-- Run once in the Supabase SQL editor (after 007). Safe to run again.
-- Operations for reserves: shared settings, ranger tasks, expert review links, public pages, branches under one umbrella, e-mail digest switch.

-- ============ Shared settings (indicator species, station notes) visible to the team ============
create table if not exists public.shared_prefs (
  owner uuid not null references auth.users (id) on delete cascade default auth.uid(),
  key text not null check (char_length(key) between 1 and 40),
  value jsonb not null check (pg_column_size(value) < 30000),
  updated_at timestamptz not null default now(),
  primary key (owner, key)
);
alter table public.shared_prefs enable row level security;
drop policy if exists "team reads prefs" on public.shared_prefs;
create policy "team reads prefs" on public.shared_prefs for select to authenticated using (public.is_peer(owner));
drop policy if exists "own prefs insert" on public.shared_prefs;
create policy "own prefs insert" on public.shared_prefs for insert to authenticated with check (owner = (select auth.uid()));
drop policy if exists "own prefs update" on public.shared_prefs;
create policy "own prefs update" on public.shared_prefs for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
drop policy if exists "own prefs delete" on public.shared_prefs;
create policy "own prefs delete" on public.shared_prefs for delete to authenticated using (owner = (select auth.uid()));
revoke all on public.shared_prefs from anon;
grant select, insert, update, delete on public.shared_prefs to authenticated;

-- ============ Tasks for rangers ============
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 2 and 140),
  note text check (char_length(note) <= 500),
  station text,
  det_id text,
  assignee uuid references auth.users (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'done')),
  done_by uuid references auth.users (id) on delete set null,
  done_at timestamptz,
  done_note text check (char_length(done_note) <= 500),
  done_photo text check (char_length(done_photo) < 250000),
  created_at timestamptz not null default now()
);
create index if not exists tasks_owner_status on public.tasks (owner, status, created_at desc);
alter table public.tasks enable row level security;
drop policy if exists "team reads tasks" on public.tasks;
create policy "team reads tasks" on public.tasks for select to authenticated using (public.is_peer(owner));
drop policy if exists "own tasks insert" on public.tasks;
create policy "own tasks insert" on public.tasks for insert to authenticated with check (owner = (select auth.uid()));
drop policy if exists "team closes tasks" on public.tasks;
create policy "team closes tasks" on public.tasks for update to authenticated using (public.is_peer(owner)) with check (public.is_peer(owner));
drop policy if exists "editors delete tasks" on public.tasks;
create policy "editors delete tasks" on public.tasks for delete to authenticated using (owner = (select auth.uid()) or public.is_peer_editor(owner));
revoke all on public.tasks from anon, authenticated;
grant select, delete on public.tasks to authenticated;
grant insert (title, note, station, det_id, assignee) on public.tasks to authenticated;
grant update (status, done_note, done_photo, assignee) on public.tasks to authenticated;
-- who closed it and when is written by the database, never by the client
create or replace function public.task_done_stamp() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then new.done_by := (select auth.uid()); new.done_at := now();
  elsif new.status = 'open' then new.done_by := null; new.done_at := null; end if;
  return new;
end $$;
drop trigger if exists tasks_done_stamp on public.tasks;
create trigger tasks_done_stamp before update on public.tasks for each row execute function public.task_done_stamp();

-- ============ Expert review links (no sign-in for the expert; the server checks the token) ============
create table if not exists public.expert_requests (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  owner uuid not null references auth.users (id) on delete cascade default auth.uid(),
  det_id text not null,
  question text check (char_length(question) <= 300),
  candidates jsonb not null default '[]',
  status text not null default 'open' check (status in ('open', 'answered')),
  answer jsonb,
  answered_at timestamptz,
  applied boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);
