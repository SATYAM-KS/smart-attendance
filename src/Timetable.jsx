import {useEffect, useMemo, useState} from 'react'
import {CalendarDays, CalendarClock, Check, Clock3, Edit3, Info, Layers3, MapPin, Plus, RotateCcw, Search, Trash2, X} from 'lucide-react'
import {supabase} from './supabase'

const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const BATCHES=['T1','T2','T3']
const KINDS=['lecture','practical','tutorial','elective','activity']
const shortTime = value => String(value||'').slice(0,5)
const blankSlot={division_id:'',subject_id:'',day_of_week:1,start_time:'08:30',end_time:'09:30',room:'310',batch:null,session_type:'lecture',instructor_code:'',is_active:true}
function indianNow(){
  const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',weekday:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const get=k=>p.find(x=>x.type===k)?.value||''
  return {day:DAYS.indexOf(get('weekday'))+1,time:`${get('hour')}:${get('minute')}`,date:`${get('year')}-${get('month')}-${get('day')}`}
}
const conflict=(a,b)=>a.division_id===b.division_id && Number(a.day_of_week)===Number(b.day_of_week)
  && shortTime(a.start_time)<shortTime(b.end_time) && shortTime(b.start_time)<shortTime(a.end_time)
  && (!a.batch || !b.batch || a.batch===b.batch)
