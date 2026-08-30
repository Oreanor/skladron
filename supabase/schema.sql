-- Складская Оборона — схема этапа 2.
-- Выполнить целиком в Supabase → SQL Editor. Скрипт идемпотентный.
--
-- Главный принцип: кредиты считает сервер. Клиент присылает желаемую карту
-- склада, сервер сам вычисляет разницу с сохранённой и списывает по прайсу.

-- ---------- прайс ----------
-- держим в одном месте, чтобы клиент и сервер не разъезжались
create or replace function price(kind text) returns int
language sql immutable as $$
  select case kind
    when 'cell'   then 10
    when 'repair' then 5
    when 'gun'    then 100
    when 'refund' then 50
    when 'drones' then 1000
    when 'drone'  then 10
    when 'income' then 10
    when 'loot'   then 5
    when 'kill'   then 5    -- доплата защитнику за сбитый дрон
    when 'win'    then 5000 -- фиксированная премия за отражённый налёт
    when 'free'   then 100   -- стартовая площадь 10×10 достаётся даром
    when 'found'  then 100   -- столько же нужно, чтобы основаться
  end;
$$;

-- сколько всего дронов лежит в контейнерах
create or replace function depot_sum(d jsonb) returns int
language sql immutable as $$
  select coalesce(sum((e->>'n')::int), 0)::int
    from jsonb_array_elements(coalesce(d, '[]'::jsonb)) e;
$$;

-- Карта приходит сжатой по длинам серий: «значение:сколько подряд» через
-- запятую. Разворачиваем в те же 10 000 байт. Собираем hex-строкой, а не
-- set_byte в цикле: bytea неизменяемый, посимвольная запись была бы
-- квадратичной по времени.
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
  -- порядок выкатки не важен: старый клиент слал карту целиком в base64
  if position(':' in src) = 0 then
    return decode(src, 'base64');
  end if;
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

-- Бесплатный стартовый склад: белый квадрат 10×10 точно в центре карты.
-- Одна функция используется и для новых аккаунтов, и после сноса пепелища,
-- чтобы клиентская и серверная карты всегда совпадали.
create or replace function starter_map() returns bytea
language sql immutable as $$
  select decode(
    string_agg(
      case
        when (n / 100) between 45 and 54 and (n % 100) between 45 and 54
          then '01'
        else '00'
      end,
      '' order by n
    ),
    'hex'
  )
  from generate_series(0, 9999) as cells(n);
$$;

-- контейнеры обязаны стоять на целых клетках, по одному на клетку, не поверх пушек
create or replace function depots_valid(d jsonb, map bytea, guns jsonb)
returns boolean language plpgsql immutable as $$
declare
  e jsonb;
  cx int;
  cy int;
  k int;
  seen int[] := '{}';
begin
  for e in select * from jsonb_array_elements(coalesce(d, '[]'::jsonb)) loop
    cx := (e->>'cx')::int;
    cy := (e->>'cy')::int;
    if cx < 0 or cy < 0 or cx > 99 or cy > 99 then return false; end if;
    if (e->>'n')::int < 1 or (e->>'n')::int > 10 then return false; end if;
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

-- ---------- таблицы ----------

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  display_name text,
  base_name text,
  credits int not null default 10000,
  drones int not null default 0,
  founded boolean not null default false,
  last_income_at timestamptz not null default now(),
  enemies jsonb not null default '[]'::jsonb,
  stats jsonb not null default
    '{"battles":0,"dronesKilled":0,"cellsBurned":0,"cellsRepaired":0,"wipes":0,"raids":0,"looted":0}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists bases (
  user_id uuid primary key references profiles on delete cascade,
  cells bytea not null,              -- 10000 байт, по клетке на байт
  guns jsonb not null default '[]'::jsonb,
  drone_cells jsonb not null default '[]'::jsonb,   -- контейнеры {cx,cy,n}, по 10 дронов
  intact_cells int not null default 0,
  updated_at timestamptz not null default now()
);

-- Догоняем схему на уже заведённых профилях: create table if not exists
-- default существующей таблице не меняет, а клиент ждёт все семь счётчиков.
alter table profiles add column if not exists base_name text;
alter table profiles add column if not exists enemies jsonb not null default '[]'::jsonb;

alter table profiles alter column stats set default
  '{"battles":0,"dronesKilled":0,"cellsBurned":0,"cellsRepaired":0,"wipes":0,"raids":0,"looted":0}'::jsonb;

update profiles
   set stats = '{"battles":0,"dronesKilled":0,"cellsBurned":0,"cellsRepaired":0,
                 "wipes":0,"raids":0,"looted":0}'::jsonb || stats;

