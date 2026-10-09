-- WetlandEar App: accounts, profiles and synced observations.
-- Every row belongs to one user. Row level security lets a user see and change only their own rows.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  organization text,
  role text,
  created_at timestamptz not null default now()
);

create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  lat double precision,
  lon double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.recordings (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text,
  started_at timestamptz,
  duration double precision,
  station text,
  lat double precision,
  lon double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.detections (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  rec_id text,
  ts timestamptz not null,
  t0 double precision,
  t1 double precision,
  f_low integer,
  f_high integer,
  f_peak integer,
  snr double precision,
  status text not null default 'auto' check (status in ('auto', 'confirmed', 'rejected')),
  species text,
  suggest jsonb,
  station text,
  lat double precision,
  lon double precision,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists detections_user_ts on public.detections (user_id, ts desc);
create index if not exists recordings_user on public.recordings (user_id);
create index if not exists stations_user on public.stations (user_id);

alter table public.profiles enable row level security;
alter table public.stations enable row level security;
alter table public.recordings enable row level security;
alter table public.detections enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "own stations" on public.stations;
create policy "own stations" on public.stations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own recordings" on public.recordings;
create policy "own recordings" on public.recordings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own detections" on public.detections;
create policy "own detections" on public.detections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.stations, public.recordings, public.detections to authenticated;

-- Create a profile on first sign in, filled from the Google account.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
          new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Private audio clips: one folder per user.
insert into storage.buckets (id, name, public) values ('clips', 'clips', false) on conflict (id) do nothing;

drop policy if exists "own clips read" on storage.objects;
create policy "own clips read" on storage.objects for select to authenticated
  using (bucket_id = 'clips' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "own clips write" on storage.objects;
create policy "own clips write" on storage.objects for insert to authenticated
  with check (bucket_id = 'clips' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "own clips delete" on storage.objects;
create policy "own clips delete" on storage.objects for delete to authenticated
  using (bucket_id = 'clips' and (storage.foldername(name))[1] = (select auth.uid())::text);
alter table public.detections add column if not exists sound jsonb;
alter table public.detections add column if not exists emb text;

-- Telegram morning report: one link per user. chat_id is written only by the server (secret key), never by the user.
create table if not exists public.telegram_links (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  code text unique,
  chat_id bigint,
  enabled boolean not null default true,
  lang text not null default 'ru' check (lang in ('ru', 'en')),
  created_at timestamptz not null default now()
);
alter table public.telegram_links enable row level security;
create policy "own link select" on public.telegram_links for select to authenticated using (user_id = (select auth.uid()));
create policy "own link insert" on public.telegram_links for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own link update" on public.telegram_links for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own link delete" on public.telegram_links for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.telegram_links from anon, authenticated;
grant select on public.telegram_links to authenticated;
grant insert (user_id, code, enabled, lang) on public.telegram_links to authenticated;
grant update (code, enabled, lang) on public.telegram_links to authenticated;
grant delete on public.telegram_links to authenticated;
grant usage on schema public to service_role;
grant all on public.telegram_links to service_role;
grant select on public.detections to service_role;
grant select on public.profiles to service_role;
