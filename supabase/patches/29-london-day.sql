-- Смена — сутки, а не двенадцать часов: аренда и отгрузка приходят раз в
-- день, в полночь по Лондону. Версию боя не меняет.
-- Выполнить в Supabase → SQL Editor до деплоя клиента (после 28-го). Можно
-- прогнать повторно.

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

  -- Смена — сутки: аренда и отгрузка приходят в полночь по Лондону.
  -- Сколько лондонских полуночей прошло с прошлой выплаты, столько и смен.
  passed := (now() at time zone 'Europe/London')::date
          - (prof.last_income_at at time zone 'Europe/London')::date;
  if passed <= 0 then
    return query select 0, 0, 0, 0;
    return;
  end if;

  paid := least(passed, 14);
  -- Аренда идёт с каждой целой клетки за каждые сутки.
  gain := paid * coalesce(intact, 0) * price('income');

  -- А раз в отгрузку склад продаёт всё, что на нём лежит, вдвое дороже
  -- закупки. Продаётся то, что есть сейчас, а не за каждые прошедшие сутки.
  -- Цену берём с учётом уровня, ту же, по какой товар и покупался: иначе
  -- прокачка съедала бы маржу — на десятом уровне дрон обходился в 47, а
  -- уходил за те же 50.
  drones_out := depot_sum_kind(cur_depots, 'basic');
  sale := (drones_out * price_at(price('drone'), coalesce((prof.levels->>'drones')::int, 1))
          * price('sale')) / 100;

  update bases
     set drone_cells = '[]'::jsonb,
         updated_at = now()
   where user_id = uid and jsonb_array_length(drone_cells) > 0;

  update profiles
     set credits = credits + gain + sale,
         drones = 0,
         last_income_at = now()
   where id = uid;

  return query select gain + sale, paid, drones_out, sale;
end;
$$;

notify pgrst, 'reload schema';
