-- Чертежи: сохранённые раскладки склада и перестройка по ним с оплатой
-- разницы. Версию боя не меняет.
-- Выполнить в Supabase → SQL Editor до деплоя клиента. Можно прогнать повторно.

-- ---------- чертежи ----------
-- Сохранённая раскладка склада: клетки, установки и контейнеры. Чертёж —
-- только план, денег при сохранении не берут; всё проверяется и
-- оплачивается при стройке.

create table if not exists blueprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  cells text not null,
  guns jsonb not null default '[]'::jsonb,
  depots jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists blueprints_user on blueprints (user_id, created_at);
alter table blueprints enable row level security;
drop policy if exists blueprints_own on blueprints;
create policy blueprints_own on blueprints for select using (user_id = auth.uid());
revoke insert, update, delete on blueprints from anon, authenticated;

-- Сколько стоят установки по нынешним ценам с учётом уровней.
create or replace function install_value(g jsonb, lv jsonb) returns int
language sql immutable as $$
  select gun_count(g, 'gun') * price_at(price('gun'), coalesce((lv->>'guns')::int, 1))
       + gun_count(g, 'rocket') * price_at(price('rocket'), coalesce((lv->>'rockets')::int, 1))
       + gun_count(g, 'spray') * price_at(price('spray'), coalesce((lv->>'sprays')::int, 1))
       + gun_count(g, 'trap') * price_at(price('trap'), coalesce((lv->>'traps')::int, 1));
$$;

-- Сколько стоит содержимое контейнеров по цене закупки.
create or replace function goods_value(d jsonb, lv jsonb) returns int
language sql immutable as $$
  select depot_sum_kind(d, 'basic') * price_at(price('drone'), coalesce((lv->>'drones')::int, 1))
       + depot_sum_kind(d, 'balloon') * price('balloon');
$$;

-- Сколько клеток с таким значением на карте.
create or replace function cells_with(map bytea, v int) returns int
language sql immutable as $$
  select count(*)::int from generate_series(0, octet_length(map) - 1) i where get_byte(map, i) = v;
$$;

create or replace function save_blueprint(bp_name text, bp_cells text, bp_guns jsonb, bp_depots jsonb)
returns table (id uuid, name text, cells text, guns jsonb, depots jsonb, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
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
  if not guns_valid(bp_guns, bin, bp_depots) then raise exception 'bad gun placement'; end if;
  if not depots_valid(bp_depots, bin, bp_guns) then raise exception 'bad depot placement'; end if;
  if (select count(*) from blueprints b where b.user_id = uid) >= 20 then
    raise exception 'too many blueprints';
  end if;
  return query
    insert into blueprints as b (user_id, name, cells, guns, depots)
    values (uid, clean, bp_cells, bp_guns, bp_depots)
    returning b.id, b.name, b.cells, b.guns, b.depots, b.created_at;
end;
$$;

create or replace function delete_blueprint(bp uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from blueprints b where b.id = bp and b.user_id = auth.uid();
end;
$$;

-- Перестройка по чертежу. Нынешний склад сносится и продаётся: целые
-- клетки сверх бесплатных — по цене постройки, сгоревшие — во вторсырьё,
-- установки и товар — по нынешней цене закупки. На его месте ставится
-- чертёж по тем же ценам. Платится только разница, и она же может прийти
-- в плюс.
create or replace function build_blueprint(bp uuid)
returns table (credits int, drones int, intact int)
language plpgsql security definer set search_path = public as $$
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

  if not guns_valid(plan.guns, bin, plan.depots) then raise exception 'bad gun placement'; end if;
  if not depots_valid(plan.depots, bin, plan.guns) then raise exception 'bad depot placement'; end if;

  new_cells := cells_with(bin, 1);
  sold := greatest(0, cells_with(cur, 1) - price('free')) * price('cell')
        + cells_with(cur, 3) * price('scrap')
        + install_value(cur_guns, prof.levels)
        + goods_value(cur_depots, prof.levels);
  cost := greatest(0, new_cells - price('free')) * price('cell')
        + install_value(plan.guns, prof.levels)
        + goods_value(plan.depots, prof.levels)
        - sold;

  if prof.credits < cost then
    raise exception 'not enough credits: need %, have %', cost, prof.credits;
  end if;

  update bases
     set cells = bin,
         guns = plan.guns,
         drone_cells = plan.depots,
         intact_cells = new_cells,
         updated_at = now()
   where user_id = uid;

  update profiles
     set credits = profiles.credits - cost,
         drones = depot_sum_kind(plan.depots, 'basic'),
         founded = profiles.founded or new_cells >= price('found')
   where profiles.id = uid
   returning profiles.credits, profiles.drones into credits, drones;

  intact := new_cells;
  return next;
end;
$$;

grant execute on function save_blueprint, delete_blueprint, build_blueprint to authenticated;

notify pgrst, 'reload schema';
