-- Начинка «турбо» (+50% скорость) и версия симуляции 15 (гуще капель).
-- Выполнить в Supabase → SQL Editor после деплоя клиента.

create or replace function sim_version() returns int
language sql immutable as $$ select 15 $$;

create or replace function price(kind text) returns int
language sql immutable as $$
  select case kind
    when 'cell'   then 10
    when 'repair' then 5
    when 'scrap'  then 5
    when 'gun'    then 100
    when 'spray'  then 150
    when 'trap'   then 200
    when 'rocket' then 200
    when 'refund' then 50
    when 'drones' then 1000
    when 'drone'  then 25
    when 'balloon' then 5
    when 'income' then 10
    when 'sale'   then 2
    when 'loot'   then 50
    when 'loot_curve' then 200
    when 'insure_cell'  then 5
    when 'insure_step'  then 25
    when 'free'   then 25
    when 'found'  then 25
    when 'upgrade' then 5000
    when 'price_step' then 10
    when 'loan_min'   then 1000
    when 'loan_max'   then 10000
    when 'loan_rate'  then 10
    when 'loan_hours' then 24
    when 'max_raid' then 500
    when 'start'    then 10000
    when 'defend_clean' then 15
    when 'defend_dirty' then 6
    when 'defend_burn'  then 8
    when 'queued'   then 3
    when 'pay_plain'  then 0
    when 'pay_heavy'  then 50
    when 'pay_jammer' then 40
    when 'pay_foamer' then 30
    when 'pay_demag'  then 35
    when 'pay_blower' then 25
    when 'pay_stealth' then 60
    when 'pay_turbo'  then 40
  end;
$$;

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
         ('plain', 'heavy', 'jammer', 'foamer', 'demag', 'stealth', 'blower', 'turbo') then
        raise exception 'bad drone payload';
      end if;
      if coalesce((g->>'n')::int, -1) < 0 then raise exception 'bad group size'; end if;
    end loop;
  end loop;
end;
$$;
