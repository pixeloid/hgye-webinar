-- Create user roles enum
CREATE TYPE user_role AS ENUM ('admin', 'viewer', 'moderator');

-- Create meetings table
CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  meeting_number text NOT NULL UNIQUE,
  passcode text,
  start_time timestamptz NOT NULL,
  duration integer DEFAULT 60, -- duration in minutes
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  zoom_sdk_key text,
  max_participants integer DEFAULT 200,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user profiles table with roles
CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  role user_role NOT NULL DEFAULT 'viewer',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Update invitees table to link with meetings
ALTER TABLE public.invitees
ADD COLUMN meeting_id uuid REFERENCES public.meetings(id) ON DELETE CASCADE,
ADD COLUMN invited_by uuid REFERENCES auth.users(id);

-- Create index for better performance
CREATE INDEX idx_invitees_meeting_id ON public.invitees(meeting_id);
CREATE INDEX idx_meetings_status ON public.meetings(status);
CREATE INDEX idx_meetings_start_time ON public.meetings(start_time);
CREATE INDEX idx_user_profiles_role ON public.user_profiles(role);

-- RLS Policies for meetings
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- Admins can do everything with meetings
CREATE POLICY "admins_all_meetings" ON public.meetings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Viewers can only read meetings they're invited to
CREATE POLICY "viewers_read_invited_meetings" ON public.meetings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invitees
      WHERE invitees.meeting_id = meetings.id
      AND invitees.email = auth.email()
    )
  );

-- RLS Policies for user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "users_read_own_profile" ON public.user_profiles
  FOR SELECT
  USING (id = auth.uid());

-- Admins can read all profiles
CREATE POLICY "admins_read_all_profiles" ON public.user_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Only admins can update profiles
CREATE POLICY "admins_update_profiles" ON public.user_profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Only admins can insert profiles
CREATE POLICY "admins_insert_profiles" ON public.user_profiles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Update invitees RLS policies
DROP POLICY IF EXISTS "invitee_self_read" ON public.invitees;
DROP POLICY IF EXISTS "invitee_self_no_write" ON public.invitees;

-- Viewers can read their own invites
CREATE POLICY "viewers_read_own_invites" ON public.invitees
  FOR SELECT
  USING (email = auth.email());

-- Admins can do everything with invitees
CREATE POLICY "admins_all_invitees" ON public.invitees
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    COALESCE((new.raw_user_meta_data->>'role')::user_role, 'viewer')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create default admin user profile
-- Note: First create the admin user via Supabase Auth, then run this
/*
INSERT INTO public.user_profiles (id, email, full_name, role)
SELECT
  id,
  email,
  'System Administrator',
  'admin'::user_role
FROM auth.users
WHERE email = 'admin@example.com'
ON CONFLICT (id)
DO UPDATE SET role = 'admin'::user_role;
*/

-- Sample meeting data
/*
INSERT INTO public.meetings (
  title,
  description,
  meeting_number,
  passcode,
  start_time,
  duration,
  status,
  max_participants
) VALUES (
  'HGYE Webinárium 2025',
  'Éves szakmai találkozó és képzés',
  '12345678901',
  'abc123',
  '2025-02-01 14:00:00+01',
  90,
  'scheduled',
  200
);
*/