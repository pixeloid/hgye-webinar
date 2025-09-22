-- Create invitees table: stores authorized participants
CREATE TABLE IF NOT EXISTS public.invitees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text,
  webinar_id text NOT NULL DEFAULT '12345678',
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'claimed', 'joined', 'completed', 'blocked')),
  device_hash text,
  zoom_registrant_id text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create sessions table: tracks active sessions and heartbeats
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitee_id uuid NOT NULL REFERENCES public.invitees(id) ON DELETE CASCADE,
  ip inet,
  user_agent text,
  device_hash text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  last_heartbeat_at timestamptz DEFAULT now()
);

-- Create access_logs table: audit trail
CREATE TABLE IF NOT EXISTS public.access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitee_id uuid REFERENCES public.invitees(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'magic_open', 'sdk_issued', 'join_denied', 'duplicate_attempt',
    'otp_sent', 'otp_verified', 'otp_failed', 'kicked', 'session_expired'
  )),
  meta jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_invitees_email ON public.invitees(email);
CREATE INDEX idx_invitees_status ON public.invitees(status);
CREATE INDEX idx_sessions_invitee_id ON public.sessions(invitee_id);
CREATE INDEX idx_sessions_active ON public.sessions(active) WHERE active = true;
CREATE INDEX idx_sessions_heartbeat ON public.sessions(last_heartbeat_at) WHERE active = true;
CREATE INDEX idx_access_logs_invitee_id ON public.access_logs(invitee_id);
CREATE INDEX idx_access_logs_event_type ON public.access_logs(event_type);
CREATE INDEX idx_access_logs_created_at ON public.access_logs(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE public.invitees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Policy: Users can only read their own invitee record
CREATE POLICY "invitee_self_read"
  ON public.invitees FOR SELECT
  USING (auth.email() = email);

-- Policy: Invitees table cannot be modified from client (only via Edge Functions)
CREATE POLICY "invitee_no_client_write"
  ON public.invitees FOR INSERT
  WITH CHECK (false);

CREATE POLICY "invitee_no_client_update"
  ON public.invitees FOR UPDATE
  USING (false);

CREATE POLICY "invitee_no_client_delete"
  ON public.invitees FOR DELETE
  USING (false);

-- Policy: Users can read their own sessions
CREATE POLICY "sessions_self_read"
  ON public.sessions FOR SELECT
  USING (
    invitee_id IN (
      SELECT id FROM public.invitees WHERE email = auth.email()
    )
  );

-- Policy: Sessions cannot be modified from client (only via Edge Functions)
CREATE POLICY "sessions_no_client_write"
  ON public.sessions FOR INSERT
  WITH CHECK (false);

CREATE POLICY "sessions_no_client_update"
  ON public.sessions FOR UPDATE
  USING (false);

CREATE POLICY "sessions_no_client_delete"
  ON public.sessions FOR DELETE
  USING (false);

-- Policy: Users can read their own access logs
CREATE POLICY "access_logs_self_read"
  ON public.access_logs FOR SELECT
  USING (
    invitee_id IN (
      SELECT id FROM public.invitees WHERE email = auth.email()
    )
  );

-- Policy: Access logs cannot be modified from client (only via Edge Functions)
CREATE POLICY "access_logs_no_client_write"
  ON public.access_logs FOR INSERT
  WITH CHECK (false);

CREATE POLICY "access_logs_no_client_update"
  ON public.access_logs FOR UPDATE
  USING (false);

CREATE POLICY "access_logs_no_client_delete"
  ON public.access_logs FOR DELETE
  USING (false);

-- Grant necessary permissions to authenticated users
GRANT SELECT ON public.invitees TO authenticated;
GRANT SELECT ON public.sessions TO authenticated;
GRANT SELECT ON public.access_logs TO authenticated;

-- Grant all permissions to service role (for Edge Functions)
GRANT ALL ON public.invitees TO service_role;
GRANT ALL ON public.sessions TO service_role;
GRANT ALL ON public.access_logs TO service_role;

-- Create a function to clean up stale sessions (optional)
CREATE OR REPLACE FUNCTION public.cleanup_stale_sessions()
RETURNS void AS $$
BEGIN
  UPDATE public.sessions
  SET active = false
  WHERE active = true
    AND last_heartbeat_at < now() - interval '1 minute';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Create a scheduled job to clean up stale sessions
-- (Requires pg_cron extension, which may not be available in local dev)
-- SELECT cron.schedule('cleanup-stale-sessions', '*/1 * * * *', 'SELECT public.cleanup_stale_sessions();');