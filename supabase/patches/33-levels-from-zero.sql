-- Уровни с нуля: ступеней прокачки одиннадцать (0–10 для игрока, в базе
-- по-прежнему с единицы), цена растёт ровно на десятую часть разницы за
-- ступень. Версию боя не меняет.
-- Выполнить в Supabase → SQL Editor до деплоя клиента (после 31-го). Можно
-- прогнать повторно.

create or replace function price_at(kind text, level int) returns int
language sql immutable as $$
  select price(kind)
       + ((coalesce(price(kind || '_top'), price(kind)) - price(kind))
          * (least(11, greatest(1, coalesce(level, 1))) - 1)) / 10;
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
  cost := price('upgrade');

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
