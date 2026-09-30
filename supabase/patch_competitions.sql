-- Патч живой базы: версия боя 16, состязания на сервере и уборка хвостов.
-- Выполнить в Supabase → SQL Editor целиком, до деплоя клиента: новый клиент
-- зовёт queue_competition и buy_depot(amount), ждёт competition_stage в
-- очереди и журнале, drone_level в отчётах и collect_income без sold_scouts.
--
-- Что внутри:
-- • версия боя 16: сбитая взрывчатка рвётся крестом, дроны не исчезают;
-- • состязания: налёт на самого себя с номером 1…100, счёт — уцелевший
--   процент × √(площадь / 100), лучший по номеру и открытый номер в профиле;
--   всем открыт снова №1;
-- • хвосты: контейнеры scout/plus, колонка profiles.scouts, налёты без волн,
--   карта в base64 у rle_decode, параметр packs у buy_depot.

-- ---------- версия боя ----------
create or replace function sim_version() returns int
language sql immutable as $$ select 16 $$;

-- держим в одном месте, чтобы клиент и сервер не разъезжались
create or replace function price(kind text) returns int
language sql immutable as $$
  select case kind
    when 'cell'   then 10
    when 'repair' then 5
    when 'scrap'  then 5   -- за сданные во вторсырьё остатки сгоревшей клетки
    when 'gun'    then 100
    when 'spray'  then 150  -- огнетушитель дороже зенитки: бережёт и площадь, и товар
    when 'trap'   then 200  -- ловушка дороже огнетушителя: держит рой в радиусе
    when 'rocket' then 200  -- ракетница вдвое дороже зенитки: и достаёт вдвое дальше
    when 'refund' then 50
    when 'drones' then 1000
    when 'drone'  then 25
    -- Шар стоит пятёрку: контейнер на десяток — полсотни. Прокачки нет.
    when 'balloon' then 5
    when 'income' then 10  -- кредитов в сутки с каждой целой клетки
    when 'sale'   then 2   -- отгрузка идёт вдвое дороже закупки
    when 'loot'   then 50   -- нападавшему за каждую сожжённую клетку склада
    -- Надбавка за близкий к полному разгром, процентов при стопроцентном.
    -- Растёт кубом от доли сожжённого; то же число в LOOT_CURVE на клиенте.
    when 'loot_curve' then 200
    when 'insure_cell'  then 5   -- страховка погорельцу: ровно на ремонт клетки
    when 'insure_step'  then 25  -- покрытие товара и пушек: столько процентов за уровень полиса
    when 'free'   then 25   -- стартовая площадь 5×5 достаётся даром
    when 'found'  then 25   -- столько же нужно, чтобы основаться
    when 'upgrade' then 5000 -- апгрейд на любую ступень стоит одинаково
    when 'price_step' then 10 -- на столько процентов дорожает вещь за уровень
    when 'loan_min'   then 1000  -- меньше этого банк не выдаёт
    when 'loan_max'   then 10000 -- потолок займа = стартовая казна
    when 'loan_rate'  then 10    -- процент за сутки
    when 'loan_hours' then 24    -- срок займа
    when 'max_raid' then 500 -- потолок одного налёта, тот же и на клиенте
    when 'start'    then 10000 -- с чего начинает новый склад и к чему сбрасывает restart_game
    when 'defend_clean' then 15 -- защитнику за дрона при чистом отбое (~2–3× меньше лута атаки)
    when 'defend_dirty' then 6  -- за дрона, если что-то сгорело
    when 'defend_burn'  then 8  -- штраф грязной премии за сгоревшую клетку
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
  end;
$$;

-- неотыгранные налёты играть новыми правилами можно — перештамповываем
update attacks
   set simulation_version = sim_version()
 where status = 'pending' and simulation_version <> sim_version();

