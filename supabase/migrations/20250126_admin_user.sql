-- Create admin user (run this once after setup)
-- Password: admin123456

-- Note: You need to run this through Supabase dashboard or with service role key
-- The user will be created with this SQL:

/*
Run in SQL Editor in Supabase Dashboard:

-- Create admin user
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at,
  instance_id,
  aud,
  role
) VALUES (
  gen_random_uuid(),
  'admin@example.com',
  crypt('admin123456', gen_salt('bf')),
  now(),
  '{"role": "admin", "name": "System Admin"}'::jsonb,
  now(),
  now(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated'
);
*/

-- Alternative: Create admin through Supabase Auth Admin API
-- This is just documentation, actual user creation should be done via dashboard