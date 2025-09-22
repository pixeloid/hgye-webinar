-- Seed data for testing
-- Insert test invitees

INSERT INTO public.invitees (email, full_name, webinar_id, status) VALUES
  ('test@example.com', 'Test User', '12345678', 'invited'),
  ('demo@example.com', 'Demo User', '12345678', 'invited'),
  ('user1@example.com', 'User One', '12345678', 'invited'),
  ('user2@example.com', 'User Two', '12345678', 'invited'),
  ('blocked@example.com', 'Blocked User', '12345678', 'blocked')
ON CONFLICT (email) DO NOTHING;

-- Optional: Create some test access logs
INSERT INTO public.access_logs (invitee_id, event_type, meta)
SELECT
  id,
  'magic_open',
  jsonb_build_object(
    'timestamp', now(),
    'test_data', true
  )
FROM public.invitees
WHERE email = 'test@example.com'
LIMIT 1;