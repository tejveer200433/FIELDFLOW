-- Private, user-owned employee profile photos.

alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-images',
  'profile-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_images_owner_select on storage.objects;
create policy profile_images_owner_select on storage.objects
for select to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists profile_images_owner_insert on storage.objects;
create policy profile_images_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists profile_images_owner_delete on storage.objects;
create policy profile_images_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.set_my_avatar_path(p_avatar_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_avatar_path is not null
    and p_avatar_path !~ ('^' || auth.uid()::text || '/avatar-[0-9a-f-]+\.(jpg|png|webp)$') then
    raise exception 'Invalid profile image path';
  end if;

  update public.profiles
  set avatar_path = p_avatar_path,
      updated_at = now()
  where id = auth.uid();

  if not found then
    raise exception 'Profile not found';
  end if;

  return p_avatar_path;
end;
$$;

revoke all on function public.set_my_avatar_path(text) from public;
grant execute on function public.set_my_avatar_path(text) to authenticated;

