-- Reference Data (Nov 2026): a common reference library maintained by the IAQA Coordinator, read-only for everyone else.
-- Additive and idempotent. No categories are inserted: the IAQA Coordinator creates them.

create table if not exists public.reference_categories (
  id bigint generated always as identity primary key,
  name text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists reference_categories_name_key on public.reference_categories (lower(name));

create table if not exists public.reference_items (
  id bigint generated always as identity primary key,
  category_id bigint not null references public.reference_categories (id)
);
create index if not exists reference_items_category_idx on public.reference_items (category_id);

-- Every save adds a row: the latest is what is shown, the earlier ones are the item's update history.
create table if not exists public.reference_versions (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.reference_items (id) on delete cascade,
  title text not null,
  content text not null default '',
  file_path text,                    -- object in the private 'reference' storage bucket
  file_name text,
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now()
);
create index if not exists reference_versions_item_idx on public.reference_versions (item_id);

do $$
declare t text;
begin
  foreach t in array array['reference_categories', 'reference_items', 'reference_versions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Uploaded files: private bucket with no policies, so only the server (secret key) reads or writes it; downloads use short-lived signed links.
insert into storage.buckets (id, name, public) values ('reference', 'reference', false) on conflict (id) do nothing;
