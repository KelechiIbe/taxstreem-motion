-- Briefs, notes and articles the team attaches for Claude to read (Word, PDF or text).
alter table public.motion_assets drop constraint if exists motion_assets_kind_check;
alter table public.motion_assets add constraint motion_assets_kind_check check (kind in ('image', 'audio', 'voice', 'video', 'reference', 'document'));
