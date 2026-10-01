-- Звено капели: волна-капель может приходить звеньями по 1…4 дрона.
-- Сервер проверяет число в звене. Без поля — по одному, как раньше.
-- Выполнить в Supabase → SQL Editor до деплоя клиента.

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
         ('plain', 'heavy', 'jammer', 'foamer', 'demag', 'stealth', 'blower', 'turbo') then
        raise exception 'bad drone payload';
      end if;
      if coalesce((g->>'n')::int, -1) < 0 then raise exception 'bad group size'; end if;
    end loop;
  end loop;
end;
$$;

