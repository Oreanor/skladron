-- Версия боя 23: у огнетушителя больше нет бака — он на водопроводе и
-- льёт, сколько нужно.
-- Выполнить в Supabase → SQL Editor до деплоя клиента (можно вместо
-- 15-gun-turret.sql, если тот ещё не выполнен).
-- Повторно не прогонять, если версия к тому времени выше 23.

create or replace function sim_version() returns int
language sql immutable as $$ select 23 $$;

-- неотыгранные налёты играть новыми правилами можно — перештамповываем
update attacks
   set simulation_version = sim_version(),
       resolving_token = null,
       resolving_at = null
 where status = 'pending';
