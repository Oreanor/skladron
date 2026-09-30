-- Журнал миссий по номерам: у рекорда номера — id лучшей попытки, по нему
-- открывается повтор. Миссия не стоит в очереди налётов и не держит их часы.
-- Выполнить в Supabase → SQL Editor до деплоя клиента. Прогонять повторно
-- можно: если прошлая версия этого патча уже убрала удаление боёв из
-- журнала, эта его вернёт (убранные тогда бои снова будут видны).

drop function if exists raid_log();
alter table attacks drop column if exists competition_score;
alter table attacks add column if not exists hidden_by uuid[] not null default '{}';

create or replace function pending_attacks()
returns table (
  id uuid, from_name text, created_at timestamptz, activated_at timestamptz,
  drones int, pattern text, direction int, seed int, waves jsonb, drone_level int,
  simulation_version int,
  from_email text,
  avatar text,
  opener text,
  competition_stage int
)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  head uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- Часы идут только у первой атаки в очереди: пропускать нельзя, а у тех,
  -- что ждут позади, время ещё не начиналось. Отметку ставим при первой же
  -- выдаче списка — это и есть «первый показ». Состязание в очередь налётов
  -- не встаёт: его играют сразу, и часов ему не нужно.
  select a.id into head
    from attacks a
   where a.defender_id = uid and a.status = 'pending'
     and a.competition_stage is null
   order by a.created_at
   limit 1;

  if head is not null then
    update attacks set activated_at = now()
     where attacks.id = head and attacks.activated_at is null;
  end if;

  return query
    select a.id,
           coalesce(p.base_name, p.display_name, split_part(p.email, '@', 1)),
           a.created_at, a.activated_at, a.drones, a.pattern, a.direction, a.seed,
           a.waves, a.drone_level, a.simulation_version, p.email, p.avatar,
           (select c.body
              from battle_comments c
             where c.attack_id = a.id and c.author_id = a.attacker_id
             order by c.created_at
             limit 1),
           a.competition_stage
      from attacks a
      join profiles p on p.id = a.attacker_id
     where a.defender_id = uid and a.status = 'pending'
     order by a.created_at;
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
  intact_before int;
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
  intact_before := defender_intact + burned_now;
  share_pct := case when intact_before > 0
                    then least(100, (burned_now * 100) / intact_before)
                    else 0 end;
  earned := (burned_now * price('loot')
             * (100 + (price('loot_curve') * share_pct * share_pct * share_pct) / 1000000))
            / 100;
  -- Состязание: добычи нет — жечь самого себя ради неё нельзя. Вместо неё
  -- счёт: сколько процентов склада уцелело, как competitionScore на
  -- клиенте. Лучший по номеру храним; уцелел склад — открыт следующий.
  if order_row.competition_stage is not null then
    earned := 0;
    if intact_before > 0 then
      comp_pct := (defender_intact * 100) / intact_before;
      comp_score := comp_pct;
      update profiles
         set competition_best = case
               when coalesce((competition_best -> order_row.competition_stage::text
                              ->> 'score')::int, -1) < comp_score
               then competition_best || jsonb_build_object(
                      order_row.competition_stage::text,
                      jsonb_build_object('score', comp_score, 'pct', comp_pct,
                                         'area', intact_before, 'id', attack_id))
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
         -- Слепок уже записан в claim_attack; здесь только исход и руки.
         trace = battle_trace,
         resolving_token = null,
         resolving_at = null
   where id = attack_id;

  return query select defender_credits, defender_intact;
end;
$$;

create or replace function raid_log()
returns table (
  id uuid, side text, foe text, at timestamptz, pending boolean,
  drones int, loot int, destroyed boolean, burned int, has_replay boolean
)
language sql security definer set search_path = public stable as $$
  -- Свои налёты видны и до боя: защитник ещё не отбивался, показывать
  -- нечего, но знать, что рой в пути, полезно. Состязание — это бой на
  -- своём складе: в журнале оно оборона, а до боя стоит в очереди.
  select a.id,
         case when a.attacker_id = auth.uid() and a.competition_stage is null
              then 'attack' else 'defence' end,
         case
           when a.attacker_id = auth.uid()
             then coalesce(d.base_name, d.display_name, split_part(d.email, '@', 1))
           else coalesce(t.base_name, t.display_name, split_part(t.email, '@', 1))
         end,
         coalesce(a.resolved_at, a.created_at),
         a.status = 'pending',
         a.drones, a.loot, a.destroyed,
         coalesce((a.result->>'burned')::int, 0),
         a.snap_cells is not null
    from attacks a
    join profiles t on t.id = a.attacker_id
    join profiles d on d.id = a.defender_id
   -- состязаний тут нет: у них свой журнал, по номерам
   where a.competition_stage is null
     and not (auth.uid() = any (a.hidden_by))
     and (
       (a.attacker_id = auth.uid() and a.status in ('pending', 'resolved'))
       or (a.defender_id = auth.uid() and a.status = 'resolved')
     )
   order by coalesce(a.resolved_at, a.created_at) desc
   limit 30;
$$;

create or replace function hide_raid(attack_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update attacks
     set hidden_by = array_append(hidden_by, uid)
   where id = attack_id
     and (attacker_id = uid or defender_id = uid)
     and not (uid = any (hidden_by));
end;
$$;

-- К уже набранным рекордам дописываем id лучшей попытки: берём сыгранную
-- попытку этого номера с наибольшим уцелевшим процентом, из равных — позднюю.
update profiles p
   set competition_best = (
     select jsonb_object_agg(k, case when best.id is null then v
                                     else v || jsonb_build_object('id', best.id) end)
       from jsonb_each(p.competition_best) as t(k, v)
       left join lateral (
         select a.id
           from attacks a
           cross join lateral (
             select count(*) as intact
               from generate_series(0, 9999) i
              where get_byte(decode(a.snap_cells, 'base64'), i) = 1
           ) c
          where a.defender_id = p.id and a.competition_stage = k::int
            and a.status = 'resolved' and a.snap_cells is not null and c.intact > 0
          order by ((c.intact - coalesce((a.result->>'burned')::int, 0)) * 100) / c.intact desc,
                   a.resolved_at desc
          limit 1
       ) best on true
   )
 where p.competition_best <> '{}'::jsonb;

grant execute on function raid_log, hide_raid to authenticated;

notify pgrst, 'reload schema';
