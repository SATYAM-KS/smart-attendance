-- SMARTATTEND v2: Admin-only attendance analytics
-- Run once in Supabase SQL Editor after 01_admin_dashboard.sql.
-- Safe to rerun. Reads existing tables; does not modify attendance records.
-- Only completed, non-cancelled lecture sessions count toward attendance rates.
-- The RFID_TEST demo subject is excluded from academic percentages.

CREATE OR REPLACE FUNCTION public.smartattend_analytics(
  p_start_date date DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date - 29),
  p_end_date date DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  p_division_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  output jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_smartattend_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date
     OR (p_end_date - p_start_date) > 365 THEN
    RAISE EXCEPTION 'Select a valid date range of 366 days or fewer' USING ERRCODE = '22023';
  END IF;

  WITH eligible AS MATERIALIZED (
    SELECT
      cs.id AS session_id,
      cs.session_date,
      cs.subject_id,
      sub.subject_name,
      sub.subject_code,
      cs.division_id,
      s.id AS student_id,
      s.full_name,
      s.roll_no,
      d.name AS division_name,
      COALESCE(a.status IN ('present', 'late'), FALSE) AS attended,
      COALESCE(a.status = 'late', FALSE) AS late
    FROM public.class_sessions cs
    JOIN public.subjects sub ON sub.id = cs.subject_id
    JOIN public.divisions d ON d.id = cs.division_id
    JOIN public.students s ON s.division_id = cs.division_id
      AND (cs.batch IS NULL OR s.batch = cs.batch)
      AND s.is_active = TRUE
      AND (s.created_at AT TIME ZONE 'Asia/Kolkata')::date <= cs.session_date
    LEFT JOIN public.attendance a
      ON a.session_id = cs.id AND a.student_id = s.id
    WHERE cs.status = 'completed'
      AND cs.session_date BETWEEN p_start_date AND p_end_date
      AND (p_division_id IS NULL OR cs.division_id = p_division_id)
      AND sub.subject_code <> 'RFID_TEST'
  ),
  totals AS (
    SELECT
      count(DISTINCT session_id) AS sessions,
      count(*) AS expected,
      count(*) FILTER (WHERE attended) AS attended,
      count(*) FILTER (WHERE late) AS late,
      count(*) FILTER (WHERE NOT attended) AS absent
    FROM eligible
  ),
  by_subject AS (
    SELECT
      subject_id, subject_name, division_id, division_name,
      count(DISTINCT session_id) AS sessions,
      count(*) AS expected,
      count(*) FILTER (WHERE attended) AS attended,
      count(*) FILTER (WHERE late) AS late,
      count(*) FILTER (WHERE NOT attended) AS absent,
      round(100.0 * count(*) FILTER (WHERE attended) / nullif(count(*), 0), 1) AS percentage
    FROM eligible
    GROUP BY subject_id, subject_name, division_id, division_name
  ),
  by_student AS (
    SELECT
      s.id AS student_id, s.full_name, s.roll_no,
      d.id AS division_id, d.name AS division_name,
      count(e.session_id) AS total,
      count(e.session_id) FILTER (WHERE e.attended) AS attended,
      count(e.session_id) FILTER (WHERE e.late) AS late,
      count(e.session_id) FILTER (WHERE NOT e.attended) AS absent,
      round(100.0 * count(e.session_id) FILTER (WHERE e.attended) /
        nullif(count(e.session_id), 0), 1) AS percentage
    FROM public.students s
    JOIN public.divisions d ON d.id = s.division_id
    LEFT JOIN eligible e ON e.student_id = s.id
    WHERE s.is_active = TRUE
      AND (p_division_id IS NULL OR s.division_id = p_division_id)
    GROUP BY s.id, s.full_name, s.roll_no, d.id, d.name
  ),
  by_day AS (
    SELECT gs::date AS day,
      count(e.session_id) AS expected,
      count(e.session_id) FILTER (WHERE e.attended) AS attended,
      count(e.session_id) FILTER (WHERE NOT e.attended) AS absent,
      round(100.0 * count(e.session_id) FILTER (WHERE e.attended) /
        nullif(count(e.session_id), 0), 1) AS percentage
    FROM generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') AS gs
    LEFT JOIN eligible e ON e.session_date = gs::date
    GROUP BY gs::date
  ),
  by_month AS (
    SELECT to_char(session_date, 'YYYY-MM') AS month,
      count(*) AS expected,
      count(*) FILTER (WHERE attended) AS attended,
      count(*) FILTER (WHERE NOT attended) AS absent,
      round(100.0 * count(*) FILTER (WHERE attended) / nullif(count(*), 0), 1) AS percentage
    FROM eligible
    GROUP BY to_char(session_date, 'YYYY-MM')
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'summary', (
      SELECT jsonb_build_object(
        'sessions', sessions,
        'expected', expected,
        'attended', attended,
        'late', late,
        'absent', absent,
        'percentage', round(100.0 * attended / nullif(expected, 0), 1)
      ) FROM totals
    ),
    'subjects', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.percentage DESC NULLS LAST, t.subject_name, t.division_name)
      FROM by_subject t
    ), '[]'::jsonb),
    'students', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.percentage ASC NULLS LAST, t.full_name)
      FROM by_student t
    ), '[]'::jsonb),
    'daily', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.day) FROM by_day t
    ), '[]'::jsonb),
    'monthly', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.month) FROM by_month t
    ), '[]'::jsonb)
  ) INTO output;

  RETURN output;
END;
$function$;

REVOKE ALL ON FUNCTION public.smartattend_analytics(date,date,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.smartattend_analytics(date,date,uuid)
  TO authenticated;

-- Verify from SQL Editor (SQL Editor executes as project owner, and the
-- function intentionally requires a signed-in administrator):
-- SELECT proname FROM pg_proc WHERE proname = 'smartattend_analytics';
-- Test from your signed-in SmartAttend Analytics page instead.