create index if not exists expert_requests_owner on public.expert_requests (owner, created_at desc);
alter table public.expert_requests enable row level security;
drop policy if exists "team reads expert requests" on public.expert_requests;
create policy "team reads expert requests" on public.expert_requests for select to authenticated using (public.is_peer(owner));
drop policy if exists "own expert insert" on public.expert_requests;
create policy "own expert insert" on public.expert_requests for insert to authenticated with check (owner = (select auth.uid()));
drop policy if exists "own expert update" on public.expert_requests;
create policy "own expert update" on public.expert_requests for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
drop policy if exists "own expert delete" on public.expert_requests;
create policy "own expert delete" on public.expert_requests for delete to authenticated using (owner = (select auth.uid()));
revoke all on public.expert_requests from anon, authenticated;
grant select, delete on public.expert_requests to authenticated;
grant insert (det_id, question, candidates) on public.expert_requests to authenticated;
grant update (applied) on public.expert_requests to authenticated;
grant select, update on public.expert_requests to service_role;

-- ============ Public pages and sponsor reports (read through the server only) ============
create table if not exists public.public_pages (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  owner uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('live', 'report')),
  title text not null check (char_length(title) between 2 and 80),
  station text,
  org_id uuid references public.organizations (id) on delete set null,
  show_clip boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists public_pages_owner on public.public_pages (owner);
alter table public.public_pages enable row level security;
drop policy if exists "own pages" on public.public_pages;
create policy "own pages" on public.public_pages for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
revoke all on public.public_pages from anon, authenticated;
grant select, delete on public.public_pages to authenticated;
grant insert (kind, title, station, org_id, show_clip) on public.public_pages to authenticated;
grant update (title, station, org_id, show_clip, enabled) on public.public_pages to authenticated;
grant select on public.public_pages to service_role;

-- ============ Branches: several reserves under one umbrella ============
alter table public.organizations add column if not exists parent_id uuid references public.organizations (id) on delete set null;
create or replace function public.create_child_org(p_parent uuid, p_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not exists (select 1 from public.org_members where org_id = p_parent and user_id = (select auth.uid()) and role = 'owner') then raise exception 'owners only'; end if;
  insert into public.organizations (name, created_by, parent_id) values (trim(p_name), (select auth.uid()), p_parent) returning id into v;
  insert into public.org_members (org_id, user_id, role) values (v, (select auth.uid()), 'owner');
  return v;
end $$;
-- One line per branch for everyone in the parent organisation: numbers only, never the raw events.
create or replace function public.umbrella_overview(p_parent uuid) returns table (org_id uuid, name text, members bigint, events_7d bigint, species_30d bigint, threats_7d bigint, last_event timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name,
    (select count(*) from public.org_members m where m.org_id = o.id),
    (select count(*) from public.detections d where d.user_id in (select user_id from public.org_members where org_id = o.id) and d.status <> 'rejected' and d.ts > now() - interval '7 days'),
    (select count(distinct d.species) from public.detections d where d.user_id in (select user_id from public.org_members where org_id = o.id) and d.status = 'confirmed' and d.species is not null and d.ts > now() - interval '30 days'),
    (select count(*) from public.detections d where d.user_id in (select user_id from public.org_members where org_id = o.id) and d.status <> 'rejected' and d.ts > now() - interval '7 days'
       and (coalesce((d.sound #>> '{groups,gun}')::float, 0) >= 0.35 or (coalesce((d.sound #>> '{groups,engine}')::float, 0) >= 0.3 and coalesce((d.sound #>> '{groups,animal}')::float, 0) < 0.5))),
    (select max(d.ts) from public.detections d where d.user_id in (select user_id from public.org_members where org_id = o.id) and d.status <> 'rejected')
  from public.organizations o
  where o.parent_id = p_parent and p_parent in (select public.my_org_ids())
  order by o.name $$;
grant execute on function public.create_child_org(uuid, text), public.umbrella_overview(uuid) to authenticated;

-- ============ E-mail copy of the weekly brief (off by default; the server needs an e-mail service key to send) ============
alter table public.profiles add column if not exists digest_email boolean not null default false;
grant update (digest_email) on public.profiles to authenticated;
