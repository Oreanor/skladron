-- Просмотр и тестирование отправленных налётов; частичное погашение кредита.
-- Выполнить до деплоя клиента. Можно выполнять повторно.

create or replace function outgoing_raid(attack_id uuid)
returns table (id uuid, "targetEmail" text, "targetName" text, waves jsonb,
  opener text, "droneLevel" int, "unitCost" int, surcharge int)
language sql security definer set search_path = public as $$
  select a.id, p.email, coalesce(p.base_name, p.display_name, split_part(p.email, '@', 1)),
    a.waves, coalesce((select c.body from battle_comments c
      where c.attack_id = a.id and c.author_id = a.attacker_id order by c.created_at limit 1), ''),
    a.drone_level, price_at('drone', a.drone_level), waves_surcharge(a.waves, price_at('drone', a.drone_level))
  from attacks a join profiles p on p.id = a.defender_id
  where a.id = attack_id and a.attacker_id = auth.uid() and a.competition_stage is null;
$$;

-- Старый вызов без аргументов оставляем совместимым: погасить весь долг.
create or replace function repay_loan(amount int)
returns table (credits int, loan int)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); owed int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select p.loan into owed from profiles p where p.id = uid for update;
  if coalesce(owed, 0) <= 0 then raise exception 'nothing to repay'; end if;
  if amount is null or amount < 1 or amount > owed then raise exception 'bad repayment amount'; end if;
  update profiles set credits = profiles.credits - amount, loan = profiles.loan - amount,
    loan_due = case when profiles.loan = amount then null else profiles.loan_due end
    where profiles.id = uid and profiles.credits >= amount
    returning profiles.credits, profiles.loan into credits, loan;
  if not found then raise exception 'not enough credits'; end if;
  return next;
end;
$$;

revoke all on function outgoing_raid(uuid), repay_loan(int) from public, anon;
grant execute on function outgoing_raid(uuid), repay_loan(int) to authenticated;