-- ---------- данные ----------
-- Налёты без волн — с доволновых времён: ни сыграть, ни пересмотреть их
-- нынешний клиент не может. Комментарии под ними уходят каскадом.
delete from attacks where waves is null;
alter table attacks alter column waves set not null;
alter table attacks drop column if exists plus;

alter table attacks add column if not exists competition_stage int;
alter table profiles add column if not exists competition_at int not null default 1;
alter table profiles add column if not exists competition_best jsonb not null default '{}'::jsonb;
alter table profiles drop column if exists scouts;
-- все начинают состязания с №1: у прежней шкалы номера были другие
update profiles set competition_at = 1, competition_best = '{}'::jsonb;

-- контейнеры scout и plus становятся обычными
update bases
   set drone_cells = (
     select coalesce(jsonb_agg(
              case when e->>'kind' in ('scout', 'plus') then e - 'kind' else e end
              order by ord), '[]'::jsonb)
       from jsonb_array_elements(drone_cells) with ordinality as t(e, ord)
   )
 where exists (select 1 from jsonb_array_elements(drone_cells) e
                where e->>'kind' in ('scout', 'plus'));

-- ---------- функции ----------
-- у этих сменились аргументы или состав колонок: create or replace не умеет
drop function if exists buy_depot(int, jsonb, text);
drop function if exists collect_income();
drop function if exists attack_reports();
drop function if exists pending_attacks();
drop function if exists raid_log();
drop function if exists public_replay(uuid);

create or replace function rle_decode(src text) returns bytea
language plpgsql immutable as $$
declare
  part text;
  v int;
  n int;
  total int := 0;
  hex text := '';
begin
  if src is null or src = '' then raise exception 'empty map'; end if;
  foreach part in array string_to_array(src, ',') loop
    v := split_part(part, ':', 1)::int;
    n := split_part(part, ':', 2)::int;
    if v < 0 or v > 4 then raise exception 'bad cell value %', v; end if;
    if n < 1 then raise exception 'bad run length %', n; end if;
    total := total + n;
    if total > 10000 then raise exception 'map longer than 10000 cells'; end if;
    hex := hex || repeat(lpad(to_hex(v), 2, '0'), n);
  end loop;
  if total <> 10000 then
    raise exception 'map must cover 10000 cells, got %', total;
  end if;
  return decode(hex, 'hex');
end;
$$;

create or replace function depot_sum_kind(d jsonb, want text) returns int
language sql immutable as $$
  select coalesce(sum((e->>'n')::int), 0)::int
    from jsonb_array_elements(coalesce(d, '[]'::jsonb)) e
   where coalesce(e->>'kind', 'basic') = want;
$$;

create or replace function depots_only_changed(
  before jsonb, after jsonb, kind text, delta int
) returns boolean language sql immutable as $$
  select bool_and(
    depot_sum_kind(after, k) =
      depot_sum_kind(before, k) + case when k = kind then delta else 0 end
  )
  from unnest(array['basic', 'balloon']) as k;
$$;

create or replace function depots_valid(d jsonb, map bytea, guns jsonb)
returns boolean language plpgsql immutable as $$
declare
  e jsonb;
  cx int;
  cy int;
  k int;
  n int;
  seen int[] := '{}';
