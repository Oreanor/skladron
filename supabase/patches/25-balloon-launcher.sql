-- Версия боя 26: шары — не ящики, а разовая пусковая установка. Ставится
-- как пушка, качается своим классом (balloons), и как только в её круг
-- входит дрон, выбрасывает шары по кругу и пропадает.
-- Старые ящики с шарами становятся такими установками на тех же клетках.
-- Выполнить в Supabase → SQL Editor до деплоя клиента (после 24-го).
-- Повторно не прогонять, если версия к тому времени выше 26.

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
    when 'drones' then 1000
    when 'drone'  then 25
    -- Пусковая шаров: разовая — выбрасывает шары и пропадает, оттого дешевле зенитки.
    when 'balloon' then 80
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
    when 'pay_armor'  then 45   -- броня: зенитке нужно два попадания
  end;
$$;

create or replace function depot_value(d jsonb) returns int
language sql immutable as $$
  select coalesce(sum((e->>'n')::int * price('drone')), 0)::int
  from jsonb_array_elements(coalesce(d, '[]'::jsonb)) e;
$$;

drop function if exists depots_only_changed(jsonb, jsonb, text, int);
create or replace function depots_only_changed(before jsonb, after jsonb, delta int)
returns boolean language sql immutable as $$
  select depot_sum_kind(after, 'basic') = depot_sum_kind(before, 'basic') + delta;
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
    if coalesce(e->>'kind', 'basic') <> 'basic' then
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

create or replace function guns_valid(g jsonb, map bytea, depots jsonb)
returns boolean language plpgsql immutable as $$
declare
  e jsonb;
  cx int;
  cy int;
  k int;
  seen int[] := '{}';
begin
  if jsonb_typeof(coalesce(g, 'null'::jsonb)) <> 'array' then return false; end if;
  for e in select * from jsonb_array_elements(coalesce(g, '[]'::jsonb)) loop
    if jsonb_typeof(e) <> 'object' then return false; end if;
    if exists (
      select 1 from jsonb_object_keys(e) key
       where key not in ('cx', 'cy', 'kind')
    ) then return false; end if;
    if e->>'cx' is null or e->>'cy' is null then return false; end if;
    if coalesce(e->>'kind', 'gun') not in ('gun', 'rocket', 'spray', 'trap', 'balloon') then
      return false;
    end if;
    begin
      cx := (e->>'cx')::int;
      cy := (e->>'cy')::int;
    exception when others then
      return false;
    end;
    if cx < 0 or cy < 0 or cx > 99 or cy > 99 then return false; end if;
    k := cy * 100 + cx;
    if get_byte(map, k) <> 1 then return false; end if;
    if seen @> array[k] then return false; end if;
    seen := seen || k;
    if exists (
      select 1 from jsonb_array_elements(coalesce(depots, '[]'::jsonb)) d
       where (d->>'cx')::int = cx and (d->>'cy')::int = cy
    ) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function collect_income_for(uid uuid)
returns table (credits_added int, days int, sold_drones int, sold_credits int)
language plpgsql security definer set search_path = public as $$
declare
  prof profiles;
  intact int;
  passed int;
  paid int;
  gain int;
  cur_depots jsonb;
  drones_out int;
  sale int;
begin
  perform settle_loan(uid);
  select * into prof from profiles where id = uid for update;
  if not found then raise exception 'no profile'; end if;

  select b.intact_cells, b.drone_cells
    into intact, cur_depots
    from bases b where b.user_id = uid for update;

  -- смена — двенадцать часов, отгрузка дважды в сутки
  passed := floor(extract(epoch from (now() - prof.last_income_at)) / 43200);
  if passed <= 0 then
    return query select 0, 0, 0, 0;
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

  update bases
     set drone_cells = '[]'::jsonb,
         updated_at = now()
   where user_id = uid and jsonb_array_length(drone_cells) > 0;

  update profiles
     set credits = credits + gain + sale,
         drones = 0,
         last_income_at = prof.last_income_at + (passed * 12 || ' hours')::interval
   where id = uid;

  return query select gain + sale, paid, drones_out, sale;
end;
$$;

drop function if exists buy_depot(int, jsonb, text);
create or replace function buy_depot(amount int, new_depots jsonb)
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
  select amount * price_at(price('drone'), coalesce((p.levels->>'drones')::int, 1))
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
  if not depots_only_changed(cur_depots, new_depots, amount) then
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

