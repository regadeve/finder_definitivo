alter table public.profiles
add column if not exists preferred_language text not null default 'es';

alter table public.profiles
drop constraint if exists profiles_preferred_language_check;

alter table public.profiles
add constraint profiles_preferred_language_check
check (preferred_language in ('es', 'en'));
