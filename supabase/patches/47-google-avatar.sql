-- Аватар по умолчанию — фото из Google-аккаунта: новым игрокам сразу,
-- остальным — выбором в окне аватара. Можно выполнять повторно.

begin;

-- Фото из Google-аккаунта игрока, или null. Берём из данных входа, а не от
-- клиента: так своим лицом не подсунешь чужую картинку. Google отдаёт
-- кружок в 96 точек — просим 320, как у остальных аватаров; клиент
-- (googleAvatar в lib/avatar.ts) делает ту же замену, и ссылки совпадают.
create or replace function google_avatar(player uuid)
returns text language sql stable security definer set search_path = public as $$
  select regexp_replace(pic, '=s[0-9]+-c$', '=s320-c')
    from (select coalesce(u.raw_user_meta_data->>'avatar_url',
                          u.raw_user_meta_data->>'picture') as pic
            from auth.users u where u.id = player) m
   where pic like 'https://lh3.googleusercontent.com/%';
$$;

revoke all on function google_avatar(uuid) from public, anon, authenticated;

create or replace function ensure_player()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

  insert into profiles (id, email, display_name, avatar)
  values (
    uid,
    (select email from auth.users where id = uid),
    coalesce(
      (select raw_user_meta_data->>'full_name' from auth.users where id = uid),
      split_part((select email from auth.users where id = uid), '@', 1)
    ),
    -- лицо по умолчанию — фото из Google, нет его — случайное готовое
    coalesce(google_avatar(uid), (1 + floor(random() * 112))::int::text)
  )
  on conflict (id) do nothing;

  insert into bases (user_id, cells, guns)
  values (uid, starter_map(), starter_guns())
  on conflict (user_id) do nothing;
end;
$$;

create or replace function set_avatar(value text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if value is not null
     and value !~ '^([1-9]|[1-9][0-9]|10[0-9]|11[0-2])$'
     and value not like 'https://%/storage/v1/object/public/avatars/%'
     and value is distinct from google_avatar(uid) then
    raise exception 'bad avatar';
  end if;
  if value is not null and strpos(value, '?') > 0 then
    value := split_part(value, '?', 1);
  end if;
  update profiles set avatar = value where id = uid;
end;
$$;

commit;
