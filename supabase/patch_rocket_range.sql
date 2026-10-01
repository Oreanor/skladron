-- Версия боя 19 (с ракетой, что держит одну цель): ракетница бьёт не дальше зенитки (было вдвое дальше, и
-- подавитель до неё не дотягивался — ответа у нападающего не было).
-- Выполнить в Supabase → SQL Editor до деплоя клиента.

create or replace function sim_version() returns int
language sql immutable as $$ select 19 $$;

-- неотыгранные налёты играть новыми правилами можно — перештамповываем
update attacks
   set simulation_version = sim_version(),
       resolving_token = null,
       resolving_at = null
 where status = 'pending';
