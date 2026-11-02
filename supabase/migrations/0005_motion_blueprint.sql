-- The video template (blueprint id) a video was started from.
alter table public.motion_projects add column if not exists blueprint text;
