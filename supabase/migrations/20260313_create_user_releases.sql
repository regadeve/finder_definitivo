create table if not exists public.user_releases (
  user_id uuid not null references auth.users (id) on delete cascade,
  release_uri text not null,
  title text,
  artist text,
  year integer,
  thumb text,
  country text,
  is_favorite boolean not null default false,
  listened boolean not null default false,
  listened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, release_uri)
);

create index if not exists user_releases_user_favorite_idx
on public.user_releases (user_id, is_favorite, updated_at desc);

alter table public.user_releases enable row level security;

create or replace function public.handle_user_releases_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if new.listened and new.listened_at is null then
    new.listened_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_user_releases_timestamp on public.user_releases;

create trigger set_user_releases_timestamp
before update on public.user_releases
for each row
execute function public.handle_user_releases_timestamp();

drop policy if exists "Users can read own releases" on public.user_releases;
create policy "Users can read own releases"
on public.user_releases
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own releases" on public.user_releases;
create policy "Users can insert own releases"
on public.user_releases
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own releases" on public.user_releases;
create policy "Users can update own releases"
on public.user_releases
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own releases" on public.user_releases;
create policy "Users can delete own releases"
on public.user_releases
for delete
to authenticated
using (auth.uid() = user_id);
