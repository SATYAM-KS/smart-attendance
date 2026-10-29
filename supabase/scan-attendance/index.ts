// SMARTATTEND v4 - complete replacement Supabase Edge Function
// Deploy as "scan-attendance" with Verify JWT OFF.
// Device authentication uses x-device-key matched to SHA256 hash in devices.
// Never place service-role/secret keys in ESP32 firmware or browser.
import { createClient } from 'npm:@supabase/supabase-js@2'

const projectUrl = Deno.env.get('SUPABASE_URL')!
const keyset = Deno.env.get('SUPABASE_SECRET_KEYS')
let secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
if (!secretKey && keyset) {
  try { secretKey = JSON.parse(keyset).default || '' } catch { /* not configured */ }
}
if (!secretKey) throw new Error('Supabase server-side secret key missing')
const db = createClient(projectUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

function response(status: string, message: string, httpCode=200, extra:Record<string,unknown>={}) {
  return Response.json({status,message,...extra},{status:httpCode})
}
async function sha256(input:string) {
  const bytes = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('')
}
function equalHex(a:string,b:string) {
  if (a.length!==64 || b.length!==64) return false
  let mismatch=0
  for(let i=0;i<64;i++) mismatch |= a.charCodeAt(i)^b.charCodeAt(i)
  return mismatch===0
}
function indiaDateTime() {
  const parts = new Intl.DateTimeFormat('en-GB',{
    timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date())
  const p=(type:string)=>parts.find(x=>x.type===type)?.value||''
  return {date:`${p('year')}-${p('month')}-${p('day')}`,
    time:`${p('hour')}:${p('minute')}:${p('second')}`}
}
Deno.serve(async req=> {
  if(req.method!=='POST') return response('ERROR','POST required',405)
  try {
    const token = req.headers.get('x-device-key') || ''
    if(token.length<32 || token.length>128) return response('UNAUTHORIZED','Device authentication failed',401)
    const body = await req.json()
    const deviceCode = String(body.device_code||'')
    const uid = String(body.rfid_uid||'').replace(/[\s:-]/g,'').toUpperCase()
    const scanId = String(body.scan_id||'')
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(deviceCode) ||
        !/^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(uid) ||
        !/^[A-Za-z0-9_-]{6,100}$/.test(scanId))
       return response('ERROR','Invalid scan data',400)

    const {data:device,error:deviceError} = await db.from('devices')
      .select('id,division_id,is_active,api_key_hash')
      .eq('device_code',deviceCode).maybeSingle()
    if(deviceError) throw deviceError
    const tokenHash = await sha256(token)
    if(!device || !equalHex(String(device.api_key_hash||''),tokenHash))
      return response('UNAUTHORIZED','Device authentication failed',401)
    if(!device.is_active) return response('DEVICE_DISABLED','Device disabled',403)

    const {data:previous,error:prevError} = await db.from('scan_events')
      .select('result,message').eq('scan_id',scanId).maybeSingle()
    if(prevError) throw prevError
    if(previous) return response(previous.result, previous.message||'Previous scan replayed')

    async function save(result:string,message:string,
      studentId:string|null=null,sessionId:string|null=null,
      extra:Record<string,unknown>={}) {
      const {error} = await db.from('scan_events').insert({
        scan_id:scanId,device_id:device.id,rfid_uid:uid,
        student_id:studentId,session_id:sessionId,result,message
      })
      if(error) {
        if(error.code==='23505') {
          const {data:stored} = await db.from('scan_events')
            .select('result,message').eq('scan_id',scanId).maybeSingle()
          if(stored) return response(stored.result,stored.message||'')
        }
        throw error
      }
      return response(result,message,200,extra)
    }

    const {data:student,error:studentError}=await db.from('students')
      .select('id,full_name,division_id,batch,is_active')
      .eq('rfid_uid',uid).maybeSingle()
    if(studentError) throw studentError
    if(!student || !student.is_active) return await save('UNKNOWN_CARD','Card not registered')
    if(student.division_id!==device.division_id)
      return await save('WRONG_DIVISION','Student belongs to another division',student.id)

    const now=indiaDateTime()
    let query = db.from('class_sessions')
      .select('id,subject_id,batch')
      .eq('division_id',student.division_id)
      .eq('session_date',now.date)
      .lte('start_time',now.time)
      .gt('end_time',now.time)
      .in('status',['scheduled','ongoing'])
    // A class-wide lecture uses NULL batch; practicals need matching T1/T2/T3.
    if (student.batch) query=query.or(`batch.is.null,batch.eq.${student.batch}`)
    else query=query.is('batch',null)
    const {data:sessions,error:sessionError}=await query.limit(2)
    if(sessionError) throw sessionError
    if(!sessions?.length) return await save('NO_ACTIVE_CLASS',
      student.batch ? 'No active class for student batch' : 'No active whole-division class; assign student batch for labs',
      student.id)
    if(sessions.length>1) return response('ERROR','Overlapping eligible lectures',409)
    const current=sessions[0]
    const {data:subject,error:subjectError}=await db.from('subjects')
      .select('subject_name').eq('id',current.subject_id).single()
    if(subjectError) throw subjectError

    // Insert-only: unique(student_id, session_id) prevents a duplicate mark.
    const {error:attendanceError}=await db.from('attendance').insert({
      student_id:student.id,session_id:current.id,status:'present',
      scanned_at:new Date().toISOString(),source:'rfid'
    })
    if(attendanceError && attendanceError.code!=='23505') throw attendanceError
    const first=!attendanceError
    return await save(first?'MARKED':'ALREADY_MARKED',
      first?'Attendance recorded':'Attendance already marked',
      student.id,current.id,{student:student.full_name,subject:subject?.subject_name||''})
  } catch(e) {
    console.error('scan-attendance failure',e)
    return response('ERROR','Attendance could not be confirmed',500)
  }
})
