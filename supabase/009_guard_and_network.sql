-- Run once in the Supabase SQL editor (after 008). Safe to run again.
-- 1. A person's verdict on an alert (real violation or false alarm).
-- 2. Evidence log: records that are chained by hashes and cannot be changed or deleted through the API.
-- 3. Network of reserves: opt-in sharing of coarse, anonymous weekly counts of confirmed species, without exact places.

create extension if not exists pgcrypto with schema extensions;

alter table public.detections add column if not exists threat_review text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'detections_threat_review_chk') then
    alter table public.detections add constraint detections_threat_review_chk check (threat_review in ('confirmed', 'false'));
  end if;
end $$;

-- ============ Evidence log ============
create table if not exists public.evidence_log (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete restrict,
  seq bigint not null,
  det_id text not null,
  payload_text text not null,
  audio_sha256 text not null check (audio_sha256 ~ '^[0-9a-f]{64}$'),
  prev_hash text not null default '',
  chain_hash text not null default '',
  created_at timestamptz not null default now(),
  unique (owner, seq)
);
create index if not exists evidence_log_owner_det on public.evidence_log (owner, det_id);
-- The chain: each record hashes the previous record's hash, the audio hash and the event text. One chain per owner, inserts are serialised.
create or replace function public.evidence_chain() returns trigger language plpgsql security definer set search_path = '' as $$
declare prev_row record;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.owner::text, 7));
  select seq, chain_hash into prev_row from public.evidence_log where owner = new.owner order by seq desc limit 1;
  new.seq := coalesce(prev_row.seq, 0) + 1;
  new.prev_hash := coalesce(prev_row.chain_hash, repeat('0', 64));
  new.chain_hash := encode(extensions.digest(convert_to(new.prev_hash || '|' || new.audio_sha256 || '|' || new.payload_text, 'UTF8'), 'sha256'), 'hex');
  return new;
end $$;
create or replace function public.evidence_immutable() returns trigger language plpgsql as $$
begin raise exception 'evidence records cannot be changed or deleted'; end $$;
drop trigger if exists evidence_chain_ins on public.evidence_log;
create trigger evidence_chain_ins before insert on public.evidence_log for each row execute function public.evidence_chain();
drop trigger if exists evidence_no_change on public.evidence_log;
create trigger evidence_no_change before update or delete on public.evidence_log for each row execute function public.evidence_immutable();
drop trigger if exists evidence_no_truncate on public.evidence_log;
create trigger evidence_no_truncate before truncate on public.evidence_log for each statement execute function public.evidence_immutable();
alter table public.evidence_log enable row level security;
drop policy if exists "team reads evidence" on public.evidence_log;
create policy "team reads evidence" on public.evidence_log for select to authenticated using (public.is_peer(owner));
revoke all on public.evidence_log from anon, authenticated;
grant select on public.evidence_log to authenticated;
grant select, insert on public.evidence_log to service_role;   -- records are written only by the server (api/evidence.py), which computes the audio hash itself

-- ============ Network of reserves ============
create table if not exists public.network_members (
  owner uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  enabled boolean not null default false,
  label text check (char_length(label) <= 60),
  updated_at timestamptz not null default now()
);
create table if not exists public.network_obs (
  owner uuid not null references auth.users (id) on delete cascade,
  cell_lat real not null, cell_lon real not null,
  species text not null check (char_length(species) between 3 and 80),
  week date not null,
  n integer not null check (n between 1 and 100000),
  first_day date not null, last_day date not null,
  primary key (owner, cell_lat, cell_lon, species, week)
);
alter table public.network_members enable row level security;
alter table public.network_obs enable row level security;
drop policy if exists "own membership" on public.network_members;
create policy "own membership" on public.network_members for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
drop policy if exists "own observations" on public.network_obs;
create policy "own observations" on public.network_obs for select to authenticated using (owner = (select auth.uid()));
revoke all on public.network_members, public.network_obs from anon, authenticated;
grant select, insert, update on public.network_members to authenticated;
grant select on public.network_obs to authenticated;

