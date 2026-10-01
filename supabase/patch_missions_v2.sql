-- Миссии переделаны: 8–10 волн, от 120 дронов на №1 до 1000 на №100,
-- волны крупнеют и уплотняются к концу. Обычный налёт по-прежнему до 500 —
-- это проверяет send_attack; таблице разрешено до 1000 ради миссий.
-- Прогресс миссий у всех сброшен: составы новые, старые счёты к ним не
-- относятся.
-- Выполнить в Supabase → SQL Editor до деплоя клиента. Сброс прогресса —
-- разовый: повторный прогон снова обнулит миссии.

alter table attacks drop constraint if exists attacks_drones_check;
alter table attacks add constraint attacks_drones_check check (drones between 1 and 1000);

create or replace function check_waves(w jsonb) returns void
language plpgsql immutable as $$
declare wave jsonb; g jsonb;
begin
  if w is null or jsonb_typeof(w) <> 'array' or jsonb_array_length(w) = 0 then
    raise exception 'raid must have at least one wave';
  end if;
  if jsonb_array_length(w) > 10 then raise exception 'too many waves'; end if;
  for wave in select * from jsonb_array_elements(w) loop
    if coalesce(wave->>'pattern', '') not in
       ('swarm', 'lines', 'random', 'drip', 'rings', 'spiral', 'flower', 'sweep') then
      raise exception 'bad wave pattern';
    end if;
    if coalesce((wave->>'direction')::int, 0) < 0
       or coalesce((wave->>'direction')::int, 0) > 3 then
      raise exception 'bad wave direction';
    end if;
    if coalesce((wave->>'delay')::numeric, 0) < 0
       or coalesce((wave->>'delay')::numeric, 0) > 300 then
      raise exception 'bad wave delay';
    end if;
    -- звено капели: сколько дронов заходит разом с одной стороны
    if coalesce((wave->>'flight')::int, 1) < 1
       or coalesce((wave->>'flight')::int, 1) > 4 then
      raise exception 'bad wave flight';
    end if;
    if jsonb_typeof(coalesce(wave->'groups', 'null'::jsonb)) <> 'array'
       or jsonb_array_length(wave->'groups') = 0
       or jsonb_array_length(wave->'groups') > 8 then
      raise exception 'bad wave groups';
    end if;
    for g in select * from jsonb_array_elements(wave->'groups') loop
      if coalesce(g->>'payload', '') not in
         ('plain', 'heavy', 'jammer', 'foamer', 'demag', 'stealth', 'blower', 'turbo') then
        raise exception 'bad drone payload';
      end if;
      if coalesce((g->>'n')::int, -1) < 0 then raise exception 'bad group size'; end if;
    end loop;
  end loop;
end;
$$;

create or replace function queue_competition(
  stage int,
  attack_waves jsonb,
  attack_seed int,
  attack_drone_level int
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  drone_count int;
  head jsonb;
  order_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if stage is null or stage < 1 or stage > 100 then
    raise exception 'bad competition stage';
  end if;
  if not exists (select 1 from profiles p
                  where p.id = uid and p.founded and stage <= p.competition_at) then
    raise exception 'competition is not open';
  end if;
  perform check_waves(attack_waves);
  drone_count := waves_drones(attack_waves);
  if drone_count <> 120 + ((stage - 1) * 880) / 99 then
    raise exception 'bad drone count';
  end if;
  if attack_drone_level is distinct from least(5, 1 + (stage - 1) / 10) then
    raise exception 'bad drone level';
  end if;
  if attack_seed is distinct from stage * 9973 then
    raise exception 'bad competition seed';
  end if;
  -- Миссию играют сразу, так что неотыгранная прежняя — брошенная: бой
  -- прервали или его не засчитали. Убираем, а не копим до потолка.
  delete from attacks a
   where a.defender_id = uid and a.competition_stage is not null
     and a.status = 'pending';

  head := attack_waves -> 0;
  insert into attacks (
    attacker_id, defender_id, drones, pattern, direction, seed, waves,
    drone_level, simulation_version, competition_stage
  )
  values (uid, uid, drone_count,
          head->>'pattern', coalesce((head->>'direction')::int, 0),
          attack_seed, attack_waves, attack_drone_level, sim_version(), stage)
  returning attacks.id into order_id;
  return order_id;
end;
$$;

-- брошенные миссии старого состава и весь прогресс — заново
delete from attacks where competition_stage is not null and status = 'pending';
update profiles set competition_at = 1, competition_best = '{}'::jsonb;
