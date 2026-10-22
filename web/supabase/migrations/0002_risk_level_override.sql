-- IAQC can set a report's risk level (Green / Yellow / Red) by judgement. Stored as a review, never on the report:
-- the submitted responses and computed score stay unchanged. The latest 'Risk Level Set' row per report wins;
-- set_category null means "back to the computed level".
alter table public.reviews add column if not exists set_category text check (set_category in ('Green', 'Yellow', 'Red'));
alter table public.reviews drop constraint if exists reviews_outcome_check;
alter table public.reviews add constraint reviews_outcome_check check (outcome in
  ('Note', 'Verified - Confirmed', 'Verified - Not Substantiated', 'Correction Recorded', 'Resolved', 'Risk Level Set'));
