-- Optional district scope for read-only (cmd) accounts, e.g. a district ASO Director.
-- null = all districts. Matched case-insensitively against centres.district.
alter table public.profiles add column if not exists district text;
