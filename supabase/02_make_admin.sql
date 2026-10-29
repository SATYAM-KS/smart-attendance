-- Step 1: Supabase Dashboard -> Authentication -> Users -> Add user.
-- Create an email/password user first. Then replace the example email below.
-- Run in SQL Editor. Keep this file private if you put in your own email.

DO $$
DECLARE target_user uuid;
BEGIN
  SELECT id INTO target_user
  FROM auth.users
  WHERE lower(email) = lower('REPLACE_WITH_YOUR_ADMIN_EMAIL')
  LIMIT 1;

  IF target_user IS NULL THEN
    RAISE EXCEPTION 'No Auth user with that email. Create user in Authentication > Users first.';
  END IF;

  INSERT INTO public.profiles (user_id, full_name, role)
  VALUES (target_user, 'SmartAttend Administrator', 'admin')
  ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
END $$;

-- Confirm that your admin profile exists:
SELECT p.full_name, p.role, u.email
FROM public.profiles p JOIN auth.users u ON u.id = p.user_id
WHERE p.role = 'admin';
