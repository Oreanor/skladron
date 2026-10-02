-- Ежедневная отгрузка с извещением в телеграм. Отгрузку теперь умеет
-- проводить и сервер — для любого игрока (collect_income_for), а не только
-- сам игрок при входе. Версию боя не меняет.
-- Выполнить в Supabase → SQL Editor до деплоя клиента. Можно прогнать повторно.

-- Сама отгрузка — для любого игрока. Зовут её двое: collect_income, когда
-- игрок заходит, и ежедневная ручка сервера (/api/cron/income), которая
-- отгружает склады сама и пишет итог в телеграм. Снаружи её не позвать:
-- права только у service_role, см. ниже.
create or replace function collect_income_for(uid uuid)
returns table (credits_added int, days int, sold_drones int, sold_credits int)
language plpgsql security definer set search_path = public as $$
declare
  prof profiles;
  intact int;
  passed int;
  paid int;
  gain int;
  cur_depots jsonb;
  drones_out int;
  sale int;
begin
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
  drones_out := depot_sum_kind(cur_depots, 'basic');
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

  return query select gain + sale, paid, drones_out, sale;
end;
$$;

-- Отгрузка своего склада — при входе в игру.
create or replace function collect_income()
returns table (credits_added int, days int, sold_drones int)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return query
    select c.credits_added, c.days, c.sold_drones from collect_income_for(auth.uid()) c;
end;
$$;

revoke all on function collect_income_for(uuid) from public, anon, authenticated;
grant execute on function collect_income_for(uuid) to service_role;
grant execute on function collect_income to authenticated;

notify pgrst, 'reload schema';
