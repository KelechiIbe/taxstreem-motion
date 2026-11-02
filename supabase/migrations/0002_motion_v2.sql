-- TaxStreem Motion v2: editable scripts, styles, video clips, sample references, stock and
-- AI-generated media. Only motion_* tables change; The Bridge's own tables are untouched.

-- A video now starts as a script the team approves, then becomes a spec.
alter table public.motion_projects add column if not exists script jsonb;
alter table public.motion_projects add column if not exists stage text not null default 'video';
alter table public.motion_projects drop constraint if exists motion_projects_stage_check;
alter table public.motion_projects add constraint motion_projects_stage_check check (stage in ('script', 'video'));

-- video clips (footage, screen recordings) and sample videos to learn from
alter table public.motion_assets drop constraint if exists motion_assets_kind_check;
alter table public.motion_assets add constraint motion_assets_kind_check check (kind in ('image', 'audio', 'voice', 'video', 'reference'));

-- script writing, stock imports and AI images run as background jobs too
alter table public.motion_jobs drop constraint if exists motion_jobs_kind_check;
alter table public.motion_jobs add constraint motion_jobs_kind_check check (kind in ('generate', 'review', 'script', 'import', 'imagegen'));

alter table public.motion_secrets drop constraint if exists motion_secrets_name_check;
alter table public.motion_secrets add constraint motion_secrets_name_check check (name in ('anthropic', 'elevenlabs', 'pexels'));

alter table public.motion_versions drop constraint if exists motion_versions_source_check;
alter table public.motion_versions add constraint motion_versions_source_check check (source in ('ai', 'review', 'manual', 'restore', 'script'));

create index if not exists motion_assets_kind on public.motion_assets (kind, created_at desc);
