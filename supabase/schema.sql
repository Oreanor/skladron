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
    when 'scout'  then 25    -- разведчик дороже ударного дрона, но дешевле пушки
    when 'drone'  then 10
    when 'income' then 10  -- процент от стоимости товара в сутки
    when 'loot'   then 50   -- нападавшему за каждую сожжённую клетку склада
    when 'insure_cell'  then 10  -- страховка погорельцу за клетку
    when 'insure_depot' then 50  -- и ещё столько, если на клетке лежал товар
    when 'raid_ttl' then 1800  -- полчаса на то, чтобы отбить атаку вручную
    when 'free'   then 25   -- стартовая площадь 5×5 достаётся даром
    when 'found'  then 25   -- столько же нужно, чтобы основаться
    when 'upgrade' then 5000 -- апгрейд на любую ступень стоит одинаково
    when 'max_raid' then 500 -- потолок одного налёта, тот же и на клиенте
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
        when (n / 100) between 47 and 51 and (n % 100) between 47 and 51
          then '01'
        else '00'
      end,
      '' order by n
    ),
    'hex'
  )
  from generate_series(0, 9999) as cells(n);
$$;

-- Во сколько обходится товар на складе: по нему считается суточный доход.
create or replace function depot_value(d jsonb) returns int
language sql immutable as $$
  select coalesce(sum(
    (e->>'n')::int
    * case when coalesce(e->>'kind', 'basic') = 'scout' then price('scout') else price('drone') end
  ), 0)::int
  from jsonb_array_elements(coalesce(d, '[]'::jsonb)) e;
$$;

-- Сколько в контейнерах лежит именно этого вида. Вид не указан — считается
-- обычным: так читаются ящики, заведённые до появления «Дронов+».
create or replace function depot_sum_kind(d jsonb, want text) returns int
language sql immutable as $$
  select coalesce(sum((e->>'n')::int), 0)::int
    from jsonb_array_elements(coalesce(d, '[]'::jsonb)) e
   where coalesce(e->>'kind', 'basic') = want;
$$;

-- Никакой вид не должен меняться, кроме одного разрешённого: иначе покупкой
-- дронов можно было бы завести себе разведчиков.
create or replace function depots_only_changed(
  before jsonb, after jsonb, kind text, delta int
) returns boolean language sql immutable as $$
  select bool_and(
    depot_sum_kind(after, k) =
      depot_sum_kind(before, k) + case when k = kind then delta else 0 end
  )
  from unnest(array['basic', 'scout']) as k;
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

-- Снимает со склада нужное число дронов заданного вида. Пустые ящики
-- исчезают. Идём с конца: последние контейнеры опустошаются первыми — так же,
-- как это делал клиент.
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
    if coalesce(e->>'kind', 'basic') = want_kind and need > 0 then
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

create table if not exists attacks (
  id uuid primary key default gen_random_uuid(),
  attacker_id uuid not null references profiles on delete cascade,
  defender_id uuid not null references profiles on delete cascade,
  drones int not null check (drones between 1 and 500),
  pattern text not null check (pattern in ('swarm', 'lines', 'random', 'drip')),
  direction int not null check (direction between 0 and 3),
  seed int not null,
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  result jsonb,
  loot int not null default 0,
  destroyed boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  reported_at timestamptz
);

create index if not exists attacks_defender_pending
  on attacks (defender_id, created_at) where status = 'pending';
create index if not exists attacks_attacker_reports
  on attacks (attacker_id, resolved_at) where status = 'resolved' and reported_at is null;

-- Догоняем схему на уже заведённых профилях: create table if not exists
-- default существующей таблице не меняет, а клиент ждёт все семь счётчиков.
alter table profiles add column if not exists base_name text;
alter table profiles add column if not exists scouts int not null default 0;
-- уровни классов: с ними растут скорость дронов, дальнобойность пушек и обзор разведки
alter table profiles add column if not exists levels jsonb not null
  default '{"drones":1,"guns":1,"scouts":1,"mg":1,"water":1}'::jsonb;
alter table profiles alter column levels set default
  '{"drones":1,"guns":1,"scouts":1,"mg":1,"water":1}'::jsonb;
