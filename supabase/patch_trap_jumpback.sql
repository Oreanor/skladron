-- Минимальный патч против save_base 400 / «ловушка прыгает на место».
--
-- Почему 400 (типичный путь):
--   Клиент после load() снимает kind=scout с контейнеров. В bases.drone_cells
--   scout ещё лежит. save_base через depot_sum_kind видит рост basic →
--   exception «drone count may only change on purchase» → HTTP 400 →
--   Lobby.saveNow ловит ошибку, resyncBase(), перенос откатывается.
--
-- Дополнительно: если live-схему не накатывали с появления ловушки,
--   guns_valid должен принимать kind='trap' (иначе «bad gun placement»).
--
-- Применить: Supabase → SQL Editor → этот файл целиком.
-- Полное совпадение с репо: затем (или вместо) supabase/schema.sql целиком —
-- там же save_base/buy_drones нормализуют depots до проверок.

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
    if coalesce(e->>'kind', 'gun') not in ('gun', 'spray', 'trap') then return false; end if;
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

-- Разово вычистить scout из уже лежащих складов.
update bases
   set drone_cells = normalize_depots(drone_cells)
 where exists (
   select 1
     from jsonb_array_elements(drone_cells) e
    where e->>'kind' = 'scout'
 );

-- Проверка после патча (ожидаем ok=true на обеих строках):
-- select depot_sum_kind('[{"cx":1,"cy":1,"n":10,"kind":"scout"}]'::jsonb, 'basic') = 10 as scout_as_basic;
-- select guns_valid(
--   '[{"cx":0,"cy":0,"kind":"trap"}]'::jsonb,
--   decode(repeat('01', 10000), 'hex'),
--   '[]'::jsonb
-- ) as trap_ok;
-- (вторая проверка нуждается в карте из 10000 байт со значением 1 в клетке 0)