-- A reserve publishes its picture of confirmed species per week. The place is cut to a one-degree cell (about 110 km); rare and nest-sensitive species are dropped here
-- as well as in the app. Every call replaces what this reserve published before.
create or replace function public.network_publish(p jsonb) returns integer language plpgsql security definer set search_path = '' as $$
declare r jsonb; cnt integer := 0; me uuid := (select auth.uid());
  sensitive text[] := array['pelecanus crispus','pelecanus onocrotalus','grus leucogeranus','otis tarda','chlamydotis macqueenii','tetrax tetrax','falco cherrug','falco peregrinus','falco biarmicus',
    'aquila heliaca','aquila nipalensis','aquila chrysaetos','clanga clanga','haliaeetus albicilla','haliaeetus leucoryphus','neophron percnopterus','gyps fulvus','aegypius monachus',
    'gypaetus barbatus','circaetus gallicus','hieraaetus pennatus','oxyura leucocephala','aythya nyroca','marmaronetta angustirostris','vanellus gregarius','glareola nordmanni',
    'larus relictus','ichthyaetus ichthyaetus','larus ichthyaetus','phoenicopterus roseus','platalea leucorodia','plegadis falcinellus','ciconia nigra','circus macrourus','bubo bubo',
    'tetraogallus altaicus','anser erythropus','branta ruficollis','charadrius leschenaultii','numenius tenuirostris'];
begin
  if me is null then raise exception 'sign in'; end if;
  if not exists (select 1 from public.network_members where owner = me and enabled) then raise exception 'not a member of the network'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 20000 then raise exception 'bad input'; end if;
  delete from public.network_obs where owner = me;
  for r in select * from jsonb_array_elements(p) loop
    continue when lower(coalesce(r ->> 'species', '')) = any (sensitive) or coalesce(r ->> 'species', '') = '';
    continue when (r ->> 'lat')::float not between -90 and 90 or (r ->> 'lon')::float not between -180 and 180;
    insert into public.network_obs (owner, cell_lat, cell_lon, species, week, n, first_day, last_day)
    values (me, (floor((r ->> 'lat')::float) + 0.5)::real, (floor((r ->> 'lon')::float) + 0.5)::real, left(r ->> 'species', 80), (r ->> 'week')::date, least(greatest((r ->> 'n')::int, 1), 100000), (r ->> 'first')::date, (r ->> 'last')::date)
    on conflict (owner, cell_lat, cell_lon, species, week) do update set n = excluded.n, first_day = least(public.network_obs.first_day, excluded.first_day), last_day = greatest(public.network_obs.last_day, excluded.last_day);
    cnt := cnt + 1;
  end loop;
  update public.network_members set updated_at = now() where owner = me;
  return cnt;
end $$;
-- What the network shows: only members can look, nobody sees who published what, only cells and weeks.
create or replace function public.network_view(p_days integer default 90) returns table (species text, cell_lat real, cell_lon real, week date, n bigint, owners bigint, first_day date, last_day date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists (select 1 from public.network_members where owner = (select auth.uid()) and enabled) then raise exception 'not a member of the network'; end if;
  return query select o.species, o.cell_lat, o.cell_lon, o.week, sum(o.n)::bigint, count(distinct o.owner)::bigint, min(o.first_day), max(o.last_day)
    from public.network_obs o join public.network_members m on m.owner = o.owner and m.enabled
    where o.week >= current_date - least(greatest(p_days, 7), 400) group by o.species, o.cell_lat, o.cell_lon, o.week;
end $$;
create or replace function public.network_stats() returns table (members bigint, updated timestamptz) language sql stable security definer set search_path = '' as $$
  select count(*), max(updated_at) from public.network_members where enabled $$;
grant execute on function public.network_publish(jsonb), public.network_view(integer), public.network_stats() to authenticated;
