# SmartAttend v4 — NMIET 2026–27 timetable import

A complete replacement for the previously supplied SmartAttend v3 React portal. It includes the scanned **NMIET Third Year CSE (AI), Semester I 2026–27** timetable, effective 03 August 2026. The schedule contains **35 class entries**, with 08:30–10:30 and 13:30–15:30 parallel T1/T2/T3 practical groups.

## Important: apply upgrades in this order

1. **Back up existing Supabase data** (at least `timetable`, `class_sessions`, `students`, `attendance`). Verify your existing division name is `CSE-A` (the name created during our SmartAttend setup). If your division is different, replace `d.name='CSE-A'` in the import and device mapping with the correct name.
2. Supabase **SQL Editor** → run **`supabase/05_nmiet_timetable_import.sql`**. This imports 35 academic slots and adds `batch`, `session_type`, `instructor_code` metadata. It does NOT delete old attendance or students. It sets the demo ESP32 `room` to NULL (portable scanner for multiple rooms) and cancels only active/future `RFID_TEST` demo sessions.
3. Supabase **SQL Editor** → run **`supabase/06_batch_aware_cron.sql`**. This replaces the existing named 5-minute Cron job's function with batch-aware session creation and absent marking. **Warning:** if run after some lectures have already ended today, it may immediately mark eligible students absent for those completed slots. For a clean demo, run at the start of a new academic day or review those records.
4. Supabase **SQL Editor** → run **`supabase/03_analytics.sql`** again. It now counts only each student's own practical batch in attendance percentages. Do not use the v3 analytics SQL after this migration.
5. Supabase Dashboard → **Edge Functions → scan-attendance → Code → Edit**. Replace the whole code with **`supabase/scan-attendance/index.ts`**, then deploy. Keep **Verify JWT OFF**. The device still authenticates through its own `x-device-key`; no ESP32 firmware changes are needed.
6. Extract this project and **copy your existing `.env.local`** from the previous portal into its root. Do not share or embed database secret keys in the browser project. Run `npm install` then `npm run dev` (Node 20.19+).
7. Open **Students** and assign **T1/T2/T3** using the new dropdown for every student (Satyam, Viraj, etc.). Never guess batch membership. Unassigned students can attend common lectures but will not be marked present/absent for parallel practical sessions.
8. Open **Timetable** and filter `All batches` or `T1/T2/T3`; compare against the image. Run **`supabase/07_verify_timetable.sql`** in Supabase to verify imported rows and to check for conflicts with older manually added slots.

## How matching now works

- Whole-class lectures have `batch = NULL` and apply to every student in the division.
- Practical classes have `batch = 'T1'`, `'T2'`, or `'T3'`. Only students belonging to that batch can mark that session, even though those practicals overlap in time.
- The demo ESP32 can be used in different classrooms without changing its database room assignment. The server matches by student division, student batch, and current India time. This is appropriate for a mobile prototype, not strict classroom-location enforcement.
- Cancelled lectures are excluded from attendance; the cron creates sessions for the current day only and runs every five minutes. Editing existing timetable entries does not rewrite or cancel previously generated class sessions.
- Breaks (10:30–10:40 and 12:40–13:30) are visually shown but not recorded as lectures.
- Classroom room numbers and faculty initials from the uploaded document are stored separately.
- T&P and R&D are treated as attendance-counted `activity` sessions by default. If your college does NOT count those in academic percentages, exclude them in `03_analytics.sql` or mark them cancelled through an admin workflow.
- The imported course names/abbreviations use the list printed at the bottom of the supplied timetable. Open Elective III is labelled 'IPR and Cyber Laws'.

## Existing data and security

- This release preserves the original attendance database, student RFID UIDs, the original admin login and your ESP32 wiring.
- The previous website's `.env.local` is **not included** in the ZIP. Copy it from your previous folder.
- The Supabase RLS policies still protect website data. The Edge Function uses its server-side key and validates the ESP32 device key before accessing protected tables.
- Do **not** paste the private ESP32 device key into `.env.local` or expose it in the website.
- Import SQL can be rerun using its stable `source_ref` identifiers, which update only the 35 imported slots. Existing manually created timetable rows remain untouched; if they overlap the imported schedule, archive them in the UI.

## Check a successful test

1. Scan at the actual lecture time, or create a controlled current-time test session; don't change your system clock.
2. The Edge Function returns `MARKED` on the first valid scan, `ALREADY_MARKED` on repeat, `NO_ACTIVE_CLASS` during breaks or if a student's batch is unassigned during a practical.
3. Check Supabase `scan_events`, `class_sessions`, `attendance` and the website's Live Scans page.

## Test/build status

React/JSX and TypeScript source passed static syntax parsing. `npm install`/full Vite build could not be completed in the authoring environment due to a package-registry DNS failure. Run `npm install` and `npm run build` locally, and share build errors if any.
