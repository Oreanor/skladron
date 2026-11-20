-- Вернуть налёт, который сервер удалил при «Начать сначала» у защитника
-- (restart_game стирает неотыгранные налёты на игрока, а нападающему ничего
-- не возвращает). Волны берём из теста этого налёта, показанного по ссылке:
-- сервер хранит его в practice_replays вместе с заказом.
--
-- Нападающему ничего не списываем: дроны и доплату он отдал ещё при первом
-- запуске. Зерно — из теста; волны, начинка и уровень дронов — тоже.
--
-- Почту нападающего и имя защитника поменять. Если нужен конкретный тест,
-- а не последний на test_drones дронов, — вписать его id из ссылки
-- /replay/<id> в test_id.
-- Выполнить в Supabase → SQL Editor целиком. Повтор поставит второй налёт.

do $$
declare
  attacker_email text := 'player@example.com';
  defender_name text := 'Cuckoild';
  test_id uuid := '4c9f6f76-6d5f-432c-86c3-2610e38ef952';
  test_drones int := 1000;
  att uuid;
  def uuid;
  n int;
  t practice_replays;
  ord jsonb;
  new_id uuid;
begin
  select id into att from profiles where lower(email) = lower(attacker_email);
  if att is null then raise exception 'нет нападающего %', attacker_email; end if;

  select count(*), min(id::text)::uuid into n, def
    from profiles
   where base_name ilike defender_name or display_name ilike defender_name;
  if n <> 1 then
    raise exception '%: найдено игроков — %, нужен ровно один', defender_name, n;
  end if;

  select p.* into t
    from practice_replays p
   where p.owner_id = att
     and (test_id is null or p.id = test_id)
     and (test_id is not null or (p.replay->'order'->>'drones')::int = test_drones)
   order by p.created_at desc
   limit 1;
  if not found then raise exception 'тест налёта не найден'; end if;
  if t.simulation_version <> sim_version() then
    raise exception 'тест снят версией боя %, сейчас %', t.simulation_version, sim_version();
  end if;

  ord := t.replay->'order';
  perform check_waves(ord->'waves');

  insert into attacks (
    attacker_id, defender_id, drones, pattern, direction, seed, waves,
    drone_level, simulation_version
  )
  values (att, def, waves_drones(ord->'waves'),
          ord->'waves'->0->>'pattern',
          coalesce((ord->'waves'->0->>'direction')::int, 0),
          (ord->>'seed')::int, ord->'waves',
          coalesce((ord->>'droneLevel')::int, 1),
          sim_version())
  returning id into new_id;

  raise notice 'налёт % восстановлен из теста % (% дронов)',
    new_id, t.id, waves_drones(ord->'waves');
end;
$$;

-- последние налёты нападающего: восстановленный должен быть сверху, pending
select a.id, a.drones, a.status, a.created_at
  from attacks a join profiles p on p.id = a.attacker_id
 where lower(p.email) = lower('player@example.com')
 order by a.created_at desc
 limit 5;
