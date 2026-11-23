-- Правки по ревью.
--
-- * add_rival решает «знакомы через общий список» только по списку цели:
--   свой список клиент пишет сам, и отказ от его налётов можно было отключить.
-- * strangers(uuid, uuid) снаружи не зовётся.
-- * Отказ от первого налёта отменяет знакомство насовсем: таблица unmet, и
--   save_enemies не пускает отменённых назад из старой вкладки.
-- * Попытки миссий и переигровок не копятся: от миссии остаётся лучшая по
--   номеру, отыгранные переигровки убираются при следующей (счёт уже в
--   исходном бою). Заодно вычищаем то, что накопилось.
-- * resolve_attack не перебирает 10 000 байт карты: уцелевшее уже посчитал
--   apply_battle_for.
-- * listed_players разворачивает свой список врагов один раз; индекс на
--   открытых.
--
-- Выполнять после 64-listed-players.sql. Можно выполнять повторно.

create or replace function add_rival(target_email text)
returns table (email text, name text)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  me profiles;
  target profiles;
  card jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select p.* into me from profiles p where p.id = uid;
  select p.* into target
    from profiles p where lower(p.email) = lower(btrim(target_email)) limit 1;
  if not found then raise exception 'player with this email has not joined yet'; end if;
  if target.id = uid then raise exception 'cannot add yourself'; end if;

  -- знакомятся заново — прежняя отмена больше не действует
  delete from unmet u
   where (u.player = uid and u.email = lower(target.email))
      or (u.player = target.id and u.email = lower(me.email));

  -- Оба открыты всем и прежде знакомы не были — значит, нашли друг друга в
  -- общем списке: запоминаем, налёт от такого можно отклонить. Смотрим только
  -- в список цели: свой список клиент пишет сам (save_enemies), и вписать туда
  -- цель заранее, чтобы отказ стал невозможен, ничего не стоило бы.
  if me.listed and target.listed
     and not exists (select 1 from jsonb_array_elements(target.enemies) e
                      where lower(e->>'email') = lower(me.email)) then
    insert into listed_met (player, other) values (uid, target.id) on conflict do nothing;
  end if;

  -- карточка знакомства: склад придёт с разведки, счёт вражды — с боёв
  card := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', coalesce(me.base_name, me.display_name, split_part(me.email, '@', 1)),
    'email', me.email,
    'cells', '',
    'guns', '[]'::jsonb,
    'depots', '[]'::jsonb,
    'burnedByMe', 0,
    'burnedByThem', 0,
    'lastRaidAt', 0
  );

  update profiles
     set enemies = profiles.enemies || card
   where profiles.id = target.id
     and not exists (
       select 1 from jsonb_array_elements(profiles.enemies) e
        where lower(e->>'email') = lower(me.email)
     );

  email := target.email;
  name := coalesce(target.base_name, target.display_name, split_part(target.email, '@', 1));
  return next;
end;
$$;

-- Состязание на свой склад. Бесплатно и без дронов со склада: состав задан
-- номером. Сервер его знает, чтобы бой шёл той же дорогой, что и живой, —
-- с расчётом на сервере, повтором, ссылкой и журналом. Размер роя и уровень
-- сверяем с формулами номера (competitionDrones и competitionDroneLevel на
-- клиенте): премия за отбой растёт с числом дронов, и без сверки в себя
-- можно было бы запускать сколько угодно. Зерно — тоже номера: переигрывая,
-- выходишь против того же боя, и счёт сравним.
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
  if attack_drone_level is distinct from least(11, 1 + (stage - 1) * 10 / 89) then
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
  -- Отыгранные попытки этого номера, кроме лучшей: у каждой слепок склада и
  -- запись рук, а смотрят только повтор лучшей.
  delete from attacks a
   where a.defender_id = uid and a.attacker_id = uid
     and a.competition_stage = stage and a.status = 'resolved'
     and a.id::text is distinct from (
       select p.competition_best -> stage::text ->> 'id' from profiles p where p.id = uid);

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
  -- Прежние переигровки — и брошенная, и отыгранные: счёт уже записан в
  -- исходный бой, а слепок склада и запись рук никто больше не откроет.
  delete from attacks a
   where a.defender_id = uid and a.retake_of is not null;

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

  select applied.credits, applied.intact
    into defender_credits, defender_intact
    from apply_battle_for(order_row.defender_id, new_cells, new_guns, new_depots, result,
                          not self_battle) applied;


  -- Миссия платит премию только за первую попытку номера или за счёт выше
  -- прежнего лучшего: столько же или меньше — денег нет, иначе один номер
  -- переигрывали бы ради заработка. Счёт — как ниже и как competitionScore
  -- на клиенте: доля уцелевшего склада; сгоревшее apply_battle_for сверит
  -- с картой.
  --
  -- Премии за отбой у миссии нет — у неё своя награда, ниже: номер × 1000 за
  -- первое прохождение и 15 за каждого сбитого при новом рекорде. Страховка
  -- платится, как в любом бою.
  -- Уцелевшее после боя уже посчитал apply_battle_for — по нему и судим.
  if order_row.competition_stage is not null then
    after_intact := defender_intact;
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