function Dialog({title,onClose,children}){
  return <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-label={title} className="panel w-full max-w-lg max-h-[92vh] overflow-y-auto !p-6" onMouseDown={e=>e.stopPropagation()}>
      <div className="flex justify-between items-center mb-5"><h2 className="text-lg font-semibold">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div>
      {children}
    </section>
  </div>
}
export default function Timetable({data,refresh}){
  const [division,setDivision]=useState('all')
  const [batch,setBatch]=useState('all')
  const [search,setSearch]=useState('')
  const [archived,setArchived]=useState(false)
  const [now,setNow]=useState(indianNow)
  const [dialog,setDialog]=useState(null)
  const [slot,setSlot]=useState(blankSlot)
  const [newSubject,setNewSubject]=useState({subject_code:'',subject_name:''})
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [saving,setSaving]=useState(false)
  useEffect(()=>{const id=setInterval(()=>setNow(indianNow()),60000);return ()=>clearInterval(id)},[])
  const divisions=useMemo(()=>Object.fromEntries(data.divisions.map(d=>[d.id,d.name])),[data.divisions])
  const subjects=useMemo(()=>Object.fromEntries(data.subjects.map(s=>[s.id,s])),[data.subjects])
  const active=data.timetable.filter(t=>t.is_active && (division==='all'||t.division_id===division))
  const matchesBatch=t=>batch==='all'||!t.batch||t.batch===batch
  const slots=data.timetable
    .filter(t=>(archived||t.is_active) && (division==='all'||t.division_id===division) && matchesBatch(t))
    .filter(t=>`${subjects[t.subject_id]?.subject_name||''} ${subjects[t.subject_id]?.subject_code||''} ${t.room||''} ${t.instructor_code||''} ${t.batch||''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>a.day_of_week-b.day_of_week||shortTime(a.start_time).localeCompare(shortTime(b.start_time))||String(a.batch||'').localeCompare(String(b.batch||'')))
  const todaySessions=(data.class_sessions||[])
    .filter(t=>t.session_date===now.date && (division==='all'||t.division_id===division) && t.status!=='cancelled' && matchesBatch(t))
    .sort((a,b)=>shortTime(a.start_time).localeCompare(shortTime(b.start_time)))
  const happening=active.filter(t=>matchesBatch(t)&&t.day_of_week===now.day&&shortTime(t.start_time)<=now.time&&shortTime(t.end_time)>now.time).length
  function editSlot(existing=null,day=1){
    setSlot(existing ? {...existing,start_time:shortTime(existing.start_time),end_time:shortTime(existing.end_time)} : {
      ...blankSlot,day_of_week:day,
      division_id:division==='all'?(data.divisions[0]?.id||''):division,
      subject_id:data.subjects[0]?.id||'',
      batch:batch==='all'?null:batch
    })
    setDialog({type:'slot',id:existing?.id||null});setError('');setNotice('')
  }
  function addSubject(){setNewSubject({subject_code:'',subject_name:''});setDialog({type:'subject'});setError('')}
  async function saveSlot(e){
    e.preventDefault();setError('')
    const payload={division_id:slot.division_id,subject_id:slot.subject_id,day_of_week:Number(slot.day_of_week),
      start_time:shortTime(slot.start_time),end_time:shortTime(slot.end_time),
      room:String(slot.room||'').trim(),batch:slot.batch||null,
      session_type:slot.session_type||'lecture',instructor_code:String(slot.instructor_code||'').trim()||null,
      is_active:Boolean(slot.is_active)}
    if(!payload.division_id||!payload.subject_id||!payload.room) return setError('Division, subject and room are required.')
    if(payload.start_time>=payload.end_time) return setError('End time must be later than start time.')
    if(payload.is_active){
      const overlap=data.timetable.find(t=>t.id!==dialog.id&&t.is_active&&conflict(t,payload))
      if(overlap) return setError(`Conflicts with ${subjects[overlap.subject_id]?.subject_name||'another class'} (${overlap.batch||'all batches'}).`)
    }
    setSaving(true)
    try{
      const q=dialog.id?supabase.from('timetable').update(payload).eq('id',dialog.id):supabase.from('timetable').insert(payload)
      const {error}=await q
      if(error) throw error
      setDialog(null);setNotice('Timetable saved. New daily sessions will be generated by Cron; historical sessions are unchanged.')
      await refresh()
    }catch(e){setError(e.message||'Could not save lecture.')}
    finally{setSaving(false)}
  }
  async function saveSubject(e){
    e.preventDefault();setError('');setSaving(true)
    try{
      const {error}=await supabase.from('subjects').insert({subject_code:newSubject.subject_code.trim().toUpperCase(),subject_name:newSubject.subject_name.trim(),is_active:true})
      if(error)throw error
      setDialog(null);setNotice('Subject created.');await refresh()
    }catch(e){setError(e.message||'Unable to create subject')}
    finally{setSaving(false)}
  }
  async function toggleSlot(item){
    if(item.is_active&&!window.confirm('Archive this lecture? Historical attendance will remain.'))return
    if(!item.is_active){
      const overlap=data.timetable.find(t=>t.id!==item.id&&t.is_active&&conflict(t,item))
      if(overlap){setError(`Cannot restore: conflicts with ${subjects[overlap.subject_id]?.subject_name}.`);return}
    }
    setSaving(true);setError('')
    try{
      const {error}=await supabase.from('timetable').update({is_active:!item.is_active}).eq('id',item.id)
      if(error)throw error
      setNotice(item.is_active?'Lecture archived.':'Lecture restored.');await refresh()
    }catch(e){setError(e.message||'Unable to update lecture')}
    finally{setSaving(false)}
  }
  return <div className="space-y-5">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[[CalendarDays,'Active weekly entries',active.length],[Layers3,'Subjects',new Set(active.map(t=>t.subject_id)).size],[Clock3,'Happening now',happening]].map(([Icon,label,value])=><div className="panel !p-4" key={label}><div className="flex items-center justify-between"><span className="text-xs text-slate-400">{label}</span><Icon size={18} className="text-emerald-300"/></div><div className="text-2xl font-bold mt-2">{value}</div></div>)}
    </div>
    <section className="panel">
      <div className="flex justify-between gap-3 flex-wrap items-start mb-5"><div><h2 className="text-lg font-semibold">NMIET · Third Year CSE (AI)</h2><p className="text-xs text-slate-500 mt-1">Semester I · 2026–27 · Weekly schedule · Asia/Kolkata</p></div><div className="flex gap-2"><button className="button-secondary" onClick={addSubject}><Plus size={15}/>Subject</button><button className="button-primary" onClick={()=>editSlot()}><Plus size={15}/>Add class</button></div></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-[1fr_170px_150px_auto] gap-3 mb-4 items-end">
        <label className="field-label">Search<input className="field" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Subject, teacher or room"/></label>
        <label className="field-label">Division<select className="field" value={division} onChange={e=>setDivision(e.target.value)}><option value="all">All divisions</option>{data.divisions.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label className="field-label">Practical batch<select className="field" value={batch} onChange={e=>setBatch(e.target.value)}><option value="all">All batches</option>{BATCHES.map(b=><option key={b}>{b}</option>)}</select></label>
        <label className="text-xs text-slate-400 flex items-center gap-2 h-11"><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)} className="accent-emerald-400"/>Show archived</label>
      </div>
      {error&&<p role="alert" className="error-banner mb-4">{error}</p>}
      {notice&&<div className="mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-3 text-xs text-emerald-200 flex justify-between">{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}
      <div className="mb-4 flex flex-wrap gap-2 text-[11px] text-slate-400"><span className="rounded-md border border-white/10 px-2 py-1">08:30 – 10:30 · Class/lab</span><span className="rounded-md border border-amber-500/25 bg-amber-400/5 text-amber-200 px-2 py-1">10:30 – 10:40 · Short break</span><span className="rounded-md border border-white/10 px-2 py-1">10:40 – 12:40 · Class</span><span className="rounded-md border border-amber-500/25 bg-amber-400/5 text-amber-200 px-2 py-1">12:40 – 13:30 · Long break</span><span className="rounded-md border border-white/10 px-2 py-1">13:30 – 15:30 · Class/lab</span></div>
      <div className="overflow-x-auto pb-3"><div className="grid grid-cols-5 gap-3 min-w-[970px]">
        {DAYS.slice(0,5).map((day,index)=>{
          const dayEntries=slots.filter(s=>s.day_of_week===index+1)
          return <div key={day} className={`rounded-xl border overflow-hidden ${now.day===index+1?'border-emerald-500/40 bg-emerald-500/[.035]':'border-white/10 bg-[#101719]'}`}>
            <div className="px-3 py-3 border-b border-white/10 flex justify-between"><b className="text-sm">{day}</b><span className="text-xs text-slate-500">{dayEntries.length}</span></div>
            <div className="p-2 space-y-2 min-h-[370px]">
              {dayEntries.map(t=>{
                const running=now.day===index+1&&t.is_active&&shortTime(t.start_time)<=now.time&&shortTime(t.end_time)>now.time
                const subject=subjects[t.subject_id]
                return <div key={t.id} className={`border rounded-lg p-2.5 ${!t.is_active?'border-white/5 opacity-40':running?'border-emerald-400/60 bg-emerald-400/10':'border-white/10 bg-[#1b2626]'}`}>
                  <div className="flex justify-between items-center gap-1"><span className="text-[11px] text-emerald-300 font-mono">{shortTime(t.start_time)}–{shortTime(t.end_time)}</span>{t.batch&&<span className="text-[10px] bg-sky-400/10 border border-sky-400/20 text-sky-300 px-1.5 py-0.5 rounded">{t.batch}</span>}</div>
                  <div className="text-sm font-semibold mt-2">{subject?.subject_code||subject?.subject_name||'Unknown'}</div><div className="text-[11px] text-slate-400 mt-0.5">{subject?.subject_name||'—'}</div>
                  <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1"><MapPin size={11}/>{t.room||'—'} · {t.session_type||'lecture'} {t.instructor_code?`· ${t.instructor_code}`:''}</div>
                  <div className="flex items-center justify-between gap-1 mt-2"><span className="text-[10px] text-slate-500">{divisions[t.division_id]||'—'}</span><span className="flex gap-1"><button aria-label="Edit" title="Edit" onClick={()=>editSlot(t)} className="p-1.5 rounded-md border border-white/10 hover:text-emerald-300"><Edit3 size={13}/></button><button aria-label={t.is_active?'Archive':'Restore'} title={t.is_active?'Archive':'Restore'} disabled={saving} onClick={()=>toggleSlot(t)} className="p-1.5 rounded-md border border-white/10 hover:text-amber-300">{t.is_active?<Trash2 size={13}/>:<RotateCcw size={13}/>}</button></span></div>
                </div>
              })}
              {dayEntries.length===0&&<p className="text-xs text-slate-500 text-center py-12">No entries</p>}
              <button className="w-full rounded-md border border-dashed border-white/15 py-2 text-xs text-slate-500 hover:text-emerald-300 flex justify-center items-center gap-1" onClick={()=>editSlot(null,index+1)}><Plus size={13}/>Add</button>
            </div>
          </div>
        })}
      </div></div>
      <p className="text-xs text-slate-500 mt-3">T1/T2/T3 practicals run simultaneously. Selecting a batch also shows whole-division theory lectures. Saturday and Sunday have no scheduled classes in the supplied timetable.</p>
    </section>
    <section className="panel">
      <div className="flex gap-2 items-center mb-4"><CalendarClock className="text-emerald-300" size={19}/><div><h3 className="font-semibold">Today's database sessions</h3><p className="text-xs text-slate-500">Generated by the Supabase Cron job. These are the actual sessions used when scanning.</p></div></div>
      {!todaySessions.length?<p className="text-sm text-slate-500">No sessions for today. Check the timetable import, holidays and Cron job.</p>:
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Time</th><th>Subject</th><th>Batch</th><th>Room</th><th>Status</th></tr></thead><tbody>{todaySessions.map(s=><tr key={s.id}><td className="font-mono">{shortTime(s.start_time)}–{shortTime(s.end_time)}</td><td>{subjects[s.subject_id]?.subject_name||'—'}</td><td>{s.batch||'All'}</td><td>{s.room}</td><td>{s.status}</td></tr>)}</tbody></table></div>}
    </section>
    <div className="rounded-xl bg-amber-400/5 border border-amber-500/20 p-4 flex gap-2 text-xs text-amber-100/85"><Info className="shrink-0" size={17}/><p><b>Batch-aware attendance:</b> Assign every student's T1/T2/T3 batch on the Students page. Without one, they can scan theory lectures but are excluded from practicals. This v4 update also needs the batch-aware Edge Function and Cron SQL supplied in the ZIP.</p></div>
    {dialog?.type==='slot'&&<Dialog title={dialog.id?'Edit lecture':'New lecture'} onClose={()=>setDialog(null)}><form onSubmit={saveSlot} className="space-y-4">
      <div className="grid grid-cols-2 gap-3"><label className="field-label">Division<select required className="field" value={slot.division_id} onChange={e=>setSlot(v=>({...v,division_id:e.target.value}))}><option value="">Choose division</option>{data.divisions.map(d=><option value={d.id} key={d.id}>{d.name}</option>)}</select></label>
      <label className="field-label">Subject<select required className="field" value={slot.subject_id} onChange={e=>setSlot(v=>({...v,subject_id:e.target.value}))}><option value="">Choose subject</option>{data.subjects.map(s=><option value={s.id} key={s.id}>{s.subject_name}</option>)}</select></label></div>
      <div className="grid grid-cols-2 gap-3"><label className="field-label">Day<select className="field" value={slot.day_of_week} onChange={e=>setSlot(v=>({...v,day_of_week:Number(e.target.value)}))}>{DAYS.map((d,i)=><option key={d} value={i+1}>{d}</option>)}</select></label>
      <label className="field-label">Batch<select className="field" value={slot.batch||''} onChange={e=>setSlot(v=>({...v,batch:e.target.value||null}))}><option value="">All batches</option>{BATCHES.map(b=><option key={b}>{b}</option>)}</select></label></div>
      <div className="grid grid-cols-2 gap-3"><label className="field-label">Start<input required type="time" className="field" value={slot.start_time} onChange={e=>setSlot(v=>({...v,start_time:e.target.value}))}/></label><label className="field-label">End<input required type="time" className="field" value={slot.end_time} onChange={e=>setSlot(v=>({...v,end_time:e.target.value}))}/></label></div>
      <div className="grid grid-cols-2 gap-3"><label className="field-label">Room<input required maxLength={100} className="field" value={slot.room||''} onChange={e=>setSlot(v=>({...v,room:e.target.value}))}/></label>
      <label className="field-label">Teacher initials<input maxLength={20} className="field" value={slot.instructor_code||''} onChange={e=>setSlot(v=>({...v,instructor_code:e.target.value}))} placeholder="PB"/></label></div>
      <label className="field-label">Class type<select className="field" value={slot.session_type||'lecture'} onChange={e=>setSlot(v=>({...v,session_type:e.target.value}))}>{KINDS.map(k=><option key={k} value={k}>{k}</option>)}</select></label>
      <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={slot.is_active} onChange={e=>setSlot(v=>({...v,is_active:e.target.checked}))} className="accent-emerald-400"/>Active each week</label>
      {error&&<p role="alert" className="error-banner">{error}</p>}
      <div className="flex gap-2"><button type="button" className="button-secondary flex-1 justify-center" onClick={()=>setDialog(null)}>Cancel</button><button type="submit" disabled={saving} className="button-primary flex-1 justify-center"><Check size={15}/>{saving?'Saving…':'Save lecture'}</button></div>
    </form></Dialog>}
    {dialog?.type==='subject'&&<Dialog title="Add subject" onClose={()=>setDialog(null)}><form onSubmit={saveSubject} className="space-y-4"><label className="field-label">Subject code<input className="field" required value={newSubject.subject_code} onChange={e=>setNewSubject(v=>({...v,subject_code:e.target.value}))}/></label><label className="field-label">Subject name<input className="field" required value={newSubject.subject_name} onChange={e=>setNewSubject(v=>({...v,subject_name:e.target.value}))}/></label>{error&&<p className="error-banner">{error}</p>}<button className="button-primary" disabled={saving} type="submit">{saving?'Saving…':'Create subject'}</button></form></Dialog>}
  </div>
}
