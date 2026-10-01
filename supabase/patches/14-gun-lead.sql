-- Версия боя 21: снаряд зенитки неуправляемый — летит прямо, с упреждением,
-- и сбивает того, в кого попал.
-- Выполнить в Supabase → SQL Editor до деплоя клиента (можно вместо
-- 13-gun-shell-speed.sql, если тот ещё не выполнен). Повторно не прогонять,
-- если версия к тому времени выше 21.

create or replace function sim_version() returns int
language sql immutable as $$ select 21 $$;

-- неотыгранные налёты играть новыми правилами можно — перештамповываем
update attacks
   set simulation_version = sim_version(),
       resolving_token = null,
       resolving_at = null
 where status = 'pending';