-- Открытые игроки — только тому, кто открыт сам: видят друг друга лишь те,
-- кто согласился быть на виду. Ближайшие по силе — сверху; уже знакомых нет.
-- Добавленный из списка — такой же друг, как по почте.
create or replace function listed_players()
returns table (email text, name text, avatar text, level int, power int)
language sql security definer set search_path = public stable as $$
  with me as (
    select p.id, upgrade_power(p.levels) as power,
           array(select lower(e->>'email') from jsonb_array_elements(p.enemies) e) as known
      from profiles p where p.id = auth.uid() and p.listed
  ), open as (
    select p.*, upgrade_power(p.levels) as power
      from profiles p, me
     where p.listed and p.founded and p.id <> me.id
       and lower(p.email) <> all (me.known)
  )
  select o.email,
         coalesce(o.base_name, o.display_name, split_part(o.email, '@', 1)),
         o.avatar,
         player_level(o.competition_best),
         o.power
    from open o, me
   order by abs(o.power - me.power), o.created_at
   limit 50;
$$;

-- накопленное: переигровки — все отыгранные, миссии — всё, кроме лучшей по номеру
delete from attacks a
 where a.retake_of is not null and a.status <> 'pending';
delete from attacks a
 using profiles p
 where p.id = a.defender_id and a.attacker_id = a.defender_id
   and a.competition_stage is not null and a.status = 'resolved'
   and a.id::text is distinct from (p.competition_best -> a.competition_stage::text ->> 'id');

create index if not exists profiles_listed on profiles (id) where listed;

revoke all on function strangers(uuid, uuid) from public, anon, authenticated;
grant execute on function strangers(uuid, uuid) to service_role;

-- Знакомство, отменённое отказом от первого налёта: кого у игрока в списке
-- врагов быть не должно. Открытая вкладка нападающего помнит прежний список и
-- при следующем сохранении вернула бы туда цель — save_enemies такое отбросит,
-- пока они не познакомятся заново (add_rival).
create table if not exists unmet (
  player uuid not null references profiles on delete cascade,
  email text not null,
  primary key (player, email)
);
alter table unmet enable row level security;
revoke all on table unmet from anon, authenticated;

create or replace function save_enemies(new_enemies jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  item jsonb;
  seen text[] := '{}';
  clean_email text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(new_enemies) <> 'array' then raise exception 'enemies must be an array'; end if;
  if jsonb_array_length(new_enemies) > 100 then raise exception 'too many enemies'; end if;

  for item in select * from jsonb_array_elements(new_enemies) loop
    clean_email := lower(btrim(item->>'email'));
    if clean_email is null or clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'bad enemy email';
    end if;
    if seen @> array[clean_email] then raise exception 'duplicate enemy email'; end if;
    seen := seen || clean_email;
  end loop;

  -- отменённые знакомства назад не пускаем, даже если старая вкладка их помнит
  update profiles
     set enemies = coalesce((select jsonb_agg(e) from jsonb_array_elements(new_enemies) e
                              where not exists (select 1 from unmet u
                                                 where u.player = uid
                                                   and u.email = lower(btrim(e->>'email')))),
                            '[]'::jsonb)
   where id = uid;
end;
$$;

-- Отклонить налёт знакомого через общий список. Нападающему — его цена, как
-- у снятого без боя; в его журнале налёт остаётся отклонённым. Если это был
-- первый же налёт между вами, знакомство не состоялось: оба пропадают из
-- списков врагов друг друга. Отдаёт true, если знакомство отменено.
create or replace function decline_raid(attack_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  a attacks;
  first_raid boolean;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into a from attacks
   where id = attack_id and defender_id = uid and status = 'pending'
     and resolving_token is null
   for update;
  if not found then raise exception 'raid not found'; end if;
  if a.attacker_id = uid or not strangers(uid, a.attacker_id) then
    raise exception 'only raids from strangers can be declined';
  end if;

  first_raid := not exists (
    select 1 from attacks b
     where b.id <> a.id and b.status <> 'pending'
       and ((b.attacker_id = uid and b.defender_id = a.attacker_id)
         or (b.attacker_id = a.attacker_id and b.defender_id = uid)));

  update profiles set credits = credits + raid_price(a) where id = a.attacker_id;
  update attacks set status = 'declined', resolved_at = now() where id = a.id;

  if first_raid then
    update profiles me
       set enemies = coalesce((select jsonb_agg(e) from jsonb_array_elements(me.enemies) e
                                where lower(e->>'email') <> lower(other.email)), '[]'::jsonb)
      from profiles other
     where (me.id = uid and other.id = a.attacker_id)
        or (me.id = a.attacker_id and other.id = uid);
    delete from listed_met m
     where (m.player = uid and m.other = a.attacker_id)
        or (m.player = a.attacker_id and m.other = uid);
    insert into unmet (player, email)
    select me.id, lower(other.email)
      from profiles me, profiles other
     where (me.id = uid and other.id = a.attacker_id)
        or (me.id = a.attacker_id and other.id = uid)
    on conflict do nothing;
  end if;
  return first_raid;
end;
$$;

notify pgrst, 'reload schema';
