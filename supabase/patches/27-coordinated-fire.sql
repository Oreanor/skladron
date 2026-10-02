-- Версия боя 28: зенитки и ракетницы бьют сообща — по цели, в которую уже
-- летит снаряд или ракета, другие не стреляют; промах снимает заявку.
-- Выполнить в Supabase → SQL Editor до деплоя клиента (после 26-го).
-- Повторно не прогонять, если версия к тому времени выше 28.

create or replace function sim_version() returns int
language sql immutable as $$ select 28 $$;

-- неотыгранные налёты играть новыми правилами можно — перештамповываем
update attacks
   set simulation_version = sim_version(),
       resolving_token = null,
       resolving_at = null
 where status = 'pending';
