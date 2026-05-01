alter table public.user_releases
add column if not exists genres text[] not null default '{}',
add column if not exists styles text[] not null default '{}',
add column if not exists formats text[] not null default '{}';