grant execute on function buy_depot to authenticated;
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
  balloons_added int;
  guns_gone int;
  rockets_gone int;
  sprays_gone int;
  traps_gone int;
  balloons_gone int;
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
  if not depots_only_changed(cur_depots, new_depots, 0) then
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
  balloons_added := greatest(0, gun_count(new_guns, 'balloon') - gun_count(cur_guns, 'balloon'));
  -- Проданные установки — по виду и по нынешней цене закупки: двойной клик
  -- на складе продаёт по номиналу. Считаем по известным видам, а не по
  -- длине массива: иначе неизвестный kind давал бы бесплатный возврат.
  guns_gone := greatest(0, gun_count(cur_guns, 'gun') - gun_count(new_guns, 'gun'));
  rockets_gone := greatest(0, gun_count(cur_guns, 'rocket') - gun_count(new_guns, 'rocket'));
  sprays_gone := greatest(0, gun_count(cur_guns, 'spray') - gun_count(new_guns, 'spray'));
  traps_gone := greatest(0, gun_count(cur_guns, 'trap') - gun_count(new_guns, 'trap'));
  balloons_gone := greatest(0, gun_count(cur_guns, 'balloon') - gun_count(new_guns, 'balloon'));

  -- первые price('free') клеток склада бесплатны, считаем от того, что уже стоит
  free_left := greatest(0, price('free') - claimed);
  paid := greatest(0, built - free_left);

  cost := paid * price('cell')
        + repaired * price('repair')
        + guns_added * price_at(price('gun'), coalesce((prof.levels->>'guns')::int, 1))
        + rockets_added * price_at(price('rocket'), coalesce((prof.levels->>'rockets')::int, 1))
        + sprays_added * price_at(price('spray'), coalesce((prof.levels->>'sprays')::int, 1))
        + traps_added * price_at(price('trap'), coalesce((prof.levels->>'traps')::int, 1))
        + balloons_added * price_at(price('balloon'), coalesce((prof.levels->>'balloons')::int, 1))
        - guns_gone * price_at(price('gun'), coalesce((prof.levels->>'guns')::int, 1))
        - rockets_gone * price_at(price('rocket'), coalesce((prof.levels->>'rockets')::int, 1))
        - sprays_gone * price_at(price('spray'), coalesce((prof.levels->>'sprays')::int, 1))
        - traps_gone * price_at(price('trap'), coalesce((prof.levels->>'traps')::int, 1))
        - balloons_gone * price_at(price('balloon'), coalesce((prof.levels->>'balloons')::int, 1))
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

create or replace function upgrade(kind text)
returns table (credits int, levels jsonb)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cur int;
  cost int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if kind not in
     ('drones', 'guns', 'rockets', 'sprays', 'traps', 'balloons', 'mg', 'water', 'insurance') then
    raise exception 'bad upgrade kind';
  end if;

  select coalesce((p.levels->>kind)::int, 1) into cur
    from profiles p where p.id = uid for update;
  if cur is null then raise exception 'no profile'; end if;
  -- у страховки потолок свой: пятый уровень покрывает потери целиком
  if cur >= (case when kind = 'insurance' then 5 else 10 end) then
    raise exception 'already at max level';
  end if;
  cost := price('upgrade');

  update profiles
     set credits = profiles.credits - cost,
         levels = jsonb_set(profiles.levels, array[kind], to_jsonb(cur + 1))
   where profiles.id = uid and profiles.credits >= cost
   returning profiles.credits, profiles.levels into credits, levels;

  if not found then raise exception 'not enough credits'; end if;
  return next;
end;
$$;

create or replace function install_value(g jsonb, lv jsonb) returns int
language sql immutable as $
  select gun_count(g, 'gun') * price_at(price('gun'), coalesce((lv->>'guns')::int, 1))
       + gun_count(g, 'rocket') * price_at(price('rocket'), coalesce((lv->>'rockets')::int, 1))
       + gun_count(g, 'spray') * price_at(price('spray'), coalesce((lv->>'sprays')::int, 1))
       + gun_count(g, 'trap') * price_at(price('trap'), coalesce((lv->>'traps')::int, 1))
       + gun_count(g, 'balloon') * price_at(price('balloon'), coalesce((lv->>'balloons')::int, 1));
$;

-- Сколько стоит содержимое контейнеров по цене закупки.
create or replace function goods_value(d jsonb, lv jsonb) returns int
language sql immutable as $
  select depot_sum_kind(d, 'basic') * price_at(price('drone'), coalesce((lv->>'drones')::int, 1));
