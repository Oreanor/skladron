-- Новая миссия убирает прежние неотыгранные, а не упирается в потолок
-- «too many competitions already queued»: миссию играют сразу, так что
-- неотыгранная прежняя — брошенная.
-- Выполнить в Supabase → SQL Editor. Прогонять повторно можно.

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
  if drone_count <> 12 + ((stage - 1) * 476) / 99 then
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

-- уже накопившиеся брошенные миссии — сразу долой
delete from attacks where competition_stage is not null and status = 'pending';
