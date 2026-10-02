-- Чертежи без дронов и шаров: это товар, а не план. При стройке всё, что
-- лежит в контейнерах, продаётся по цене закупки, а склад по чертежу
-- встаёт без контейнеров. Версию боя не меняет.
-- Выполнить в Supabase → SQL Editor после 22-blueprints.sql и до деплоя
-- клиента. Можно прогнать повторно.

alter table blueprints drop column if exists depots;
drop function if exists save_blueprint(text, text, jsonb, jsonb);

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

grant execute on function save_blueprint, build_blueprint to authenticated;

notify pgrst, 'reload schema';
