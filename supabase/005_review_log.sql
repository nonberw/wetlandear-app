-- Run once in the Supabase SQL editor (after 004). Safe to run again.
-- Audit trail of reviews: who confirmed, rejected or corrected which event and when. Visible to everyone in the same team, written only by a trigger.

create table if not exists public.review_log (
  id bigint generated always as identity primary key,
  detection_id text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text,
  action text not null,
  species text,
  prev_status text,
  prev_species text,
  via text not null default 'app',
  at timestamptz not null default now()
);
create index if not exists review_log_owner_at on public.review_log (owner_id, at desc);
alter table public.review_log enable row level security;
drop policy if exists "team reads review log" on public.review_log;
create policy "team reads review log" on public.review_log for select to authenticated using (public.is_peer(owner_id));
revoke all on public.review_log from anon, authenticated;
grant select on public.review_log to authenticated;
grant select on public.review_log to service_role;

create or replace function public.log_review() returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := coalesce((select auth.uid()), new.user_id);
begin
  if new.status is distinct from old.status or new.species is distinct from old.species then
    insert into public.review_log (detection_id, owner_id, actor_id, actor_name, action, species, prev_status, prev_species, via)
    values (new.id, new.user_id, actor, (select display_name from public.profiles where id = actor), new.status, new.species, old.status, old.species,
            case when (select auth.uid()) is null then 'server' else 'app' end);
  end if;
  return new;
end $$;
drop trigger if exists detections_review_log on public.detections;
create trigger detections_review_log after update on public.detections for each row execute function public.log_review();