-- пулемёт и брандспойт добавились позже: у заведённых профилей их нет
update profiles set levels = '{"drones":1,"guns":1,"scouts":1,"mg":1,"water":1}'::jsonb || levels;
-- уровень дронов запоминаем в самой атаке: у защитника они летят так,
-- как их прокачал нападающий, даже если тот потом апгрейднулся ещё
alter table attacks add column if not exists drone_level int not null default 1;
-- потолок налёта подняли с 300 до 500: у существующей таблицы check
-- сам не поменяется, поэтому пересоздаём его явно
alter table attacks drop constraint if exists attacks_drones_check;
alter table attacks add constraint attacks_drones_check check (drones between 1 and 500);
-- очередь налётов: у первой атаки идут часы, остальные ждут
alter table attacks add column if not exists activated_at timestamptz;
-- быстрые дроны убраны: вид остался только у разведчиков
alter table attacks drop column if exists plus;

update bases
   set drone_cells = (
     select coalesce(
       jsonb_agg(case when e->>'kind' = 'plus' then e - 'kind' else e end),
       '[]'::jsonb
     )
     from jsonb_array_elements(drone_cells) e
   )
 where drone_cells @> '[{"kind":"plus"}]'::jsonb;
alter table profiles add column if not exists enemies jsonb not null default '[]'::jsonb;

alter table profiles alter column stats set default
  '{"battles":0,"dronesKilled":0,"cellsBurned":0,"cellsRepaired":0,"wipes":0,"raids":0,"looted":0}'::jsonb;

update profiles
   set stats = '{"battles":0,"dronesKilled":0,"cellsBurned":0,"cellsRepaired":0,
                 "wipes":0,"raids":0,"looted":0}'::jsonb || stats;

-- ---------- сносим устаревшие сигнатуры ----------
-- create or replace не заменяет функцию, у которой изменился список
-- аргументов или тип результата: он заводит вторую с тем же именем. Дальше
-- PostgREST не может выбрать, какую звать, а grant падает на «name is not
-- unique». Поэтому старые варианты убираем явно, до создания новых.

drop function if exists buy_drones(int, jsonb);
drop function if exists buy_scouts(int);
drop function if exists spend_scouts(int);
drop function if exists send_attack(text, int, text, int, int, jsonb);
drop function if exists send_attack(text, int, text, int, int, jsonb, int);
-- у pending_attacks менялся не список аргументов, а состав колонок:
-- create or replace такого тоже не умеет
drop function if exists pending_attacks();
-- дронов теперь списывает сервер: клиент больше не присылает свой склад
drop function if exists spend_scouts(int, jsonb);
-- enemy_base теперь отдаёт ещё и уровень чужих пушек
drop function if exists enemy_base(text);

alter table profiles enable row level security;
alter table bases enable row level security;
alter table attacks enable row level security;

-- свой профиль читаем и заводим; изменения — только через функции ниже
drop policy if exists "own profile read" on profiles;
create policy "own profile read" on profiles for select using (auth.uid() = id);

drop policy if exists "own base read" on bases;
create policy "own base read" on bases for select using (auth.uid() = user_id);

drop policy if exists "participant attack read" on attacks;
create policy "participant attack read" on attacks for select
  using (auth.uid() = attacker_id or auth.uid() = defender_id);

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

-- ---------- настоящие налёты между аккаунтами ----------

