drop policy if exists "Admins can read all subscriptions" on public.user_subscriptions;
create policy "Admins can read all subscriptions"
on public.user_subscriptions
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.is_admin = true
  )
);

drop policy if exists "Admins can read all searches" on public.user_searches;
create policy "Admins can read all searches"
on public.user_searches
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.is_admin = true
  )
);

drop policy if exists "Admins can read all releases" on public.user_releases;
create policy "Admins can read all releases"
on public.user_releases
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.is_admin = true
  )
);
