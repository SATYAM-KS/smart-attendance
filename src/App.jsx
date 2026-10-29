import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowDownToLine, ArrowRight, BarChart3, CalendarClock, CheckCircle2,
  ChevronDown, Clock3, Database, FileSpreadsheet, Fingerprint, GraduationCap,
  LayoutDashboard, LockKeyhole, LogOut, Menu, Plus, Radio, RefreshCcw,
  Search, ShieldCheck, Signal, TrendingUp, Users, Wifi, X, XCircle
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { configured, supabase } from './supabase'
import Analytics from './Analytics'
import Timetable from './Timetable'

const tz = 'Asia/Kolkata'
const tabs = [
  ['overview', 'Overview', LayoutDashboard],
  ['scans', 'Live scans', Radio],
  ['attendance', 'Attendance', CheckCircle2],
  ['students', 'Students', GraduationCap],
  ['timetable', 'Timetable', CalendarClock],
  ['analytics', 'Analytics', TrendingUp],
  ['reports', 'Reports', BarChart3],
]
const emptyData = {
  students: [], divisions: [], subjects: [], timetable: [], class_sessions: [],
  attendance: [], scan_events: [], devices: [], holidays: [],
}
const pad = n => String(n).padStart(2, '0')
function indiaDate(value = new Date()) {
  const pieces = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(value)
  const p = name => pieces.find(x => x.type === name)?.value
  return `${p('year')}-${p('month')}-${p('day')}`
}
const dateAgo = (date, days) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}
const displayDate = date => date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'
const displayTime = date => date ? new Date(date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: tz }) : '—'
const weekday = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const safeString = v => String(v ?? '')
const friendlyError = e => e?.message ?? 'Unknown error'
const shortUid = uid => String(uid || '—').replace(/(.{2})/g, '$1 ').trim()

function Status({ status }) {
  const positive = ['MARKED','present','late','ongoing','scheduled'].includes(status)
  const warning = ['ALREADY_MARKED', 'NO_ACTIVE_CLASS', 'completed'].includes(status)
  const styles = positive ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : warning
    ? 'text-amber-300 bg-amber-500/10 border-amber-500/20'
    : 'text-rose-300 bg-rose-500/10 border-rose-500/20'
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${styles}`}>{safeString(status).replaceAll('_', ' ')}</span>
}
function Pill({ children, green = false }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${green ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/[.04] text-slate-400'}`}>{children}</span>
}
function Panel({ title, description, action, children, className = '' }) {
  return <section className={`panel ${className}`}>
    {(title || action) && <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>{title && <h3 className="text-base font-semibold text-slate-100">{title}</h3>}{description && <p className="mt-1 text-xs text-slate-500">{description}</p>}</div>
      {action}
    </div>}
    {children}
  </section>
}
function Empty({ label }) {
  return <div className="flex min-h-44 flex-col items-center justify-center gap-2 text-center text-slate-500"><Database size={26} strokeWidth={1.5}/><p className="text-sm">{label}</p></div>
}
function CSVDownload({ rows, filename, children }) {
  const download = () => {
    if (!rows.length) return
    const escape = x => {
      let s = String(x ?? '')
      if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`
      return `"${s.replaceAll('"','""')}"`
    }
    const csv = '\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n')
    const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = href; a.download = filename; a.click()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  }
  return <button className="button-primary" onClick={download} disabled={!rows.length}><ArrowDownToLine size={15}/>{children}</button>
}