create or replace function send_attack(
  target_email text,
  drone_count int,
  attack_pattern text,
  attack_direction int,
  attack_seed int
) returns table (id uuid, depots jsonb)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  target profiles;
  cur bytea;
  cur_guns jsonb;
  cur_depots jsonb;
  next_depots jsonb;
  order_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if drone_count is null or drone_count < 1 or drone_count > price('max_raid') then
    raise exception 'bad drone count';
  end if;
  if attack_pattern not in ('swarm', 'lines', 'random', 'drip') then
    raise exception 'bad attack pattern';
  end if;
  if attack_direction < 0 or attack_direction > 3 then raise exception 'bad direction'; end if;

  select p.* into target
    from profiles p
   where lower(p.email) = lower(btrim(target_email))
   limit 1;
  if not found then raise exception 'player with this email has not joined yet'; end if;
  if target.id = uid then raise exception 'cannot attack yourself'; end if;
  if not target.founded then raise exception 'target warehouse is not founded'; end if;

  select b.cells, b.guns, b.drone_cells into cur, cur_guns, cur_depots
    from bases b where b.user_id = uid for update;
  if cur is null then raise exception 'no base'; end if;

  -- Дронов снимает сервер со своей же копии склада. Раньше новый склад
  -- присылал клиент, и любое расхождение — недосохранённая правка, гонка с
  -- автосохранением — валило налёт с «sent drones do not match».
  next_depots := take_from_depots(cur_depots, drone_count, 'basic');

  update bases set drone_cells = next_depots, updated_at = now() where user_id = uid;
  update profiles
     set drones = depot_sum(next_depots),
         stats = jsonb_set(stats, '{raids}', to_jsonb((stats->>'raids')::int + 1))
   where profiles.id = uid;

  insert into attacks (attacker_id, defender_id, drones, pattern, direction, seed, drone_level)
  values (uid, target.id, drone_count, attack_pattern, attack_direction, attack_seed,
          (select coalesce((p.levels->>'drones')::int, 1) from profiles p where p.id = uid))
  returning attacks.id into order_id;
  id := order_id;
  depots := next_depots;
  return next;
end;
$$;

-- Как зовут склады по адресам. Отдаём только имя: список врагов и так
-- строится по почте, а больше о чужом профиле знать незачем.
create or replace function base_names(emails text[])
returns table (email text, name text)
language sql security definer set search_path = public as $$
  select p.email,
         coalesce(p.base_name, p.display_name, split_part(p.email, '@', 1))
    from profiles p
   where lower(p.email) = any (select lower(e) from unnest(emails) e);
$$;

-- Карта противника для разведки. Отдаём целиком: туман войны и всё, что
-- разведчик успел снять, считает клиент. Прятать карту от него по-настоящему
-- можно только просчитывая полёт на сервере — до этого этап не дошёл.
-- ---------- разведчики ----------
-- Лежат счётчиком: на карте их нет, гореть им негде.

create or replace function spend_scouts(n int)
returns table (scouts int, depots jsonb)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cur bytea;
  cur_depots jsonb;
  next_depots jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if n is null or n < 1 then raise exception 'bad scout count'; end if;

  select b.cells, b.drone_cells into cur, cur_depots
    from bases b where b.user_id = uid for update;
  if cur is null then raise exception 'no base'; end if;

  -- как и с ударными дронами: снимает сервер, клиент только просит
  next_depots := take_from_depots(cur_depots, n, 'scout');

  update bases set drone_cells = next_depots, updated_at = now() where user_id = uid;
  scouts := depot_sum_kind(next_depots, 'scout');
  depots := next_depots;
  return next;
end;
$$;

