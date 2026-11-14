-- Бой без строки налёта больше не платит премию за отбой.
--
-- apply_battle открыта любому вошедшему, а премию считала по dronesSent из
-- присланного клиентом result. Нетронутая карта плюс dronesSent: 100000 —
-- и полтора миллиона кредитов за вызов. Настоящие налёты и миссии идут
-- через /api/battle/resolve и resolve_attack, их это не касается.
--
-- Выполнить в Supabase → SQL Editor в любой момент, клиент не меняется.
-- Можно выполнять повторно.

create or replace function apply_battle(new_cells text, new_guns jsonb, new_depots jsonb, result jsonb)
returns table (credits int, intact int)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  return query select * from apply_battle_for(uid, new_cells, new_guns, new_depots, result, false);
end;
$$;
