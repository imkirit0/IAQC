-- IAQA change requests (Oct 2026): Directory verification, PRO / Area Coordinator information sharing, ASO contact details.
-- Additive and idempotent. Existing Directory entries stay live (they count as verified).

-- Directory: Area Coordinators propose additions and edits; the live list changes only when IAQA verifies.
create table if not exists public.directory_changes (
  id bigint generated always as identity primary key,
  entry_id bigint references public.directory (id) on delete set null,  -- null = a new entry
  kind text not null check (kind in ('pro', 'trainer', 'placement')),
  name text not null,
  phone text not null default '',
  email text not null default '',
  district text,
  notes text not null default '',
  status text not null default 'Pending' check (status in ('Pending', 'Verified', 'Rejected')),
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  remark text not null default ''
);
create index if not exists directory_changes_status_idx on public.directory_changes (status);

-- Information shared between PROs and Area Coordinators. Readable by everyone; never edited after sending.
create table if not exists public.info_shares (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.profiles (id),
  recipient_id uuid not null references public.profiles (id),
  subject text not null,
  remarks text not null,
  sent_at timestamptz not null default now(),
  accepted_at timestamptz,           -- by the recipient
  reply text not null default ''
);

create or replace function public.guard_info_share() returns trigger language plpgsql as $$
begin
  if old.accepted_at is not null or (new.sender_id, new.recipient_id, new.subject, new.remarks, new.sent_at)
     is distinct from (old.sender_id, old.recipient_id, old.subject, old.remarks, old.sent_at) then
    raise exception 'A shared item cannot be changed after it is sent, and is accepted only once';
  end if;
  return new;
end $$;
drop trigger if exists info_shares_guard on public.info_shares;
create trigger info_shares_guard before update on public.info_shares
  for each row execute function public.guard_info_share();

-- ASO Directors' contact details; no two accounts may share a mobile number or email.
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists email text;
create unique index if not exists profiles_phone_key on public.profiles (phone) where phone is not null;
create unique index if not exists profiles_email_key on public.profiles (lower(email)) where email is not null;

-- Demo reset also clears the new tables, so demo users can be removed afterwards. Server-side key only.
create or replace function public.rds_reset_demo() returns void language sql security definer set search_path = public as $$
  truncate public.info_shares, public.directory_changes, public.directory, public.support_events, public.support_requests, public.audit_log, public.reviews,
    public.assessments, public.criteria, public.sections, public.centres, public.settings restart identity cascade;
$$;
revoke execute on function public.rds_reset_demo() from public, anon, authenticated;
grant execute on function public.rds_reset_demo() to service_role;

do $$
declare t text;
begin
  foreach t in array array['directory_changes', 'info_shares'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
