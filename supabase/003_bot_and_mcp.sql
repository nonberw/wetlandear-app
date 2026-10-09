-- Run once in the Supabase SQL editor.
-- Telegram bot and MCP server act for the signed-in person through the server (secret key). Give that server role only what it needs.

-- Personal access keys for AI assistants (MCP). Only the SHA-256 hash is stored; the key itself is shown once in the app.
create table if not exists public.api_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  label text,
  created_at timestamptz not null default now(),
  last_used timestamptz
);
alter table public.api_tokens enable row level security;
drop policy if exists "own tokens" on public.api_tokens;
create policy "own tokens" on public.api_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.api_tokens from anon, authenticated;
grant select (token_hash, label, created_at, last_used), insert (token_hash, label), delete on public.api_tokens to authenticated;
grant select, update (last_used) on public.api_tokens to service_role;

-- What the server may change on behalf of a person (every query is filtered by that person's id in the code).
grant update (status, species, reviewed_at) on public.detections to service_role;
grant select, insert, update, delete on public.stations to service_role;
grant select on public.recordings to service_role;