alter table profiles enable row level security;
alter table bases enable row level security;

-- свой профиль читаем и заводим; изменения — только через функции ниже
drop policy if exists "own profile read" on profiles;
create policy "own profile read" on profiles for select using (auth.uid() = id);

drop policy if exists "own base read" on bases;
create policy "own base read" on bases for select using (auth.uid() = user_id);

-- ---------- заведение игрока ----------

create or replace function ensure_player()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

  insert into profiles (id, email, display_name)
  values (
    uid,
    (select email from auth.users where id = uid),
    coalesce(
      (select raw_user_meta_data->>'full_name' from auth.users where id = uid),
      split_part((select email from auth.users where id = uid), '@', 1)
    )
  )
  on conflict (id) do nothing;

  insert into bases (user_id, cells)
  values (uid, starter_map())
  on conflict (user_id) do nothing;
end;
$$;

-- Старые аккаунты, которые ещё не основали и не начали строить склад,
-- тоже получают бесплатный центральный квадрат после обновления схемы.
update bases b
   set cells = starter_map(), intact_cells = 100, updated_at = now()
  from profiles p
 where p.id = b.user_id
   and not p.founded
   and b.intact_cells = 0
   and jsonb_array_length(b.guns) = 0
   and jsonb_array_length(b.drone_cells) = 0;

-- ---------- добавленные по e-mail соперники ----------

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

  update profiles set enemies = new_enemies where id = uid;
end;
$$;

-- ---------- имя склада ----------
-- Своё имя игрок задаёт при основании и может менять; враги видят именно его.

