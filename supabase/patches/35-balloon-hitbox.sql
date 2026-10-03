-- Версия боя 29: тело дрона у шаров — как нарисовано, а не вдвое меньше.
-- Выполнить в Supabase → SQL Editor до деплоя клиента (после 34-го).
-- Повторно не прогонять, если версия к тому времени выше 29.

create or replace function sim_version() returns int
language sql immutable as $$ select 29 $$;

-- неотыгранные налёты играть новыми правилами можно — перештамповываем
update attacks
   set simulation_version = sim_version(),
       resolving_token = null,
       resolving_at = null
 where status = 'pending';