$;

-- Сколько клеток с таким значением на карте.
create or replace function cells_with(map bytea, v int) returns int
language sql immutable as $
  select count(*)::int from generate_series(0, octet_length(map) - 1) i where get_byte(map, i) = v;
$;

create or replace function save_blueprint(bp_name text, bp_cells text, bp_guns jsonb)
returns table (id uuid, name text, cells text, guns jsonb, created_at timestamptz)
language plpgsql security definer set search_path = public as $
declare
  uid uuid := auth.uid();
  bin bytea := rle_decode(bp_cells);
  clean text := btrim(coalesce(bp_name, ''));
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if char_length(clean) < 1 or char_length(clean) > 40 then raise exception 'bad blueprint name'; end if;
  if octet_length(bin) <> 10000 then raise exception 'bad map size'; end if;
  -- в чертеже только земля и целые клетки: гарь и следы — не план
  if cells_with(bin, 0) + cells_with(bin, 1) <> 10000 then raise exception 'bad blueprint cells'; end if;
  if cells_with(bin, 1) < price('found') then raise exception 'blueprint too small'; end if;
  if not guns_valid(bp_guns, bin, '[]'::jsonb) then raise exception 'bad gun placement'; end if;
  if (select count(*) from blueprints b where b.user_id = uid) >= 20 then
    raise exception 'too many blueprints';
  end if;
  return query
    insert into blueprints as b (user_id, name, cells, guns)
    values (uid, clean, bp_cells, bp_guns)
    returning b.id, b.name, b.cells, b.guns, b.created_at;
end;
$;

create or replace function delete_blueprint(bp uuid)
returns void language plpgsql security definer set search_path = public as $
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from blueprints b where b.id = bp and b.user_id = auth.uid();
end;
$;

-- Перестройка по чертежу. Нынешний склад сносится и продаётся: целые
-- клетки сверх бесплатных — по цене постройки, сгоревшие — во вторсырьё,
-- установки, дроны и шары — по нынешней цене закупки. На его месте
-- ставится чертёж по тем же ценам, без контейнеров. Платится только
-- разница, и она же может прийти в плюс.
create or replace function build_blueprint(bp uuid)
returns table (credits int, drones int, intact int)
language plpgsql security definer set search_path = public as $
declare
  uid uuid := auth.uid();
  prof profiles;
  plan blueprints;
  bin bytea;
  cur bytea;
  cur_guns jsonb;
  cur_depots jsonb;
  new_cells int;
  sold int;
  cost int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into plan from blueprints b where b.id = bp and b.user_id = uid;
  if not found then raise exception 'no such blueprint'; end if;
  bin := rle_decode(plan.cells);

  select * into prof from profiles p where p.id = uid for update;
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

  if not guns_valid(plan.guns, bin, '[]'::jsonb) then raise exception 'bad gun placement'; end if;

  new_cells := cells_with(bin, 1);
  sold := greatest(0, cells_with(cur, 1) - price('free')) * price('cell')
        + cells_with(cur, 3) * price('scrap')
        + install_value(cur_guns, prof.levels)
        + goods_value(cur_depots, prof.levels);
  cost := greatest(0, new_cells - price('free')) * price('cell')
        + install_value(plan.guns, prof.levels)
        - sold;

  if prof.credits < cost then
    raise exception 'not enough credits: need %, have %', cost, prof.credits;
  end if;

  update bases
     set cells = bin,
         guns = plan.guns,
         drone_cells = '[]'::jsonb,
         intact_cells = new_cells,
         updated_at = now()
   where user_id = uid;

  update profiles
     set credits = profiles.credits - cost,
         drones = 0,
         founded = profiles.founded or new_cells >= price('found')
   where profiles.id = uid
   returning profiles.credits, profiles.drones into credits, drones;

  intact := new_cells;
  return next;
end;
$;

grant execute on function save_blueprint, delete_blueprint, build_blueprint to authenticated;

