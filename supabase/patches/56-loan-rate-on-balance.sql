-- Проценты за просроченный заём считать на остаток долга, а не на
-- изначальную сумму. Кто-то погасил часть вручную — на оставшуюся.
-- Выполнять до деплоя клиента. Повторное выполнение безопасно.

create or replace function settle_loan(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  prof profiles;
  pay int;
begin
  select * into prof from profiles where id = uid for update;
  if not found or prof.loan <= 0 then return; end if;
  if prof.loan_due is null or now() < prof.loan_due then return; end if;

  -- срок вышел: берём сколько есть
  pay := least(prof.loan, greatest(0, prof.credits));
  update profiles
     set credits = profiles.credits - pay,
         loan = profiles.loan - pay
    where profiles.id = uid;

  -- не хватило — долг растёт, срок едет дальше. Проценты на остаток.
  if prof.loan - pay > 0 then
    update profiles
       set loan = profiles.loan + ((profiles.loan - pay) * price('loan_rate')) / 100,
           loan_due = profiles.loan_due + (price('loan_hours') || ' hours')::interval
     where profiles.id = uid;
  else
    update profiles set loan_due = null where profiles.id = uid;
  end if;
end;
$$;

revoke all on function settle_loan(uuid) from public, anon;
grant execute on function settle_loan(uuid) to authenticated;