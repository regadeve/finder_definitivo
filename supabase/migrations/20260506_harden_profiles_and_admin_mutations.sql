-- Harden profile updates so regular users cannot self-assign privileged flags.

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid := auth.uid();
  v_is_admin boolean := false;
begin
  if v_requester is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(p.is_admin, false)
  into v_is_admin
  from public.profiles p
  where p.id = v_requester;

  if not v_is_admin and new.id = v_requester then
    if new.is_admin is distinct from old.is_admin
      or new.bypass_subscription is distinct from old.bypass_subscription
      or new.device_transfer_bonus is distinct from old.device_transfer_bonus then
      raise exception 'Not allowed to modify privileged profile fields';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_privilege_escalation_trigger on public.profiles;

create trigger prevent_profile_privilege_escalation_trigger
before update on public.profiles
for each row
execute function public.prevent_profile_privilege_escalation();

-- Central admin-only mutation endpoint for access flags.
create or replace function public.admin_update_user_access_flags(
  p_target_user_id uuid,
  p_bypass_subscription boolean,
  p_device_transfer_bonus integer
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid := auth.uid();
  v_is_admin boolean := false;
  v_row public.profiles;
begin
  if v_requester is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(p.is_admin, false)
  into v_is_admin
  from public.profiles p
  where p.id = v_requester;

  if not v_is_admin then
    raise exception 'Not allowed';
  end if;

  update public.profiles
  set
    bypass_subscription = p_bypass_subscription,
    device_transfer_bonus = greatest(0, coalesce(p_device_transfer_bonus, 0)),
    updated_at = now()
  where id = p_target_user_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Target user not found';
  end if;

  return v_row;
end;
$$;

grant execute on function public.admin_update_user_access_flags(uuid, boolean, integer) to authenticated;