begin
  if jsonb_typeof(coalesce(d, 'null'::jsonb)) <> 'array' then return false; end if;
  for e in select * from jsonb_array_elements(coalesce(d, '[]'::jsonb)) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    -- Лишние поля не принимаем: иначе через них можно тащить состояние мимо
    -- проверок количества и вида.
    if exists (
      select 1 from jsonb_object_keys(e) key
       where key not in ('cx', 'cy', 'n', 'kind')
    ) then return false; end if;
    if e->>'cx' is null or e->>'cy' is null or e->>'n' is null then return false; end if;
    if coalesce(e->>'kind', 'basic') not in ('basic', 'balloon') then
      return false;
    end if;
    begin
      cx := (e->>'cx')::int;
      cy := (e->>'cy')::int;
      n := (e->>'n')::int;
    exception when others then
      return false;
    end;
    if cx < 0 or cy < 0 or cx > 99 or cy > 99 then return false; end if;
    if n < 1 or n > 10 then return false; end if;
    k := cy * 100 + cx;
    if get_byte(map, k) <> 1 then return false; end if;
    if seen @> array[k] then return false; end if;
    seen := seen || k;
    if exists (
      select 1 from jsonb_array_elements(coalesce(guns, '[]'::jsonb)) g
       where (g->>'cx')::int = cx and (g->>'cy')::int = cy
    ) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function battle_depots_valid(
  before jsonb, after jsonb, map bytea, guns jsonb
) returns boolean language sql immutable as $$
  select depots_valid(after, map, guns)
     and not exists (
       select 1
         from jsonb_array_elements(coalesce(after, '[]'::jsonb)) a
        where not exists (
          select 1
            from jsonb_array_elements(coalesce(before, '[]'::jsonb)) b
           where (b->>'cx')::int = (a->>'cx')::int
             and (b->>'cy')::int = (a->>'cy')::int
             and coalesce(b->>'kind', 'basic') = coalesce(a->>'kind', 'basic')
             and (b->>'n')::int >= (a->>'n')::int
        )
     );
$$;

create or replace function take_from_depots(d jsonb, want int, want_kind text)
returns jsonb
language plpgsql immutable as $$
declare
  arr jsonb := coalesce(d, '[]'::jsonb);
  out jsonb := '[]'::jsonb;
  e jsonb;
  need int := want;
  n int;
  grab int;
  i int;
begin
  if want is null or want < 1 then raise exception 'bad drone count'; end if;
  for i in reverse jsonb_array_length(arr) - 1 .. 0 loop
    e := arr -> i;
    if need > 0 and coalesce(e->>'kind', 'basic') = want_kind then
      n := coalesce((e->>'n')::int, 0);
      grab := least(n, need);
      need := need - grab;
      n := n - grab;
      if n > 0 then
        out := jsonb_insert(out, '{0}', jsonb_set(e, '{n}', to_jsonb(n)));
      end if;
    else
      out := jsonb_insert(out, '{0}', e);
    end if;
  end loop;
  if need > 0 then raise exception 'not enough drones in the warehouse'; end if;
  return out;
end;
$$;

