-- Миссия платит своей наградой вместо премии за отбой: номер × 1000 за
-- первое прохождение (счёт выше нуля) и 15 за каждого сбитого дрона при
-- новом рекорде. Страховка — как в любом бою. Выполнить до обновления
-- клиента. Можно выполнять повторно.

create or replace function price(kind text) returns int
language sql immutable as $$
  select case kind
    when 'cell'   then 10
    when 'repair' then 5
    when 'scrap'  then 5   -- за сданные во вторсырьё остатки сгоревшей клетки
    when 'gun'    then 100
    when 'spray'  then 150  -- огнетушитель дороже зенитки: бережёт и площадь, и товар
    when 'net' then 10
    when 'net_mid' then 25
    when 'net_top' then 50
    when 'net_upgrade_first' then 8000
    when 'net_upgrade_second' then 64000
    when 'trap'   then 200  -- ловушка дороже огнетушителя: держит рой в радиусе
    when 'rocket' then 200  -- ракетница вдвое дороже зенитки: и достаёт вдвое дальше
    when 'drones' then 1000
    when 'drone'  then 25
    -- Пусковая шаров: разовая — выбрасывает шары и пропадает, оттого дешевле зенитки.
    when 'balloon' then 80
    when 'sale'   then 200 -- отгрузка: процент от цены закупки, вдвое дороже
    when 'loot'   then 50   -- нападавшему за каждую сожжённую клетку склада
    -- Надбавка за близкий к полному разгром, процентов при стопроцентном.
    -- Растёт кубом от доли сожжённого; то же число в LOOT_CURVE на клиенте.
    when 'loot_curve' then 200
    when 'insure_cell'  then 5   -- страховка погорельцу: ровно на ремонт клетки
    when 'insure_step'  then 25  -- покрытие товара и пушек: столько процентов за уровень полиса
    when 'free'   then 25   -- стартовая площадь 5×5 достаётся даром
    when 'found'  then 25   -- столько же нужно, чтобы основаться
    when 'upgrade' then 1000 -- первый уровень; каждый следующий вдвое дороже
    when 'insurance_upgrade' then 250 -- страховка: отдельная базовая цена
    -- Цена на десятом уровне: с первого до десятого вещь дорожает ровно.
    when 'gun_top'     then 200
    when 'rocket_top'  then 400
    when 'spray_top'   then 300
    when 'trap_top'    then 400
    when 'balloon_top' then 150
    when 'drone_top'   then 30
    when 'loan_min'   then 1000  -- меньше этого банк не выдаёт
    when 'loan_rate'  then 10    -- процент за сутки
    when 'loan_hours' then 24    -- срок займа
    when 'start'    then 10000 -- с чего начинает новый склад и к чему сбрасывает restart_game
    when 'defend_clean' then 15 -- защитнику за дрона при чистом отбое (~2–3× меньше лута атаки)
    when 'defend_dirty' then 6  -- за дрона, если что-то сгорело
    when 'defend_burn'  then 8  -- штраф грязной премии за сгоревшую клетку
    when 'mission_stage' then 1000 -- миссия: за первое прохождение номера, умножается на номер
    when 'mission_kill'  then 15   -- миссия: за сбитого дрона при новом рекорде
    when 'queued'   then 3   -- столько своих налётов можно держать в чужой очереди разом
    -- Надбавка за начинку, процентов от цены дрона. Те же числа в PAYLOAD
    -- на клиенте: их обязаны считать одинаково, иначе окно налёта покажет
    -- одну сумму, а спишется другая.
    when 'pay_plain'  then 0
    when 'pay_heavy'  then 50
    when 'pay_jammer' then 40
    when 'pay_foamer' then 30
    when 'pay_demag'  then 35
    when 'pay_blower' then 25
    when 'pay_stealth' then 60  -- невидимка снимает всю автоматику склада, оттого и дороже всех
    when 'pay_turbo'  then 40   -- турбо: +50% к скорости, взрыв как у простой
    when 'pay_armor'  then 45   -- броня: зенитке нужно два попадания
    when 'pay_shooter' then 50  -- стрелок: ракета по складу издалека, потом таран
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
                          order_row.competition_stage is null) applied;

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
