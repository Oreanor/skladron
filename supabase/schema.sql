-- Складская Оборона — схема этапа 2.
-- Выполнить целиком в Supabase → SQL Editor. Скрипт идемпотентный.
--
-- Главный принцип: кредиты считает сервер. Клиент присылает желаемую карту
-- склада, сервер сам вычисляет разницу с сохранённой и списывает по прайсу.

-- ---------- прайс ----------
-- Версия боевого движка. Должна совпадать с SIMULATION_VERSION в
-- lib/tuning.ts: по ней отсекаются бои, посчитанные прежней геометрией волн.
create or replace function sim_version() returns int
language sql immutable as $$ select 14 $$;

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
  end;
$$;

-- сколько установок такого вида стоит на складе: без поля kind это зенитка
create or replace function gun_count(g jsonb, want text) returns int
language sql immutable as $$
  select count(*)::int
    from jsonb_array_elements(coalesce(g, '[]'::jsonb)) e
   where coalesce(e->>'kind', 'gun') = want;
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

-- Во сколько обходится товар на складе: по нему считается суточный доход и
-- страховая выплата за сгоревшее. Шары считаются по своей цене.
create or replace function depot_value(d jsonb) returns int
language sql immutable as $$
  select coalesce(sum(
    (e->>'n')::int
    * case when coalesce(e->>'kind', 'basic') = 'balloon'
             then price('balloon') else price('drone') end
  ), 0)::int
  from jsonb_array_elements(coalesce(d, '[]'::jsonb)) e;
$$;

-- Сколько в контейнерах лежит именно этого вида. Вид не указан — считается
-- обычным. kind=scout — наследие: считаем его basic, иначе клиентская
-- нормализация «scout → basic» выглядит как покупка дронов и save_base
-- отвечает 400 на любой перенос пушки/ловушки.
create or replace function depot_sum_kind(d jsonb, want text) returns int
language sql immutable as $$
  select coalesce(sum((e->>'n')::int), 0)::int
    from jsonb_array_elements(coalesce(d, '[]'::jsonb)) e
   where case
           when want = 'basic' then coalesce(e->>'kind', 'basic') in ('basic', 'scout')
           when want = 'scout' then false
           else coalesce(e->>'kind', 'basic') = want
         end;
$$;

-- Убираем kind=scout у контейнеров: разведка теперь тратит обычные дроны.
create or replace function normalize_depots(d jsonb) returns jsonb
language sql immutable as $$
  select coalesce(
    (
      select jsonb_agg(
               case when coalesce(e->>'kind', 'basic') = 'scout' then e - 'kind' else e end
               order by ord
             )
        from jsonb_array_elements(coalesce(d, '[]'::jsonb)) with ordinality as t(e, ord)
    ),
    '[]'::jsonb
  );
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
  from unnest(array['basic', 'balloon']) as k;
$$;

-- контейнеры обязаны стоять на целых клетках, по одному на клетку, не поверх пушек
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
    if coalesce(e->>'kind', 'basic') not in ('basic', 'scout', 'balloon') then
      return false;
    end if;
    -- scout — legacy: клиент при сохранении переводит в basic; новые не принимаем
    if coalesce(e->>'kind', 'basic') = 'scout' then return false; end if;
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

-- Установки приходят от клиента как JSON, поэтому проверяем не только их
-- количество, но и каждый объект. Неизвестный kind раньше не попадал в цену,
-- зато попадал в длину массива и при удалении приносил возврат.
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
    if coalesce(e->>'kind', 'gun') not in ('gun', 'rocket', 'spray', 'trap') then
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

-- Бой может только уничтожить имущество. Переставить, превратить один вид
-- в другой или подложить отрицательный контейнер через итог боя нельзя.
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
             and case
                   when coalesce(b->>'kind', 'basic') in ('basic', 'scout') then 'basic'
                   else coalesce(b->>'kind', 'basic')
                 end
               = case
                   when coalesce(a->>'kind', 'basic') in ('basic', 'scout') then 'basic'
                   else coalesce(a->>'kind', 'basic')
                 end
             and (b->>'n')::int >= (a->>'n')::int
        )
     );
$$;

create or replace function battle_guns_valid(
  before jsonb, after jsonb, map bytea, depots jsonb
) returns boolean language sql immutable as $$
  select guns_valid(after, map, depots)
     and not exists (
       select 1
         from jsonb_array_elements(coalesce(after, '[]'::jsonb)) a
        where not exists (
          select 1
            from jsonb_array_elements(coalesce(before, '[]'::jsonb)) b
           where (b->>'cx')::int = (a->>'cx')::int
             and (b->>'cy')::int = (a->>'cy')::int
             and coalesce(b->>'kind', 'gun') = coalesce(a->>'kind', 'gun')
        )
     );
$$;

-- ---------- таблицы ----------

-- Цена с учётом прокачки: что летит дальше и быстрее, то и дороже.
-- Делим нацело — округление вниз, как и на клиенте.
create or replace function price_at(base int, level int) returns int
language sql immutable as $$
  select (base * (100 + price('price_step') * greatest(0, coalesce(level, 1) - 1))) / 100;