function Login({ onSignIn, loading, error }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return <main className="min-h-screen flex items-center justify-center px-5 relative overflow-hidden">
    <div className="ambient-orb absolute -top-40 -left-40" />
    <div className="w-full max-w-md relative">
      <div className="mb-10 flex items-center gap-3 justify-center">
        <div className="brand-mark"><Fingerprint size={25}/></div>
        <span className="text-2xl font-bold tracking-tight">smart<span className="text-[#7de0a4]">attend</span><span className="text-[#7de0a4]">.</span></span>
      </div>
      <div className="panel !p-8 shadow-[0_40px_120px_rgba(0,0,0,.3)]">
        <Pill><LockKeyhole size={12}/> Secure administrator access</Pill>
        <h1 className="mt-5 text-2xl font-semibold">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in to manage your RFID attendance system.</p>
        <form onSubmit={e => { e.preventDefault(); onSignIn(email, password) }} className="mt-7 space-y-4">
          <label className="field-label">Email address<input className="field" type="email" required autoComplete="email" placeholder="admin@college.edu" value={email} onChange={e=>setEmail(e.target.value)}/></label>
          <label className="field-label">Password<input className="field" type="password" required autoComplete="current-password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)}/></label>
          {error && <p role="alert" className="error-banner">{error}</p>}
          <button className="button-primary w-full justify-center !py-3" disabled={loading}>{loading ? 'Signing in…' : 'Sign in to dashboard'}<ArrowRight size={16}/></button>
        </form>
      </div>
      <p className="text-center text-xs text-slate-600 mt-6">Access is limited to Supabase Auth users approved as SmartAttend admins.</p>
    </div>
  </main>
}

function Modal({ title, onClose, children }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
    <div className="panel w-full max-w-lg !p-6 shadow-2xl" onMouseDown={e=>e.stopPropagation()}>
      <div className="flex justify-between gap-3 items-center mb-5"><h2 className="text-lg font-semibold">{title}</h2><button className="icon-button" aria-label="Close" onClick={onClose}><X size={18}/></button></div>
      {children}
    </div>
  </div>
}

