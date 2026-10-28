-- Прокачка кредита: банк даёт 10 000 на нулевом уровне и +10 000 за
-- уровень, до 100 000 на девятом. Можно выполнять повторно.

begin;

alter table profiles alter column levels set default
  '{"drones":1,"guns":1,"rockets":1,"sprays":1,"traps":1,"balloons":1,"scouts":1,"mg":1,"water":1,"insurance":1,"loan":1}'::jsonb;

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
     ('drones', 'guns', 'rockets', 'sprays', 'traps', 'balloons', 'mg', 'water', 'insurance', 'loan') then
    raise exception 'bad upgrade kind';
  end if;

  select coalesce((p.levels->>kind)::int, 1) into cur
    from profiles p where p.id = uid for update;
  if cur is null then raise exception 'no profile'; end if;
  -- у страховки потолок свой: пятый уровень покрывает потери целиком;
  -- у кредита — десятый: банк даёт до 100 000 и не больше
  if cur >= (case kind when 'insurance' then 5 when 'loan' then 10 else 11 end) then
    raise exception 'already at max level';
  end if;
  cost := price(case when kind = 'insurance' then 'insurance_upgrade' else 'upgrade' end)
          * (1 << ((cur - 1) * (case when kind = 'insurance' then 2 else 1 end)));

  update profiles
     set credits = profiles.credits - cost,
         levels = jsonb_set(profiles.levels, array[kind], to_jsonb(cur + 1))
   where profiles.id = uid and profiles.credits >= cost
   returning profiles.credits, profiles.levels into credits, levels;

  if not found then raise exception 'not enough credits'; end if;
  return next;
end;
$$;

create or replace function take_loan(amount int)
returns table (credits int, loan int, loan_due timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  top int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform settle_loan(uid);
  -- Потолок растёт прокачкой кредита: loan_max за каждый уровень, до десятого.
  select price('loan_max') * least(10, greatest(1, coalesce((p.levels->>'loan')::int, 1)))
    into top from profiles p where p.id = uid;
  if amount is null or amount < price('loan_min') or amount > top then
    -- Говорим суммой, а не 'bad amount': без цифр не понять, потолок
    -- это, порог или устаревшая на сервере цена.
    raise exception 'loan must be between % and %, asked %',
      price('loan_min'), top, amount;
  end if;
  if (select p.loan from profiles p where p.id = uid) > 0 then
    raise exception 'previous loan of % is not repaid',
      (select p.loan from profiles p where p.id = uid);
  end if;

  update profiles
     set credits = profiles.credits + amount,
         loan = amount + (amount * price('loan_rate')) / 100,
         loan_due = now() + (price('loan_hours') || ' hours')::interval
   where profiles.id = uid
   returning profiles.credits, profiles.loan, profiles.loan_due
   into credits, loan, loan_due;
  return next;
end;
$$;

create or replace function restart_game()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

  update bases
     set cells = starter_map(),
         guns = starter_guns(), drone_cells = '[]'::jsonb,
         intact_cells = price('free'), updated_at = now()
   where user_id = uid;

  update profiles
     set credits = price('start'),
         drones = 0,
         loan = 0,
         loan_due = null,
         founded = true,
         last_income_at = now(),
         competition_at = 1,
         competition_best = '{}'::jsonb,
         levels = '{"drones":1,"guns":1,"rockets":1,"sprays":1,"traps":1,"balloons":1,"scouts":1,"mg":1,"water":1,"insurance":1,"loan":1}'::jsonb,
         stats = '{"battles":0,"dronesKilled":0,"cellsBurned":0,"cellsRepaired":0,
                   "wipes":0,"raids":0,"looted":0}'::jsonb
   where id = uid;

  -- налёты, которые ждали старый склад, начинать сначала не должны
  delete from attacks where defender_id = uid and status = 'pending';
end;
$$;

commit;
