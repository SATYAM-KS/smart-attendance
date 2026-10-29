-- SMARTATTEND v4 VERIFICATION
-- Run after installing the timetable import, cron and batch-aware Edge Function.
SELECT count(*) AS imported_slots -- Expected: 35
FROM public.timetable WHERE source_ref LIKE 'NMIET-CSEAI-S5-2026-%';

SELECT CASE t.day_of_week WHEN 1 THEN 'Monday' WHEN 2 THEN 'Tuesday'
  WHEN 3 THEN 'Wednesday' WHEN 4 THEN 'Thursday' WHEN 5 THEN 'Friday'
  ELSE 'Weekend' END AS day,
  t.start_time,t.end_time,s.subject_code,t.batch,t.room,t.session_type,t.is_active
FROM public.timetable t JOIN public.subjects s ON s.id=t.subject_id
WHERE t.source_ref LIKE 'NMIET-CSEAI-S5-2026-%'
ORDER BY t.day_of_week,t.start_time,t.batch NULLS FIRST;

-- Check for multiple active slots for the SAME student group.
-- Parallel T1/T2/T3 practicals are legitimate and not flagged.
SELECT a.day_of_week, a.start_time AS a_start, a.end_time AS a_end,
  a.batch AS a_batch, b.start_time AS b_start, b.end_time AS b_end,
  b.batch AS b_batch, a.source_ref AS a_ref,b.source_ref AS b_ref
FROM public.timetable a JOIN public.timetable b
 ON a.id<b.id AND a.division_id=b.division_id
 AND a.day_of_week=b.day_of_week
 AND a.is_active AND b.is_active
 AND a.start_time<b.end_time AND b.start_time<a.end_time
 AND (a.batch IS NULL OR b.batch IS NULL OR a.batch=b.batch)
WHERE a.division_id=(SELECT id FROM public.divisions WHERE name='CSE-A')
ORDER BY a.day_of_week,a.start_time;
-- Expected no rows for a conflict-free schedule. If rows appear,
-- archive older manual entries from the Timetable page.

SELECT full_name,roll_no,rfid_uid,batch FROM public.students
WHERE division_id=(SELECT id FROM public.divisions WHERE name='CSE-A')
ORDER BY roll_no;

SELECT cs.session_date,cs.start_time,cs.end_time,s.subject_code,
  cs.batch,cs.room,cs.status
FROM public.class_sessions cs
JOIN public.subjects s ON s.id=cs.subject_id
WHERE cs.session_date=(now() AT TIME ZONE 'Asia/Kolkata')::date
ORDER BY cs.start_time,cs.batch NULLS FIRST;
