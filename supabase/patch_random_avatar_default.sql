-- Случайный аватар, если не выбран: бэкап пустых + default при ensure_player.
-- Выполнить в Supabase SQL Editor на живой базе.

-- У кого лица ещё нет — по одному случайному из «1»…«112».
update profiles
   set avatar = (1 + floor(random() * 112))::int::text
 where avatar is null;

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
    (1 + floor(random() * 112))::int::text
  )
  on conflict (id) do nothing;

  insert into bases (user_id, cells)
  values (uid, starter_map())
  on conflict (user_id) do nothing;
end;
$$;