create or replace function rename_base(new_name text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  clean text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  clean := btrim(regexp_replace(coalesce(new_name, ''), '\s+', ' ', 'g'));
  if clean = '' then raise exception 'empty base name'; end if;
  if length(clean) > 24 then raise exception 'base name too long'; end if;

  update profiles set base_name = clean where profiles.id = uid;
  return clean;
end;
$$;

-- ---------- доход ----------
-- 10 кр за целую клетку за сутки, потолок накопления 14 суток

create or replace function collect_income()
returns table (credits_added int, days int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof profiles;
  intact int;
  passed int;
  paid int;
  gain int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into prof from profiles where id = uid for update;
  if not found then raise exception 'no profile'; end if;

  select b.intact_cells into intact from bases b where b.user_id = uid;

  -- страховка: от склада ничего не осталось, а на подъём нет денег
  if prof.founded and coalesce(intact, 0) = 0 and prof.credits < 10000 then
    update profiles set credits = 10000 where profiles.id = uid;
    prof.credits := 10000;
  end if;

  passed := floor(extract(epoch from (now() - prof.last_income_at)) / 86400);
  if passed <= 0 then
    return query select 0, 0;
    return;
  end if;

  paid := least(passed, 14);
  gain := paid * coalesce(intact, 0) * price('income');

  update profiles
     set credits = credits + gain,
         last_income_at = prof.last_income_at + (passed || ' days')::interval
   where id = uid;

  return query select gain, paid;
end;
$$;

-- ---------- сохранение склада ----------
-- Клиент присылает карту целиком; сервер считает, что изменилось, и берёт
-- деньги по прайсу. Клетки могут только улучшаться: строительство (что угодно
-- -> целая) и ремонт (сгоревшая -> целая). Ухудшение здесь запрещено — этим
-- занимается только apply_battle.

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
  intact_now int := 0;
  claimed int := 0;   -- клетки, уже занятые зданием: от них считается лимит
  free_left int;
  paid int;
  guns_added int;
  guns_removed int;
  cost int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if octet_length(bin) <> 10000 then raise exception 'bad map size'; end if;

  select * into prof from profiles where id = uid for update;
  select b.cells, b.guns, b.drone_cells into cur, cur_guns, cur_depots
    from bases b where b.user_id = uid for update;
  if cur is null then raise exception 'no base'; end if;

  -- вне боя дронов не прибавляется: контейнеры можно только переставлять
  if depot_sum(new_depots) <> depot_sum(cur_depots) then
    raise exception 'drone count may only change on purchase';
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
    elsif new_v <> old_v then
      -- вне боя клетка не может стать хуже
      raise exception 'cell % may not degrade outside battle', i;
    end if;
  end loop;

  guns_added := greatest(0, jsonb_array_length(new_guns) - jsonb_array_length(cur_guns));
  guns_removed := greatest(0, jsonb_array_length(cur_guns) - jsonb_array_length(new_guns));

  -- первые price('free') клеток склада бесплатны, считаем от того, что уже стоит
  free_left := greatest(0, price('free') - claimed);
  paid := greatest(0, built - free_left);

  cost := paid * price('cell')
        + repaired * price('repair')
        + guns_added * price('gun')
        - guns_removed * price('refund');

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
         drones = depot_sum(new_depots),
         founded = profiles.founded or intact_now >= price('found'),
         stats = jsonb_set(profiles.stats, '{cellsRepaired}',
                 to_jsonb((profiles.stats->>'cellsRepaired')::int + repaired))
   where profiles.id = uid
   returning profiles.credits, profiles.drones into credits, drones;

  intact := intact_now;
  return next;
end;
$$;

-- ---------- закупка дронов ----------

-- Параметр packs сохранён по имени для бесшовного обновления старой RPC,
-- но его значение теперь означает точное количество дронов.
create or replace function buy_drones(packs int, new_depots jsonb)
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
  if packs is null or packs < 1 or packs > 100000 then
    raise exception 'bad drone amount';
  end if;
  cost := packs * price('drone');

  select b.cells, b.guns, b.drone_cells into cur, cur_guns, cur_depots
    from bases b where b.user_id = uid for update;
  if cur is null then raise exception 'no base'; end if;

  -- купленное обязано лечь на склад: ровно запрошенное число новых дронов
  if depot_sum(new_depots) <> depot_sum(cur_depots) + packs then
    raise exception 'depots must hold exactly the purchased drones';
  end if;
  if not depots_valid(new_depots, cur, cur_guns) then
    raise exception 'not enough free cells for containers';
  end if;

  update bases set drone_cells = new_depots, updated_at = now() where user_id = uid;

  update profiles
     set credits = profiles.credits - cost,
         drones = depot_sum(new_depots)
   where profiles.id = uid and profiles.credits >= cost
   returning profiles.credits, profiles.drones into credits, drones;

  if not found then raise exception 'not enough credits'; end if;
  return next;
end;
$$;

-- ---------- итог боя ----------
-- Здесь карта может только ухудшаться, а пушки только убывать: бой ничего
-- не чинит и не строит.

create or replace function apply_battle(new_cells text, new_guns jsonb, new_depots jsonb, result jsonb)
returns table (credits int, intact int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
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
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if octet_length(bin) <> 10000 then raise exception 'bad map size'; end if;

  select b.cells, b.guns, b.drone_cells into cur, cur_guns, cur_depots
    from bases b where b.user_id = uid for update;
  if cur is null then raise exception 'no base'; end if;

  -- в бою дроны только теряются
  if depot_sum(new_depots) > depot_sum(cur_depots) then
    raise exception 'battle may not add drones';
  end if;

  for i in 0..9999 loop
    old_v := get_byte(cur, i);
    new_v := get_byte(bin, i);
    if new_v = 1 then
      intact_now := intact_now + 1;
      if old_v <> 1 then raise exception 'battle may not repair cell %', i; end if;
    elsif old_v = 1 then
      burned := burned + 1;
    end if;
  end loop;

  if jsonb_array_length(new_guns) > jsonb_array_length(cur_guns) then
    raise exception 'battle may not add guns';
  end if;

  killed := coalesce((result->>'killedByGuns')::int, 0)
          + coalesce((result->>'killedByMg')::int, 0);
  if killed < 0 or killed > 300 then raise exception 'bad killed drone count'; end if;

  update bases
     set cells = bin, guns = new_guns, drone_cells = new_depots,
         intact_cells = intact_now, updated_at = now()
   where user_id = uid;

  update profiles
     set drones = depot_sum(new_depots),
         -- сгорело всё до последней клетки — сразу поднимаем кассу
         credits = greatest(
           profiles.credits
             + killed * price('kill')
             + case when intact_now > 0 then price('win') else 0 end,
           case when intact_now = 0 then 10000 else 0 end
         ),
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

-- ---------- вайп ----------

create or replace function wipe_base()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

  update bases
     set cells = starter_map(),
         guns = '[]'::jsonb, drone_cells = '[]'::jsonb,
         intact_cells = 100, updated_at = now()
   where user_id = uid;

  update profiles
     set credits = greatest(profiles.credits, 10000),
         drones = 0, founded = false, last_income_at = now(),
         stats = jsonb_set(stats, '{wipes}', to_jsonb((stats->>'wipes')::int + 1))
   where id = uid;
end;
$$;

grant execute on function ensure_player, collect_income, save_base,
  buy_drones, apply_battle, wipe_base, rename_base, save_enemies to authenticated;
