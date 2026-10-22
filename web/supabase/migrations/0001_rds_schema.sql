-- RDS — Risk Detection System schema.
-- All application access goes through the Next.js server using the secret key after a role check.
-- RLS is enabled with no policies, so the public (publishable/anon) key can read or write nothing directly.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  name text not null,
  role text not null check (role in ('ac', 'iaqc', 'cmd')),
  area text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.centres (
  id bigint generated always as identity primary key,
  code text unique not null,
  name text not null,
  location text not null,
  district text not null,
  ac_id uuid references public.profiles (id) on delete set null,
  active boolean not null default true,
  demo boolean not null default false
);

create table if not exists public.sections (
  id bigint generated always as identity primary key,
  name text not null,
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists public.criteria (
  id bigint generated always as identity primary key,
  section_id bigint not null references public.sections (id),
  text text not null,
  description text not null default '',
  priority text not null check (priority in ('Critical', 'High', 'Medium', 'Low')),
  weight double precision not null check (weight > 0 and weight <= 100),
  critical boolean not null default false,
  mandatory boolean not null default false,
  active boolean not null default true,
  sort int not null default 0
);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null
);

create table if not exists public.assessments (
  id bigint generated always as identity primary key,
  centre_id bigint not null references public.centres (id),
  ac_id uuid not null references public.profiles (id),
  visit_date date not null,
  submitted_at timestamptz not null default now(),
  checklist_version int not null,
  snapshot jsonb not null,      -- checklist + scoring rules in force at submission
  responses jsonb not null,
  general_remarks text not null default '',
  demo boolean not null default false
);
create index if not exists assessments_centre_idx on public.assessments (centre_id, visit_date);

create table if not exists public.reviews (
  id bigint generated always as identity primary key,
  assessment_id bigint not null references public.assessments (id),
  criterion_id bigint,
  user_id uuid not null references public.profiles (id),
  at timestamptz not null default now(),
  outcome text not null check (outcome in ('Note', 'Verified - Confirmed', 'Verified - Not Substantiated', 'Correction Recorded', 'Resolved')),
  note text not null,
  corrected_status text check (corrected_status in ('C', 'P', 'N', 'NA'))
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  username text,
  action text not null,
  detail text not null default ''
);

-- Submitted reports are permanent: no edits, no deletes.
create or replace function public.block_assessment_change() returns trigger language plpgsql as $$
begin
  raise exception 'Submitted assessments are immutable';
end $$;
drop trigger if exists assessments_immutable on public.assessments;
create trigger assessments_immutable before update or delete on public.assessments
  for each row execute function public.block_assessment_change();

-- Demo reset used by `npm run seed -- --reset` (truncate bypasses the row trigger). Server-side key only.
create or replace function public.rds_reset_demo() returns void language sql security definer set search_path = public as $$
  truncate public.audit_log, public.reviews, public.assessments, public.criteria, public.sections, public.centres, public.settings restart identity cascade;
$$;
revoke execute on function public.rds_reset_demo() from public, anon, authenticated;
grant execute on function public.rds_reset_demo() to service_role;

do $$
declare t text;
begin
  foreach t in array array['profiles','centres','sections','criteria','settings','assessments','reviews','audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
