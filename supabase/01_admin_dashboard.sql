-- SMARTATTEND WEB PORTAL SECURITY
-- Run in Supabase SQL Editor (as project owner).
-- Keeps RLS enabled and limits browser access to users with an admin profile.
-- The existing ESP32 Edge Function continues using server-side service credentials.

BEGIN;

-- A dedicated security-definer helper avoids recursive RLS checks on profiles.
CREATE OR REPLACE FUNCTION public.is_smartattend_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = (SELECT auth.uid()) AND p.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_smartattend_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_smartattend_admin() TO authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;

-- The portal needs read-only access to attendance and event logs.
GRANT SELECT ON
  public.divisions, public.students, public.subjects,
  public.timetable, public.class_sessions, public.attendance,
  public.scan_events, public.holidays, public.profiles
TO authenticated;

-- Do not expose the hashed ESP32 device key through browser queries.
REVOKE ALL ON public.devices FROM authenticated;
GRANT SELECT (id, device_code, device_name, division_id, room,
  is_active, last_seen_at, created_at) ON public.devices TO authenticated;

-- Only admin users may create/edit students, subjects, timetable entries.
GRANT INSERT, UPDATE, DELETE ON
  public.students, public.subjects, public.timetable
TO authenticated;

ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Safe to rerun.
DROP POLICY IF EXISTS smartattend_admin_read_divisions ON public.divisions;
DROP POLICY IF EXISTS smartattend_admin_manage_students ON public.students;
DROP POLICY IF EXISTS smartattend_admin_manage_subjects ON public.subjects;
DROP POLICY IF EXISTS smartattend_admin_manage_timetable ON public.timetable;
DROP POLICY IF EXISTS smartattend_admin_read_sessions ON public.class_sessions;
DROP POLICY IF EXISTS smartattend_admin_read_attendance ON public.attendance;
DROP POLICY IF EXISTS smartattend_admin_read_devices ON public.devices;
DROP POLICY IF EXISTS smartattend_admin_read_events ON public.scan_events;
DROP POLICY IF EXISTS smartattend_admin_read_holidays ON public.holidays;
DROP POLICY IF EXISTS smartattend_read_profiles ON public.profiles;

CREATE POLICY smartattend_admin_read_divisions ON public.divisions
FOR SELECT TO authenticated USING ((SELECT public.is_smartattend_admin()));

CREATE POLICY smartattend_admin_manage_students ON public.students
FOR ALL TO authenticated
USING ((SELECT public.is_smartattend_admin()))
WITH CHECK ((SELECT public.is_smartattend_admin()));

CREATE POLICY smartattend_admin_manage_subjects ON public.subjects
FOR ALL TO authenticated
USING ((SELECT public.is_smartattend_admin()))
WITH CHECK ((SELECT public.is_smartattend_admin()));

CREATE POLICY smartattend_admin_manage_timetable ON public.timetable
FOR ALL TO authenticated
USING ((SELECT public.is_smartattend_admin()))
WITH CHECK ((SELECT public.is_smartattend_admin()));

CREATE POLICY smartattend_admin_read_sessions ON public.class_sessions
FOR SELECT TO authenticated USING ((SELECT public.is_smartattend_admin()));

CREATE POLICY smartattend_admin_read_attendance ON public.attendance
FOR SELECT TO authenticated USING ((SELECT public.is_smartattend_admin()));

CREATE POLICY smartattend_admin_read_devices ON public.devices
FOR SELECT TO authenticated USING ((SELECT public.is_smartattend_admin()));

CREATE POLICY smartattend_admin_read_events ON public.scan_events
FOR SELECT TO authenticated USING ((SELECT public.is_smartattend_admin()));

CREATE POLICY smartattend_admin_read_holidays ON public.holidays
FOR SELECT TO authenticated USING ((SELECT public.is_smartattend_admin()));

CREATE POLICY smartattend_read_profiles ON public.profiles
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_smartattend_admin()));

COMMIT;

-- Realtime events (only safe insert events; avoid publishing deletes).
-- Supabase normally creates 'supabase_realtime'; guard against double-add.
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    EXECUTE 'CREATE PUBLICATION supabase_realtime';
  END IF;

  FOR t IN SELECT unnest(ARRAY['attendance', 'scan_events'])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime' AND puballtables
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('attendance', 'scan_events');
