-- Run once in the Supabase SQL editor (after 003_bot_and_mcp.sql). Safe to run again.

-- ============ Instant Telegram alerts: per-person switch ============
alter table public.telegram_links add column if not exists alerts boolean not null default true;
grant update (alerts) on public.telegram_links to authenticated;

-- ============ Teams: a shared journal for an organisation ============
-- Everyone in an organisation sees the events, recordings and clips of all members.
-- Roles: owner (manages people), editor (can review events), viewer (read only).
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  join_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  created_by uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user on public.org_members (user_id);
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;

-- Helper functions run with the owner's rights so the policies below cannot recurse into themselves.
create or replace function public.my_org_ids() returns setof uuid language sql stable security definer set search_path = '' as $$
  select org_id from public.org_members where user_id = (select auth.uid()) $$;
create or replace function public.is_peer(owner uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select owner = (select auth.uid()) or exists (select 1 from public.org_members a join public.org_members b on a.org_id = b.org_id
    where a.user_id = (select auth.uid()) and b.user_id = owner) $$;
create or replace function public.is_peer_editor(owner uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members a join public.org_members b on a.org_id = b.org_id
    where a.user_id = (select auth.uid()) and a.role in ('owner', 'editor') and b.user_id = owner) $$;

drop policy if exists "members read org" on public.organizations;
create policy "members read org" on public.organizations for select to authenticated using (id in (select public.my_org_ids()));
drop policy if exists "members read members" on public.org_members;
create policy "members read members" on public.org_members for select to authenticated using (org_id in (select public.my_org_ids()));
revoke all on public.organizations, public.org_members from anon, authenticated;
grant select (id, name, created_at) on public.organizations to authenticated;
grant select on public.org_members to authenticated;
grant select on public.organizations, public.org_members to service_role;

-- Everything that changes people goes through these functions (the join code is only returned to owners).
create or replace function public.create_org(p_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if (select auth.uid()) is null then raise exception 'sign in'; end if;
  insert into public.organizations (name, created_by) values (trim(p_name), (select auth.uid())) returning id into v;
  insert into public.org_members (org_id, user_id, role) values (v, (select auth.uid()), 'owner');
  return v;
end $$;
create or replace function public.join_org(p_code text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if (select auth.uid()) is null then raise exception 'sign in'; end if;
  select id into v from public.organizations where join_code = lower(trim(p_code));
  if v is null then raise exception 'code not found'; end if;
  insert into public.org_members (org_id, user_id, role) values (v, (select auth.uid()), 'viewer') on conflict do nothing;
  return v;
end $$;
create or replace function public.my_orgs() returns table (id uuid, name text, role text, members bigint, join_code text) language sql stable security definer set search_path = '' as $$
  select o.id, o.name, m.role, (select count(*) from public.org_members x where x.org_id = o.id),
         case when m.role = 'owner' then o.join_code else null end
  from public.org_members m join public.organizations o on o.id = m.org_id where m.user_id = (select auth.uid()) order by o.created_at $$;
create or replace function public.org_people(p_org uuid) returns table (user_id uuid, display_name text, role text) language sql stable security definer set search_path = '' as $$
  select m.user_id, coalesce(p.display_name, 'member'), m.role from public.org_members m left join public.profiles p on p.id = m.user_id
  where m.org_id = p_org and p_org in (select public.my_org_ids()) order by m.created_at $$;
create or replace function public.set_member_role(p_org uuid, p_user uuid, p_role text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_role not in ('owner', 'editor', 'viewer') then raise exception 'bad role'; end if;
  if not exists (select 1 from public.org_members where org_id = p_org and user_id = (select auth.uid()) and role = 'owner') then raise exception 'owners only'; end if;
  if p_role <> 'owner' and exists (select 1 from public.org_members where org_id = p_org and user_id = p_user and role = 'owner')
     and (select count(*) from public.org_members where org_id = p_org and role = 'owner') < 2 then raise exception 'keep one owner'; end if;
  update public.org_members set role = p_role where org_id = p_org and user_id = p_user;
end $$;
create or replace function public.remove_member(p_org uuid, p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user <> (select auth.uid()) and not exists (select 1 from public.org_members where org_id = p_org and user_id = (select auth.uid()) and role = 'owner') then raise exception 'owners only'; end if;
  if exists (select 1 from public.org_members where org_id = p_org and user_id = p_user and role = 'owner')
     and (select count(*) from public.org_members where org_id = p_org and role = 'owner') < 2 then raise exception 'keep one owner'; end if;
  delete from public.org_members where org_id = p_org and user_id = p_user;
end $$;
create or replace function public.new_join_code(p_org uuid) returns text language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  if not exists (select 1 from public.org_members where org_id = p_org and user_id = (select auth.uid()) and role = 'owner') then raise exception 'owners only'; end if;
  c := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  update public.organizations set join_code = c where id = p_org;
  return c;
end $$;
create or replace function public.delete_org(p_org uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.org_members where org_id = p_org and user_id = (select auth.uid()) and role = 'owner') then raise exception 'owners only'; end if;
  delete from public.organizations where id = p_org;
end $$;
revoke execute on function public.create_org(text), public.join_org(text), public.my_orgs(), public.org_people(uuid), public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid), public.new_join_code(uuid), public.delete_org(uuid) from public, anon;
grant execute on function public.create_org(text), public.join_org(text), public.my_orgs(), public.org_people(uuid), public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid), public.new_join_code(uuid), public.delete_org(uuid) to authenticated;
grant execute on function public.my_org_ids(), public.is_peer(uuid), public.is_peer_editor(uuid) to authenticated, service_role;

-- Shared data: members read each other's rows; editors and owners may review events (status, species).
drop policy if exists "peer read detections" on public.detections;
create policy "peer read detections" on public.detections for select to authenticated using (public.is_peer(user_id));
drop policy if exists "peer review detections" on public.detections;
create policy "peer review detections" on public.detections for update to authenticated using (public.is_peer_editor(user_id)) with check (public.is_peer_editor(user_id));
drop policy if exists "peer read recordings" on public.recordings;
create policy "peer read recordings" on public.recordings for select to authenticated using (public.is_peer(user_id));
drop policy if exists "peer read stations" on public.stations;
create policy "peer read stations" on public.stations for select to authenticated using (public.is_peer(user_id));
drop policy if exists "peer read profiles" on public.profiles;
create policy "peer read profiles" on public.profiles for select to authenticated using (public.is_peer(id));
drop policy if exists "peer read clips" on storage.objects;
create policy "peer read clips" on storage.objects for select to authenticated
  using (bucket_id = 'clips' and public.is_peer(((storage.foldername(name))[1])::uuid));

-- Nobody may move an event to another owner: update is allowed on every column except user_id.
revoke update on public.detections from authenticated;
grant update (id, rec_id, ts, t0, t1, f_low, f_high, f_peak, snr, status, species, suggest, station, lat, lon, reviewed_at, sound, emb) on public.detections to authenticated;
