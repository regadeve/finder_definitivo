create table if not exists public.yearless_release_hits (
  release_uri text primary key,
  title text,
  artist text,
  year integer,
  thumb text,
  country text,
  genres jsonb not null default '[]'::jsonb,
  styles jsonb not null default '[]'::jsonb,
  formats jsonb not null default '[]'::jsonb,
  first_found_by uuid references auth.users (id) on delete set null,
  last_found_by uuid references auth.users (id) on delete set null,
  first_found_at timestamptz not null default now(),
  last_found_at timestamptz not null default now(),
  times_found integer not null default 1
);

create index if not exists yearless_release_hits_last_found_idx
on public.yearless_release_hits (last_found_at desc);

alter table public.yearless_release_hits enable row level security;

create or replace function public.report_yearless_release_hit(
  p_release_uri text,
  p_title text default null,
  p_artist text default null,
  p_year integer default null,
  p_thumb text default null,
  p_country text default null,
  p_genres jsonb default '[]'::jsonb,
  p_styles jsonb default '[]'::jsonb,
  p_formats jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.yearless_release_hits (
    release_uri,
    title,
    artist,
    year,
    thumb,
    country,
    genres,
    styles,
    formats,
    first_found_by,
    last_found_by
  )
  values (
    p_release_uri,
    p_title,
    p_artist,
    p_year,
    p_thumb,
    p_country,
    coalesce(p_genres, '[]'::jsonb),
    coalesce(p_styles, '[]'::jsonb),
    coalesce(p_formats, '[]'::jsonb),
    v_user_id,
    v_user_id
  )
  on conflict (release_uri) do update
  set title = coalesce(excluded.title, public.yearless_release_hits.title),
      artist = coalesce(excluded.artist, public.yearless_release_hits.artist),
      year = coalesce(excluded.year, public.yearless_release_hits.year),
      thumb = coalesce(nullif(excluded.thumb, ''), public.yearless_release_hits.thumb),
      country = coalesce(nullif(excluded.country, ''), public.yearless_release_hits.country),
      genres = case when excluded.genres = '[]'::jsonb then public.yearless_release_hits.genres else excluded.genres end,
      styles = case when excluded.styles = '[]'::jsonb then public.yearless_release_hits.styles else excluded.styles end,
      formats = case when excluded.formats = '[]'::jsonb then public.yearless_release_hits.formats else excluded.formats end,
      last_found_by = v_user_id,
      last_found_at = now(),
      times_found = public.yearless_release_hits.times_found + 1;
end;
$$;

grant execute on function public.report_yearless_release_hit(text, text, text, integer, text, text, jsonb, jsonb, jsonb) to authenticated;

drop policy if exists "Admins can read yearless releases" on public.yearless_release_hits;
create policy "Admins can read yearless releases"
on public.yearless_release_hits
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and coalesce(profiles.is_admin, false) = true
  )
);