export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [role, setRole] = useState(null)
  const [authError, setAuthError] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [profileName, setProfileName] = useState('Administrator')
  const [tab, setTab] = useState('overview')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [data, setData] = useState(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [live, setLive] = useState(false)
  const [query, setQuery] = useState('')
  const [dateFilter, setDateFilter] = useState(indiaDate())
  const [modal, setModal] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({ full_name:'', roll_no:'', rfid_uid:'', batch:'', division_id:'', subject_code:'', subject_name:'', subject_id:'', day_of_week:1, start_time:'09:00', end_time:'10:00', room:'Demo Lab' })
  const busyRef = useRef(false)

  useEffect(() => {
    if (!configured) { setAuthReady(true); return }
    let mounted = true
    supabase.auth.getSession().then(({data:{session}, error}) => {
      if(mounted) { setSession(session); setAuthError(error?.message || ''); setAuthReady(true) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session); setAuthReady(true)
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session?.user?.id) { setRole(null); return }
    let active = true
    setRole(null)
    supabase.from('profiles').select('role,full_name').eq('user_id',session.user.id).maybeSingle()
      .then(({data,error}) => { if (!active) return; setRole(error ? 'error' : data?.role || 'none'); setProfileName(data?.full_name || 'Administrator'); if(error) setAuthError(error.message) })
    return () => { active = false }
  }, [session?.user?.id])

  const refresh = useCallback(async (isInitial = false) => {
    if (!configured || busyRef.current) return
    busyRef.current = true
    if (isInitial) setLoading(true)
    else setRefreshing(true)
    try {
      const tables = Object.keys(emptyData)
      const result = await Promise.all(tables.map(async (table) => {
        const limit = table === 'scan_events' ? 600 : 2000
        const columns = table === 'devices'
          ? 'id,device_code,device_name,division_id,room,is_active,last_seen_at,created_at'
          : '*'
        const query = supabase.from(table).select(columns).limit(limit)
        const { data, error } = table === 'scan_events'
          ? await query.order('scanned_at', { ascending:false })
          : table === 'attendance' ? await query.order('created_at', { ascending:false })
          : await query
        if (error) throw new Error(`${table}: ${error.message}`)
        return [table, data || []]
      }))
      setData(Object.fromEntries(result))
      setLastUpdate(new Date())
      setError('')
    } catch(e) { setError(friendlyError(e)) }
    finally { busyRef.current = false; setRefreshing(false); setLoading(false) }
  }, [])

  useEffect(() => {
    if (role !== 'admin') return
    refresh(true)
    const channel = supabase.channel('smartattend-dashboard')
      .on('postgres_changes', {event:'INSERT',schema:'public',table:'scan_events'}, () => refresh())
      .on('postgres_changes', {event:'INSERT',schema:'public',table:'attendance'}, () => refresh())
      .subscribe(status => setLive(status === 'SUBSCRIBED'))
    const timer = setInterval(() => refresh(), 15000)
    return () => { clearInterval(timer); supabase.removeChannel(channel); setLive(false) }
  }, [role, refresh])

  const signIn = async (email, password) => {
    setSigningIn(true); setAuthError('')
    const {error} = await supabase.auth.signInWithPassword({email, password})
    if (error) setAuthError(error.message)
    setSigningIn(false)
  }
  const signOut = async () => { await supabase.auth.signOut(); setTab('overview'); setData(emptyData) }

  const lookups = useMemo(() => ({
    students: Object.fromEntries(data.students.map(x=>[x.id,x])),
    subjects: Object.fromEntries(data.subjects.map(x=>[x.id,x])),
    divisions: Object.fromEntries(data.divisions.map(x=>[x.id,x])),
    sessions: Object.fromEntries(data.class_sessions.map(x=>[x.id,x])),
    devices: Object.fromEntries(data.devices.map(x=>[x.id,x])),
  }), [data])
  const today = indiaDate()
  const todaySessions = data.class_sessions.filter(x => x.session_date === today && x.status !== 'cancelled')
  const todayAttendance = data.attendance.filter(x=>lookups.sessions[x.session_id]?.session_date === today)
  const validPresent = todayAttendance.filter(x=>['present','late'].includes(x.status))
  const todayScans = data.scan_events.filter(x => indiaDate(new Date(x.scanned_at)) === today)
  const studentsPresent = new Set(validPresent.map(x=>x.student_id)).size
  const activeStudents = data.students.filter(x=>x.is_active).length
  const activeDevices = data.devices.filter(x=>x.is_active).length
  const weekly = Array.from({length:7}, (_,i) => {
    const date = dateAgo(today, 6-i)
    return { date, label: new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN',{weekday:'short',timeZone:'UTC'}),
      scans: data.scan_events.filter(x=>indiaDate(new Date(x.scanned_at))===date).length,
      present: data.attendance.filter(x=>lookups.sessions[x.session_id]?.session_date===date && ['present','late'].includes(x.status)).length }
  })
  const scannedRows = data.scan_events.filter(x => {
    const s = lookups.students[x.student_id]
    const text = `${s?.full_name ?? ''} ${x.rfid_uid} ${x.result}`.toLowerCase()
    return text.includes(query.toLowerCase())
  })
  const attendanceRows = data.attendance.filter(x => lookups.sessions[x.session_id]?.session_date === dateFilter &&
    `${lookups.students[x.student_id]?.full_name ?? ''} ${lookups.subjects[lookups.sessions[x.session_id]?.subject_id]?.subject_name ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  const studentRows = data.students.filter(x => `${x.full_name} ${x.roll_no} ${x.rfid_uid}`.toLowerCase().includes(query.toLowerCase()))
  const attendanceCSV = [ ['Student','Roll No','Division','Subject','Date','Status','Scan time (IST)'], ...attendanceRows.map(a=>{
    const s=lookups.students[a.student_id]||{}; const classSession=lookups.sessions[a.session_id]||{}
    return [s.full_name,s.roll_no,lookups.divisions[s.division_id]?.name,lookups.subjects[classSession.subject_id]?.subject_name,classSession.session_date,a.status,displayTime(a.scanned_at)]
  })]
  const scansCSV = [ ['Date (IST)','Time (IST)','Student','UID','Result','Message'], ...scannedRows.map(x=>[
    indiaDate(new Date(x.scanned_at)),displayTime(x.scanned_at), lookups.students[x.student_id]?.full_name || 'Unknown', x.rfid_uid,x.result,x.message
  ])]

  const addRecord = async e => {
    e.preventDefault(); setFormError(''); setSaving(true)
    try {
      let table, payload
      if (modal === 'student') {
        const uid = form.rfid_uid.replace(/[\s:-]/g,'').toUpperCase()
        if (!/^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(uid)) throw new Error('RFID UID must be 8, 14, or 20 hexadecimal characters.')
        if (!form.division_id) throw new Error('Select a division.')
        table='students'; payload={full_name:form.full_name.trim(),roll_no:form.roll_no.trim(),rfid_uid:uid,division_id:form.division_id,batch:form.batch||null}
      } else if (modal === 'subject') {
        table='subjects';payload={subject_code:form.subject_code.trim().toUpperCase(),subject_name:form.subject_name.trim()}
      } else {
        if (!form.division_id || !form.subject_id) throw new Error('Choose division and subject.')
        if (form.start_time >= form.end_time) throw new Error('End time must be later than start time.')
        table='timetable';payload={division_id:form.division_id,subject_id:form.subject_id,day_of_week:Number(form.day_of_week),start_time:form.start_time,end_time:form.end_time,room:form.room.trim()||'Main',is_active:true}
      }
      const {error} = await supabase.from(table).insert(payload)
      if(error) throw error
      setModal(''); setForm({full_name:'',roll_no:'',rfid_uid:'',batch:'',division_id:'',subject_code:'',subject_name:'',subject_id:'',day_of_week:1,start_time:'09:00',end_time:'10:00',room:'Demo Lab'})
      await refresh()
    } catch(e) {setFormError(friendlyError(e))}
    finally {setSaving(false)}
  }
  const setField = (field,value) => setForm(f=>({...f,[field]:value}))
  const navigate = to => { setTab(to); setQuery(''); setMobileMenu(false) }

  if (!configured) return <div className="min-h-screen grid place-items-center p-4"><div className="panel max-w-lg w-full"><h1 className="text-xl font-semibold mb-2">SmartAttend setup needed</h1><p className="text-slate-400 text-sm">Copy <code>.env.example</code> to <code>.env.local</code> and fill in <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> from Supabase project settings. Restart <code>npm run dev</code>.</p></div></div>
  if (!authReady || (session && role === null)) return <div className="min-h-screen grid place-items-center"><div className="animate-pulse text-emerald-300 flex items-center gap-2"><Fingerprint/> Loading SmartAttend…</div></div>
  if (!session) return <Login onSignIn={signIn} loading={signingIn} error={authError}/>
  if (role !== 'admin') return <div className="min-h-screen grid place-items-center p-5"><div className="panel max-w-md w-full text-center"><ShieldCheck className="text-amber-400 mx-auto mb-4" size={34}/><h2 className="text-xl font-semibold">Administrator access required</h2><p className="text-sm text-slate-400 mt-3">Your account is signed in, but it hasn't been assigned the <code>admin</code> role in Supabase <code>profiles</code>. Run the included admin setup SQL for your email.</p>{authError && <p className="error-banner mt-4">{authError}</p>}<button className="button-secondary mt-6" onClick={signOut}>Sign out</button></div></div>

  const activeTab = tabs.find(x=>x[0]===tab)
  return <div className="min-h-screen lg:flex">
    {mobileMenu && <button className="fixed inset-0 z-30 bg-black/70 lg:hidden" onClick={()=>setMobileMenu(false)} aria-label="Close navigation"/>}
    <aside className={`sidebar ${mobileMenu ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="flex items-center gap-3 px-5 pt-7 pb-10">
        <div className="brand-mark"><Fingerprint size={24}/></div>
        <div className="text-[21px] font-bold tracking-tight">smart<span className="text-[#7de0a4]">attend</span><span className="text-[#7de0a4]">.</span></div>
      </div>
      <div className="px-5 mb-3 text-[10px] tracking-[.18em] font-semibold uppercase text-slate-600">Workspace</div>
      <nav className="px-3 space-y-1 flex-1">
        {tabs.map(([id,label,Icon])=><button key={id} onClick={()=>navigate(id)} className={`sidebar-link ${tab===id?'sidebar-link-active':''}`}><Icon size={18}/>{label}{id==='scans'&&<span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400"/>}</button>)}
      </nav>
      <div className="mx-4 mb-4 rounded-xl bg-white/[.035] border border-white/[.065] p-3">
        <div className="text-xs flex items-center gap-2 text-slate-300"><Signal size={14} className="text-emerald-400"/>ESP32 cloud scanner</div>
        <div className="mt-2 text-[11px] text-slate-500">{activeDevices} registered active device{activeDevices===1?'':'s'}</div>
      </div>
      <div className="mx-4 mb-5 border-t border-white/[.08] pt-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-emerald-600/20 text-emerald-300 grid place-items-center text-sm font-bold">{profileName[0]?.toUpperCase()}</div>
        <div className="flex-1 min-w-0"><p className="text-xs font-semibold truncate">{profileName}</p><p className="text-[11px] text-slate-500">Administrator</p></div>
        <button className="icon-button" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut size={17}/></button>
      </div>
    </aside>

    <main className="flex-1 min-w-0 lg:ml-[246px]">
      <header className="topbar">
        <div className="flex items-center gap-3"><button onClick={()=>setMobileMenu(true)} className="icon-button lg:hidden" aria-label="Open menu"><Menu size={21}/></button>
          <div className="text-sm text-slate-500">Workspace <span className="mx-2 text-slate-700">/</span> <span className="font-medium text-slate-200">{activeTab?.[1]}</span></div>
        </div>
        <div className="flex items-center gap-3"><Pill green={live}><span className={`h-1.5 w-1.5 rounded-full ${live?'bg-emerald-400':'bg-amber-400'}`}/>{live?'Live':'Polling'}</Pill><button className="icon-button" onClick={()=>refresh()} title="Refresh data" aria-label="Refresh" disabled={refreshing}><RefreshCcw size={16} className={refreshing?'animate-spin':''}/></button></div>
      </header>
      <div className="mx-auto max-w-[1440px] px-5 pb-16 pt-8 sm:px-8 lg:px-10">
        <div className="mb-8 flex flex-wrap justify-between items-start gap-4"><div><p className="text-xs tracking-[.18em] text-emerald-400 font-semibold uppercase">SmartAttend management</p><h1 className="mt-2 text-3xl font-bold tracking-tight">{activeTab?.[1]}</h1><p className="mt-2 text-sm text-slate-500">{tab==='overview'?'Everything happening across your attendance system.':tab==='scans'?'A live record of every RFID scan, including rejected cards.':tab==='attendance'?'Browse attendance records by date and subject.':tab==='students'?'Manage student profiles and registered RFID cards.':tab==='timetable'?'Create weekly class schedules and subject assignments.':tab==='analytics'?'Subject performance, attendance rates, trends and at-risk students.':'Export attendance data and review the activity trend.'}</p></div>
          <div className="flex items-center gap-3"><div className="hidden sm:block text-xs text-slate-600">{lastUpdate?`Updated ${displayTime(lastUpdate)}`:'Connecting...'}</div>{tab==='students' && <button className="button-primary" onClick={()=>{setFormError('');setModal('student')}}><Plus size={16}/> Add student</button>}</div>
        </div>
        {error && <div role="alert" className="error-banner mb-6">Database read failed: {error}. Check that the admin RLS SQL was applied. <button onClick={()=>refresh()} className="underline ml-2">Retry</button></div>}
        {loading ? <div className="panel py-20 text-center text-slate-400">Loading your Supabase records…</div> : <>
          {tab==='overview' && <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard icon={Users} label="Active students" value={activeStudents} helper="Registered learners" color="green"/>
              <StatCard icon={CheckCircle2} label="Checked in today" value={studentsPresent} helper="Unique students with attendance" color="green"/>
              <StatCard icon={Radio} label="Scans today" value={todayScans.length} helper="Includes duplicate & invalid" color="blue"/>
              <StatCard icon={CalendarClock} label="Sessions today" value={todaySessions.length} helper="Scheduled or ongoing lectures" color="amber"/>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-5 mt-5">
              <Panel title="Attendance activity" description="Confirmed attendance entries for the past seven days" action={<Pill>Last 7 days</Pill>}>
                <div className="h-[260px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weekly} margin={{top:10,right:10,left:-24,bottom:0}}><defs><linearGradient id="activityGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#62d39a" stopOpacity={.30}/><stop offset="95%" stopColor="#62d39a" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#263036" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill:'#85919b',fontSize:11}}/><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{fill:'#85919b',fontSize:11}}/><Tooltip contentStyle={{background:'#171e22',border:'1px solid #2a343a',borderRadius:12,color:'#e5ecea'}}/><Area type="monotone" dataKey="present" stroke="#6ee7a7" strokeWidth={3} fill="url(#activityGreen)" name="Present records"/></AreaChart></ResponsiveContainer></div>
              </Panel>
              <Panel title="Today's scan results" description="All attempts received by the cloud API">
                {todayScans.length === 0 ? <Empty label="No RFID scans recorded today"/> : <div className="space-y-5 pt-2">{[
                  ['Marked', todayScans.filter(x=>x.result==='MARKED').length,'bg-emerald-400'],
                  ['Duplicates',todayScans.filter(x=>x.result==='ALREADY_MARKED').length,'bg-amber-400'],
                  ['Rejected / other',todayScans.filter(x=>!['MARKED','ALREADY_MARKED'].includes(x.result)).length,'bg-rose-400'],
                ].map(([label,n,color])=><div key={label}><div className="flex justify-between text-xs mb-2"><span className="text-slate-400">{label}</span><strong className="font-semibold text-slate-200">{n}</strong></div><div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className={`h-full ${color} rounded-full`} style={{width:`${todayScans.length?n/todayScans.length*100:0}%`}}/></div></div>)}</div>}
              </Panel>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-5 mt-5">
              <Panel title="Recent scan activity" description="Latest RFID events stored in Supabase" action={<button className="text-xs text-emerald-300 flex items-center gap-1" onClick={()=>navigate('scans')}>View all <ArrowRight size={13}/></button>}><ScanTable events={data.scan_events.slice(0,6)} lookups={lookups}/></Panel>
              <Panel title="Device overview" description="Registered ESP32 scanners"><div className="space-y-3">{data.devices.map(x=><div key={x.id} className="rounded-xl bg-[#11181b] border border-white/[.055] p-4"><div className="flex items-center gap-3"><span className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-300 grid place-items-center"><Wifi size={18}/></span><div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{x.device_name}</p><p className="text-xs text-slate-500">{x.device_code}</p></div><Pill green={x.is_active}>{x.is_active?'Enabled':'Disabled'}</Pill></div><p className="text-xs text-slate-500 mt-4">Room: {x.room || 'Unassigned'}</p><p className="text-[11px] text-slate-600 mt-2">“Enabled” is registration status, not a live heartbeat.</p></div>)}{!data.devices.length&&<Empty label="No ESP32 devices found"/>}</div></Panel>
            </div>
          </>}
          {tab==='scans' && <Panel title="Scan event stream" description="Newest events first. Refreshes automatically and every 15 seconds." action={<CSVDownload rows={scansCSV} filename="smartattend-scan-events.csv">Export CSV</CSVDownload>}><SearchField query={query} setQuery={setQuery} placeholder="Search by student, card UID or result..."/><ScanTable events={scannedRows.slice(0,150)} lookups={lookups} showDevice/></Panel>}
          {tab==='attendance' && <Panel title="Lecture attendance records" description="Each row belongs to one student and lecture session." action={<CSVDownload rows={attendanceCSV} filename={`smartattend-${dateFilter}.csv`}>Export CSV</CSVDownload>}><div className="flex flex-col sm:flex-row gap-3 mb-5"><input className="field sm:w-48" type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/><div className="flex-1"><SearchField query={query} setQuery={setQuery} placeholder="Search student or subject..."/></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Student</th><th>Roll</th><th>Subject</th><th>Status</th><th>Scan time</th></tr></thead><tbody>{attendanceRows.map(a=>{const s=lookups.students[a.student_id];const cs=lookups.sessions[a.session_id];return <tr key={a.id}><td className="font-medium text-slate-200">{s?.full_name||'Unknown'}</td><td>{s?.roll_no||'—'}</td><td>{lookups.subjects[cs?.subject_id]?.subject_name||'—'}</td><td><Status status={a.status}/></td><td>{displayTime(a.scanned_at)}</td></tr>})}</tbody></table>{!attendanceRows.length&&<Empty label="No attendance rows for this date"/>}</div></Panel>}
          {tab==='students' && <Panel title={`Registered students (${data.students.length})`} description="Students are matched to RFID UIDs; assign T1/T2/T3 so practicals count correctly." action={<Pill>UID-linked</Pill>}><SearchField query={query} setQuery={setQuery} placeholder="Search by name, roll number or card UID..."/><div className="table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Roll no.</th><th>Division</th><th>Batch (editable)</th><th>RFID UID</th><th>Account</th></tr></thead><tbody>{studentRows.map(s=><tr key={s.id}><td className="text-slate-200 font-medium">{s.full_name}</td><td>{s.roll_no||'—'}</td><td>{lookups.divisions[s.division_id]?.name||'—'}</td><td><select aria-label={`Batch for ${s.full_name}`} className="field min-w-24 !py-1.5 text-xs" value={s.batch||''} onChange={async e=>{const next=e.target.value||null;const {error:batchError}=await supabase.from('students').update({batch:next}).eq('id',s.id);if(batchError) setError(batchError.message);else await refresh()}}><option value="">Unassigned</option><option value="T1">T1</option><option value="T2">T2</option><option value="T3">T3</option></select></td><td className="font-mono text-xs">{shortUid(s.rfid_uid)}</td><td><Pill green={s.is_active}>{s.is_active?'Active':'Inactive'}</Pill></td></tr>)}</tbody></table>{!studentRows.length&&<Empty label="No matching students found"/>}</div></Panel>}
          {tab==='timetable' && <Timetable data={data} refresh={refresh}/> }
          {tab==='analytics' && <Analytics divisions={data.divisions}/>}
          {tab==='reports' && <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5"><Panel title="Attendance export" description="Download confirmed attendance records for a selected date."><input className="field mb-4" type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/><CSVDownload rows={attendanceCSV} filename={`smartattend-attendance-${dateFilter}.csv`}>Download attendance CSV</CSVDownload></Panel><Panel title="RFID scan audit" description="Download the latest captured scan events."><p className="text-sm text-slate-400 mb-4">Includes marked, duplicate, unknown-card, and no-active-class scans.</p><CSVDownload rows={scansCSV} filename="smartattend-scan-audit.csv">Download scan CSV</CSVDownload></Panel></div>
            <Panel title="Recent seven-day activity" description="Attendance records verified by the backend" className="mt-5"><div className="grid grid-cols-7 gap-2 h-40 items-end">{weekly.map(d=><div className="flex flex-col gap-2 h-full items-center justify-end" key={d.date}><span className="text-[11px] text-slate-500">{d.present}</span><div className="w-full max-w-14 bg-emerald-400/80 rounded-t-lg min-h-[4px]" style={{height:`${Math.max(3,d.present/Math.max(...weekly.map(x=>x.present),1)*100)}%`}}/><span className="text-[11px] text-slate-500">{d.label}</span></div>)}</div></Panel>
          </>}
        </>}
        <p className="mt-9 text-center text-xs text-slate-600">SmartAttend · Secure Supabase data · Times shown in Asia/Kolkata</p>
      </div>
    </main>

    {!!modal&&<Modal title={modal==='student'?'Register new student':modal==='subject'?'Add subject':'Add weekly timetable slot'} onClose={()=>setModal('')}>
      <form className="space-y-4" onSubmit={addRecord}>
        {modal==='student'&&<><label className="field-label">Full name<input required maxLength={120} className="field" value={form.full_name} onChange={e=>setField('full_name',e.target.value)} placeholder="Student name"/></label><label className="field-label">Roll number<input required maxLength={30} className="field" value={form.roll_no} onChange={e=>setField('roll_no',e.target.value)} placeholder="64"/></label><label className="field-label">RFID UID (hexadecimal)<input required className="field font-mono" value={form.rfid_uid} onChange={e=>setField('rfid_uid',e.target.value)} placeholder="D0507310"/></label><label className="field-label">Division<select required className="field" value={form.division_id} onChange={e=>setField('division_id',e.target.value)}><option value="">Select division</option>{data.divisions.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="field-label">Practical batch<select className="field" value={form.batch||''} onChange={e=>setField('batch',e.target.value)}><option value="">Not assigned yet</option><option value="T1">T1</option><option value="T2">T2</option><option value="T3">T3</option></select></label></>}
        {modal==='subject'&&<><label className="field-label">Subject code<input className="field" required maxLength={40} value={form.subject_code} onChange={e=>setField('subject_code',e.target.value)} placeholder="DBMS"/></label><label className="field-label">Subject name<input className="field" required maxLength={150} value={form.subject_name} onChange={e=>setField('subject_name',e.target.value)} placeholder="Database Management Systems"/></label></>}
        {modal==='timetable'&&<><label className="field-label">Division<select className="field" required value={form.division_id} onChange={e=>setField('division_id',e.target.value)}><option value="">Select division</option>{data.divisions.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="field-label">Subject<select className="field" required value={form.subject_id} onChange={e=>setField('subject_id',e.target.value)}><option value="">Select subject</option>{data.subjects.map(s=><option key={s.id} value={s.id}>{s.subject_name}</option>)}</select></label><label className="field-label">Day<select className="field" value={form.day_of_week} onChange={e=>setField('day_of_week',e.target.value)}>{weekday.map((d,i)=><option key={d} value={i+1}>{d}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="field-label">Start<input className="field" type="time" value={form.start_time} onChange={e=>setField('start_time',e.target.value)}/></label><label className="field-label">End<input className="field" type="time" value={form.end_time} onChange={e=>setField('end_time',e.target.value)}/></label></div><label className="field-label">Room<input className="field" required value={form.room} onChange={e=>setField('room',e.target.value)}/></label></>}
        {formError&&<div className="error-banner" role="alert">{formError}</div>}
        <div className="flex gap-3 pt-2"><button className="button-secondary flex-1 justify-center" type="button" onClick={()=>setModal('')}>Cancel</button><button className="button-primary flex-1 justify-center" disabled={saving}>{saving?'Saving…':'Save record'}</button></div>
      </form>
    </Modal>}
  </div>
}

function SearchField({query,setQuery,placeholder}) {
  return <div className="relative mb-4"><Search size={16} className="absolute top-1/2 -translate-y-1/2 left-3 text-slate-500"/><input type="search" className="field !pl-10" value={query} onChange={e=>setQuery(e.target.value)} placeholder={placeholder}/></div>
}
function StatCard({icon: Icon,label,value,helper,color='green'}) {
  const colorClass = color==='green'?'text-emerald-300 bg-emerald-400/10':color==='blue'?'text-sky-300 bg-sky-400/10':'text-amber-300 bg-amber-400/10'
  return <div className="panel !p-5"><div className="flex justify-between items-start gap-2"><p className="text-xs text-slate-400">{label}</p><span className={`rounded-lg p-2 ${colorClass}`}><Icon size={17}/></span></div><p className="mt-4 text-3xl font-bold tracking-tight tabular-nums">{value.toLocaleString()}</p><p className="mt-1 text-[11px] text-slate-600">{helper}</p></div>
}
function ScanTable({events,lookups,showDevice=false}) {
  if (!events.length) return <Empty label="No RFID scans yet. Scan a card to see events here."/>
  return <div className="table-wrap"><table className="data-table"><thead><tr><th>Time (IST)</th><th>Student</th><th>Card UID</th><th>Result</th>{showDevice&&<th>Device</th>}</tr></thead><tbody>{events.map(e=><tr key={e.id}><td className="whitespace-nowrap"><p className="text-slate-300">{displayTime(e.scanned_at)}</p><p className="text-[11px] text-slate-600">{indiaDate(new Date(e.scanned_at))}</p></td><td className="font-medium text-slate-200">{lookups.students[e.student_id]?.full_name || <span className="text-slate-500">Unknown card</span>}</td><td className="font-mono text-xs">{shortUid(e.rfid_uid)}</td><td><Status status={e.result}/></td>{showDevice&&<td>{lookups.devices[e.device_id]?.device_name||'—'}</td>}</tr>)}</tbody></table></div>
}
