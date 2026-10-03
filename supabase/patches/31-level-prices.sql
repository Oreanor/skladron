-- Цены с уровнем: каждая вещь дорожает ровно от цены первого уровня до
-- цены десятого (зенитка 100→200, ракетница 200→400, огнетушитель
-- 150→300, ловушка 200→400, шары 80→150, дрон 25→30). price_at теперь
-- берёт вид вещи, а не цену. Версию боя не меняет.
-- Выполнить в Supabase → SQL Editor до деплоя клиента (после 30-го). Можно
-- прогнать повторно.

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
    when 'sale'   then 200 -- отгрузка: процент от цены закупки, вдвое дороже
    when 'loot'   then 50   -- нападавшему за каждую сожжённую клетку склада
    -- Надбавка за близкий к полному разгром, процентов при стопроцентном.
    -- Растёт кубом от доли сожжённого; то же число в LOOT_CURVE на клиенте.
    when 'loot_curve' then 200
    when 'insure_cell'  then 5   -- страховка погорельцу: ровно на ремонт клетки
    when 'insure_step'  then 25  -- покрытие товара и пушек: столько процентов за уровень полиса
    when 'free'   then 25   -- стартовая площадь 5×5 достаётся даром
    when 'found'  then 25   -- столько же нужно, чтобы основаться
    when 'upgrade' then 5000 -- апгрейд на любую ступень стоит одинаково
    -- Цена на десятом уровне: с первого до десятого вещь дорожает ровно.
    when 'gun_top'     then 200
    when 'rocket_top'  then 400
    when 'spray_top'   then 300
    when 'trap_top'    then 400
    when 'balloon_top' then 150
    when 'drone_top'   then 30
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
    when 'pay_shooter' then 50  -- стрелок: ракета по складу издалека, потом таран
  end;
$$;

create or replace function price_at(kind text, level int) returns int
language sql immutable as $$
  select price(kind)
       + ((coalesce(price(kind || '_top'), price(kind)) - price(kind))
          * (least(10, greatest(1, coalesce(level, 1))) - 1)) / 9;
$$;

