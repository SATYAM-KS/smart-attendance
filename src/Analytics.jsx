import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowDownToLine, CalendarDays, CheckCircle2, Clock3,
  RefreshCcw, Search, TrendingUp, Users, AlertTriangle, BarChart3
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend
} from 'recharts'
import { supabase } from './supabase'

const formatN = value => Number(value || 0).toLocaleString('en-IN')
const formatPct = value => value == null ? '—' : `${Number(value).toFixed(1)}%`
const dateIST = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date())
  const x = key => parts.find(p => p.type === key)?.value || ''
  return `${x('year')}-${x('month')}-${x('day')}`
}
const daysBefore = (date, amount) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - amount)
  return d.toISOString().slice(0,10)
}
const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN', {day:'numeric', month:'short', timeZone:'UTC'})
const chartColors = { green:'#6ee7a7', blue:'#71b7e6', red:'#ee8997', grid:'#263036' }

function downloadCSV(filename, columns, rows) {
  const quote = value => {
    let str = String(value ?? '')
    if (/^[\t\r=+@-]/.test(str)) str = `'${str}`
    return `"${str.replaceAll('"', '""')}"`
  }
  const csv = '\uFEFF' + [columns, ...rows].map(row => row.map(quote).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}))
  const link = document.createElement('a')
  link.href=url; link.download=filename; link.click()
  setTimeout(()=>URL.revokeObjectURL(url), 1000)
}

function Metric({icon:Icon, title, value, note, color='emerald'}) {
  const colors = color === 'rose' ? 'text-rose-300 bg-rose-400/10' : color === 'blue' ? 'text-sky-300 bg-sky-400/10' : 'text-emerald-300 bg-emerald-400/10'
  return <div className="panel !p-5">
    <div className="flex justify-between gap-3 items-start"><span className="text-xs text-slate-400">{title}</span><span className={`p-2 rounded-lg ${colors}`}><Icon size={17}/></span></div>
    <div className="text-3xl font-bold mt-4 tabular-nums tracking-tight">{value}</div>
    <p className="text-xs text-slate-500 mt-1">{note}</p>
  </div>
}
function Section({title,subtitle,children,action}) {
  return <section className="panel">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-100">{title}</h3><p className="text-xs text-slate-500 mt-1">{subtitle}</p></div>{action}</div>
    {children}
  </section>
}
const tooltipStyle = {background:'#171e22',border:'1px solid #2a343a',borderRadius:12,color:'#e5ecea'}