$$;

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
    if need > 0 and (
      coalesce(e->>'kind', 'basic') = want_kind
      or (want_kind = 'basic' and coalesce(e->>'kind', 'basic') = 'scout')
    ) then
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
  pattern text not null check (pattern in ('swarm', 'lines', 'random', 'drip', 'rings', 'spiral', 'flower', 'sweep')),
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

-- Разговор о бою: короткие текстовые заметки под повтором. Читает всякий,
-- у кого есть ссылка; пишет только вошедший.
create table if not exists battle_comments (
  id uuid primary key default gen_random_uuid(),
  attack_id uuid not null references attacks on delete cascade,
  author_id uuid not null references profiles on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists battle_comments_attack
  on battle_comments (attack_id, created_at);

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
  default '{"drones":1,"guns":1,"rockets":1,"sprays":1,"traps":1,"scouts":1,"mg":1,"water":1,"insurance":1}'::jsonb;
alter table profiles alter column levels set default
  '{"drones":1,"guns":1,"rockets":1,"sprays":1,"traps":1,"scouts":1,"mg":1,"water":1,"insurance":1}'::jsonb;
-- пулемёт, брандспойт, полис, огнетушители и ловушки добавились позже: у заведённых профилей их нет
update profiles set levels =
  '{"drones":1,"guns":1,"rockets":1,"sprays":1,"traps":1,"scouts":1,"mg":1,"water":1,"insurance":1}'::jsonb || levels;
-- кольца и спираль появились позже: у заведённой таблицы ограничение старое,
-- а create table if not exists его не трогает
alter table attacks drop constraint if exists attacks_pattern_check;
alter table attacks add constraint attacks_pattern_check
  check (pattern in ('swarm', 'lines', 'random', 'drip', 'rings', 'spiral', 'flower', 'sweep'));
-- уровень дронов запоминаем в самой атаке: у защитника они летят так,
-- как их прокачал нападающий, даже если тот потом апгрейднулся ещё
alter table attacks add column if not exists drone_level int not null default 1;
-- кто убрал бой из своего журнала: строка одна на двоих, прячем по-своему
alter table attacks add column if not exists hidden_by uuid[] not null default '{}';
-- повтор налёта: слепок склада защитника до боя и запись его действий
alter table attacks add column if not exists snap_cells text;
alter table attacks add column if not exists snap_guns jsonb;
alter table attacks add column if not exists snap_depots jsonb;
alter table attacks add column if not exists snap_levels jsonb;
alter table attacks add column if not exists trace text;
-- Версия движка и краткоживущий claim не дают двум серверным расчётам
-- одновременно закрывать один бой и не позволяют старому движку молча
-- проигрывать новый повтор.
--
-- Колонку заводим пустой, а не сразу с умолчанием: иначе все бои, что уже
-- лежат в базе, разом объявили бы себя нынешней версией, и старый повтор
-- проигрывался бы новой геометрией волн — молча и неверно. Пустые — это
-- ровно те, что писались до версий.
alter table attacks add column if not exists simulation_version int;

-- Бои прежних версий отыграть нечем: волны у них строились иначе, и запись
-- рук к новой геометрии не подходит. Пока игра не вышла, такие просто
-- вычищаем — и старые, и те, что останутся от следующего поднятия версии.
-- Прогон схемы после смены sim_version() сам подметает за собой.
delete from attacks
 where simulation_version is null or simulation_version <> sim_version();

alter table attacks alter column simulation_version set default sim_version();
alter table attacks alter column simulation_version set not null;
alter table attacks add column if not exists resolving_token uuid;
alter table attacks add column if not exists resolving_at timestamptz;
alter table attacks add column if not exists snap_base_updated_at timestamptz;
-- Уведомление каждого вида отправляется не больше одного раза.
alter table attacks add column if not exists sent_notified_at timestamptz;
alter table attacks add column if not exists resolved_notified_at timestamptz;
-- телеграм: куда слать извещения и по какому коду привязывать
-- Налёт теперь идёт волнами: у каждой своя форма и свой состав по начинкам.
-- Колонка пустая у старых строк — их читают как одну волну простых дронов.
alter table attacks add column if not exists waves jsonb;

-- Лицо игрока. Пусто — инициалы; «1»…«112» — готовое из public/avatars;
-- строка с http — своя картинка в хранилище. Новым и тем, у кого было
-- пусто, ставим случайный пресет (см. ensure_player / patch).
alter table profiles add column if not exists avatar text;

alter table profiles add column if not exists tg_chat_id bigint;
alter table profiles add column if not exists tg_code text;
create unique index if not exists profiles_tg_code on profiles (tg_code) where tg_code is not null;
-- заём: сколько отдать и когда
alter table profiles add column if not exists loan int not null default 0;
alter table profiles add column if not exists loan_due timestamptz;
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

-- Разведчики больше не отдельный склад: оставшиеся kind=scout → обычные дроны.
-- Без этого save_base падает на depots_only_changed после клиентской нормализации.
update bases
   set drone_cells = normalize_depots(drone_cells)
 where exists (
   select 1
     from jsonb_array_elements(drone_cells) e
    where e->>'kind' = 'scout'
 );
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
drop function if exists buy_drones(int, jsonb, text);
-- Закупка стала общей для дронов и шаров и переехала в buy_depot.
drop function if exists buy_depot(int, jsonb);
drop function if exists buy_scouts(int);
drop function if exists spend_scouts(int);
-- claim/resolve настоящего налёта: добавился token, старые формы мешают PostgREST
drop function if exists resolve_attack(uuid, text, jsonb, jsonb, jsonb, text);
drop function if exists resolve_attack(uuid, text, jsonb, jsonb, jsonb, text, uuid);
drop function if exists claim_attack(uuid);
drop function if exists send_attack(text, int, text, int, int, jsonb);
drop function if exists send_attack(text, int, text, int, int, jsonb, int);
-- у pending_attacks менялся не список аргументов, а состав колонок:
-- create or replace такого тоже не умеет
drop function if exists pending_attacks();
-- дронов теперь списывает сервер: клиент больше не присылает свой склад
drop function if exists spend_scouts(int, jsonb);
-- Итог настоящего налёта считает сервер (resolve_attack), клиент его больше
-- не присылает. Обе прежние подписи сносим: дублирующая ветка, которую никто
-- не зовёт, рано или поздно разъедется с рабочей.
drop function if exists complete_attack(uuid, text, jsonb, jsonb, jsonb);
drop function if exists complete_attack(uuid, text, jsonb, jsonb, jsonb, text);
-- attack_reports отдаёт ещё и повтор боя
drop function if exists attack_reports();
-- collect_income отдаёт ещё и что было продано с отгрузкой
drop function if exists collect_income();
-- enemy_base теперь отдаёт ещё и уровень чужих пушек
drop function if exists enemy_base(text);
-- журнал переехал с my_raids на raid_log: старую убираем, чтобы не висела
drop function if exists my_raids();
-- в журнал добавились ещё не отыгранные налёты: состав колонок другой
drop function if exists raid_log();
-- base_names отдаёт ещё и лицо игрока
drop function if exists base_names(text[]);
-- комментарии тоже: рядом с автором идёт его лицо
drop function if exists battle_comments(uuid);
drop function if exists add_battle_comment(uuid, text);

-- public_replay тоже отдаёт теперь волны: возвращаемый тип сменился
drop function if exists public_replay(uuid);

alter table profiles enable row level security;
alter table bases enable row level security;
alter table attacks enable row level security;
alter table battle_comments enable row level security;

-- Комментарии доступны только через функции ниже: так публичное чтение по
-- id боя не превращается в прямой доступ ко всей таблице Data API.
revoke all on table battle_comments from anon, authenticated;

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

  insert into profiles (id, email, display_name, avatar)
  values (
    uid,
    (select email from auth.users where id = uid),
    coalesce(
      (select raw_user_meta_data->>'full_name' from auth.users where id = uid),
      split_part((select email from auth.users where id = uid), '@', 1)
    ),
    (1 + floor(random() * 112))::int::text
  )
  on conflict (id) do nothing;

  insert into bases (user_id, cells)
  values (uid, starter_map())
  on conflict (user_id) do nothing;
end;
$$;

-- ---------- настоящие налёты между аккаунтами ----------

-- ---------- состав налёта ----------
-- Волны приходят от клиента, поэтому проверяем их целиком: форма из списка,
-- сторона в пределах, начинка известная, счёт неотрицательный.

create or replace function waves_drones(w jsonb) returns int
language sql immutable as $$
  select coalesce(sum(greatest(0, coalesce((g->>'n')::int, 0))), 0)::int
    from jsonb_array_elements(coalesce(w, '[]'::jsonb)) wave,
         jsonb_array_elements(coalesce(wave->'groups', '[]'::jsonb)) g;
$$;

/** Надбавка за начинку по всему налёту, в кредитах, при такой цене дрона. */
create or replace function waves_surcharge(w jsonb, unit int) returns int
language sql immutable as $$
  select coalesce(sum(
           floor(unit * price('pay_' || coalesce(g->>'payload', 'plain')) / 100.0)
           * greatest(0, coalesce((g->>'n')::int, 0))
         ), 0)::int
    from jsonb_array_elements(coalesce(w, '[]'::jsonb)) wave,
         jsonb_array_elements(coalesce(wave->'groups', '[]'::jsonb)) g;
$$;

/** Валит налёт с внятной причиной, если состав кривой. */
create or replace function check_waves(w jsonb) returns void
language plpgsql immutable as $$
declare wave jsonb; g jsonb;
begin
  if w is null or jsonb_typeof(w) <> 'array' or jsonb_array_length(w) = 0 then
    raise exception 'raid must have at least one wave';
  end if;
  if jsonb_array_length(w) > 8 then raise exception 'too many waves'; end if;
  for wave in select * from jsonb_array_elements(w) loop
    if coalesce(wave->>'pattern', '') not in
       ('swarm', 'lines', 'random', 'drip', 'rings', 'spiral', 'flower', 'sweep') then
      raise exception 'bad wave pattern';
    end if;
    if coalesce((wave->>'direction')::int, 0) < 0
       or coalesce((wave->>'direction')::int, 0) > 3 then
      raise exception 'bad wave direction';
    end if;
    if coalesce((wave->>'delay')::numeric, 0) < 0
       or coalesce((wave->>'delay')::numeric, 0) > 300 then
      raise exception 'bad wave delay';
    end if;
    if jsonb_typeof(coalesce(wave->'groups', 'null'::jsonb)) <> 'array'
       or jsonb_array_length(wave->'groups') = 0
       or jsonb_array_length(wave->'groups') > 8 then
      raise exception 'bad wave groups';
    end if;
    for g in select * from jsonb_array_elements(wave->'groups') loop
      if coalesce(g->>'payload', '') not in
         ('plain', 'heavy', 'jammer', 'foamer', 'demag', 'stealth', 'blower') then
        raise exception 'bad drone payload';
      end if;
      if coalesce((g->>'n')::int, -1) < 0 then raise exception 'bad group size'; end if;
    end loop;
  end loop;
end;
$$;

-- Старая подпись уходит целиком: PostgREST не выбирает между перегрузками,
-- а аргументы сменились.
drop function if exists send_attack(text, int, text, int, int);
drop function if exists send_attack(text, jsonb, int);

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
           price_at(price('drone'), coalesce((p.levels->>'drones')::int, 1))
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
          3)
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

