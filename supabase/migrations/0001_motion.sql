-- TaxStreem Motion tables, added to The Bridge's Supabase project.
-- Team membership and roles come from The Bridge (public.profiles, is_member(), has_role()),
-- so the same people sign in to both apps. Files live in the existing private "media" bucket
-- under motion/.

create table if not exists public.motion_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled video',
  format text not null default '9:16' check (format in ('9:16', '1:1', '16:9')),
  spec jsonb,
  version int not null default 0,
  thumb_path text,
  archived boolean not null default false,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.motion_versions (
  id bigserial primary key,
  project_id uuid not null references public.motion_projects (id) on delete cascade,
  n int not null,
  spec jsonb not null,
  note text not null default '',
  source text not null default 'ai' check (source in ('ai', 'review', 'manual', 'restore')),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (project_id, n)
);

create table if not exists public.motion_messages (
  id bigserial primary key,
  project_id uuid not null references public.motion_projects (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- project_id null = team library (shared across videos)
create table if not exists public.motion_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.motion_projects (id) on delete cascade,
  kind text not null check (kind in ('image', 'audio', 'voice')),
  name text not null default '',
  path text not null,
  mime text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.motion_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.motion_projects (id) on delete cascade,
  kind text not null check (kind in ('generate', 'review')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  message text not null default '',
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.motion_renders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.motion_projects (id) on delete cascade,
  version int not null default 0,
  format text not null,
  path text not null,
  size bigint not null default 0,
  duration real not null default 0,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- API keys, AES-GCM encrypted with the site's APP_SECRET. Ciphertext alone is useless.
create table if not exists public.motion_secrets (
  name text primary key check (name in ('anthropic', 'elevenlabs')),
  ciphertext text not null,
  iv text not null,
  last4 text not null default '',
  updated_by uuid references auth.users (id) default auth.uid(),
  updated_at timestamptz not null default now()
);

create index if not exists motion_versions_project on public.motion_versions (project_id, n desc);
create index if not exists motion_messages_project on public.motion_messages (project_id, id);
create index if not exists motion_assets_project on public.motion_assets (project_id);
create index if not exists motion_jobs_project on public.motion_jobs (project_id, created_at desc);
create index if not exists motion_renders_project on public.motion_renders (project_id, created_at desc);

alter table public.motion_projects enable row level security;
alter table public.motion_versions enable row level security;
alter table public.motion_messages enable row level security;
alter table public.motion_assets enable row level security;
alter table public.motion_jobs enable row level security;
alter table public.motion_renders enable row level security;
alter table public.motion_secrets enable row level security;

-- Everyone on the team can read and work on every video; deleting needs admin or producer.
do $$
declare t text;
begin
  foreach t in array array['motion_projects','motion_versions','motion_messages','motion_assets','motion_jobs','motion_renders'] loop
    execute format('drop policy if exists "team read" on public.%I', t);
    execute format('drop policy if exists "team add" on public.%I', t);
    execute format('drop policy if exists "team edit" on public.%I', t);
    execute format('drop policy if exists "producers delete" on public.%I', t);
    execute format('create policy "team read" on public.%I for select to authenticated using (public.is_member())', t);
    execute format('create policy "team add" on public.%I for insert to authenticated with check (public.is_member())', t);
    execute format('create policy "team edit" on public.%I for update to authenticated using (public.is_member()) with check (public.is_member())', t);
    execute format('create policy "producers delete" on public.%I for delete to authenticated using (public.has_role(array[''admin'',''producer'']))', t);
  end loop;
end $$;

drop policy if exists "team read" on public.motion_secrets;
drop policy if exists "admins write" on public.motion_secrets;
create policy "team read" on public.motion_secrets for select to authenticated using (public.is_member());
create policy "admins write" on public.motion_secrets for all to authenticated using (public.has_role(array['admin'])) with check (public.has_role(array['admin']));

-- keep updated_at fresh
create or replace function public.motion_touch() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists motion_projects_touch on public.motion_projects;
create trigger motion_projects_touch before update on public.motion_projects for each row execute function public.motion_touch();
drop trigger if exists motion_jobs_touch on public.motion_jobs;
create trigger motion_jobs_touch before update on public.motion_jobs for each row execute function public.motion_touch();

-- the studio listens for job progress
do $$ begin
  alter publication supabase_realtime add table public.motion_jobs;
exception when duplicate_object then null; when undefined_object then null;
end $$;
