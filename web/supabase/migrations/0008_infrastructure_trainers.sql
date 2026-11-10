-- Directory enhancements (Nov 2026): per-centre Infrastructure, extra trainer details, IAQA verification at assessment.
-- Additive and idempotent. No sample infrastructure is inserted: entries and their specifications are created by users.

-- Trainers: qualification, division, GCTID and the centres they teach at (also carried by pending submissions).
do $$
declare t text;
begin
  foreach t in array array['directory', 'directory_changes'] loop
    execute format('alter table public.%I add column if not exists qualification text not null default ''''', t);
    execute format('alter table public.%I add column if not exists division text not null default ''''', t);
    execute format('alter table public.%I add column if not exists gctid text not null default ''''', t);
    -- No foreign key on array elements: ids of deleted centres are ignored when shown.
    execute format('alter table public.%I add column if not exists centre_ids bigint[] not null default ''{}''', t);
  end loop;
end $$;
create index if not exists directory_centre_ids_idx on public.directory using gin (centre_ids);

-- Infrastructure of a centre: a named entry with free-form specifications, [{ "label": ..., "value": ... }].
create table if not exists public.infrastructure (
  id bigint generated always as identity primary key,
  centre_id bigint not null references public.centres (id) on delete cascade,
  name text not null,
  specs jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create index if not exists infrastructure_centre_idx on public.infrastructure (centre_id);

-- IAQA's verification of a centre's infrastructure and trainers against one assessment. Append-only: the latest row per item wins.
create table if not exists public.directory_checks (
  id bigint generated always as identity primary key,
  assessment_id bigint not null references public.assessments (id),
  subject text not null check (subject in ('infrastructure', 'trainer')),
  subject_id bigint not null,
  label text not null,               -- the item's name when it was checked (it may be edited or removed later)
  outcome text not null check (outcome in ('Verified', 'Discrepancy')),
  note text not null default '',
  user_id uuid not null references public.profiles (id),
  at timestamptz not null default now()
);
create index if not exists directory_checks_assessment_idx on public.directory_checks (assessment_id);

do $$
declare t text;
begin
  foreach t in array array['infrastructure', 'directory_checks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
