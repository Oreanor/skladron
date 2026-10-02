-- Продажа со склада по номиналу: установка, снятая со склада, возвращает
-- нынешнюю цену закупки (а не плоские 50), и контейнер можно продать
-- отдельно (sell_depot). Версию боя не меняет.
-- Выполнить в Supabase → SQL Editor после 22-blueprints.sql и до деплоя
-- клиента. Можно прогнать повторно.

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
    when 'pay_armor'  then 45   -- броня: зенитке нужно два попадания
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
  guns_gone int;
  rockets_gone int;
  sprays_gone int;
  traps_gone int;
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
  -- Проданные установки — по виду и по нынешней цене закупки: двойной клик
  -- на складе продаёт по номиналу. Считаем по известным видам, а не по
  -- длине массива: иначе неизвестный kind давал бы бесплатный возврат.
  guns_gone := greatest(0, gun_count(cur_guns, 'gun') - gun_count(new_guns, 'gun'));
  rockets_gone := greatest(0, gun_count(cur_guns, 'rocket') - gun_count(new_guns, 'rocket'));
  sprays_gone := greatest(0, gun_count(cur_guns, 'spray') - gun_count(new_guns, 'spray'));
  traps_gone := greatest(0, gun_count(cur_guns, 'trap') - gun_count(new_guns, 'trap'));

  -- первые price('free') клеток склада бесплатны, считаем от того, что уже стоит
  free_left := greatest(0, price('free') - claimed);
  paid := greatest(0, built - free_left);

  cost := paid * price('cell')
        + repaired * price('repair')
        + guns_added * price_at(price('gun'), coalesce((prof.levels->>'guns')::int, 1))
        + rockets_added * price_at(price('rocket'), coalesce((prof.levels->>'rockets')::int, 1))
        + sprays_added * price_at(price('spray'), coalesce((prof.levels->>'sprays')::int, 1))
        + traps_added * price_at(price('trap'), coalesce((prof.levels->>'traps')::int, 1))
        - guns_gone * price_at(price('gun'), coalesce((prof.levels->>'guns')::int, 1))
        - rockets_gone * price_at(price('rocket'), coalesce((prof.levels->>'rockets')::int, 1))
        - sprays_gone * price_at(price('spray'), coalesce((prof.levels->>'sprays')::int, 1))
        - traps_gone * price_at(price('trap'), coalesce((prof.levels->>'traps')::int, 1))
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

grant execute on function sell_depot to authenticated;

notify pgrst, 'reload schema';
