-- Версия боя 27: начинка «стрелок» — пускает ракету по складу издалека и
-- идёт на таран. Заодно дописывает уровень шаров в профили, заведённые
-- до пусковых установок: без него у кнопки не было ни цены, ни уровня.
-- Выполнить в Supabase → SQL Editor до деплоя клиента (после 25-го).
-- Повторно не прогонять, если версия к тому времени выше 27.

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
    when 'pay_turbo'  then 40   -- турбо: +50% к скорости, взрыв как у простой
    when 'pay_armor'  then 45   -- броня: зенитке нужно два попадания
    when 'pay_shooter' then 50  -- стрелок: ракета по складу издалека, потом таран
  end;
$$;

create or replace function check_waves(w jsonb) returns void
language plpgsql immutable as $$
declare wave jsonb; g jsonb;
begin
  if w is null or jsonb_typeof(w) <> 'array' or jsonb_array_length(w) = 0 then
    raise exception 'raid must have at least one wave';
  end if;
  if jsonb_array_length(w) > 10 then raise exception 'too many waves'; end if;
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
    -- звено капели: сколько дронов заходит разом с одной стороны
    if coalesce((wave->>'flight')::int, 1) < 1
       or coalesce((wave->>'flight')::int, 1) > 4 then
      raise exception 'bad wave flight';
    end if;
    if jsonb_typeof(coalesce(wave->'groups', 'null'::jsonb)) <> 'array'
       or jsonb_array_length(wave->'groups') = 0
       or jsonb_array_length(wave->'groups') > 8 then
      raise exception 'bad wave groups';
    end if;
    for g in select * from jsonb_array_elements(wave->'groups') loop
      if coalesce(g->>'payload', '') not in
         ('plain', 'heavy', 'jammer', 'foamer', 'demag', 'stealth', 'blower', 'turbo', 'armor', 'shooter') then
        raise exception 'bad drone payload';
      end if;
      if coalesce((g->>'n')::int, -1) < 0 then raise exception 'bad group size'; end if;
    end loop;
  end loop;
end;
$$;

update profiles
   set levels = levels || '{"balloons":1}'::jsonb
 where not (levels ? 'balloons');

create or replace function sim_version() returns int
language sql immutable as $$ select 27 $$;

-- неотыгранные налёты играть новыми правилами можно — перештамповываем
update attacks
   set simulation_version = sim_version(),
       resolving_token = null,
       resolving_at = null
 where status = 'pending';

notify pgrst, 'reload schema';
