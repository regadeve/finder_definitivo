alter table public.profiles
add column if not exists device_transfer_bonus integer not null default 0;

alter table public.profiles
drop constraint if exists profiles_device_transfer_bonus_check;

alter table public.profiles
add constraint profiles_device_transfer_bonus_check
check (device_transfer_bonus >= 0);

create table if not exists public.user_devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  device_name text,
  platform text,
  app_version text,
  is_active boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_authorized_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

create index if not exists user_devices_user_active_idx
on public.user_devices (user_id, is_active, updated_at desc);

create table if not exists public.user_device_transfer_events (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  from_device_id text,
  to_device_id text not null,
  transferred_at timestamptz not null default now(),
  transfer_month date not null default date_trunc('month', now())::date,
  created_at timestamptz not null default now()
);

create index if not exists user_device_transfer_events_user_month_idx
on public.user_device_transfer_events (user_id, transfer_month, transferred_at desc);

alter table public.user_devices enable row level security;
alter table public.user_device_transfer_events enable row level security;

create or replace function public.handle_user_devices_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.get_user_device_access_summary(
  p_target_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid := auth.uid();
  v_user_id uuid := coalesce(p_target_user_id, auth.uid());
  v_now timestamptz := now();
  v_month_start date := date_trunc('month', v_now)::date;
  v_reset_at timestamptz := date_trunc('month', v_now) + interval '1 month';
  v_is_admin boolean := false;
  v_target_is_admin boolean := false;
  v_bonus integer := 0;
  v_limit integer := 3;
  v_used integer := 0;
  v_remaining integer := 0;
  v_active_device public.user_devices%rowtype;
begin
  if v_requester is null or v_user_id is null then
    raise exception 'No authenticated user';
  end if;

  select is_admin into v_is_admin
  from public.profiles
  where id = v_requester;

  if v_user_id <> v_requester and not coalesce(v_is_admin, false) then
    raise exception 'Not allowed';
  end if;

  select is_admin, coalesce(device_transfer_bonus, 0)
  into v_target_is_admin, v_bonus
  from public.profiles
  where id = v_user_id;

  v_limit := 3 + greatest(v_bonus, 0);

  select count(*)::integer
  into v_used
  from public.user_device_transfer_events
  where user_id = v_user_id
    and transfer_month = v_month_start;

  v_remaining := greatest(v_limit - v_used, 0);

  select *
  into v_active_device
  from public.user_devices
  where user_id = v_user_id
    and is_active = true
  order by coalesce(last_authorized_at, updated_at) desc
  limit 1;

  return jsonb_build_object(
    'userId', v_user_id,
    'isAdmin', coalesce(v_target_is_admin, false),
    'bonus', greatest(v_bonus, 0),
    'transfersUsed', v_used,
    'transfersLimit', case when coalesce(v_target_is_admin, false) then null else v_limit end,
    'transfersRemaining', case when coalesce(v_target_is_admin, false) then null else v_remaining end,
    'resetAt', v_reset_at,
    'activeDeviceId', v_active_device.device_id,
    'activeDeviceName', coalesce(v_active_device.device_name, v_active_device.device_id)
  );
end;
$$;

drop trigger if exists set_user_devices_timestamp on public.user_devices;

create trigger set_user_devices_timestamp
before update on public.user_devices
for each row
execute function public.handle_user_devices_timestamp();

drop policy if exists "Users can read own devices" on public.user_devices;
create policy "Users can read own devices"
on public.user_devices
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own devices" on public.user_devices;
create policy "Users can insert own devices"
on public.user_devices
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own devices" on public.user_devices;
create policy "Users can update own devices"
on public.user_devices
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Admins can read all devices" on public.user_devices;
create policy "Admins can read all devices"
on public.user_devices
for select
to authenticated
using (
  exists (
    select 1 from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.is_admin = true
  )
);

drop policy if exists "Admins can update all devices" on public.user_devices;
create policy "Admins can update all devices"
on public.user_devices
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

drop policy if exists "Users can read own device transfer events" on public.user_device_transfer_events;
create policy "Users can read own device transfer events"
on public.user_device_transfer_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins can read all device transfer events" on public.user_device_transfer_events;
create policy "Admins can read all device transfer events"
on public.user_device_transfer_events
for select
to authenticated
using (
  exists (
    select 1 from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.is_admin = true
  )
);

create or replace function public.ensure_user_device_access(
  p_device_id text,
  p_device_name text default null,
  p_platform text default null,
  p_app_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_month_start date := date_trunc('month', v_now)::date;
  v_reset_at timestamptz := date_trunc('month', v_now) + interval '1 month';
  v_is_admin boolean := false;
  v_bonus integer := 0;
  v_limit integer := 3;
  v_used integer := 0;
  v_remaining integer := 0;
  v_active_device public.user_devices%rowtype;
begin
  if v_user_id is null then
    raise exception 'No authenticated user';
  end if;

  if coalesce(trim(p_device_id), '') = '' then
    raise exception 'Device ID required';
  end if;

  select is_admin, coalesce(device_transfer_bonus, 0)
  into v_is_admin, v_bonus
  from public.profiles
  where id = v_user_id;

  v_limit := 3 + greatest(v_bonus, 0);

  insert into public.user_devices (
    user_id,
    device_id,
    device_name,
    platform,
    app_version,
    is_active,
    first_seen_at,
    last_seen_at,
    revoked_at
  )
  values (
    v_user_id,
    p_device_id,
    nullif(trim(p_device_name), ''),
    nullif(trim(p_platform), ''),
    nullif(trim(p_app_version), ''),
    false,
    v_now,
    v_now,
    null
  )
  on conflict (user_id, device_id) do update
  set
    device_name = coalesce(excluded.device_name, public.user_devices.device_name),
    platform = coalesce(excluded.platform, public.user_devices.platform),
    app_version = coalesce(excluded.app_version, public.user_devices.app_version),
    last_seen_at = v_now,
    revoked_at = null,
    updated_at = v_now;

  select *
  into v_active_device
  from public.user_devices
  where user_id = v_user_id
    and is_active = true
  order by coalesce(last_authorized_at, updated_at) desc
  limit 1;

  if v_active_device.user_id is null then
    update public.user_devices
    set
      is_active = true,
      last_authorized_at = v_now,
      last_seen_at = v_now,
      revoked_at = null
    where user_id = v_user_id
      and device_id = p_device_id;

    return jsonb_build_object(
      'status', 'authorized',
      'isAdmin', v_is_admin,
      'transfersUsed', 0,
      'transfersLimit', case when v_is_admin then null else v_limit end,
      'transfersRemaining', case when v_is_admin then null else v_limit end,
      'resetAt', v_reset_at,
      'activeDeviceId', p_device_id,
      'activeDeviceName', coalesce(nullif(trim(p_device_name), ''), p_device_id)
    );
  end if;

  if v_active_device.device_id = p_device_id then
    update public.user_devices
    set
      is_active = true,
      last_authorized_at = coalesce(last_authorized_at, v_now),
      last_seen_at = v_now,
      revoked_at = null
    where user_id = v_user_id
      and device_id = p_device_id;

    select count(*)::integer
    into v_used
    from public.user_device_transfer_events
    where user_id = v_user_id
      and transfer_month = v_month_start;

    return jsonb_build_object(
      'status', 'authorized',
      'isAdmin', v_is_admin,
      'transfersUsed', v_used,
      'transfersLimit', case when v_is_admin then null else v_limit end,
      'transfersRemaining', case when v_is_admin then null else greatest(v_limit - v_used, 0) end,
      'resetAt', v_reset_at,
      'activeDeviceId', v_active_device.device_id,
      'activeDeviceName', coalesce(v_active_device.device_name, v_active_device.device_id)
    );
  end if;

  select count(*)::integer
  into v_used
  from public.user_device_transfer_events
  where user_id = v_user_id
    and transfer_month = v_month_start;

  v_remaining := greatest(v_limit - v_used, 0);

  return jsonb_build_object(
    'status', case when v_is_admin or v_remaining > 0 then 'transfer_available' else 'limit_reached' end,
    'isAdmin', v_is_admin,
    'transfersUsed', v_used,
    'transfersLimit', case when v_is_admin then null else v_limit end,
    'transfersRemaining', case when v_is_admin then null else v_remaining end,
    'resetAt', v_reset_at,
    'activeDeviceId', v_active_device.device_id,
    'activeDeviceName', coalesce(v_active_device.device_name, v_active_device.device_id),
    'requestedDeviceId', p_device_id,
    'requestedDeviceName', coalesce(nullif(trim(p_device_name), ''), p_device_id)
  );
end;
$$;

create or replace function public.transfer_user_device_access(
  p_device_id text,
  p_device_name text default null,
  p_platform text default null,
  p_app_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_month_start date := date_trunc('month', v_now)::date;
  v_reset_at timestamptz := date_trunc('month', v_now) + interval '1 month';
  v_is_admin boolean := false;
  v_bonus integer := 0;
  v_limit integer := 3;
  v_used integer := 0;
  v_active_device public.user_devices%rowtype;
begin
  if v_user_id is null then
    raise exception 'No authenticated user';
  end if;

  if coalesce(trim(p_device_id), '') = '' then
    raise exception 'Device ID required';
  end if;

  select is_admin, coalesce(device_transfer_bonus, 0)
  into v_is_admin, v_bonus
  from public.profiles
  where id = v_user_id;

  v_limit := 3 + greatest(v_bonus, 0);

  insert into public.user_devices (
    user_id,
    device_id,
    device_name,
    platform,
    app_version,
    is_active,
    first_seen_at,
    last_seen_at,
    revoked_at
  )
  values (
    v_user_id,
    p_device_id,
    nullif(trim(p_device_name), ''),
    nullif(trim(p_platform), ''),
    nullif(trim(p_app_version), ''),
    false,
    v_now,
    v_now,
    null
  )
  on conflict (user_id, device_id) do update
  set
    device_name = coalesce(excluded.device_name, public.user_devices.device_name),
    platform = coalesce(excluded.platform, public.user_devices.platform),
    app_version = coalesce(excluded.app_version, public.user_devices.app_version),
    last_seen_at = v_now,
    revoked_at = null,
    updated_at = v_now;

  select *
  into v_active_device
  from public.user_devices
  where user_id = v_user_id
    and is_active = true
  order by coalesce(last_authorized_at, updated_at) desc
  limit 1;

  if v_active_device.user_id is not null and v_active_device.device_id = p_device_id then
    select count(*)::integer
    into v_used
    from public.user_device_transfer_events
    where user_id = v_user_id
      and transfer_month = v_month_start;

    return jsonb_build_object(
      'status', 'authorized',
      'isAdmin', v_is_admin,
      'transfersUsed', v_used,
      'transfersLimit', case when v_is_admin then null else v_limit end,
      'transfersRemaining', case when v_is_admin then null else greatest(v_limit - v_used, 0) end,
      'resetAt', v_reset_at,
      'activeDeviceId', p_device_id,
      'activeDeviceName', coalesce(v_active_device.device_name, v_active_device.device_id)
    );
  end if;

  select count(*)::integer
  into v_used
  from public.user_device_transfer_events
  where user_id = v_user_id
    and transfer_month = v_month_start;

  if not v_is_admin and v_used >= v_limit then
    return jsonb_build_object(
      'status', 'limit_reached',
      'isAdmin', v_is_admin,
      'transfersUsed', v_used,
      'transfersLimit', v_limit,
      'transfersRemaining', 0,
      'resetAt', v_reset_at,
      'activeDeviceId', coalesce(v_active_device.device_id, null),
      'activeDeviceName', coalesce(v_active_device.device_name, v_active_device.device_id)
    );
  end if;

  update public.user_devices
  set
    is_active = false,
    revoked_at = v_now
  where user_id = v_user_id
    and is_active = true
    and device_id <> p_device_id;

  update public.user_devices
  set
    is_active = true,
    last_authorized_at = v_now,
    last_seen_at = v_now,
    revoked_at = null
  where user_id = v_user_id
    and device_id = p_device_id;

  if v_active_device.user_id is not null and v_active_device.device_id <> p_device_id then
    insert into public.user_device_transfer_events (
      user_id,
      from_device_id,
      to_device_id,
      transferred_at,
      transfer_month
    )
    values (
      v_user_id,
      v_active_device.device_id,
      p_device_id,
      v_now,
      v_month_start
    );

    v_used := v_used + 1;
  end if;

  return jsonb_build_object(
    'status', 'authorized',
    'isAdmin', v_is_admin,
    'transfersUsed', v_used,
    'transfersLimit', case when v_is_admin then null else v_limit end,
    'transfersRemaining', case when v_is_admin then null else greatest(v_limit - v_used, 0) end,
    'resetAt', v_reset_at,
    'activeDeviceId', p_device_id,
    'activeDeviceName', coalesce(nullif(trim(p_device_name), ''), p_device_id)
  );
end;
$$;