create or replace function enemy_base(target_email text)
returns table (cells text, guns jsonb, gun_level int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  tid uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select p.id into tid from profiles p where lower(p.email) = lower(target_email);
  if tid is null then raise exception 'no such player'; end if;

  return query
    select encode(b.cells, 'base64'), b.guns,
           coalesce((p.levels->>'guns')::int, 1)
      from bases b join profiles p on p.id = b.user_id
     where b.user_id = tid;
end;
$$;

create or replace function pending_attacks()
returns table (
  id uuid, from_name text, created_at timestamptz, activated_at timestamptz,
  drones int, pattern text, direction int, seed int, drone_level int
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
           a.drone_level
      from attacks a
      join profiles p on p.id = a.attacker_id
     where a.defender_id = uid and a.status = 'pending'
     order by a.created_at;
end;
$$;

create or replace function attack_reports()
returns table (
  id uuid, target_name text, resolved_at timestamptz,
  result jsonb, loot int, destroyed boolean
)
language sql security definer set search_path = public as $$
  select a.id,
         coalesce(p.base_name, p.display_name, split_part(p.email, '@', 1)) as target_name,
         a.resolved_at, a.result, a.loot, a.destroyed
    from attacks a
    join profiles p on p.id = a.defender_id
   where a.attacker_id = auth.uid()
     and a.status = 'resolved'
     and a.reported_at is null
   order by a.resolved_at;
$$;

create or replace function ack_attack_report(attack_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update attacks set reported_at = now()
   where id = attack_id and attacker_id = auth.uid() and status = 'resolved';
  if not found then raise exception 'attack report not found'; end if;
end;
$$;

-- Старые аккаунты, которые ещё не основали и не начали строить склад,
-- тоже получают бесплатный центральный квадрат после обновления схемы.
update bases b
   set cells = starter_map(), intact_cells = 25, updated_at = now()
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
  goods int;
  passed int;
  paid int;
  gain int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into prof from profiles where id = uid for update;
  if not found then raise exception 'no profile'; end if;

  select b.intact_cells, depot_value(b.drone_cells)
    into intact, goods
    from bases b where b.user_id = uid;

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
  -- Платит не площадь, а товар: доход — процент от стоимости того, что
  -- лежит в контейнерах на момент начисления. Пушки едят площадь даром.
  gain := paid * ((coalesce(goods, 0) * price('income')) / 100);

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
  -- вне покупки ни один вид не меняется: ящики можно только переставлять
  if not depots_only_changed(cur_depots, new_depots, 'basic', 0) then
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
    elsif old_v = 4 and new_v = 0 then
      -- следы падений на земле после боя мгновенно зарастают травой
      null;
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

-- ---------- апгрейд классов ----------
-- Уровень общий для всего класса: апгрейд достаёт и склад, и то, что
-- купят завтра. Цена растёт линейно: на 2-й уровень 5000, на 3-й 10000.

create or replace function upgrade(kind text)
returns table (credits int, levels jsonb)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cur int;
  cost int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if kind not in ('drones', 'guns', 'scouts', 'mg', 'water') then
    raise exception 'bad upgrade kind';
  end if;

  select coalesce((p.levels->>kind)::int, 1) into cur
    from profiles p where p.id = uid for update;
  if cur is null then raise exception 'no profile'; end if;
  if cur >= 10 then raise exception 'already at max level'; end if;
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

-- ---------- закупка дронов ----------

-- Параметр packs сохранён по имени для бесшовного обновления старой RPC,
-- но его значение теперь означает точное количество дронов.
create or replace function buy_drones(packs int, new_depots jsonb, kind text default 'basic')
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
  if kind not in ('basic', 'scout') then raise exception 'bad drone kind'; end if;
  cost := packs * price(case kind when 'scout' then 'scout' else 'drone' end);

  select b.cells, b.guns, b.drone_cells into cur, cur_guns, cur_depots
    from bases b where b.user_id = uid for update;
  if cur is null then raise exception 'no base'; end if;

  -- купленное обязано лечь на склад: ровно запрошенное число новых дронов
  if not depots_only_changed(cur_depots, new_depots, kind, packs) then
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
  depots_lost int;
  payout int;
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
  -- Здесь про размер роя ничего не известно: бой мог быть и с ботом, и с
  -- атакой, отправленной при прежнем потолке. Точную сверку с числом
  -- высланных дронов делает complete_attack; тут — только защита от чуши.
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
  -- уже сверены с картой, а сгоревшие контейнеры — это те, что были и
  -- пропали. Вне боя контейнеры не исчезают.
  depots_lost := greatest(
    0,
    jsonb_array_length(cur_depots) - jsonb_array_length(new_depots)
  );
  payout := burned * price('insure_cell') + depots_lost * price('insure_depot');

  -- За сбитых не платят: деньги приносит товар, а не стрельба. Зато
  -- погорельцу выплачивается страховка.
  update profiles
     set drones = depot_sum(new_depots),
         -- сгорело всё до последней клетки — сразу поднимаем кассу
         credits = greatest(
           profiles.credits + payout,
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

-- Защитник завершает конкретный входящий налёт. В одной транзакции сохраняем
-- его склад, закрываем очередь и начисляем добычу отправителю.
create or replace function complete_attack(
  attack_id uuid,
  new_cells text,
  new_guns jsonb,
  new_depots jsonb,
  result jsonb
) returns table (credits int, intact int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  order_row attacks;
  defender_credits int;
  defender_intact int;
  earned int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select a.* into order_row from attacks a where a.id = attack_id for update;
  if not found or order_row.defender_id <> uid then raise exception 'attack not found'; end if;
  if order_row.status <> 'pending' then raise exception 'attack already resolved'; end if;
  if coalesce((result->>'dronesSent')::int, -1) <> order_row.drones then
    raise exception 'attack drone count mismatch';
  end if;
  if coalesce((result->>'leaked')::int, -1) < 0
     or coalesce((result->>'leaked')::int, -1) > order_row.drones then
    raise exception 'bad leaked drone count';
  end if;
  if coalesce((result->>'killedByGuns')::int, 0)
       + coalesce((result->>'killedByMg')::int, 0)
       + coalesce((result->>'leaked')::int, 0) > order_row.drones then
    raise exception 'attack result exceeds sent drones';
  end if;

  select applied.credits, applied.intact
    into defender_credits, defender_intact
    from apply_battle(new_cells, new_guns, new_depots, result) applied;

  -- Добыча считается по нанесённому ущербу: за каждую сожжённую клетку.
  -- И это перевод, а не новые деньги: сколько нападавший взял, столько
  -- защитник и недосчитался. Больше, чем у того есть, не возьмёшь.
  earned := least(
    coalesce((result->>'burned')::int, 0) * price('loot'),
    greatest(0, defender_credits)
  );
  update profiles set credits = profiles.credits - earned where profiles.id = uid;
  defender_credits := defender_credits - earned;

  update profiles
     set credits = profiles.credits + earned,
         stats = jsonb_set(
           profiles.stats,
           '{looted}',
           to_jsonb((profiles.stats->>'looted')::int + earned)
         )
   where id = order_row.attacker_id;

  update attacks
     set status = 'resolved', result = $5, loot = earned,
         destroyed = defender_intact = 0, resolved_at = now()
   where id = attack_id;

  return query select defender_credits, defender_intact;
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
         intact_cells = 25, updated_at = now()
   where user_id = uid;

  update profiles
     set credits = greatest(profiles.credits, 10000),
         drones = 0, founded = false, last_income_at = now(),
         stats = jsonb_set(stats, '{wipes}', to_jsonb((stats->>'wipes')::int + 1))
   where id = uid;
end;
$$;

-- ---------- начать сначала ----------
-- Полный сброс: пустой стартовый склад, стартовые деньги, обнулённые
-- счётчики и уровни. Имя склада и список соперников остаются — это
-- знакомства, а не имущество.

create or replace function restart_game()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

  update bases
     set cells = starter_map(),
         guns = '[]'::jsonb, drone_cells = '[]'::jsonb,
         intact_cells = 25, updated_at = now()
   where user_id = uid;

  update profiles
     set credits = 10000,
         drones = 0,
         founded = true,
         last_income_at = now(),
         levels = '{"drones":1,"guns":1,"scouts":1,"mg":1,"water":1}'::jsonb,
         stats = '{"battles":0,"dronesKilled":0,"cellsBurned":0,"cellsRepaired":0,
                   "wipes":0,"raids":0,"looted":0}'::jsonb
   where id = uid;

  -- налёты, которые ждали старый склад, начинать сначала не должны
  delete from attacks where defender_id = uid and status = 'pending';
end;
$$;

grant execute on function ensure_player, collect_income, save_base,
  buy_drones, apply_battle, complete_attack, wipe_base, rename_base, save_enemies,
  base_names, enemy_base, spend_scouts, upgrade,
  send_attack, pending_attacks, attack_reports, ack_attack_report, restart_game to authenticated;

-- PostgREST держит список функций в кэше. Supabase обычно перечитывает его сам,
-- но после смены сигнатур надёжнее попросить явно — иначе клиент ещё какое-то
-- время будет звать функцию, которой уже нет.
notify pgrst, 'reload schema';
