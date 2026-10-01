-- Журнал боёв отдаёт почту второй стороны: по нику в журнале открывается
-- карточка врага, а искать его по имени нельзя — имя склада не уникально.
-- Выполнить в Supabase → SQL Editor до деплоя клиента.
--
-- Заодно возвращает удаление боя из журнала, если его убрала первая версия
-- patches/04-competition-list.sql. Прогонять повторно можно.

alter table attacks add column if not exists hidden_by uuid[] not null default '{}';

-- у raid_log сменился состав колонок: create or replace такого не умеет
drop function if exists raid_log();

create or replace function raid_log()
returns table (
  id uuid, side text, foe text, foe_email text, at timestamptz, pending boolean,
  drones int, loot int, destroyed boolean, burned int, has_replay boolean
)
language sql security definer set search_path = public stable as $$
  -- Свои налёты видны и до боя: защитник ещё не отбивался, показывать
  -- нечего, но знать, что рой в пути, полезно. Почта второй стороны — чтобы
  -- по нику в журнале открыть его карточку: имя склада не уникально.
  select a.id,
         case when a.attacker_id = auth.uid() then 'attack' else 'defence' end,
         case
           when a.attacker_id = auth.uid()
             then coalesce(d.base_name, d.display_name, split_part(d.email, '@', 1))
           else coalesce(t.base_name, t.display_name, split_part(t.email, '@', 1))
         end,
         case when a.attacker_id = auth.uid() then d.email else t.email end,
         coalesce(a.resolved_at, a.created_at),
         a.status = 'pending',
         a.drones, a.loot, a.destroyed,
         coalesce((a.result->>'burned')::int, 0),
         a.snap_cells is not null
    from attacks a
    join profiles t on t.id = a.attacker_id
    join profiles d on d.id = a.defender_id
   -- состязаний тут нет: у них свой журнал, по номерам
   where a.competition_stage is null
     and not (auth.uid() = any (a.hidden_by))
     and (
       (a.attacker_id = auth.uid() and a.status in ('pending', 'resolved'))
       or (a.defender_id = auth.uid() and a.status = 'resolved')
     )
   order by coalesce(a.resolved_at, a.created_at) desc
   limit 30;
$$;

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

grant execute on function raid_log, hide_raid to authenticated;

notify pgrst, 'reload schema';
