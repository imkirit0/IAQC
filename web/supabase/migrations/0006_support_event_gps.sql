-- Device location captured with every support-request submission and action (request, answer, accept, delivery...).
-- Shown only to IAQA and CMD. Written once on insert: support_events is append-only. Additive and idempotent.
alter table public.support_events add column if not exists gps_lat double precision;
alter table public.support_events add column if not exists gps_lng double precision;
alter table public.support_events add column if not exists gps_accuracy double precision;
alter table public.support_events add column if not exists gps_at timestamptz;
alter table public.support_events add column if not exists gps_reason text;  -- why no location, when none was captured
