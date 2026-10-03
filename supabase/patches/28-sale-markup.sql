-- Отгрузка в полтора раза дороже закупки, а не вдвое: price('sale') теперь
-- процент. Версию боя не меняет.
-- Выполнить в Supabase → SQL Editor до деплоя клиента. Можно прогнать повторно.

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
    when 'drones' then 1000
    when 'drone'  then 25
    -- Пусковая шаров: разовая — выбрасывает шары и пропадает, оттого дешевле зенитки.
    when 'balloon' then 80
    when 'income' then 10  -- кредитов в сутки с каждой целой клетки
    when 'sale'   then 150 -- отгрузка: процент от цены закупки, в полтора раза дороже
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
    when 'pay_turbo'  then 40   -- турбо: +50% к скорости, взрыв как у простой
    when 'pay_armor'  then 45   -- броня: зенитке нужно два попадания
    when 'pay_shooter' then 50  -- стрелок: ракета по складу издалека, потом таран
  end;
$$;

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
  sale := (drones_out * price_at(price('drone'), coalesce((prof.levels->>'drones')::int, 1))
          * price('sale')) / 100;

  update bases
     set drone_cells = '[]'::jsonb,
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

notify pgrst, 'reload schema';
