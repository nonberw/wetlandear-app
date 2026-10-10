-- Run once in the Supabase SQL editor (after 006). Safe to run again.
-- Acoustic indices (ACI, NDSI, BI, H) computed on the device for each recording.
alter table public.recordings add column if not exists idx jsonb;