create or replace function send_attack(
  target_email text,
  attack_waves jsonb,
  attack_seed int,
  opener text default null
) returns table (id uuid, depots jsonb, credits int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  target profiles;
  cur bytea;
  cur_guns jsonb;
  cur_depots jsonb;
  next_depots jsonb;
  order_id uuid;
  drone_count int;
  surcharge int;
  head jsonb;
  note text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform check_waves(attack_waves);
  drone_count := waves_drones(attack_waves);
  if drone_count < 1 or drone_count > price('max_raid') then
    raise exception 'bad drone count';
  end if;
  head := attack_waves -> 0;

  select p.* into target
    from profiles p
   where lower(p.email) = lower(btrim(target_email))
   limit 1;
  if not found then raise exception 'player with this email has not joined yet'; end if;
  if target.id = uid then raise exception 'cannot attack yourself'; end if;
  if not target.founded then raise exception 'target warehouse is not founded'; end if;

  -- Очередь у защитника одна и разбирается по одному налёту за раз, по
  -- получасу на каждый. Без потолка один нападающий запирал бы чужую игру
  -- на часы, просто поставив в очередь десяток роёв.
  if (select count(*) from attacks a
       where a.attacker_id = uid and a.defender_id = target.id
         and a.status = 'pending') >= price('queued') then
    raise exception 'too many raids already queued against this warehouse';
  end if;

  select b.cells, b.guns, b.drone_cells into cur, cur_guns, cur_depots
    from bases b where b.user_id = uid for update;
  if cur is null then raise exception 'no base'; end if;

  -- Дронов снимает сервер со своей же копии склада. Раньше новый склад
  -- присылал клиент, и любое расхождение — недосохранённая правка, гонка с
  -- автосохранением — валило налёт с «sent drones do not match».
  next_depots := take_from_depots(cur_depots, drone_count, 'basic');

  -- Со склада уходят обычные дроны, а за начинку доплачивается кредитами:
  -- по цене дрона на нынешнем уровне, той же, по какой он и покупался.
  select waves_surcharge(
           attack_waves,
           price_at('drone', coalesce((p.levels->>'drones')::int, 1))
         )
    into surcharge
    from profiles p where p.id = uid;

  update bases set drone_cells = next_depots, updated_at = now() where user_id = uid;
  update profiles
     set drones = depot_sum_kind(next_depots, 'basic'),
         credits = profiles.credits - surcharge,
         stats = jsonb_set(stats, '{raids}', to_jsonb((stats->>'raids')::int + 1))
   where profiles.id = uid and profiles.credits >= surcharge
   returning profiles.credits into credits;

  if not found then raise exception 'not enough credits for these warheads'; end if;

  insert into attacks (
    attacker_id, defender_id, drones, pattern, direction, seed, waves,
    drone_level, simulation_version
  )
  values (uid, target.id, drone_count,
          head->>'pattern', coalesce((head->>'direction')::int, 0),
          attack_seed, attack_waves,
          (select coalesce((p.levels->>'drones')::int, 1) from profiles p where p.id = uid),
          -- Версию берём у sim_version(), а не числом: тут стояла тройка с
          -- тех времён, когда версия и была тройкой, и каждое поднятие
          -- делало все новые налёты неиграбельными.
          sim_version())
  returning attacks.id into order_id;
  note := left(btrim(coalesce(opener, '')), 500);
  if note <> '' then
    insert into battle_comments (attack_id, author_id, body)
    values (order_id, uid, note);
  end if;
  id := order_id;
  depots := next_depots;
  return next;
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

  -- Смена — сутки: аренда и отгрузка приходят в полночь по Лондону.
  -- Сколько лондонских полуночей прошло с прошлой выплаты, столько и смен.
  passed := (now() at time zone 'Europe/London')::date
          - (prof.last_income_at at time zone 'Europe/London')::date;
  if passed <= 0 then
    return query select 0, 0, 0, 0;
    return;
  end if;

  -- Аренды с клеток нет: доход склада — только отгрузка того, что лежит.
  paid := passed;
  gain := 0;

  -- А раз в отгрузку склад продаёт всё, что на нём лежит, вдвое дороже
  -- закупки. Продаётся то, что есть сейчас, а не за каждые прошедшие сутки.
  -- Цену берём с учётом уровня, ту же, по какой товар и покупался: иначе
  -- прокачка съедала бы маржу — на десятом уровне дрон обходился в 47, а
  -- уходил за те же 50.
  drones_out := depot_sum_kind(cur_depots, 'basic');
  sale := (drones_out * price_at('drone', coalesce((prof.levels->>'drones')::int, 1))
          * price('sale')) / 100;

  update bases
     set drone_cells = '[]'::jsonb,
         updated_at = now()
   where user_id = uid and jsonb_array_length(drone_cells) > 0;

  update profiles
     set credits = credits + gain + sale,
         drones = 0,
         last_income_at = now()
   where id = uid;

  return query select gain + sale, paid, drones_out, sale;
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
  select amount * price_at('drone', coalesce((p.levels->>'drones')::int, 1))
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

create or replace function install_value(g jsonb, lv jsonb) returns int
language sql immutable as $$
  select gun_count(g, 'gun') * price_at('gun', coalesce((lv->>'guns')::int, 1))
       + gun_count(g, 'rocket') * price_at('rocket', coalesce((lv->>'rockets')::int, 1))
       + gun_count(g, 'spray') * price_at('spray', coalesce((lv->>'sprays')::int, 1))
       + gun_count(g, 'trap') * price_at('trap', coalesce((lv->>'traps')::int, 1))
       + gun_count(g, 'balloon') * price_at('balloon', coalesce((lv->>'balloons')::int, 1));
$$;

create or replace function goods_value(d jsonb, lv jsonb) returns int
language sql immutable as $$
  select depot_sum_kind(d, 'basic') * price_at('drone', coalesce((lv->>'drones')::int, 1));
$$;

drop function if exists price_at(int, int);

notify pgrst, 'reload schema';