-- Как зовут склады по адресам. Отдаём только имя: список врагов и так
-- строится по почте, а больше о чужом профиле знать незачем.
create or replace function base_names(emails text[])
returns table (email text, name text, avatar text)
language sql security definer set search_path = public as $$
  select p.email,
         coalesce(p.base_name, p.display_name, split_part(p.email, '@', 1)),
         p.avatar
    from profiles p
   where lower(p.email) = any (select lower(e) from unnest(emails) e);
$$;

-- ---------- разведка ----------
-- Списывает обычных дронов со склада и отдаёт карту врага одной операцией:
-- иначе карту запрашивали бы бесплатно.

create or replace function launch_scout(target_email text, n int)
returns table (scouts int, depots jsonb, cells text, guns jsonb, gun_level int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  tid uuid;
  cur bytea;
  cur_depots jsonb;
  next_depots jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if n is null or n < 1 then raise exception 'bad scout count'; end if;

  select p.id into tid
    from profiles p
   where lower(p.email) = lower(btrim(target_email))
     and p.founded;
  if tid is null then raise exception 'no such player'; end if;
  if tid = uid then raise exception 'cannot scout yourself'; end if;

  select b.cells, b.drone_cells into cur, cur_depots
    from bases b where b.user_id = uid for update;
  if cur is null then raise exception 'no base'; end if;

  -- как и с ударными дронами: снимает сервер, клиент только просит
  next_depots := take_from_depots(cur_depots, n, 'basic');

  update bases set drone_cells = next_depots, updated_at = now() where user_id = uid;
  scouts := depot_sum_kind(next_depots, 'basic');
  depots := next_depots;
  select encode(b.cells, 'base64'), b.guns,
         coalesce((p.levels->>'guns')::int, 1)
    into cells, guns, gun_level
    from bases b join profiles p on p.id = b.user_id
   where b.user_id = tid;
  return next;
end;
$$;

-- Что изменилось на чужом складе с прошлой разведки. Отдаём не карту, а
-- список квадратов 5×5, где стало не так, как на снимке: по ним разведданные
-- снова затягивает туманом. Саму карту клиенту знать незачем.
create or replace function stale_patches(target_email text, snap text)
returns int[]
language plpgsql security definer set search_path = public stable as $$
declare
  uid uuid := auth.uid();
  tid uuid;
  now_map bytea;
  was bytea := rle_decode(snap);
  out int[] := '{}';
  i int;
  block int;
  changed boolean[] := array_fill(false, array[400]);
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select p.id into tid from profiles p where lower(p.email) = lower(btrim(target_email));
  if tid is null then raise exception 'no such player'; end if;
  select b.cells into now_map from bases b where b.user_id = tid;
  if now_map is null or octet_length(was) <> 10000 then return out; end if;

  for i in 0..9999 loop
    if get_byte(now_map, i) <> get_byte(was, i) then
      -- квадрат 5×5: двадцать на двадцать таких накрывают всё поле
      block := ((i / 100) / 5) * 20 + ((i % 100) / 5);
      changed[block + 1] := true;
    end if;
  end loop;

  for block in 0..399 loop
    if changed[block + 1] then out := array_append(out, block); end if;
  end loop;
  return out;
end;
$$;

create or replace function pending_attacks()
returns table (
  id uuid, from_name text, created_at timestamptz, activated_at timestamptz,
  drones int, pattern text, direction int, seed int, waves jsonb, drone_level int,
  simulation_version int,
  from_email text,
  avatar text,
  opener text
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
             limit 1)
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
  drones int, pattern text, direction int, seed int, waves jsonb, simulation_version int,
  snap_cells text, snap_guns jsonb, snap_depots jsonb, snap_levels jsonb, trace text
)
language sql security definer set search_path = public as $$
  select a.id,
         coalesce(p.base_name, p.display_name, split_part(p.email, '@', 1)) as target_name,
         a.resolved_at, a.result, a.loot, a.destroyed,
         a.drones, a.pattern, a.direction, a.seed, a.waves, a.simulation_version,
         a.snap_cells, a.snap_guns, a.snap_depots, a.snap_levels, a.trace
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
   set cells = starter_map(), intact_cells = price('free'), updated_at = now()
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
returns table (credits_added int, days int, sold_drones int, sold_scouts int)
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
  scouts_out int;
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
  -- scout уже входит в basic (см. depot_sum_kind); отдельно не суммируем
  drones_out := depot_sum_kind(cur_depots, 'basic');
  scouts_out := 0;
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

  return query select gain + sale, paid, drones_out, scouts_out;
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

  -- kind=scout больше не принимаем: и снимок, и присланное приводим к basic,
  -- иначе перенос пушки/ловушки выглядит как смена состава склада.
  cur_depots := normalize_depots(cur_depots);
  new_depots := normalize_depots(new_depots);

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
  if kind not in
     ('drones', 'guns', 'rockets', 'sprays', 'traps', 'mg', 'water', 'insurance') then
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

