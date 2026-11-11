-- Reference Data (Nov 2026): Excel uploads shown as tables, with rows readable only by users of the row's ASO.
-- Additive and idempotent. A version with sheet_columns set has its rows here, one row per ASO in the file,
-- so a query that names the viewer's ASOs never reads another ASO's data.

alter table public.reference_versions add column if not exists sheet_columns jsonb;

create table if not exists public.reference_sheet_rows (
  file_path text not null,           -- the uploaded file these rows came from; versions that keep the file share its rows
  aso_key text not null,             -- normalised ASO name (see asoKey in src/lib/support.ts)
  aso text not null,
  rows jsonb not null,               -- [{ n: spreadsheet row number, cells: [...] }]
  primary key (file_path, aso_key)
);

alter table public.reference_sheet_rows enable row level security;
revoke all on public.reference_sheet_rows from anon, authenticated;
