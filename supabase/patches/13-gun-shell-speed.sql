-- Версия боя 20: снаряд зенитки медленнее ракеты (12 против 20).
-- Выполнить в Supabase → SQL Editor до деплоя клиента. Повторно не
-- прогонять, если версия к тому времени выше 20.

create or replace function sim_version() returns int
language sql immutable as $$ select 20 $$;

-- неотыгранные налёты играть новыми правилами можно — перештамповываем
update attacks
   set simulation_version = sim_version(),
       resolving_token = null,
       resolving_at = null
 where status = 'pending';
