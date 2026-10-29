-- SMARTATTEND v4 | NMIET Third Year CSE(AI), Sem I, 2026-27
-- Source: timetable effective 03 August 2026, supplied by user.
-- Run as SQL Editor project owner BEFORE updating Edge Function or website.
-- The existing division CSE-A is used, and all students remain registered.
-- T1/T2/T3 practical sessions require students.batch to be assigned.
-- Room filter is cleared on the portable demo ESP32; student division + batch + time
-- determine the correct lecture (NOT whichever separate lab room is printed).

BEGIN;

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS batch text;
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS batch text;
ALTER TABLE public.class_sessions ADD COLUMN IF NOT EXISTS batch text;
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'lecture';
ALTER TABLE public.class_sessions ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'lecture';
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS instructor_code text;
ALTER TABLE public.class_sessions ADD COLUMN IF NOT EXISTS instructor_code text;
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS source_ref text;

DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='smartattend_students_batch_check') THEN
   ALTER TABLE public.students ADD CONSTRAINT smartattend_students_batch_check CHECK (batch IS NULL OR batch IN ('T1','T2','T3'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='smartattend_timetable_batch_check') THEN
   ALTER TABLE public.timetable ADD CONSTRAINT smartattend_timetable_batch_check CHECK (batch IS NULL OR batch IN ('T1','T2','T3'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='smartattend_sessions_batch_check') THEN
   ALTER TABLE public.class_sessions ADD CONSTRAINT smartattend_sessions_batch_check CHECK (batch IS NULL OR batch IN ('T1','T2','T3'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='smartattend_timetable_kind_check') THEN
   ALTER TABLE public.timetable ADD CONSTRAINT smartattend_timetable_kind_check CHECK (session_type IN ('lecture','practical','tutorial','activity','elective'));
 END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS timetable_source_ref_unique ON public.timetable(source_ref)
  WHERE source_ref IS NOT NULL;

-- Ensure the academic subjects exist. Existing subject codes with other meanings
-- should be checked before running; these codes are chosen to avoid collisions.
INSERT INTO public.subjects(subject_code,subject_name,is_active) VALUES
 ('TOC','Theory of Computation',true),
 ('ML','Machine Learning',true),
 ('DAA','Design and Analysis of Algorithms',true),
 ('IOT','Internet of Things',true),
 ('PEC1','Programme Elective I (Soft Computing)',true),
 ('OE3','Open Elective III (IPR and Cyber Laws)',true),
 ('TP','Training and Placement',true),
 ('RD','Research and Development',true)
ON CONFLICT(subject_code) DO UPDATE SET is_active=true;

-- Staging values: day, start, end, subject code, batch,
-- room, teacher initials, type, stable unique import identifier.
-- NULL batch means whole division.
WITH imported(day_no,start_at,end_at,code,batch,room,teacher,kind,tag) AS (
 VALUES
 -- MONDAY morning parallel practicals / mid-day theory / afternoon practicals
 (1,'08:30','10:30','IOT','T1','203','SM','practical','MON-AM-T1'),
 (1,'08:30','10:30','PEC1','T2','205','SS','practical','MON-AM-T2'),
 (1,'08:30','10:30','ML','T3','206','PB','practical','MON-AM-T3'),
 (1,'10:40','11:40','ML',NULL,'310','PB','lecture','MON-1040'),
 (1,'11:40','12:40','DAA',NULL,'310','BD','lecture','MON-1140'),
 (1,'13:30','15:30','PEC1','T1','205','SS','practical','MON-PM-T1'),
 (1,'13:30','15:30','ML','T2','206','PB','practical','MON-PM-T2'),
 (1,'13:30','15:30','IOT','T3','203','SM','practical','MON-PM-T3'),
 -- TUESDAY
 (2,'08:30','10:30','IOT','T1','203','SM','practical','TUE-AM-T1'),
 (2,'08:30','10:30','DAA','T2','202','BD','practical','TUE-AM-T2'),
 (2,'08:30','10:30','ML','T3','206','PB','practical','TUE-AM-T3'),
 (2,'10:40','11:40','DAA',NULL,'310','BD','lecture','TUE-1040'),
 (2,'11:40','12:40','IOT',NULL,'310','ND','tutorial','TUE-1140'),
 (2,'13:30','15:30','ML','T1','206','PB','practical','TUE-PM-T1'),
 (2,'13:30','15:30','IOT','T2','203','ND','practical','TUE-PM-T2'),
 (2,'13:30','15:30','PEC1','T3','205','SS','practical','TUE-PM-T3'),
 -- WEDNESDAY
 (3,'08:30','10:30','ML','T1','206','PB','practical','WED-AM-T1'),
 (3,'08:30','10:30','IOT','T2','203','ND','practical','WED-AM-T2'),
 (3,'08:30','10:30','DAA','T3','202','BD','practical','WED-AM-T3'),
 (3,'10:40','11:40','ML',NULL,'310','PB','lecture','WED-1040'),
 (3,'11:40','12:40','TOC',NULL,'310','SM','lecture','WED-1140'),
 (3,'13:30','14:30','PEC1',NULL,'310','SS','lecture','WED-1330'),
 (3,'14:30','15:30','TP',NULL,'310',NULL,'activity','WED-1430'),
 -- THURSDAY
 (4,'08:30','09:30','OE3',NULL,'310','PB','elective','THU-0830'),
 (4,'09:30','10:30','DAA',NULL,'310','BD','lecture','THU-0930'),
 (4,'10:40','11:40','PEC1',NULL,'310','SS','lecture','THU-1040'),
 (4,'11:40','12:40','TOC',NULL,'310','SM','lecture','THU-1140'),
 (4,'13:30','15:30','DAA','T1','202','BD','practical','THU-PM-T1'),
 (4,'13:30','15:30','ML','T2','206','PB','practical','THU-PM-T2'),
 (4,'13:30','15:30','IOT','T3','203','ND','practical','THU-PM-T3'),
 -- FRIDAY
 (5,'08:30','09:30','TOC',NULL,'310','SM','lecture','FRI-0830'),
 (5,'09:30','10:30','OE3',NULL,'310','PB','elective','FRI-0930'),
 (5,'10:40','11:40','PEC1',NULL,'310','SS','lecture','FRI-1040'),
 (5,'11:40','12:40','ML',NULL,'310','PB','lecture','FRI-1140'),
 (5,'13:30','15:30','RD',NULL,'310',NULL,'activity','FRI-1330')
)
INSERT INTO public.timetable(
 division_id,subject_id,day_of_week,start_time,end_time,room,
 is_active,batch,session_type,instructor_code,source_ref
)
SELECT d.id, s.id, i.day_no, i.start_at::time,i.end_at::time,i.room,
 true, i.batch,i.kind,i.teacher,'NMIET-CSEAI-S5-2026-'||i.tag
FROM imported i
JOIN public.divisions d ON d.name='CSE-A'
JOIN public.subjects s ON s.subject_code=i.code
ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL
DO UPDATE SET
 division_id=EXCLUDED.division_id,subject_id=EXCLUDED.subject_id,
 day_of_week=EXCLUDED.day_of_week,start_time=EXCLUDED.start_time,
 end_time=EXCLUDED.end_time,room=EXCLUDED.room,batch=EXCLUDED.batch,
 session_type=EXCLUDED.session_type,instructor_code=EXCLUDED.instructor_code,
 is_active=true;

-- This is ONE portable device covering the division's various rooms.
-- Other fixed-position devices can retain their room assignment.
UPDATE public.devices
SET room=NULL
WHERE device_code='ESP32_MAIN_01';

-- Exclude the old all-day prototype lecture without deleting historical records.
UPDATE public.class_sessions SET status='cancelled'
WHERE subject_id=(SELECT id FROM public.subjects WHERE subject_code='RFID_TEST')
  AND session_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
  AND status IN ('scheduled','ongoing');

COMMIT;

SELECT count(*) AS imported_timetable_entries
FROM public.timetable
WHERE source_ref LIKE 'NMIET-CSEAI-S5-2026-%';
-- Expected 35

SELECT d.name AS division, t.day_of_week,
  s.subject_code,t.batch,t.session_type,t.start_time,t.end_time,t.room,t.instructor_code
FROM public.timetable t
JOIN public.subjects s ON s.id=t.subject_id
JOIN public.divisions d ON d.id=t.division_id
WHERE t.source_ref LIKE 'NMIET-CSEAI-S5-2026-%'
ORDER BY day_of_week,start_time,batch NULLS FIRST;
