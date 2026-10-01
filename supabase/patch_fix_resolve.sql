-- Срочно: после patch_raid_log_pct.sql каждый бой с соперником падал при
-- записи итога с «missing FROM-clause entry for table "resolve_attack"».
-- В PL/pgSQL приставку с именем функции можно ставить только параметрам, а
-- не переменным; переменная intact_before теперь зовётся was_intact и с
-- колонкой не путается. Несохранённые бои остались в очереди — после патча
-- их можно отыграть.
-- Выполнить в Supabase → SQL Editor сразу.

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

  select applied.credits, applied.intact
    into defender_credits, defender_intact
    from apply_battle_for(order_row.defender_id, new_cells, new_guns, new_depots, result) applied;

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

