create table if not exists public.billing_invoices (
  stripe_invoice_id text primary key,
  user_id uuid references auth.users (id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  status text not null,
  livemode boolean not null default false,
  currency text,
  amount_due integer not null default 0,
  amount_paid integer not null default 0,
  amount_remaining integer not null default 0,
  subtotal integer not null default 0,
  tax integer not null default 0,
  total integer not null default 0,
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  invoice_pdf text,
  hosted_invoice_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_invoices_user_idx
on public.billing_invoices (user_id, created_at desc);

create index if not exists billing_invoices_status_idx
on public.billing_invoices (status, livemode, created_at desc);

create table if not exists public.billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  user_id uuid references auth.users (id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_invoice_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index if not exists billing_events_type_idx
on public.billing_events (event_type, created_at desc);

create index if not exists billing_events_user_idx
on public.billing_events (user_id, created_at desc);

alter table public.billing_invoices enable row level security;
alter table public.billing_events enable row level security;

create or replace function public.handle_billing_invoice_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_billing_invoices_timestamp on public.billing_invoices;
create trigger set_billing_invoices_timestamp
before update on public.billing_invoices
for each row
execute function public.handle_billing_invoice_timestamp();

drop policy if exists "Admins can read all billing invoices" on public.billing_invoices;
create policy "Admins can read all billing invoices"
on public.billing_invoices
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

drop policy if exists "Admins can read all billing events" on public.billing_events;
create policy "Admins can read all billing events"
on public.billing_events
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
