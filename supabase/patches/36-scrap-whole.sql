-- Снос любой пустой клетки склада, целой или сгоревшей, — 5 кр во
-- вторсырьё. Меньше 25 клеток склад сносом не ужимается. Версию боя не
-- меняет.
-- Выполнить в Supabase → SQL Editor до деплоя клиента. Можно прогнать повторно.

create or replace function cells_with(map bytea, v int) returns int
language sql immutable as $$
  select count(*)::int from generate_series(0, octet_length(map) - 1) i where get_byte(map, i) = v;
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

notify pgrst, 'reload schema';