create or replace function save_base(new_cells text, new_guns jsonb, new_depots jsonb)
returns table (credits int, drones int, intact int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof profiles;
  bin bytea := rle_decode(new_cells);
  cur bytea;
  cur_guns jsonb;
  cur_depots jsonb;
  i int;
  old_v int;
  new_v int;
  built int := 0;
  repaired int := 0;
  scrapped int := 0;
  intact_now int := 0;
  claimed int := 0;   -- клетки, уже занятые зданием: от них считается лимит
  free_left int;
  paid int;
  guns_added int;
  rockets_added int;
  sprays_added int;
  traps_added int;
  guns_removed int;
  cost int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if octet_length(bin) <> 10000 then raise exception 'bad map size'; end if;

  select * into prof from profiles where id = uid for update;
  select b.cells, b.guns, b.drone_cells into cur, cur_guns, cur_depots
    from bases b where b.user_id = uid for update;
  if cur is null then raise exception 'no base'; end if;

  -- Пока сервер считает настоящий налёт по снимку, склад нельзя менять:
  -- иначе итог боя наложится на уже купленное или разъедется со слепком.
  if exists (
    select 1 from attacks a
     where a.defender_id = uid
       and a.status = 'pending'
       and a.resolving_token is not null
       and a.resolving_at > now() - interval '2 minutes'
  ) then
    raise exception 'battle is resolving';
  end if;

  -- вне боя дронов не прибавляется: контейнеры можно только переставлять
  -- вне покупки ни один вид не меняется: ящики можно только переставлять
  if not depots_only_changed(cur_depots, new_depots, 'basic', 0) then
    raise exception 'drone count may only change on purchase';
  end if;
  if not guns_valid(new_guns, bin, new_depots) then
    raise exception 'bad gun placement';
  end if;
  if not depots_valid(new_depots, bin, new_guns) then
    raise exception 'bad depot placement';
  end if;

  for i in 0..9999 loop
    old_v := get_byte(cur, i);
    new_v := get_byte(bin, i);
    if old_v in (1, 2, 3) then claimed := claimed + 1; end if;
    if new_v = 1 then
      intact_now := intact_now + 1;
      if old_v = 3 then
        repaired := repaired + 1;
      elsif old_v <> 1 then
        built := built + 1;
      end if;
    elsif old_v = 4 and new_v = 0 then
      -- следы падений на земле после боя мгновенно зарастают травой
      null;
    elsif old_v = 3 and new_v = 0 then
      -- снос: остатки сгоревшей клетки сданы во вторсырьё
      scrapped := scrapped + 1;
    elsif new_v <> old_v then
      -- вне боя клетка не может стать хуже
      raise exception 'cell % may not degrade outside battle', i;
    end if;
  end loop;

  guns_added := greatest(0, gun_count(new_guns, 'gun') - gun_count(cur_guns, 'gun'));
  rockets_added := greatest(0, gun_count(new_guns, 'rocket') - gun_count(cur_guns, 'rocket'));
  sprays_added := greatest(0, gun_count(new_guns, 'spray') - gun_count(cur_guns, 'spray'));
  traps_added := greatest(0, gun_count(new_guns, 'trap') - gun_count(cur_guns, 'trap'));
  -- Возврат только за реально снятые установки известных видов, а не за
  -- разницу длин массива: иначе неизвестный kind давал бы бесплатный refund.
  guns_removed := greatest(
    0,
    gun_count(cur_guns, 'gun') + gun_count(cur_guns, 'rocket')
      + gun_count(cur_guns, 'spray') + gun_count(cur_guns, 'trap')
      - gun_count(new_guns, 'gun') - gun_count(new_guns, 'rocket')
      - gun_count(new_guns, 'spray') - gun_count(new_guns, 'trap')
  );

  -- первые price('free') клеток склада бесплатны, считаем от того, что уже стоит
  free_left := greatest(0, price('free') - claimed);
  paid := greatest(0, built - free_left);

  cost := paid * price('cell')
        + repaired * price('repair')
        + guns_added * price_at(price('gun'), coalesce((prof.levels->>'guns')::int, 1))
        + rockets_added * price_at(price('rocket'), coalesce((prof.levels->>'rockets')::int, 1))
        + sprays_added * price_at(price('spray'), coalesce((prof.levels->>'sprays')::int, 1))
        + traps_added * price_at(price('trap'), coalesce((prof.levels->>'traps')::int, 1))
        - guns_removed * price('refund')
        - scrapped * price('scrap');

  if prof.credits < cost then
    raise exception 'not enough credits: need %, have %', cost, prof.credits;
  end if;

  update bases
     set cells = bin,
         guns = new_guns,
         drone_cells = new_depots,
         intact_cells = intact_now,
         updated_at = now()
   where user_id = uid;

  update profiles
     set credits = profiles.credits - cost,
         drones = depot_sum_kind(new_depots, 'basic'),
         founded = profiles.founded or intact_now >= price('found'),
         stats = jsonb_set(profiles.stats, '{cellsRepaired}',
                 to_jsonb((profiles.stats->>'cellsRepaired')::int + repaired))
   where profiles.id = uid
   returning profiles.credits, profiles.drones into credits, drones;

  intact := intact_now;
  return next;
end;
$$;

create or replace function apply_battle_for(
  player uuid, new_cells text, new_guns jsonb, new_depots jsonb, result jsonb
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
  drones_sent := greatest(0, coalesce((result->>'dronesSent')::int, 0));
  if burned = 0 then
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

create or replace function buy_depot(
  amount int, new_depots jsonb, depot_kind text default 'basic'
)
returns table (credits int, drones int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cost int;
  cur bytea;
  cur_guns jsonb;
  cur_depots jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if amount is null or amount < 1 or amount > 100000 then
    raise exception 'bad drone amount';
  end if;
  if depot_kind not in ('basic', 'balloon') then
    raise exception 'bad depot kind';
  end if;
  -- Шары не качаются: их цена одна на всю игру, дроны дорожают с уровнем.
  select case when depot_kind = 'balloon'
              then amount * price('balloon')
              else amount * price_at(
                     price('drone'),
                     coalesce((p.levels->>'drones')::int, 1)
                   )
         end
    into cost
    from profiles p where p.id = uid;

  select b.cells, b.guns, b.drone_cells into cur, cur_guns, cur_depots
    from bases b where b.user_id = uid for update;
  if cur is null then raise exception 'no base'; end if;

  if exists (
    select 1 from attacks a
     where a.defender_id = uid
       and a.status = 'pending'
       and a.resolving_token is not null
       and a.resolving_at > now() - interval '2 minutes'
  ) then
    raise exception 'battle is resolving';
  end if;

  -- купленное обязано лечь на склад: ровно запрошенное число новых дронов
  if not depots_only_changed(cur_depots, new_depots, depot_kind, amount) then
    raise exception 'depots must hold exactly the purchased items';
  end if;
  if not depots_valid(new_depots, cur, cur_guns) then
    raise exception 'not enough free cells for containers';
  end if;

  update bases set drone_cells = new_depots, updated_at = now() where user_id = uid;

  update profiles
     set credits = profiles.credits - cost,
         drones = depot_sum_kind(new_depots, 'basic')
   where profiles.id = uid and profiles.credits >= cost
   returning profiles.credits, profiles.drones into credits, drones;

  if not found then raise exception 'not enough credits'; end if;
  return next;
end;
$$;

create or replace function collect_income()
returns table (credits_added int, days int, sold_drones int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof profiles;
  intact int;
  passed int;
  paid int;
  gain int;
  cur_depots jsonb;
  drones_out int;
  sale int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform settle_loan(uid);
  select * into prof from profiles where id = uid for update;
  if not found then raise exception 'no profile'; end if;

  select b.intact_cells, b.drone_cells
    into intact, cur_depots
    from bases b where b.user_id = uid for update;

  -- смена — двенадцать часов, отгрузка дважды в сутки
  passed := floor(extract(epoch from (now() - prof.last_income_at)) / 43200);
  if passed <= 0 then
    return query select 0, 0, 0;
    return;
  end if;

  paid := least(passed, 28);
  -- Аренда идёт с каждой целой клетки за каждые сутки.
  gain := paid * coalesce(intact, 0) * price('income');

  -- А раз в отгрузку склад продаёт всё, что на нём лежит, вдвое дороже
  -- закупки. Продаётся то, что есть сейчас, а не за каждые прошедшие сутки.
  -- Цену берём с учётом уровня, ту же, по какой товар и покупался: иначе
  -- прокачка съедала бы маржу — на десятом уровне дрон обходился в 47, а
  -- уходил за те же 50.
  drones_out := depot_sum_kind(cur_depots, 'basic');
  sale := drones_out * price_at(price('drone'), coalesce((prof.levels->>'drones')::int, 1))
         * price('sale');

  -- Уходят только дроны. Шары остаются на складе: они не товар, а
  -- заграждение, и отгружать их некуда.
  update bases
     set drone_cells = coalesce((
           select jsonb_agg(e order by ord)
             from jsonb_array_elements(coalesce(drone_cells, '[]'::jsonb))
                  with ordinality as t(e, ord)
            where coalesce(e->>'kind', 'basic') = 'balloon'
         ), '[]'::jsonb),
         updated_at = now()
   where user_id = uid and jsonb_array_length(drone_cells) > 0;

  update profiles
     set credits = credits + gain + sale,
         drones = 0,
         last_income_at = prof.last_income_at + (passed * 12 || ' hours')::interval
   where id = uid;

  return query select gain + sale, paid, drones_out;
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
  if drone_count <> 12 + ((stage - 1) * 238) / 99 then
    raise exception 'bad drone count';
  end if;
  if attack_drone_level is distinct from 1 + (stage - 1) / 20 then
    raise exception 'bad drone level';
  end if;
  if attack_seed is distinct from stage * 9973 then
    raise exception 'bad competition seed';
  end if;
  if (select count(*) from attacks a
       where a.defender_id = uid and a.competition_stage is not null
         and a.status = 'pending') >= price('queued') then
    raise exception 'too many competitions already queued';
  end if;

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
  -- выдаче списка — это и есть «первый показ».
  select a.id into head
    from attacks a
   where a.defender_id = uid and a.status = 'pending'
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
     -- в состязании нападающий сам себе защитник: итог он уже видел
     and a.competition_stage is null
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
  -- счёт: уцелевший процент × √(площадь / 100), как competitionScore на
  -- клиенте. Лучший по номеру храним; уцелел склад — открыт следующий.
  if order_row.competition_stage is not null then
    earned := 0;
    if intact_before > 0 then
      comp_pct := (defender_intact * 100) / intact_before;
      comp_score := round((comp_pct * sqrt(intact_before / 100.0))::numeric)::int;
      update profiles
         set competition_best = case
               when coalesce((competition_best -> order_row.competition_stage::text
                              ->> 'score')::int, -1) < comp_score
               then competition_best || jsonb_build_object(
                      order_row.competition_stage::text,
                      jsonb_build_object('score', comp_score, 'pct', comp_pct,
                                         'area', intact_before))
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
  drones int, loot int, destroyed boolean, burned int, has_replay boolean,
  competition_stage int
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
         a.snap_cells is not null,
         a.competition_stage
    from attacks a
    join profiles t on t.id = a.attacker_id
    join profiles d on d.id = a.defender_id
   where not (auth.uid() = any (a.hidden_by))
     and (
       (a.attacker_id = auth.uid() and a.competition_stage is null
        and a.status in ('pending', 'resolved'))
       or (a.defender_id = auth.uid() and a.status = 'resolved')
     )
   order by coalesce(a.resolved_at, a.created_at) desc
   limit 30;
$$;

create or replace function public_replay(attack_id uuid)
returns table (
  attacker text, defender text,
  drones int, pattern text, direction int, seed int, waves jsonb, drone_level int,
  simulation_version int,
  snap_cells text, snap_guns jsonb, snap_depots jsonb, snap_levels jsonb,
  trace text, result jsonb, resolved_at timestamptz, competition_stage int
)
language sql security definer set search_path = public stable as $$
  select coalesce(att.base_name, att.display_name, split_part(att.email, '@', 1)),
         coalesce(def.base_name, def.display_name, split_part(def.email, '@', 1)),
         a.drones, a.pattern, a.direction, a.seed, a.waves, a.drone_level,
         a.simulation_version,
         a.snap_cells, a.snap_guns, a.snap_depots, a.snap_levels,
         a.trace, a.result, a.resolved_at, a.competition_stage
    from attacks a
    join profiles att on att.id = a.attacker_id
    join profiles def on def.id = a.defender_id
   where a.id = attack_id
     and a.status = 'resolved'
     and a.snap_cells is not null;
$$;

drop function if exists normalize_depots(jsonb);

grant execute on function public_replay to anon, authenticated;
grant execute on function buy_depot, collect_income, attack_reports,
  queue_competition, pending_attacks, raid_log to authenticated;

notify pgrst, 'reload schema';
