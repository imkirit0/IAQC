-- Support requests (AC / ASO Director → IAQA → department in-charge, monitored by CMD) and GPS on visit reports.
-- Additive and idempotent: existing rows, roles and reports are unchanged.

-- Department in-charge accounts: role 'dept', scoped to one department.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('ac', 'iaqc', 'cmd', 'dept'));
alter table public.profiles add column if not exists department text;

-- Registered centre coordinates (optional) for the visit-distance check.
alter table public.centres add column if not exists lat double precision;
alter table public.centres add column if not exists lng double precision;

-- Location captured on the device at submission. gps_status 'verified' only with a fresh fix; otherwise 'unavailable' + reason.
-- Written once on insert: the existing immutability trigger blocks later changes.
alter table public.assessments add column if not exists gps_status text check (gps_status in ('verified', 'unavailable'));
alter table public.assessments add column if not exists gps_lat double precision;
alter table public.assessments add column if not exists gps_lng double precision;
alter table public.assessments add column if not exists gps_accuracy double precision;
alter table public.assessments add column if not exists gps_at timestamptz;
alter table public.assessments add column if not exists gps_reason text;

create table if not exists public.support_requests (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles (id),
  centre_id bigint not null references public.centres (id),
  assessment_id bigint references public.assessments (id),
  department text not null,
  category text not null,
  title text not null,
  remarks text not null,
  priority text not null check (priority in ('Normal', 'High', 'Urgent')),
  preferred_date date,
  status text not null default 'Submitted' check (status in ('Submitted', 'Under Review', 'Awaiting Clarification', 'Assigned', 'Accepted', 'In Progress',
    'On Hold', 'Completed - Awaiting Verification', 'Completed', 'Rejected', 'Cancelled')),
  resume_status text,                -- status to return to once a clarification is answered
  assigned_department text,
  assignee_id uuid references public.profiles (id),
  assigned_at timestamptz,
  response_due timestamptz,
  completion_due timestamptz,
  responded_at timestamptz,          -- first department response (accept / reject / clarification)
  accepted_at timestamptz,
  estimated_completion date,
  delivered_at timestamptz,          -- completion submitted by the department
  delivery jsonb,                    -- {date, description, topic, mode, participants, outcome}
  verified_at timestamptz,
  verified_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_requests_status_idx on public.support_requests (status);

-- Append-only history: every material action, with actor, time and reason.
create table if not exists public.support_events (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.support_requests (id),
  at timestamptz not null default now(),
  user_id uuid references public.profiles (id),
  actor text not null,
  action text not null,
  from_status text,
  to_status text,
  note text not null default '',
  data jsonb
);
create index if not exists support_events_request_idx on public.support_events (request_id, id);

create or replace function public.block_support_event_change() returns trigger language plpgsql as $$
begin
  raise exception 'Support request history is append-only';
end $$;
drop trigger if exists support_events_append_only on public.support_events;
create trigger support_events_append_only before update or delete on public.support_events
  for each row execute function public.block_support_event_change();

-- The requester's original request is kept as submitted; requests are never deleted.
create or replace function public.guard_support_request() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Support requests cannot be deleted'; end if;
  if (new.requester_id, new.centre_id, new.assessment_id, new.department, new.category, new.title, new.remarks, new.priority, new.preferred_date, new.created_at)
     is distinct from (old.requester_id, old.centre_id, old.assessment_id, old.department, old.category, old.title, old.remarks, old.priority, old.preferred_date, old.created_at) then
    raise exception 'The original support request cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists support_requests_guard on public.support_requests;
create trigger support_requests_guard before update or delete on public.support_requests
  for each row execute function public.guard_support_request();

-- Demo reset also clears support data (truncate bypasses the row triggers). Server-side key only.
create or replace function public.rds_reset_demo() returns void language sql security definer set search_path = public as $$
  truncate public.support_events, public.support_requests, public.audit_log, public.reviews, public.assessments, public.criteria, public.sections, public.centres, public.settings restart identity cascade;
$$;
revoke execute on function public.rds_reset_demo() from public, anon, authenticated;
grant execute on function public.rds_reset_demo() to service_role;

do $$
declare t text;
begin
  foreach t in array array['support_requests', 'support_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