-- ---------- закупка в контейнеры ----------

-- Дроны и шары кладутся на склад одним и тем же движением, так что и
-- функция одна. Параметр packs сохранён по имени от старой RPC, но его
-- значение означает точное количество штук, а не число пачек.
create or replace function buy_depot(
  packs int, new_depots jsonb, depot_kind text default 'basic'
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
  if packs is null or packs < 1 or packs > 100000 then
    raise exception 'bad drone amount';
  end if;
  if depot_kind not in ('basic', 'balloon') then
    raise exception 'bad depot kind';
  end if;
  -- Шары не качаются: их цена одна на всю игру, дроны дорожают с уровнем.
  select case when depot_kind = 'balloon'
              then packs * price('balloon')
              else packs * price_at(
                     price('drone'),
                     coalesce((p.levels->>'drones')::int, 1)
                   )
         end
    into cost
    from profiles p where p.id = uid;

  select b.cells, b.guns, b.drone_cells into cur, cur_guns, cur_depots
    from bases b where b.user_id = uid for update;
  if cur is null then raise exception 'no base'; end if;

  cur_depots := normalize_depots(cur_depots);
  new_depots := normalize_depots(new_depots);

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
  if not depots_only_changed(cur_depots, new_depots, depot_kind, packs) then
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

-- ---------- итог боя ----------
-- Здесь карта может только ухудшаться, а пушки только убывать: бой ничего
-- не чинит и не строит.

-- Тело боя за указанного игрока. Отдельно от apply_battle, потому что итог
-- боя с настоящим налётом теперь считает сервер, и он приходит не от имени
-- защитника. Функция принимает игрока параметром, поэтому ниже с неё снято
-- право исполнения: звать её может только сервер под служебным ключом.
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

  cur_depots := normalize_depots(cur_depots);
  new_depots := normalize_depots(new_depots);

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

-- Свой бой без настоящего налёта — с ботом или пробный. Тут верить клиенту
-- можно: премии нападающему нет, а страховка за сожжённое ровно покрывает
-- ремонт, так что жечь себя незачем.
create or replace function apply_battle(new_cells text, new_guns jsonb, new_depots jsonb, result jsonb)
returns table (credits int, intact int)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  return query select * from apply_battle_for(uid, new_cells, new_guns, new_depots, result);
end;
$$;

-- ---------- итог настоящего налёта, посчитанный сервером ----------
-- Бой детерминирован, а недетерминированы только руки защитника. Поэтому
-- клиент присылает лишь запись своих рук, сервер прогоняет бой сам и зовёт
-- эту функцию со своим же результатом. Защитник тут не участвует — его id
-- берётся из строки налёта, — и потому исполнение с неё снято: звать может
-- только сервер под служебным ключом.

-- Короткий claim: блокируем налёт, снимаем слепок склада и версии, отдаём
-- серверу всё нужное для расчёта. Пока claim жив (две минуты), склад
-- защитника не принимают к сохранению — иначе расчёт уедет от слепка.
-- Снять заявку, не закрывая бой. Нужна, когда расчёт сорвался: без неё
-- сорвавшийся бой две минуты отвечал «уже считается», и защитник не мог
-- ни повторить, ни сдвинуть очередь — а очередь у него одна.
create or replace function release_attack(attack_id uuid, claim_token uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update attacks
     set resolving_token = null, resolving_at = null
   where id = attack_id
     and status = 'pending'
     and resolving_token = claim_token;
end;
$$;

create or replace function claim_attack(attack_id uuid)
returns table (
  token uuid,
  cells text,
  guns jsonb,
  depots jsonb,
  levels jsonb,
  drones int,
  pattern text,
  direction int,
  seed int,
  waves jsonb,
  drone_level int,
  simulation_version int
)
language plpgsql security definer set search_path = public as $$
declare
  order_row attacks;
  claim uuid := gen_random_uuid();
  snap_map text;
  snap_g jsonb;
  snap_d jsonb;
  snap_lv jsonb;
  base_at timestamptz;
begin
  select a.* into order_row from attacks a where a.id = attack_id for update;
  if not found then raise exception 'attack not found'; end if;
  if order_row.status <> 'pending' then raise exception 'attack already resolved'; end if;
  if order_row.resolving_token is not null
     and order_row.resolving_at > now() - interval '2 minutes' then
    raise exception 'attack is already resolving';
  end if;

  select encode(b.cells, 'base64'), b.guns, b.drone_cells, b.updated_at
    into snap_map, snap_g, snap_d, base_at
    from bases b where b.user_id = order_row.defender_id for update;
  if snap_map is null then raise exception 'no base'; end if;
  select p.levels into snap_lv from profiles p where p.id = order_row.defender_id;

  update attacks
     set resolving_token = claim,
         resolving_at = now(),
         snap_cells = snap_map,
         snap_guns = snap_g,
         snap_depots = snap_d,
         snap_levels = snap_lv,
         snap_base_updated_at = base_at
   where id = attack_id;

  token := claim;
  cells := snap_map;
  guns := snap_g;
  depots := snap_d;
  levels := snap_lv;
  drones := order_row.drones;
  pattern := order_row.pattern;
  direction := order_row.direction;
  seed := order_row.seed;
  waves := order_row.waves;
  drone_level := order_row.drone_level;
  simulation_version := order_row.simulation_version;
  return next;
end;
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

-- ---------- вайп ----------

create or replace function wipe_base()
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
     set credits = greatest(profiles.credits, price('start')),
         drones = 0, founded = false, last_income_at = now(),
         stats = jsonb_set(stats, '{wipes}', to_jsonb((stats->>'wipes')::int + 1))
   where id = uid;
end;
$$;

-- ---------- заём ----------
-- Банк даёт от price('loan_min') до price('loan_max') на сутки под процент.
-- Долг гасится при заходе в игру по сроку или руками в любой момент. Не
-- расплатился вовремя — процент начисляется заново, и срок едет на сутки.

create or replace function settle_loan(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  prof profiles;
  pay int;
begin
  select * into prof from profiles where id = uid for update;
  if not found or prof.loan <= 0 then return; end if;
  if prof.loan_due is null or now() < prof.loan_due then return; end if;

  -- срок вышел: берём сколько есть
  pay := least(prof.loan, greatest(0, prof.credits));
  update profiles
     set credits = profiles.credits - pay,
         loan = profiles.loan - pay
   where profiles.id = uid;

  -- не хватило — долг растёт, срок едет дальше
  if prof.loan - pay > 0 then
    update profiles
       set loan = profiles.loan + (profiles.loan * price('loan_rate')) / 100,
           loan_due = profiles.loan_due + (price('loan_hours') || ' hours')::interval
     where profiles.id = uid;
  else
    update profiles set loan_due = null where profiles.id = uid;
  end if;
end;
$$;

create or replace function take_loan(amount int)
returns table (credits int, loan int, loan_due timestamptz)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform settle_loan(uid);
  if amount is null or amount < price('loan_min') or amount > price('loan_max') then
    -- Говорим суммой, а не 'bad amount': без цифр не понять, потолок
    -- это, порог или устаревшая на сервере цена.
    raise exception 'loan must be between % and %, asked %',
      price('loan_min'), price('loan_max'), amount;
  end if;
  if (select p.loan from profiles p where p.id = uid) > 0 then
    raise exception 'previous loan of % is not repaid',
      (select p.loan from profiles p where p.id = uid);
  end if;

  update profiles
     set credits = profiles.credits + amount,
         loan = amount + (amount * price('loan_rate')) / 100,
         loan_due = now() + (price('loan_hours') || ' hours')::interval
   where profiles.id = uid
   returning profiles.credits, profiles.loan, profiles.loan_due
   into credits, loan, loan_due;
  return next;
end;
$$;

create or replace function repay_loan()
returns table (credits int, loan int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  owed int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select p.loan into owed from profiles p where p.id = uid for update;
  if coalesce(owed, 0) <= 0 then raise exception 'nothing to repay'; end if;

  update profiles
     set credits = profiles.credits - owed,
         loan = 0,
         loan_due = null
   where profiles.id = uid and profiles.credits >= owed
   returning profiles.credits, profiles.loan into credits, loan;
  if not found then raise exception 'not enough credits'; end if;
  return next;
end;
$$;

-- ---------- знакомство в обе стороны ----------
-- Добавил соперника — он добавляет тебя. Иначе получалось одностороннее
-- знакомство: он видит налёты от «Порт-Складъ», а ответить не может, потому
-- что почты твоей не знает.

create or replace function add_rival(target_email text)
returns table (email text, name text)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  me profiles;
  target profiles;
  card jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select p.* into me from profiles p where p.id = uid;
  select p.* into target
    from profiles p where lower(p.email) = lower(btrim(target_email)) limit 1;
  if not found then raise exception 'player with this email has not joined yet'; end if;
  if target.id = uid then raise exception 'cannot add yourself'; end if;

  -- карточка знакомства: склад придёт с разведки, счёт вражды — с боёв
  card := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', coalesce(me.base_name, me.display_name, split_part(me.email, '@', 1)),
    'email', me.email,
    'cells', '',
    'guns', '[]'::jsonb,
    'depots', '[]'::jsonb,
    'burnedByMe', 0,
    'burnedByThem', 0,
    'lastRaidAt', 0
  );

  update profiles
     set enemies = profiles.enemies || card
   where profiles.id = target.id
     and not exists (
       select 1 from jsonb_array_elements(profiles.enemies) e
        where lower(e->>'email') = lower(me.email)
     );

  email := target.email;
  name := coalesce(target.base_name, target.display_name, split_part(target.email, '@', 1));
  return next;
end;
$$;

-- ---------- телеграм ----------
-- Код привязки: игрок открывает t.me/бот?start=код, бот запоминает чат.
-- Код одноразовый по смыслу, но не по сроку: перепривязать можно всегда.

create or replace function tg_code()
returns table (code text, linked boolean)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  -- Без pgcrypto: gen_random_bytes живёт в схеме extensions и при
  -- search_path=public его не видно. UUID хватает как одноразового кода.
  update profiles
     set tg_code = coalesce(
       tg_code,
       substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
     )
   where profiles.id = uid;
  select p.tg_code, p.tg_chat_id is not null
    into code, linked
    from profiles p where p.id = uid;
  return next;
end;
$$;

create or replace function tg_unlink()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update profiles set tg_chat_id = null where id = auth.uid();
end;
$$;

grant execute on function tg_code, tg_unlink to authenticated;

-- ---------- разговор о бою ----------

create or replace function battle_comments(target uuid)
returns table (id uuid, author text, avatar text, body text, created_at timestamptz, mine boolean)
language sql security definer set search_path = public stable as $$
  select c.id,
         coalesce(p.base_name, p.display_name, split_part(p.email, '@', 1)),
         p.avatar, c.body, c.created_at, c.author_id = auth.uid()
    from battle_comments c
    join profiles p on p.id = c.author_id
   where c.attack_id = target
   order by c.created_at;
$$;

create or replace function add_battle_comment(target uuid, message text)
returns table (id uuid, author text, avatar text, body text, created_at timestamptz, mine boolean)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  fresh battle_comments;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from attacks a
     where a.id = target and (a.attacker_id = uid or a.defender_id = uid)
  ) then
    raise exception 'not a participant';
  end if;

  insert into battle_comments (attack_id, author_id, body)
  values (target, uid, btrim(message))
  returning * into fresh;

  select fresh.id,
         coalesce(p.base_name, p.display_name, split_part(p.email, '@', 1)),
         p.avatar, fresh.body, fresh.created_at, true
    into id, author, avatar, body, created_at, mine
    from profiles p where p.id = uid;
  return next;
end;
$$;

create or replace function delete_battle_comment(comment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from battle_comments where id = comment_id and author_id = auth.uid();
end;
$$;

grant execute on function battle_comments to anon, authenticated;
grant execute on function add_battle_comment, delete_battle_comment to authenticated;

-- ---------- хранилище под свои аватарки ----------
-- Картинку ужимает клиент до трёхсот с небольшим пикселей, так что файл
-- выходит в десятки килобайт. Каждый кладёт её под своим id и только свою;
-- читают все — лицо видно и сопернику, и под комментарием.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 262144, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = 262144,
      allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg'];

drop policy if exists "avatars readable" on storage.objects;
create policy "avatars readable" on storage.objects for select
  using (bucket_id = 'avatars');

-- Ровно один файл на игрока: {uuid}.webp — иначе копились uuid.123.webp и т.п.
drop policy if exists "own avatar write" on storage.objects;
create policy "own avatar write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = auth.uid()::text || '.webp');

drop policy if exists "own avatar replace" on storage.objects;
create policy "own avatar replace" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '.webp');

drop policy if exists "own avatar remove" on storage.objects;
create policy "own avatar remove" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and name = auth.uid()::text || '.webp');

-- ---------- лицо игрока ----------
-- Своё меняет только сам игрок. Готовое — это номер, своя картинка — адрес
-- в нашем же хранилище: чужие ссылки не берём, иначе профиль стал бы местом
-- для картинки с любого сайта.

create or replace function set_avatar(value text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if value is not null
     and value !~ '^([1-9]|[1-9][0-9]|10[0-9]|11[0-2])$'
     and value not like 'https://%/storage/v1/object/public/avatars/%' then
    raise exception 'bad avatar';
  end if;
  if value is not null and strpos(value, '?') > 0 then
    value := split_part(value, '?', 1);
  end if;
  update profiles set avatar = value where id = uid;
end;
$$;

grant execute on function set_avatar to authenticated;

-- ---------- журнал боёв ----------
-- И свои налёты, и те, где отбивался ты: по журналу открываются повторы.
-- Слепки складов сюда не тащим, они тяжёлые — их отдаёт public_replay.

create or replace function raid_log()
returns table (
  id uuid, side text, foe text, at timestamptz, pending boolean,
  drones int, loot int, destroyed boolean, burned int, has_replay boolean
)
language sql security definer set search_path = public stable as $$
  -- Свои налёты видны и до боя: защитник ещё не отбивался, показывать
  -- нечего, но знать, что рой в пути, полезно.
  select a.id,
         case when a.attacker_id = auth.uid() then 'attack' else 'defence' end,
         case
           when a.attacker_id = auth.uid()
             then coalesce(d.base_name, d.display_name, split_part(d.email, '@', 1))
           else coalesce(t.base_name, t.display_name, split_part(t.email, '@', 1))
         end,
         coalesce(a.resolved_at, a.created_at),
         a.status = 'pending',
         a.drones, a.loot, a.destroyed,
         coalesce((a.result->>'burned')::int, 0),
         a.snap_cells is not null
    from attacks a
    join profiles t on t.id = a.attacker_id
    join profiles d on d.id = a.defender_id
   where not (auth.uid() = any (a.hidden_by))
     and (
       (a.attacker_id = auth.uid() and a.status in ('pending', 'resolved'))
       or (a.defender_id = auth.uid() and a.status = 'resolved')
     )
   order by coalesce(a.resolved_at, a.created_at) desc
   limit 30;
$$;

-- Убрать бой из своего журнала. У второй стороны он остаётся: строка одна.
create or replace function hide_raid(attack_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update attacks
     set hidden_by = array_append(hidden_by, uid)
   where id = attack_id
     and (attacker_id = uid or defender_id = uid)
     and not (uid = any (hidden_by));
end;
$$;

-- ---------- ссылка на повтор ----------
-- Повтор боя открывается по ссылке кем угодно: id атаки — случайный uuid,
-- а показывать нечего, кроме того, что и так видели обе стороны.

create or replace function public_replay(attack_id uuid)
returns table (
  attacker text, defender text,
  drones int, pattern text, direction int, seed int, waves jsonb, drone_level int,
  simulation_version int,
  snap_cells text, snap_guns jsonb, snap_depots jsonb, snap_levels jsonb,
  trace text, result jsonb, resolved_at timestamptz
)
language sql security definer set search_path = public stable as $$
  select coalesce(att.base_name, att.display_name, split_part(att.email, '@', 1)),
         coalesce(def.base_name, def.display_name, split_part(def.email, '@', 1)),
         a.drones, a.pattern, a.direction, a.seed, a.waves, a.drone_level,
         a.simulation_version,
         a.snap_cells, a.snap_guns, a.snap_depots, a.snap_levels,
         a.trace, a.result, a.resolved_at
    from attacks a
    join profiles att on att.id = a.attacker_id
    join profiles def on def.id = a.defender_id
   where a.id = attack_id
     and a.status = 'resolved'
     and a.snap_cells is not null;
$$;

grant execute on function public_replay to anon, authenticated;

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
         intact_cells = price('free'), updated_at = now()
   where user_id = uid;

  update profiles
     set credits = price('start'),
         drones = 0,
         loan = 0,
         loan_due = null,
         founded = true,
         last_income_at = now(),
         levels = '{"drones":1,"guns":1,"rockets":1,"sprays":1,"traps":1,"scouts":1,"mg":1,"water":1,"insurance":1}'::jsonb,
         stats = '{"battles":0,"dronesKilled":0,"cellsBurned":0,"cellsRepaired":0,
                   "wipes":0,"raids":0,"looted":0}'::jsonb
   where id = uid;

  -- налёты, которые ждали старый склад, начинать сначала не должны
  delete from attacks where defender_id = uid and status = 'pending';
end;
$$;

-- Postgres по умолчанию отдаёт EXECUTE всем (PUBLIC), поэтому одних grant
-- мало: с функций, которые принимают игрока параметром, право надо снимать
-- явно. Иначе любой вошедший мог бы завершить чужой бой за кого угодно.
-- Служебные функции: их зовёт только сервер под service_role.
--
-- Одного «revoke from public» мало, и это важно. Postgres отдаёт EXECUTE
-- роли PUBLIC при создании функции, но Supabase вдобавок раздаёт его
-- напрямую ролям anon, authenticated и service_role — своими default
-- privileges на схему public. Снимешь только с PUBLIC — у authenticated
-- останется его собственное право, и любой вошедший сможет позвать
-- apply_battle_for с чужим id и снести чужой склад. Поэтому снимаем со
-- всех поимённо и тут же возвращаем ровно service_role.
do $perm$
declare fn text;
begin
  foreach fn in array array[
    'apply_battle_for(uuid, text, jsonb, jsonb, jsonb)',
    'resolve_attack(uuid, text, jsonb, jsonb, jsonb, text, uuid)',
    'claim_attack(uuid)',
    'release_attack(uuid, uuid)',
    -- Просрочку по займу закрывает сервер изнутри collect_income и repay_loan.
    -- Снаружи её звать некому: функция принимает чужой id, а id соперника
    -- виден обеим сторонам боя.
    'settle_loan(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end
$perm$;

grant execute on function ensure_player, collect_income, save_base,
  buy_depot, apply_battle, wipe_base, rename_base, save_enemies,
  base_names, stale_patches, launch_scout, upgrade, add_rival,
  take_loan, repay_loan, raid_log, hide_raid,
  send_attack, pending_attacks, attack_reports, ack_attack_report, restart_game to authenticated;

-- PostgREST держит список функций в кэше. Supabase обычно перечитывает его сам,
-- но после смены сигнатур надёжнее попросить явно — иначе клиент ещё какое-то
-- время будет звать функцию, которой уже нет.
notify pgrst, 'reload schema';
