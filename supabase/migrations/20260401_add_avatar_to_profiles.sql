-- Add avatar_url to public.profiles
alter table public.profiles
add column if not exists avatar_url text;

-- Create avatars storage bucket if doesn't exist
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Policies for avatars bucket
drop policy if exists "Avatar images are publicly accessible." on storage.objects;
create policy "Avatar images are publicly accessible."
  on storage.objects for select
  using ( bucket_id = 'avatars' );

drop policy if exists "Anyone can upload an avatar." on storage.objects;
create policy "Anyone can upload an avatar."
  on storage.objects for insert
  with check ( bucket_id = 'avatars' );

drop policy if exists "Anyone can update their own avatar." on storage.objects;
create policy "Anyone can update their own avatar."
  on storage.objects for update
  using ( bucket_id = 'avatars' );

drop policy if exists "Anyone can delete their own avatar." on storage.objects;
create policy "Anyone can delete their own avatar."
  on storage.objects for delete
  using ( bucket_id = 'avatars' );
