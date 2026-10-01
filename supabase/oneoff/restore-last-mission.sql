-- Вернуть склад игрока к тому, каким он был перед его последней сыгранной
-- миссией, и стереть эту миссию: из журнала и из рекорда номера.
--
-- Нужен после боя, который сервер пересчитал другой версией движка, чем
-- играл клиент (до 3fb1e27 такое не отлавливалось): на экране «уцелело
-- 90%», а в базе склад сгорел. Перед каждым боем сервер снимает слепок
-- склада (snap_*) — из него и восстанавливаем.
--
-- Почту поменять на нужную. Кредиты, начисленные за тот бой, не трогаем.
-- Выполнить в Supabase → SQL Editor целиком.

do $$
declare
  target_email text := 'oreanor@gmail.com';
  uid uuid;
  last attacks;
begin
  select id into uid from profiles where lower(email) = lower(target_email);
  if uid is null then raise exception 'no such player'; end if;

  select a.* into last
    from attacks a
   where a.defender_id = uid and a.competition_stage is not null
     and a.status = 'resolved' and a.snap_cells is not null
   order by a.resolved_at desc
   limit 1;
  if not found then raise exception 'no resolved mission with a snapshot'; end if;

  update bases
     set cells = decode(last.snap_cells, 'base64'),
         guns = coalesce(last.snap_guns, '[]'::jsonb),
         drone_cells = coalesce(last.snap_depots, '[]'::jsonb),
         intact_cells = (select count(*) from generate_series(0, 9999) i
                          where get_byte(decode(last.snap_cells, 'base64'), i) = 1),
         updated_at = now()
   where user_id = uid;

  -- рекорд номера, если он от этой попытки, — долой
  update profiles
     set competition_best = competition_best - last.competition_stage::text
   where id = uid
     and competition_best -> last.competition_stage::text ->> 'id' = last.id::text;

  delete from attacks where id = last.id;

  raise notice 'склад восстановлен перед миссией №%, сыгранной %', last.competition_stage, last.resolved_at;
end;
$$;
