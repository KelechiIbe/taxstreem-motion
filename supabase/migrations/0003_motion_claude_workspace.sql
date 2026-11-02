-- Lets an admin save the Anthropic workspace ID used with keys that work across workspaces.
alter table public.motion_secrets drop constraint if exists motion_secrets_name_check;
alter table public.motion_secrets add constraint motion_secrets_name_check check (name in ('anthropic', 'anthropic_workspace', 'elevenlabs', 'pexels'));
