-- Сетка разрешена только над пустыми клетками и контейнерами.
-- Для базы с уже применённым патчем 54. Выполнить до обновления клиента.
-- Можно выполнять повторно.

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
