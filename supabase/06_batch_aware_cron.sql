-- SMARTATTEND v4: batch-aware daily attendance and timetable materialization
-- Run after 05_nmiet_timetable_import.sql.
-- Supersedes prior smartattend_maintain_sessions() while preserving job name.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE OR REPLACE FUNCTION public.smartattend_maintain_sessions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $body$
DECLARE
  today_ist date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  current_ist time := (now() AT TIME ZONE 'Asia/Kolkata')::time;
  created_count integer := 0;
  started_count integer := 0;
  absent_count integer := 0;
  completed_count integer := 0;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(16002,2027);

  -- Make one real session per WEEKLY row/day (including simultaneous T1/T2/T3).
  INSERT INTO public.class_sessions
    (timetable_id, division_id, subject_id, session_date,
     start_time, end_time, room, status, batch, session_type, instructor_code)
  SELECT t.id,t.division_id,t.subject_id,today_ist,
         t.start_time,t.end_time,t.room,'scheduled',t.batch,t.session_type,t.instructor_code
  FROM public.timetable t
  WHERE t.is_active
    AND t.day_of_week = EXTRACT(ISODOW FROM today_ist)::integer
    AND NOT EXISTS (SELECT 1 FROM public.holidays h WHERE h.holiday_date = today_ist)
  ON CONFLICT(timetable_id,session_date) DO NOTHING;
  GET DIAGNOSTICS created_count = ROW_COUNT;

  UPDATE public.class_sessions cs SET status='ongoing'
  WHERE cs.session_date=today_ist
    AND cs.status='scheduled'
    AND cs.start_time <= current_ist
    AND cs.end_time > current_ist;
  GET DIAGNOSTICS started_count = ROW_COUNT;

  -- Students are eligible for all-group lectures plus ONLY their assigned
  -- practical batch. Unassigned students are intentionally excluded from labs.
  INSERT INTO public.attendance(student_id,session_id,status,source)
  SELECT s.id,cs.id,'absent','system'
  FROM public.class_sessions cs
  JOIN public.students s
    ON s.division_id=cs.division_id
   AND (cs.batch IS NULL OR s.batch=cs.batch)
   AND s.is_active
   AND (s.created_at AT TIME ZONE 'Asia/Kolkata')::date <= cs.session_date
  WHERE cs.session_date=today_ist
    AND cs.end_time<=current_ist
    AND cs.status IN ('scheduled','ongoing')
  ON CONFLICT(student_id,session_id) DO NOTHING;
  GET DIAGNOSTICS absent_count = ROW_COUNT;

  UPDATE public.class_sessions SET status='completed'
  WHERE session_date=today_ist
    AND end_time <= current_ist
    AND status IN ('scheduled','ongoing');
  GET DIAGNOSTICS completed_count = ROW_COUNT;

  RETURN jsonb_build_object('date',today_ist,
    'sessions_created',created_count,'sessions_started',started_count,
    'absences_added',absent_count,'sessions_completed',completed_count);
END;
$body$;

REVOKE ALL ON FUNCTION public.smartattend_maintain_sessions()
  FROM PUBLIC, anon, authenticated;

-- Reuses the same named job instead of adding another scheduler.
SELECT cron.schedule(
  'smartattend-session-maintenance',
  '*/5 * * * *',
  'SELECT public.smartattend_maintain_sessions();'
);

SELECT public.smartattend_maintain_sessions();