-- Продать контейнер со склада: дроны и шары уходят по цене закупки.
create or replace function sell_depot(at_x int, at_y int)
returns table (credits int, drones int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof profiles;
  cur_depots jsonb;
  box jsonb;
  rest jsonb;
  gain int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into prof from profiles p where p.id = uid for update;
  select b.drone_cells into cur_depots from bases b where b.user_id = uid for update;

  if exists (
    select 1 from attacks a
     where a.defender_id = uid
       and a.status = 'pending'
       and a.resolving_token is not null
       and a.resolving_at > now() - interval '2 minutes'
  ) then
    raise exception 'battle is resolving';
  end if;

  select e into box
    from jsonb_array_elements(coalesce(cur_depots, '[]'::jsonb)) e
   where (e->>'cx')::int = at_x and (e->>'cy')::int = at_y
   limit 1;
  if box is null then raise exception 'no depot there'; end if;

  gain := goods_value(jsonb_build_array(box), prof.levels);
  select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into rest
    from jsonb_array_elements(cur_depots) with ordinality as t(e, ord)
   where not ((e->>'cx')::int = at_x and (e->>'cy')::int = at_y);

  update bases set drone_cells = rest, updated_at = now() where user_id = uid;
  update profiles
     set credits = profiles.credits + gain,
         drones = depot_sum_kind(rest, 'basic')
   where profiles.id = uid
   returning profiles.credits, profiles.drones into credits, drones;
  return next;
end;
$$;

create or replace function goods_value(d jsonb, lv jsonb) returns int
language sql immutable as $
  select depot_sum_kind(d, 'basic') * price_at(price('drone'), coalesce((lv->>'drones')::int, 1));
$;

-- Сколько клеток с таким значением на карте.
create or replace function cells_with(map bytea, v int) returns int
language sql immutable as $
  select count(*)::int from generate_series(0, octet_length(map) - 1) i where get_byte(map, i) = v;
$;

create or replace function save_blueprint(bp_name text, bp_cells text, bp_guns jsonb)
returns table (id uuid, name text, cells text, guns jsonb, created_at timestamptz)
language plpgsql security definer set search_path = public as $
declare
  uid uuid := auth.uid();
  bin bytea := rle_decode(bp_cells);
  clean text := btrim(coalesce(bp_name, ''));
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if char_length(clean) < 1 or char_length(clean) > 40 then raise exception 'bad blueprint name'; end if;
  if octet_length(bin) <> 10000 then raise exception 'bad map size'; end if;
  -- в чертеже только земля и целые клетки: гарь и следы — не план
  if cells_with(bin, 0) + cells_with(bin, 1) <> 10000 then raise exception 'bad blueprint cells'; end if;
  if cells_with(bin, 1) < price('found') then raise exception 'blueprint too small'; end if;
  if not guns_valid(bp_guns, bin, '[]'::jsonb) then raise exception 'bad gun placement'; end if;
  if (select count(*) from blueprints b where b.user_id = uid) >= 20 then
    raise exception 'too many blueprints';
  end if;
  return query
    insert into blueprints as b (user_id, name, cells, guns)
    values (uid, clean, bp_cells, bp_guns)
    returning b.id, b.name, b.cells, b.guns, b.created_at;
end;
$;

create or replace function delete_blueprint(bp uuid)
returns void language plpgsql security definer set search_path = public as $
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from blueprints b where b.id = bp and b.user_id = auth.uid();
end;
$;

-- Перестройка по чертежу. Нынешний склад сносится и продаётся: целые
-- клетки сверх бесплатных — по цене постройки, сгоревшие — во вторсырьё,
-- установки, дроны и шары — по нынешней цене закупки. На его месте
-- ставится чертёж по тем же ценам, без контейнеров. Платится только
-- разница, и она же может прийти в плюс.
create or replace function build_blueprint(bp uuid)
returns table (credits int, drones int, intact int)
language plpgsql security definer set search_path = public as $
declare
  uid uuid := auth.uid();
  prof profiles;
  plan blueprints;
  bin bytea;
  cur bytea;
  cur_guns jsonb;
  cur_depots jsonb;
  new_cells int;
  sold int;
  cost int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into plan from blueprints b where b.id = bp and b.user_id = uid;
  if not found then raise exception 'no such blueprint'; end if;
  bin := rle_decode(plan.cells);

  select * into prof from profiles p where p.id = uid for update;
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

  if not guns_valid(plan.guns, bin, '[]'::jsonb) then raise exception 'bad gun placement'; end if;

  new_cells := cells_with(bin, 1);
  sold := greatest(0, cells_with(cur, 1) - price('free')) * price('cell')
        + cells_with(cur, 3) * price('scrap')
        + install_value(cur_guns, prof.levels)
        + goods_value(cur_depots, prof.levels);
  cost := greatest(0, new_cells - price('free')) * price('cell')
        + install_value(plan.guns, prof.levels)
        - sold;

  if prof.credits < cost then
    raise exception 'not enough credits: need %, have %', cost, prof.credits;
  end if;

  update bases
     set cells = bin,
         guns = plan.guns,
         drone_cells = '[]'::jsonb,
         intact_cells = new_cells,
         updated_at = now()
   where user_id = uid;

  update profiles
     set credits = profiles.credits - cost,
         drones = 0,
         founded = profiles.founded or new_cells >= price('found')
   where profiles.id = uid
   returning profiles.credits, profiles.drones into credits, drones;

  intact := new_cells;
  return next;
end;
$;

grant execute on function save_blueprint, delete_blueprint, build_blueprint to authenticated;

-- Продать контейнер со склада: дроны и шары уходят по цене закупки.
create or replace function sell_depot(at_x int, at_y int)
returns table (credits int, drones int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof profiles;
  cur_depots jsonb;
  box jsonb;
  rest jsonb;
  gain int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into prof from profiles p where p.id = uid for update;
  select b.drone_cells into cur_depots from bases b where b.user_id = uid for update;

  if exists (
    select 1 from attacks a
     where a.defender_id = uid
       and a.status = 'pending'
       and a.resolving_token is not null
       and a.resolving_at > now() - interval '2 minutes'
  ) then
    raise exception 'battle is resolving';
  end if;

  select e into box
    from jsonb_array_elements(coalesce(cur_depots, '[]'::jsonb)) e
   where (e->>'cx')::int = at_x and (e->>'cy')::int = at_y
   limit 1;
  if box is null then raise exception 'no depot there'; end if;

  gain := goods_value(jsonb_build_array(box), prof.levels);
  select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into rest
    from jsonb_array_elements(cur_depots) with ordinality as t(e, ord)
   where not ((e->>'cx')::int = at_x and (e->>'cy')::int = at_y);

  update bases set drone_cells = rest, updated_at = now() where user_id = uid;
  update profiles
     set credits = profiles.credits + gain,
         drones = depot_sum_kind(rest, 'basic')
   where profiles.id = uid
   returning profiles.credits, profiles.drones into credits, drones;
  return next;
end;
$$;

create or replace function restart_game()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

  update bases
     set cells = starter_map(),
         guns = '[]'::jsonb, drone_cells = '[]'::jsonb,
         intact_cells = price('free'), updated_at = now()
   where user_id = uid;

  update profiles
     set credits = price('start'),
         drones = 0,
         loan = 0,
         loan_due = null,
         founded = true,
         last_income_at = now(),
         levels = '{"drones":1,"guns":1,"rockets":1,"sprays":1,"traps":1,"balloons":1,"scouts":1,"mg":1,"water":1,"insurance":1}'::jsonb,
         stats = '{"battles":0,"dronesKilled":0,"cellsBurned":0,"cellsRepaired":0,
                   "wipes":0,"raids":0,"looted":0}'::jsonb
   where id = uid;

  -- налёты, которые ждали старый склад, начинать сначала не должны
  delete from attacks where defender_id = uid and status = 'pending';
end;
$$;

alter table profiles alter column levels set default
  '{"drones":1,"guns":1,"rockets":1,"sprays":1,"traps":1,"balloons":1,"scouts":1,"mg":1,"water":1,"insurance":1}'::jsonb;

-- ящики с шарами → пусковые установки на тех же клетках
update bases b
   set guns = coalesce(b.guns, '[]'::jsonb) || coalesce((
         select jsonb_agg(jsonb_build_object('cx', (e->>'cx')::int, 'cy', (e->>'cy')::int, 'kind', 'balloon'))
           from jsonb_array_elements(b.drone_cells) e
          where e->>'kind' = 'balloon'
       ), '[]'::jsonb),
       drone_cells = coalesce((
         select jsonb_agg(e - 'kind')
           from jsonb_array_elements(b.drone_cells) e
          where coalesce(e->>'kind', 'basic') <> 'balloon'
       ), '[]'::jsonb),
       updated_at = now()
 where exists (select 1 from jsonb_array_elements(b.drone_cells) e where e->>'kind' = 'balloon');

-- в чертежах ящиков нет, а в слепках старых боёв пусть остаются как были

create or replace function sim_version() returns int
language sql immutable as $$ select 26 $$;

-- неотыгранные налёты играть новыми правилами можно — перештамповываем
update attacks
   set simulation_version = sim_version(),
       resolving_token = null,
       resolving_at = null
 where status = 'pending';

notify pgrst, 'reload schema';
