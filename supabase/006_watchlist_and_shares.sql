-- Run once in the Supabase SQL editor (after 005). Safe to run again.

-- ============ Watchlist: species the person wants an instant Telegram message about ============
alter table public.telegram_links add column if not exists watch jsonb not null default '[]'::jsonb;
grant update (watch) on public.telegram_links to authenticated;

-- ============ Sharing training samples with the project ============
-- Only the sound fingerprint (1024 numbers) of an event the person confirmed, the species and a rounded location. No audio leaves the device.
create table if not exists public.training_shares (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  det_id text not null,
  species text not null,
  common text,
  sci text,
  emb text not null,
  station text,
  lat double precision,
  lon double precision,
  consent text not null default 'research-noncommercial-v1',
  created_at timestamptz not null default now(),
  unique (user_id, det_id)
);
alter table public.training_shares enable row level security;
drop policy if exists "own shares" on public.training_shares;
create policy "own shares" on public.training_shares for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.training_shares from anon, authenticated;
grant select, delete on public.training_shares to authenticated;
grant insert (det_id, species, common, sci, emb, station, lat, lon, consent) on public.training_shares to authenticated;
grant select on public.training_shares to service_role;
