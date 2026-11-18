-- Сетка: 10/25/50 за клетку; улучшения 8000 и 64000; симуляция 31.
-- Выполнить до деплоя клиента. Повторное выполнение безопасно.

create or replace function sim_version() returns int
language sql immutable as $$ select 31 $$;

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

create or replace function price_at(kind text, level int) returns int
language sql immutable as $$
  select case when kind = 'net' then price(case when level >= 3 then 'net_top' when level >= 2 then 'net_mid' else 'net' end) else price(kind)
       + ((coalesce(price(kind || '_top'), price(kind)) - price(kind))
          * (least(11, greatest(1, coalesce(level, 1))) - 1)) / 10 end;
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
       where coalesce(g->>'kind', 'gun') <> 'net' and (g->>'cx')::int = cx and (g->>'cy')::int = cy
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
    if coalesce(e->>'kind', 'gun') not in ('gun', 'rocket', 'spray', 'trap', 'balloon', 'net') then
      return false;
    end if;
    begin
      cx := (e->>'cx')::int;
      cy := (e->>'cy')::int;
    exception when others then
      return false;
    end;
    if cx < 0 or cy < 0 or cx > 99 or cy > 99 then return false; end if;
    if e->>'kind' = 'net' and exists (
      select 1 from jsonb_array_elements(g) other
      where coalesce(other->>'kind', 'gun') <> 'net'
        and (other->>'cx')::int = cx and (other->>'cy')::int = cy
    ) then return false; end if;
    k := cy * 100 + cx;
    if get_byte(map, k) <> 1 then return false; end if;
    if e->>'kind' = 'net' then k := k + 10000; end if;
    if seen @> array[k] then return false; end if;
    seen := seen || k;
    if coalesce(e->>'kind', 'gun') <> 'net' and exists (
      select 1 from jsonb_array_elements(coalesce(depots, '[]'::jsonb)) d
       where (d->>'cx')::int = cx and (d->>'cy')::int = cy
    ) then return false; end if;
  end loop;
  return true;
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
  balloons_added int;
  guns_gone int;
  rockets_gone int;
  sprays_gone int;
  traps_gone int;
  balloons_gone int;
  cost int;
  nets_added int;
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
    elsif old_v = 1 and new_v = 0 then
      -- Снос целой клетки — как и сгоревшей, во вторсырьё. Установок на ней не
      -- будет: guns_valid и depots_valid не пустят их на землю.
      scrapped := scrapped + 1;
    elsif new_v <> old_v then
      -- вне боя клетка не может стать хуже
      raise exception 'cell % may not degrade outside battle', i;
    end if;
  end loop;

  -- Сносом склад не ужимается меньше стартового: там бесплатные клетки, и их
  -- сносили бы и строили заново ради денег.
  if scrapped > 0 and cells_with(bin, 1) + cells_with(bin, 2) + cells_with(bin, 3) < price('found') then
    raise exception 'warehouse too small';
  end if;

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

  select count(*) into nets_added from jsonb_array_elements(new_guns) n
    where n->>'kind' = 'net' and not exists (
      select 1 from jsonb_array_elements(cur_guns) c where c->>'kind' = 'net'
      and c->>'cx' = n->>'cx' and c->>'cy' = n->>'cy');
  cost := nets_added * price_at('net', coalesce((prof.levels->>'nets')::int, 1)) + paid * price('cell')
        + repaired * price('repair')
        + guns_added * price_at('gun', coalesce((prof.levels->>'guns')::int, 1))
        + rockets_added * price_at('rocket', coalesce((prof.levels->>'rockets')::int, 1))
        + sprays_added * price_at('spray', coalesce((prof.levels->>'sprays')::int, 1))
        + traps_added * price_at('trap', coalesce((prof.levels->>'traps')::int, 1))
        + balloons_added * price_at('balloon', coalesce((prof.levels->>'balloons')::int, 1))
        - guns_gone * price_at('gun', coalesce((prof.levels->>'guns')::int, 1))
        - rockets_gone * price_at('rocket', coalesce((prof.levels->>'rockets')::int, 1))
        - sprays_gone * price_at('spray', coalesce((prof.levels->>'sprays')::int, 1))
        - traps_gone * price_at('trap', coalesce((prof.levels->>'traps')::int, 1))
        - balloons_gone * price_at('balloon', coalesce((prof.levels->>'balloons')::int, 1))
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

create or replace function install_value(g jsonb, lv jsonb) returns int
language sql immutable as $$
  select gun_count(g, 'net') * price_at('net', coalesce((lv->>'nets')::int, 1)) + gun_count(g, 'gun') * price_at('gun', coalesce((lv->>'guns')::int, 1))
       + gun_count(g, 'rocket') * price_at('rocket', coalesce((lv->>'rockets')::int, 1))
       + gun_count(g, 'spray') * price_at('spray', coalesce((lv->>'sprays')::int, 1))
       + gun_count(g, 'trap') * price_at('trap', coalesce((lv->>'traps')::int, 1))
       + gun_count(g, 'balloon') * price_at('balloon', coalesce((lv->>'balloons')::int, 1));
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
     ('drones', 'guns', 'rockets', 'sprays', 'traps', 'nets', 'balloons', 'mg', 'water', 'insurance', 'loan') then
    raise exception 'bad upgrade kind';
  end if;

  select coalesce((p.levels->>kind)::int, 1) into cur
    from profiles p where p.id = uid for update;
  if cur is null then raise exception 'no profile'; end if;
  -- у страховки потолок свой: пятый уровень покрывает потери целиком
  if cur >= (case when kind = 'nets' then 3 when kind = 'insurance' then 5 else 11 end) then
    raise exception 'already at max level';
  end if;
  cost := case when kind = 'nets' then price(case when cur = 1 then 'net_upgrade_first' else 'net_upgrade_second' end) else price(case when kind = 'insurance' then 'insurance_upgrade' else 'upgrade' end)
          * (1 << ((cur - 1) * (case when kind = 'insurance' then 2 else 1 end))) end;

  update profiles
     set credits = profiles.credits - cost,
         levels = jsonb_set(profiles.levels, array[kind], to_jsonb(cur + 1))
   where profiles.id = uid and profiles.credits >= cost
   returning profiles.credits, profiles.levels into credits, levels;

  if not found then raise exception 'not enough credits'; end if;
  return next;
end;
$$;
