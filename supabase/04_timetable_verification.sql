-- SMARTATTEND v3: Timetable checks only.
-- Does not modify student records, schedule, attendance, or cron.
-- Run in Supabase SQL Editor to verify your saved weekly timetable.

SELECT
  t.id,
  d.name AS division,
  s.subject_name,
  t.day_of_week,
  CASE t.day_of_week
    WHEN 1 THEN 'Monday' WHEN 2 THEN 'Tuesday'
    WHEN 3 THEN 'Wednesday' WHEN 4 THEN 'Thursday'
    WHEN 5 THEN 'Friday' WHEN 6 THEN 'Saturday'
    WHEN 7 THEN 'Sunday'
  END AS weekday,
  t.start_time,
  t.end_time,
  t.room,
  t.is_active
FROM public.timetable t
JOIN public.divisions d ON d.id = t.division_id
JOIN public.subjects s ON s.id = t.subject_id
ORDER BY d.name, t.day_of_week, t.start_time;

-- Detect overlapping active classes for the same division.
SELECT
  d.name AS division,
  a.day_of_week,
  a.id AS slot_a,
  b.id AS slot_b,
  a.start_time AS a_start,
  a.end_time AS a_end,
  b.start_time AS b_start,
  b.end_time AS b_end
FROM public.timetable a
JOIN public.timetable b
  ON a.id < b.id
 AND a.division_id = b.division_id
 AND a.day_of_week = b.day_of_week
 AND a.is_active AND b.is_active
 AND a.start_time < b.end_time
 AND b.start_time < a.end_time
JOIN public.divisions d ON d.id = a.division_id;

-- Confirm today's sessions are being created.
SELECT cs.session_date, d.name AS division, s.subject_name,
       cs.start_time, cs.end_time, cs.room, cs.status
FROM public.class_sessions cs
JOIN public.divisions d ON d.id = cs.division_id
JOIN public.subjects s ON s.id = cs.subject_id
WHERE cs.session_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
ORDER BY cs.start_time;
