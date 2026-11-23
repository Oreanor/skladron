-- Переигровка отбитого налёта — настоящий бой, как миссия.
--
-- Тот же рой (волны, зерно, уровень дронов) налетает на нынешний склад мимо
-- очереди: урон настоящий, страховка платит, премии за отбой и добычи нет.
-- Счёт — как у миссии, доля уцелевшего склада; лучший пишется в исходный бой
-- (attacks.retake_best) и приходит в журнал.
--
-- Налёт на себя теперь узнаётся по attacker_id = defender_id, а не по номеру
-- миссии: так переигровки не попадают ни в очередь, ни в журнал, ни в отчёты.
--
-- Выполнить до деплоя клиента. Можно выполнять повторно.

alter table attacks add column if not exists retake_of uuid references attacks(id) on delete cascade;
alter table attacks add column if not exists retake_best int;

-- Переиграть отбитый налёт: тот же рой — волны, зерно, уровень дронов — на
-- нынешний склад. Идёт как миссия: налёт на самого себя, мимо очереди, с
-- уроном и страховкой, но без премии за отбой; лучший счёт resolve_attack
-- пишет в исходный бой. Отдаёт новый налёт и имя того, кто напал тогда.
create or replace function queue_retake(raid_id uuid)
returns table (id uuid, foe text, waves jsonb, seed int, drone_level int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  src attacks;
  order_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select a.* into src
    from attacks a
   where a.id = raid_id and a.defender_id = uid and a.attacker_id <> uid
     and a.status = 'resolved';
  if not found then raise exception 'raid not found'; end if;
  -- неотыгранная прежняя переигровка — брошенная, как у миссий
  delete from attacks a
   where a.defender_id = uid and a.retake_of is not null and a.status = 'pending';

  insert into attacks (
    attacker_id, defender_id, drones, pattern, direction, seed, waves,
    drone_level, simulation_version, retake_of
  )
  values (uid, uid, src.drones, src.pattern, src.direction, src.seed, src.waves,
          src.drone_level, sim_version(), src.id)
  returning attacks.id into order_id;

  return query
    select order_id, coalesce(p.base_name, p.display_name, split_part(p.email, '@', 1)),
           src.waves, src.seed, src.drone_level
      from profiles p where p.id = src.attacker_id;
end;
$$;

-- у списка налётов и журнала поменялся состав колонок
drop function if exists pending_attacks();
drop function if exists raid_log();

create or replace function pending_attacks()
returns table (
  id uuid, from_name text, created_at timestamptz, activated_at timestamptz,
  drones int, pattern text, direction int, seed int, waves jsonb, drone_level int,
  simulation_version int,
  from_email text,
  avatar text,
  opener text,
  competition_stage int,
  retake_of uuid
)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  head uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- Часы идут только у первой атаки в очереди: пропускать нельзя, а у тех,
  -- что ждут позади, время ещё не начиналось. Отметку ставим при первой же
  -- выдаче списка — это и есть «первый показ». Налёт на самого себя (миссия,
  -- переигровка) в очередь не встаёт: его играют сразу, и часов ему не нужно.
  select a.id into head
    from attacks a
   where a.defender_id = uid and a.status = 'pending'
     and a.attacker_id <> a.defender_id
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
           a.competition_stage,
           a.retake_of
      from attacks a
      -- у переигровки «напал» тот, кто прислал исходный налёт
      left join attacks src on src.id = a.retake_of
      join profiles p on p.id = coalesce(src.attacker_id, a.attacker_id)
     where a.defender_id = uid and a.status = 'pending'
     order by a.created_at;
end;
$$;

create or replace function attack_reports()
returns table (
  id uuid, target_name text, resolved_at timestamptz,
  result jsonb, loot int, destroyed boolean,
  drones int, pattern text, direction int, seed int, waves jsonb, drone_level int,
  simulation_version int,
  snap_cells text, snap_guns jsonb, snap_depots jsonb, snap_levels jsonb, trace text
)
language sql security definer set search_path = public as $$
  select a.id,
         coalesce(p.base_name, p.display_name, split_part(p.email, '@', 1)) as target_name,
         a.resolved_at, a.result, a.loot, a.destroyed,
         a.drones, a.pattern, a.direction, a.seed, a.waves, a.drone_level,
         a.simulation_version,
         a.snap_cells, a.snap_guns, a.snap_depots, a.snap_levels, a.trace
    from attacks a
    join profiles p on p.id = a.defender_id
   where a.attacker_id = auth.uid()
     and a.status = 'resolved'
     and a.reported_at is null
     -- в налёте на себя нападающий сам себе защитник: итог он уже видел
     and a.attacker_id <> a.defender_id
   order by a.resolved_at;
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
  prev_score int;
  mission_pay int := 0;
  new_map bytea;
  after_intact int;
  before_intact int;
  -- миссия или переигровка: нападающий и защитник — один человек
  self_battle boolean;
begin
  select a.* into order_row from attacks a where a.id = attack_id for update;
  if not found then raise exception 'attack not found'; end if;
  if order_row.status <> 'pending' then raise exception 'attack already resolved'; end if;
  self_battle := order_row.attacker_id = order_row.defender_id;
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
  --
  -- Премии за отбой у миссии нет — у неё своя награда, ниже: номер × 1000 за
  -- первое прохождение и 15 за каждого сбитого при новом рекорде. Страховка
  -- платится, как в любом бою.
  if order_row.competition_stage is not null then
    new_map := rle_decode(new_cells);
    after_intact := (select count(*) from generate_series(0, 9999) i
                      where get_byte(new_map, i) = 1);
    before_intact := after_intact + coalesce((result->>'burned')::int, 0);
    prev_score := coalesce(
      (select (p.competition_best -> order_row.competition_stage::text ->> 'score')::int
         from profiles p where p.id = order_row.defender_id),
      -1);
    pays := before_intact > 0 and (after_intact * 100) / before_intact > prev_score;
    if pays then
      -- пройден — значит счёт выше нуля; первый раз — значит раньше выше нуля не было
      if prev_score <= 0 and after_intact * 100 >= before_intact then
        mission_pay := order_row.competition_stage * price('mission_stage');
      end if;
      mission_pay := mission_pay + price('mission_kill') * greatest(0, least(100000,
        coalesce((result->>'killedByGuns')::int, 0)
        + coalesce((result->>'killedByMg')::int, 0)
        + coalesce((result->>'killedByBalloons')::int, 0)));
    end if;
  end if;

  select applied.credits, applied.intact
    into defender_credits, defender_intact
    from apply_battle_for(order_row.defender_id, new_cells, new_guns, new_depots, result,
                          not self_battle) applied;

  if mission_pay > 0 then
    update profiles set credits = profiles.credits + mission_pay
     where id = order_row.defender_id
     returning profiles.credits into defender_credits;
  end if;

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
  -- Налёт на себя: добычи нет — жечь самого себя ради неё нельзя. Вместо неё
  -- счёт: сколько процентов склада уцелело, как competitionScore на
  -- клиенте. У миссии лучший храним по номеру, и уцелел склад — открыт
  -- следующий; у переигровки — в исходном бою.
  if self_battle then
    earned := 0;
  end if;
  if order_row.retake_of is not null and was_intact > 0 then
    update attacks
       set retake_best = greatest(coalesce(retake_best, -1), (defender_intact * 100) / was_intact)
     where id = order_row.retake_of;
  end if;
  if order_row.competition_stage is not null then
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

create or replace function raid_log()
returns table (
  id uuid, side text, foe text, foe_email text, at timestamptz, pending boolean,
  drones int, loot int, destroyed boolean, burned int, burned_pct int, has_replay boolean,
  retake_best int
)
language sql security definer set search_path = public stable as $$
  -- Свои налёты видны и до боя: защитник ещё не отбивался, показывать
  -- нечего, но знать, что рой в пути, полезно. Почта второй стороны — чтобы
  -- по нику в журнале открыть его карточку: имя склада не уникально.
  select a.id,
         case when a.attacker_id = auth.uid() then 'attack' else 'defence' end,
         case
           when a.attacker_id = auth.uid()
             then coalesce(d.base_name, d.display_name, split_part(d.email, '@', 1))
           else coalesce(t.base_name, t.display_name, split_part(t.email, '@', 1))
         end,
         case when a.attacker_id = auth.uid() then d.email else t.email end,
         coalesce(a.resolved_at, a.created_at),
         a.status = 'pending',
         a.drones, a.loot, a.destroyed,
         coalesce((a.result->>'burned')::int, 0),
         -- какая доля склада сгорела: по ней видно, удачен ли налёт
         case when a.intact_before > 0
              then (coalesce((a.result->>'burned')::int, 0) * 100) / a.intact_before end,
         a.snap_cells is not null,
         a.retake_best
    from attacks a
    join profiles t on t.id = a.attacker_id
    join profiles d on d.id = a.defender_id
   -- налётов на себя тут нет: у миссий свой журнал, переигровка — счёт в исходном бою
   where a.attacker_id <> a.defender_id
     and not (auth.uid() = any (a.hidden_by))
     and (
       (a.attacker_id = auth.uid() and a.status in ('pending', 'resolved'))
       or (a.defender_id = auth.uid() and a.status = 'resolved')
     )
   order by coalesce(a.resolved_at, a.created_at) desc
   limit 30;
$$;

grant execute on function queue_retake, pending_attacks, raid_log to authenticated;

notify pgrst, 'reload schema';
