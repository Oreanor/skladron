-- Потолка на налёт больше нет: рой ограничен только дронами на складе
-- (их снимает take_from_depots). Сильную оборону 500 дронов не пробивали.
-- Можно выполнять повторно.

create or replace function send_attack(
  target_email text,
  attack_waves jsonb,
  attack_seed int,
  opener text default null
) returns table (id uuid, depots jsonb, credits int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  target profiles;
  cur bytea;
  cur_guns jsonb;
  cur_depots jsonb;
  next_depots jsonb;
  order_id uuid;
  drone_count int;
  surcharge int;
  head jsonb;
  note text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform check_waves(attack_waves);
  drone_count := waves_drones(attack_waves);
  -- Потолка на рой нет: больше, чем лежит на складе, не даст take_from_depots.
  if drone_count < 1 then
    raise exception 'bad drone count';
  end if;
  head := attack_waves -> 0;

  select p.* into target
    from profiles p
   where lower(p.email) = lower(btrim(target_email))
   limit 1;
  if not found then raise exception 'player with this email has not joined yet'; end if;
  if target.id = uid then raise exception 'cannot attack yourself'; end if;
  if not target.founded then raise exception 'target warehouse is not founded'; end if;

  -- Очередь у защитника одна и разбирается по одному налёту за раз, по
  -- получасу на каждый. Без потолка один нападающий запирал бы чужую игру
  -- на часы, просто поставив в очередь десяток роёв.
  if (select count(*) from attacks a
       where a.attacker_id = uid and a.defender_id = target.id
         and a.status = 'pending') >= price('queued') then
    raise exception 'too many raids already queued against this warehouse';
  end if;

  select b.cells, b.guns, b.drone_cells into cur, cur_guns, cur_depots
    from bases b where b.user_id = uid for update;
  if cur is null then raise exception 'no base'; end if;

  -- Дронов снимает сервер со своей же копии склада. Раньше новый склад
  -- присылал клиент, и любое расхождение — недосохранённая правка, гонка с
  -- автосохранением — валило налёт с «sent drones do not match».
  next_depots := take_from_depots(cur_depots, drone_count, 'basic');

  -- Со склада уходят обычные дроны, а за начинку доплачивается кредитами:
  -- по цене дрона на нынешнем уровне, той же, по какой он и покупался.
  select waves_surcharge(
           attack_waves,
           price_at('drone', coalesce((p.levels->>'drones')::int, 1))
         )
    into surcharge
    from profiles p where p.id = uid;

  update bases set drone_cells = next_depots, updated_at = now() where user_id = uid;
  update profiles
     set drones = depot_sum_kind(next_depots, 'basic'),
         credits = profiles.credits - surcharge,
         stats = jsonb_set(stats, '{raids}', to_jsonb((stats->>'raids')::int + 1))
   where profiles.id = uid and profiles.credits >= surcharge
   returning profiles.credits into credits;

  if not found then raise exception 'not enough credits for these warheads'; end if;

  insert into attacks (
    attacker_id, defender_id, drones, pattern, direction, seed, waves,
    drone_level, simulation_version
  )
  values (uid, target.id, drone_count,
          head->>'pattern', coalesce((head->>'direction')::int, 0),
          attack_seed, attack_waves,
          (select coalesce((p.levels->>'drones')::int, 1) from profiles p where p.id = uid),
          -- Версию берём у sim_version(), а не числом: тут стояла тройка с
          -- тех времён, когда версия и была тройкой, и каждое поднятие
          -- делало все новые налёты неиграбельными.
          sim_version())
  returning attacks.id into order_id;
  note := left(btrim(coalesce(opener, '')), 500);
  if note <> '' then
    insert into battle_comments (attack_id, author_id, body)
    values (order_id, uid, note);
  end if;
  id := order_id;
  depots := next_depots;
  return next;
end;
$$;
