-- Миссия платит премию за отбой только за первую попытку номера или за
-- новый рекорд; столько же или меньше — без премии (страховка остаётся).
-- Можно выполнять повторно.

begin;

drop function if exists apply_battle_for(uuid, text, jsonb, jsonb, jsonb);

create or replace function apply_battle_for(
  player uuid, new_cells text, new_guns jsonb, new_depots jsonb, result jsonb,
  -- Премию за отбой платить? Миссия платит её только за новый рекорд номера.
  pay_bounty boolean default true
)
returns table (credits int, intact int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := player;
  bin bytea := rle_decode(new_cells);
  cur bytea;
  cur_guns jsonb;
  cur_depots jsonb;
  i int;
  old_v int;
  new_v int;
  intact_now int := 0;
  burned int := 0;
  killed int;
  depots_lost int;
  payout int;
  cover int;
  drones_sent int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if octet_length(bin) <> 10000 then raise exception 'bad map size'; end if;

  select b.cells, b.guns, b.drone_cells into cur, cur_guns, cur_depots
    from bases b where b.user_id = uid for update;
  if cur is null then raise exception 'no base'; end if;

  for i in 0..9999 loop
    old_v := get_byte(cur, i);
    new_v := get_byte(bin, i);
    if old_v = 1 then
      if new_v = 1 then
        intact_now := intact_now + 1;
      elsif new_v = 3 then
        burned := burned + 1;
      else
        raise exception 'bad battle transition at cell %', i;
      end if;
    elsif old_v in (2, 3) then
      if new_v <> 3 then raise exception 'battle may not repair cell %', i; end if;
    elsif old_v = 4 then
      if new_v <> 0 then raise exception 'bad scorch transition at cell %', i; end if;
    elsif new_v <> 0 then
      raise exception 'battle may not build at cell %', i;
    end if;
  end loop;

  if not battle_guns_valid(cur_guns, new_guns, bin, new_depots) then
    raise exception 'battle may only remove existing guns';
  end if;
  if not battle_depots_valid(cur_depots, new_depots, bin, new_guns) then
    raise exception 'battle may only remove existing depots';
  end if;

  killed := coalesce((result->>'killedByGuns')::int, 0)
          + coalesce((result->>'killedByMg')::int, 0)
          + coalesce((result->>'killedByBalloons')::int, 0);
  -- Здесь про размер роя ничего не известно: бой мог быть и с ботом, и с
  -- атакой, отправленной при прежнем потолке. Точную сверку с числом
  -- высланных дронов делает resolve_attack; тут — только защита от чуши.
  if killed < 0 or killed > 100000 then
    raise exception 'bad killed drone count';
  end if;
  if burned <> coalesce((result->>'burned')::int, -1) then
    raise exception 'burned cell count does not match map';
  end if;

  update bases
     set cells = bin, guns = new_guns, drone_cells = new_depots,
         intact_cells = intact_now, updated_at = now()
   where user_id = uid;

  -- Страховку считаем по своим данным, а не по присланным: сожжённые клетки
  -- уже сверены с картой, а потери в товаре и пушках видны как разница между
  -- тем, что было, и тем, что осталось. Вне боя они не исчезают.
  depots_lost := greatest(0, depot_value(cur_depots) - depot_value(new_depots));
  -- Базовый полис покрывает только расчистку клеток, каждый следующий
  -- уровень добавляет четверть стоимости сгоревшего товара и пушек.
  select least(100, greatest(0, coalesce((p.levels->>'insurance')::int, 1) - 1)
                     * price('insure_step'))
    into cover
    from profiles p where p.id = uid;
  payout := burned * price('insure_cell')
          + ((depots_lost
              + greatest(0, gun_count(cur_guns, 'gun') - gun_count(new_guns, 'gun'))
                * price('gun')
              + greatest(0, gun_count(cur_guns, 'rocket') - gun_count(new_guns, 'rocket'))
                * price('rocket')
              + greatest(0, gun_count(cur_guns, 'spray') - gun_count(new_guns, 'spray'))
                * price('spray')
              + greatest(0, gun_count(cur_guns, 'trap') - gun_count(new_guns, 'trap'))
                * price('trap')) * cover) / 100;

  -- Премия за отбой: чистый платит лучше; сожжённые клетки съедают грязную ставку.
  -- Страховка выше платится всегда: она возмещает ущерб, а не награждает.
  drones_sent := greatest(0, coalesce((result->>'dronesSent')::int, 0));
  if not pay_bounty then
    null;
  elsif burned = 0 then
    payout := payout + drones_sent * price('defend_clean');
  else
    payout := payout + greatest(
      0,
      drones_sent * price('defend_dirty') - burned * price('defend_burn')
    );
  end if;

  -- За сбитых не платят: деньги приносит товар, а не стрельба. Зато
  -- погорельцу выплачивается страховка и премия за отбой.
  update profiles
     set drones = depot_sum_kind(new_depots, 'basic'),
         credits = profiles.credits + payout,
         stats = profiles.stats
       || jsonb_build_object(
            'battles', (profiles.stats->>'battles')::int + 1,
            'dronesKilled', (profiles.stats->>'dronesKilled')::int + killed,
            'cellsBurned', (profiles.stats->>'cellsBurned')::int + burned)
   where profiles.id = uid
   returning profiles.credits into credits;

  intact := intact_now;
  return next;
end;
$$;

create or replace function resolve_attack(
  attack_id uuid,
  new_cells text,
  new_guns jsonb,
  new_depots jsonb,
  result jsonb,
  battle_trace text default '',
  claim_token uuid default null
) returns table (credits int, intact int)
language plpgsql security definer set search_path = public as $$
declare
  order_row attacks;
  defender_credits int;
  defender_intact int;
  burned_now int;
  was_intact int;
  share_pct int;
  earned int;
  base_at timestamptz;
  comp_pct int;
  comp_score int;
  pays boolean := true;
  new_map bytea;
  after_intact int;
  before_intact int;
begin
  select a.* into order_row from attacks a where a.id = attack_id for update;
  if not found then raise exception 'attack not found'; end if;
  if order_row.status <> 'pending' then raise exception 'attack already resolved'; end if;
  if claim_token is null or order_row.resolving_token is distinct from claim_token then
    raise exception 'attack claim mismatch';
  end if;
  if order_row.resolving_at is null
     or order_row.resolving_at <= now() - interval '2 minutes' then
    raise exception 'attack claim expired';
  end if;

  -- Сверки с присланным числом дронов больше нет и быть не может: исход
  -- считал сервер по тому же расписанию, что и рой. Оставляем только защиту
  -- от откровенной чуши на случай, если сюда однажды придёт не наш счёт.
  if coalesce((result->>'dronesSent')::int, -1) <> order_row.drones then
    raise exception 'attack drone count mismatch';
  end if;

  select b.updated_at into base_at
    from bases b where b.user_id = order_row.defender_id for update;
  if base_at is distinct from order_row.snap_base_updated_at then
    raise exception 'base changed during battle';
  end if;

  -- Миссия платит премию только за первую попытку номера или за счёт выше
  -- прежнего лучшего: столько же или меньше — денег нет, иначе один номер
  -- переигрывали бы ради заработка. Счёт — как ниже и как competitionScore
  -- на клиенте: доля уцелевшего склада; сгоревшее apply_battle_for сверит
  -- с картой.
  if order_row.competition_stage is not null then
    new_map := rle_decode(new_cells);
    after_intact := (select count(*) from generate_series(0, 9999) i
                      where get_byte(new_map, i) = 1);
    before_intact := after_intact + coalesce((result->>'burned')::int, 0);
    pays := before_intact > 0
      and (after_intact * 100) / before_intact > coalesce(
            (select (p.competition_best -> order_row.competition_stage::text ->> 'score')::int
               from profiles p where p.id = order_row.defender_id),
            -1);
  end if;

  select applied.credits, applied.intact
    into defender_credits, defender_intact
    from apply_battle_for(order_row.defender_id, new_cells, new_guns, new_depots, result, pays) applied;

  -- Премия растёт не по клеткам, а по доле склада: половина даёт +25%,
  -- четыре пятых — вдвое, весь склад — втрое. Добить выгоднее, чем
  -- пощипать по краю у десятерых.
  --
  -- Сколько целых клеток было до налёта, считаем обратным ходом: вне боя
  -- склад не чинится, значит целых было ровно столько, сколько осталось,
  -- плюс сожжённые. Арифметика целая и слово в слово повторяет attackLoot
  -- на клиенте — правила и отчёт обязаны показывать то же число.
  burned_now := coalesce((result->>'burned')::int, 0);
  was_intact := defender_intact + burned_now;
  share_pct := case when was_intact > 0
                    then least(100, (burned_now * 100) / was_intact)
                    else 0 end;
  earned := (burned_now * price('loot')
             * (100 + (price('loot_curve') * share_pct * share_pct * share_pct) / 1000000))
            / 100;
  -- Состязание: добычи нет — жечь самого себя ради неё нельзя. Вместо неё
  -- счёт: сколько процентов склада уцелело, как competitionScore на
  -- клиенте. Лучший по номеру храним; уцелел склад — открыт следующий.
  if order_row.competition_stage is not null then
    earned := 0;
    if was_intact > 0 then
      comp_pct := (defender_intact * 100) / was_intact;
      comp_score := comp_pct;
      update profiles
         set competition_best = case
               when coalesce((competition_best -> order_row.competition_stage::text
                              ->> 'score')::int, -1) < comp_score
               then competition_best || jsonb_build_object(
                      order_row.competition_stage::text,
                      jsonb_build_object('score', comp_score, 'pct', comp_pct,
                                         'area', was_intact, 'id', attack_id))
               else competition_best
             end,
             competition_at = case
               when defender_intact > 0
               then greatest(competition_at, least(100, order_row.competition_stage + 1))
               else competition_at
             end
       where id = order_row.defender_id;
    end if;
  end if;

  update profiles
     set credits = profiles.credits + earned,
         stats = jsonb_set(
           profiles.stats,
           '{looted}',
           to_jsonb((profiles.stats->>'looted')::int + earned)
         )
   where id = order_row.attacker_id;

  update attacks
     set status = 'resolved', result = resolve_attack.result, loot = earned,
         destroyed = defender_intact = 0, resolved_at = now(),
         intact_before = was_intact,
         -- Слепок уже записан в claim_attack; здесь только исход и руки.
         trace = battle_trace,
         resolving_token = null,
         resolving_at = null
   where id = attack_id;

  return query select defender_credits, defender_intact;
end;
$$;

revoke all on function apply_battle_for(uuid, text, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function apply_battle_for(uuid, text, jsonb, jsonb, jsonb, boolean) to service_role;

commit;

notify pgrst, 'reload schema';
