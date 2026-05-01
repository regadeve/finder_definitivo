create table if not exists public.user_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_admin boolean not null default false,
  bypass_subscription boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'inactive',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_status_check check (
    status in ('inactive', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired')
  )
);

create index if not exists user_subscriptions_status_idx
on public.user_subscriptions (status, current_period_end desc);

alter table public.user_access enable row level security;
alter table public.user_subscriptions enable row level security;

create or replace function public.handle_access_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_access_timestamp on public.user_access;
create trigger set_user_access_timestamp
before update on public.user_access
for each row
execute function public.handle_access_timestamp();

drop trigger if exists set_user_subscriptions_timestamp on public.user_subscriptions;
create trigger set_user_subscriptions_timestamp
before update on public.user_subscriptions
for each row
execute function public.handle_access_timestamp();

drop policy if exists "Users can read own access" on public.user_access;
create policy "Users can read own access"
on public.user_access
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can read all access" on public.user_access;
create policy "Admins can read all access"
on public.user_access
for select
to authenticated
using (
  exists (
    select 1 from public.user_access admin_access
    where admin_access.user_id = auth.uid()
      and admin_access.is_admin = true
  )
);

drop policy if exists "Admins can insert access" on public.user_access;
create policy "Admins can insert access"
on public.user_access
for insert
to authenticated
with check (
  exists (
    select 1 from public.user_access admin_access
    where admin_access.user_id = auth.uid()
      and admin_access.is_admin = true
  )
);

drop policy if exists "Admins can update access" on public.user_access;
create policy "Admins can update access"
on public.user_access
for update
to authenticated
using (
  exists (
    select 1 from public.user_access admin_access
    where admin_access.user_id = auth.uid()
      and admin_access.is_admin = true
  )
)
with check (
  exists (
    select 1 from public.user_access admin_access
    where admin_access.user_id = auth.uid()
      and admin_access.is_admin = true
  )
);

drop policy if exists "Users can read own subscription" on public.user_subscriptions;
create policy "Users can read own subscription"
on public.user_subscriptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1 from public.user_access admin_access
    where admin_access.user_id = auth.uid()
      and admin_access.is_admin = true
  )
);
