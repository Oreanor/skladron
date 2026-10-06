-- Стартовый склад теперь не пустой: четыре зенитки по углам и огнетушитель
-- в центре. Так встречают новичка, вайп после пожара и «начать сначала».
-- Всем, у кого склад ещё нетронутый стартовый (5×5, без установок), они
-- ставятся сейчас же. Версию боя не меняет.
-- Выполнить в Supabase → SQL Editor до деплоя клиента. Можно прогнать повторно.

-- Установки стартового склада: зенитки по углам и огнетушитель в центре.
-- Клиент ставит те же (starterGuns в lib/base.ts).
create or replace function starter_guns() returns jsonb
language sql immutable as $$
  select '[{"cx":47,"cy":47,"kind":"gun"},{"cx":51,"cy":47,"kind":"gun"},
           {"cx":47,"cy":51,"kind":"gun"},{"cx":51,"cy":51,"kind":"gun"},
           {"cx":49,"cy":49,"kind":"spray"}]'::jsonb;
$$;

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

  insert into bases (user_id, cells, guns)
  values (uid, starter_map(), starter_guns())
  on conflict (user_id) do nothing;
end;
$$;

create or replace function wipe_base()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

  update bases
     set cells = starter_map(),
         guns = starter_guns(), drone_cells = '[]'::jsonb,
         intact_cells = price('free'), updated_at = now()
   where user_id = uid;

  update profiles
     set credits = greatest(profiles.credits, price('start')),
         drones = 0, founded = false, last_income_at = now(),
         stats = jsonb_set(stats, '{wipes}', to_jsonb((stats->>'wipes')::int + 1))
   where id = uid;
end;
$$;

create or replace function restart_game()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

  update bases
     set cells = starter_map(),
         guns = starter_guns(), drone_cells = '[]'::jsonb,
         intact_cells = price('free'), updated_at = now()
   where user_id = uid;

  update profiles
     set credits = price('start'),
         drones = 0,
         loan = 0,
         loan_due = null,
         founded = true,
         last_income_at = now(),
         levels = '{"drones":1,"guns":1,"rockets":1,"sprays":1,"traps":1,"balloons":1,"scouts":1,"mg":1,"water":1,"insurance":1}'::jsonb,
         stats = '{"battles":0,"dronesKilled":0,"cellsBurned":0,"cellsRepaired":0,
                   "wipes":0,"raids":0,"looted":0}'::jsonb
   where id = uid;

  -- налёты, которые ждали старый склад, начинать сначала не должны
  delete from attacks where defender_id = uid and status = 'pending';
end;
$$;

-- Нетронутые склады: карта ровно стартовая и установок нет. Ящик с дронами
-- на месте будущей установки — пропускаем такой склад, не трогая ящик.
update bases b
   set guns = starter_guns(), updated_at = now()
 where b.cells = starter_map()
   and jsonb_array_length(coalesce(b.guns, '[]'::jsonb)) = 0
   and not exists (
     select 1
       from jsonb_array_elements(coalesce(b.drone_cells, '[]'::jsonb)) d,
            jsonb_array_elements(starter_guns()) g
      where (d->>'cx')::int = (g->>'cx')::int and (d->>'cy')::int = (g->>'cy')::int
   );
