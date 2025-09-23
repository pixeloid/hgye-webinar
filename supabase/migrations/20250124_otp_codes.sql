-- Create table for OTP codes
create table public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz default now()
);

-- Index for faster lookups
create index idx_otp_codes_email on public.otp_codes(email);
create index idx_otp_codes_expires on public.otp_codes(expires_at);

-- Cleanup old/expired OTP codes periodically
create or replace function cleanup_expired_otps() returns void as $$
begin
  delete from public.otp_codes where expires_at < now() or used = true;
end;
$$ language plpgsql;

-- RLS policies
alter table public.otp_codes enable row level security;

-- Only service role can access OTP codes directly
create policy "otp_codes_service_only"
  on public.otp_codes for all
  using (false)
  with check (false);