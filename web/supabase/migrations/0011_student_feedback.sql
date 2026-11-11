-- Student Feedback (Nov 2026): one form managed by the IAQA Coordinator, answered by students through the public /feedback page.
-- Additive and idempotent. No form content is inserted: the IAQA Coordinator writes it.

-- The one form: the check on id means a second row cannot exist.
create table if not exists public.feedback_form (
  id smallint primary key default 1 check (id = 1),
  draft jsonb not null default '{"title":"","description":"","items":[]}',  -- what the Coordinator is editing
  version integer,                   -- the published version students see; null until first published
  active boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
insert into public.feedback_form (id) values (1) on conflict (id) do nothing;

-- Every publish adds a row and none is ever changed, so a submission can always be read against the questions it answered.
create table if not exists public.feedback_versions (
  version integer primary key,
  form jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid not null references public.profiles (id)
);

create table if not exists public.feedback_responses (
  id bigint generated always as identity primary key,
  version integer not null references public.feedback_versions (version),
  answers jsonb not null,            -- question id -> answer; uploaded files as { name, size, path }
  search_text text not null default '',
  ticket text not null unique,       -- one signed ticket per opening of the form, so a repeated submit cannot add a second response
  ip_hash text not null,             -- salted hash, for rate limiting only
  submitted_at timestamptz not null default now(),
  status text not null default 'Pending Verification' check (status in ('Pending Verification', 'Verified')),
  verified_at timestamptz,
  verified_by uuid references public.profiles (id)
);
create index if not exists feedback_responses_submitted_idx on public.feedback_responses (submitted_at desc);
create index if not exists feedback_responses_status_idx on public.feedback_responses (status);
create index if not exists feedback_responses_ip_idx on public.feedback_responses (ip_hash, submitted_at);

create or replace function public.block_feedback_version_change() returns trigger language plpgsql as $$
begin
  raise exception 'Published feedback forms are immutable';
end $$;
drop trigger if exists feedback_versions_immutable on public.feedback_versions;
create trigger feedback_versions_immutable before update or delete on public.feedback_versions
  for each row execute function public.block_feedback_version_change();

-- A response is never edited or deleted. The only change allowed is verifying it, once.
create or replace function public.guard_feedback_response() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Feedback responses are immutable'; end if;
  if (new.id, new.version, new.answers, new.search_text, new.ticket, new.ip_hash, new.submitted_at)
     is distinct from (old.id, old.version, old.answers, old.search_text, old.ticket, old.ip_hash, old.submitted_at)
     or old.status <> 'Pending Verification' or new.status <> 'Verified' or new.verified_at is null or new.verified_by is null then
    raise exception 'Feedback responses are immutable';
  end if;
  return new;
end $$;
drop trigger if exists feedback_responses_guard on public.feedback_responses;
create trigger feedback_responses_guard before update or delete on public.feedback_responses
  for each row execute function public.guard_feedback_response();

do $$
declare t text;
begin
  foreach t in array array['feedback_form', 'feedback_versions', 'feedback_responses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Student uploads: private bucket with no policies; only the server reads or writes it, and the Coordinator downloads through short-lived signed links.
insert into storage.buckets (id, name, public, file_size_limit) values ('feedback', 'feedback', false, 4194304) on conflict (id) do nothing;
