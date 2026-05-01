alter table public.profiles
add column if not exists is_admin boolean not null default false,
add column if not exists bypass_subscription boolean not null default false;

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1 from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.is_admin = true
  )
);

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles"
on public.profiles
for update
to authenticated
using (
  exists (
    select 1 from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.is_admin = true
  )
)
with check (
  exists (
    select 1 from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.is_admin = true
  )
);
