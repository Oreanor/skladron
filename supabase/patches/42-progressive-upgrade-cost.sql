-- Прогрессивная цена уровней 1–10: 1000 × 2^(уровень − 1).
-- Выполнить в Supabase → SQL Editor перед деплоем клиента.
-- Можно выполнять повторно; текущие уровни сохраняются.

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
    when 'sale'   then 200 -- отгрузка: процент от цены закупки, вдвое дороже
    when 'loot'   then 50   -- нападавшему за каждую сожжённую клетку склада
    -- Надбавка за близкий к полному разгром, процентов при стопроцентном.
    -- Растёт кубом от доли сожжённого; то же число в LOOT_CURVE на клиенте.
    when 'loot_curve' then 200
    when 'insure_cell'  then 5   -- страховка погорельцу: ровно на ремонт клетки
    when 'insure_step'  then 25  -- покрытие товара и пушек: столько процентов за уровень полиса
    when 'free'   then 25   -- стартовая площадь 5×5 достаётся даром
    when 'found'  then 25   -- столько же нужно, чтобы основаться
    when 'upgrade' then 1000 -- первый уровень; каждый следующий вдвое дороже
    -- Цена на десятом уровне: с первого до десятого вещь дорожает ровно.
    when 'gun_top'     then 200
    when 'rocket_top'  then 400
    when 'spray_top'   then 300
    when 'trap_top'    then 400
    when 'balloon_top' then 150
    when 'drone_top'   then 30
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
     ('drones', 'guns', 'rockets', 'sprays', 'traps', 'balloons', 'mg', 'water', 'insurance') then
    raise exception 'bad upgrade kind';
  end if;

  select coalesce((p.levels->>kind)::int, 1) into cur
    from profiles p where p.id = uid for update;
  if cur is null then raise exception 'no profile'; end if;
  -- у страховки потолок свой: пятый уровень покрывает потери целиком
  if cur >= (case when kind = 'insurance' then 5 else 11 end) then
    raise exception 'already at max level';
  end if;
  cost := price('upgrade') * (1 << (cur - 1));

  update profiles
     set credits = profiles.credits - cost,
         levels = jsonb_set(profiles.levels, array[kind], to_jsonb(cur + 1))
   where profiles.id = uid and profiles.credits >= cost
   returning profiles.credits, profiles.levels into credits, levels;

  if not found then raise exception 'not enough credits'; end if;
  return next;
end;
$$;

notify pgrst, 'reload schema';