export default function Analytics({ divisions }) {
  const today = dateIST()
  const [period, setPeriod] = useState('30')
  const [fromDate, setFromDate] = useState(daysBefore(today,29))
  const [toDate, setToDate] = useState(today)
  const [division, setDivision] = useState('')
  const [threshold, setThreshold] = useState(75)
  const [search, setSearch] = useState('')
  const [response, setResponse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const dateRange = useMemo(() => {
    if (period === 'custom') return {from:fromDate, to:toDate}
    if (period === 'month') return {from:`${today.slice(0,7)}-01`, to:today}
    return {from:daysBefore(today,Number(period)-1),to:today}
  },[period,fromDate,toDate,today])

  const load = useCallback(async (quiet=false, cancelled=()=>false) => {
    if (!quiet) setLoading(true)
    try {
      if (!dateRange.from || !dateRange.to || dateRange.from > dateRange.to) throw new Error('Choose a valid date range.')
      const span = (new Date(`${dateRange.to}T12:00:00Z`) - new Date(`${dateRange.from}T12:00:00Z`))/86400000
      if (span > 365) throw new Error('Choose 366 days or fewer.')
      const {data,error} = await supabase.rpc('smartattend_analytics', {
        p_start_date:dateRange.from,
        p_end_date:dateRange.to,
        p_division_id:division || null
      })
      if (error) throw error
      if (cancelled()) return
      setResponse(data)
      setLastUpdated(new Date())
      setError('')
    } catch(e) {
      if (!cancelled()) setError(e?.message || 'Analytics could not be loaded.')
    } finally {
      if (!cancelled()) setLoading(false)
    }
  },[dateRange.from,dateRange.to,division])

  useEffect(() => {
    let stopped = false
    const cancelled=()=>stopped
    load(false,cancelled)
    const timer = setInterval(()=>load(true,cancelled),30000)
    const channel = supabase.channel('smartattend-analytics')
      .on('postgres_changes',{event:'*',schema:'public',table:'attendance'},()=>load(true,cancelled))
      .on('postgres_changes',{event:'*',schema:'public',table:'class_sessions'},()=>load(true,cancelled))
      .subscribe()
    return ()=>{stopped=true;clearInterval(timer);supabase.removeChannel(channel)}
  },[load])

  const data = response || {summary:{},subjects:[],students:[],daily:[],monthly:[]}
  const summary = data.summary || {}
  const students = data.students || []
  const subjects = data.subjects || []
  const days = (data.daily||[]).map(d=>({...d, label:dateLabel(d.day),attended:Number(d.attended),absent:Number(d.absent),percentage:d.percentage==null?null:Number(d.percentage)}))
  const months = (data.monthly||[]).map(d=>({...d,attended:Number(d.attended),absent:Number(d.absent)}))
  const atRisk = students.filter(s=>Number(s.total)>0 && s.percentage !== null && Number(s.percentage)<threshold)
  const studentRows = students.filter(s=>`${s.full_name} ${s.roll_no||''} ${s.division_name}`.toLowerCase().includes(search.toLowerCase()))
  const hasClasses = Number(summary.expected)>0

  const studentCSV = students.map(s=>[s.full_name,s.roll_no,s.division_name,s.total,s.attended,s.late,s.absent,s.percentage==null?'N/A':s.percentage,Number(s.total)===0?'No completed classes':Number(s.percentage)<threshold?'At risk':'On track'])
  const subjectCSV = subjects.map(s=>[s.subject_name,s.division_name,s.sessions,s.expected,s.attended,s.late,s.absent,s.percentage])
  const dailyCSV = days.map(s=>[s.day,s.expected,s.attended,s.absent,s.percentage ?? 'N/A'])

  return <div className="space-y-5">
    <Section title="Analytics controls" subtitle="All percentages use completed classes only; cancelled and RFID_TEST demo sessions are excluded." action={<button className="button-secondary" onClick={()=>load(false)} disabled={loading}><RefreshCcw size={15} className={loading?'animate-spin':''}/>Refresh</button>}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="field-label min-w-[155px] flex-1">Date range
          <select className="field" value={period} onChange={e=>setPeriod(e.target.value)}>
            <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
            <option value="month">This month</option><option value="custom">Custom range</option>
          </select>
        </label>
        <label className="field-label min-w-[180px] flex-1">Division
          <select className="field" value={division} onChange={e=>setDivision(e.target.value)}>
            <option value="">All divisions</option>
            {divisions.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="field-label min-w-[140px]">Low-attendance threshold
          <select className="field" value={threshold} onChange={e=>setThreshold(Number(e.target.value))}>
            <option value={65}>65%</option><option value={70}>70%</option><option value={75}>75%</option><option value={80}>80%</option><option value={85}>85%</option>
          </select>
        </label>
      </div>
      {period==='custom' && <div className="flex flex-wrap gap-3 mt-3"><label className="field-label flex-1">From<input className="field" type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label><label className="field-label flex-1">To<input className="field" type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></label></div>}
      <p className="text-xs mt-4 text-slate-500">Reporting period: {dateRange.from} to {dateRange.to} · Time zone: Asia/Kolkata · {lastUpdated?`Updated ${lastUpdated.toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'})}`:'Not loaded yet'}</p>
    </Section>

    {error && <div className="error-banner" role="alert">{error} · If it says “function not found”, run <code>supabase/03_analytics.sql</code> in Supabase SQL Editor.</div>}
    {loading && !response ? <div className="panel text-slate-400 text-center py-12">Loading attendance analytics…</div> : <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric icon={Activity} title="Attendance rate" value={formatPct(summary.percentage)} note="Completed classes only"/>
        <Metric icon={CheckCircle2} title="Present / late" value={formatN(summary.attended)} note={`${formatN(summary.late)} late check-ins`} color="blue"/>
        <Metric icon={CalendarDays} title="Completed lectures" value={formatN(summary.sessions)} note={`${formatN(summary.expected)} expected student-attendances`}/>
        <Metric icon={AlertTriangle} title={`Below ${threshold}%`} value={formatN(atRisk.length)} note="Students with eligible completed classes" color="rose"/>
      </div>
      {!hasClasses && <div className="panel border-amber-500/20 text-sm text-amber-100/90">No completed academic lecture sessions in this date range yet. Rates remain blank instead of showing a misleading 0%. Add real timetable slots, let the daily Cron run, and wait until at least one lecture is completed. The demo RFID_TEST subject is intentionally excluded.</div>}
      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-5">
        <Section title="Daily attendance" subtitle="Attended vs absent student-session records">
          <div className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={days} margin={{left:-18,right:8,top:8,bottom:0}}>
            <defs><linearGradient id="anaGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={chartColors.green} stopOpacity={.28}/><stop offset="1" stopColor={chartColors.green} stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 5" vertical={false}/><XAxis dataKey="label" tick={{fill:'#85919b',fontSize:10}} tickLine={false} axisLine={false} minTickGap={18}/><YAxis allowDecimals={false} tick={{fill:'#85919b',fontSize:10}} tickLine={false} axisLine={false}/><Tooltip contentStyle={tooltipStyle}/>
            <Area type="monotone" dataKey="attended" stroke={chartColors.green} fill="url(#anaGreen)" strokeWidth={2} name="Present / late"/><Area type="monotone" dataKey="absent" stroke={chartColors.red} fill="transparent" strokeWidth={1.7} name="Absent"/>
          </AreaChart></ResponsiveContainer></div>
        </Section>
        <Section title="Monthly trend" subtitle="Completed student-lecture outcomes by month">
          {months.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={months} margin={{left:-18,right:8,top:8,bottom:0}}><CartesianGrid stroke={chartColors.grid} strokeDasharray="3 5" vertical={false}/><XAxis dataKey="month" tick={{fill:'#85919b',fontSize:11}} tickLine={false} axisLine={false}/><YAxis allowDecimals={false} tick={{fill:'#85919b',fontSize:11}} tickLine={false} axisLine={false}/><Tooltip contentStyle={tooltipStyle}/><Legend/><Bar dataKey="attended" stackId="a" fill={chartColors.green} name="Present"/><Bar dataKey="absent" stackId="a" fill={chartColors.red} name="Absent"/></BarChart></ResponsiveContainer></div> : <p className="text-slate-500 text-sm">No completed lectures in this period.</p>}
        </Section>
      </div>
      <Section title="Subject-wise attendance" subtitle="Each subject is calculated separately per division." action={<button className="button-secondary" onClick={()=>downloadCSV(`smartattend-subjects-${dateRange.from}-${dateRange.to}.csv`,['Subject','Division','Classes','Expected','Present','Late','Absent','Percentage'],subjectCSV)}><ArrowDownToLine size={15}/>Export subjects</button>}>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Subject</th><th>Division</th><th>Lectures</th><th>Present</th><th>Absent</th><th>Attendance</th></tr></thead><tbody>{subjects.map(s=><tr key={`${s.subject_id}-${s.division_id}`}><td className="font-medium text-slate-200">{s.subject_name}</td><td>{s.division_name}</td><td>{formatN(s.sessions)}</td><td>{formatN(s.attended)}</td><td>{formatN(s.absent)}</td><td><div className="min-w-28 flex gap-3 items-center"><div className="h-2 w-20 bg-white/10 rounded-full overflow-hidden"><div className="h-full rounded-full bg-emerald-400" style={{width:`${Math.max(0,Math.min(100,Number(s.percentage)||0))}%`}}/></div><span className="font-semibold">{formatPct(s.percentage)}</span></div></td></tr>)}</tbody></table>{!subjects.length&&<p className="text-sm text-slate-500 py-10 text-center">No academic subject sessions completed yet.</p>}</div>
      </Section>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.3fr] gap-5">
        <Section title={`At-risk students · below ${threshold}%`} subtitle="Only students with at least one completed class are ranked.">
          {atRisk.length ? <div className="space-y-2 max-h-[390px] overflow-y-auto">{atRisk.slice(0,30).map(s=><div key={s.student_id} className="rounded-lg bg-rose-500/[.045] border border-rose-500/15 p-3 flex justify-between gap-3"><div><p className="text-sm font-medium">{s.full_name}</p><p className="text-[11px] text-slate-500">{s.division_name} · Roll {s.roll_no||'—'} · {s.attended}/{s.total} lectures</p></div><span className="text-rose-300 font-bold tabular-nums">{formatPct(s.percentage)}</span></div>)}</div> : <p className="text-sm text-slate-500 py-9 text-center">No at-risk students for this range and threshold.</p>}
        </Section>
        <Section title="Student attendance summary" subtitle="Students with no completed lectures show N/A, not 0%." action={<button className="button-secondary" onClick={()=>downloadCSV(`smartattend-students-${dateRange.from}-${dateRange.to}.csv`,['Name','Roll No','Division','Expected','Present','Late','Absent','Percentage','Status'],studentCSV)}><ArrowDownToLine size={15}/>Export students</button>}>
          <div className="relative mb-4"><Search size={16} className="absolute top-1/2 -translate-y-1/2 left-3 text-slate-500"/><input className="field !pl-10" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search student, roll number or division..."/></div>
          <div className="table-wrap max-h-[400px] overflow-y-auto"><table className="data-table"><thead><tr><th>Student</th><th>Division</th><th>Present</th><th>Absent</th><th>Rate</th></tr></thead><tbody>{studentRows.map(s=><tr key={s.student_id}><td><div className="font-medium text-slate-200">{s.full_name}</div><div className="text-xs text-slate-500">Roll {s.roll_no||'—'}</div></td><td>{s.division_name}</td><td>{s.attended}/{s.total}</td><td>{s.absent}</td><td className={s.percentage !== null && Number(s.percentage)<threshold?'text-rose-300 font-semibold':'text-emerald-300 font-semibold'}>{formatPct(s.percentage)}</td></tr>)}</tbody></table>{!studentRows.length&&<p className="text-sm text-slate-500 py-9 text-center">No matching students.</p>}</div>
        </Section>
      </div>
      <Section title="Daily summary export" subtitle="Download a date-wise attendance report for the selected period." action={<button className="button-secondary" onClick={()=>downloadCSV(`smartattend-daily-${dateRange.from}-${dateRange.to}.csv`,['Date','Expected','Present','Absent','Percentage'],dailyCSV)}><ArrowDownToLine size={15}/>Export daily CSV</button>}>
        <p className="text-sm text-slate-400">{formatN(summary.expected)} expected student-attendances across {formatN(summary.sessions)} completed lectures. Attendance percentage = (present + late) ÷ expected × 100. A completed session without a recorded scan counts as an absence, including if the Cron job has not yet inserted an explicit absent row.</p>
      </Section>
    </>}
  </div>
}
