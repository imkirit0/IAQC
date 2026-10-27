-- Contact directories shared with Area Coordinators and ASO Directors: PROs, Trainers (Academics), Placement Officers (GOBS Bank).
-- Additive and idempotent.

create table if not exists public.directory (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('pro', 'trainer', 'placement')),
  name text not null,
  phone text not null default '',
  email text not null default '',
  district text,                     -- null = all districts
  notes text not null default '',    -- e.g. courses taught, companies handled
  updated_at timestamptz not null default now()
);

alter table public.directory enable row level security;
revoke all on public.directory from anon, authenticated;

-- Placement in-charges maintain the Placement Officer list: add the department if IAQA has saved a custom list.
update public.settings set value = value || '["Placement"]'::jsonb
  where key = 'departments' and not value ? 'Placement';
