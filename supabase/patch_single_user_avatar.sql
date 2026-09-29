-- Одна своя аватарка на игрока: политики storage + подчистка лишних файлов.
-- Выполнить в Supabase SQL Editor один раз на живой базе.

drop policy if exists "own avatar write" on storage.objects;
create policy "own avatar write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '.webp');

drop policy if exists "own avatar replace" on storage.objects;
create policy "own avatar replace" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '.webp');

drop policy if exists "own avatar remove" on storage.objects;
create policy "own avatar remove" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '.webp');

-- Лишние объекты в bucket (старые uuid.timestamp.webp и т.д.)
delete from storage.objects
where bucket_id = 'avatars'
  and name <> (split_part(name, '.', 1) || '.webp');

create or replace function set_avatar(value text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if value is not null
     and value !~ '^([1-9]|1[0-6])$'
     and value not like 'https://%/storage/v1/object/public/avatars/%' then
    raise exception 'bad avatar';
  end if;
  if value is not null and strpos(value, '?') > 0 then
    value := split_part(value, '?', 1);
  end if;
  update profiles set avatar = value where id = uid;
end;
$$;
