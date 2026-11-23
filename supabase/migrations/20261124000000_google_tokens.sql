-- One Google refresh token per signed-in user, encrypted by the drive-token Edge Function.
-- RLS is on with no policies: only the service role (the Edge Function) can read or write it.
create table if not exists public.google_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.google_tokens enable row level security;
revoke all on public.google_tokens from anon, authenticated;
-- Projects that do not grant API access to new tables automatically need this for the function.
grant select, insert, update, delete on public.google_tokens to service_role;
