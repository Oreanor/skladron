-- Версия боя 24: у кольца вращение выбирает нападающий (по часовой,
-- против или без вращения), а не жребий.
-- Выполнить в Supabase → SQL Editor до деплоя клиента (можно вместо
-- 17-spray-mains.sql, если тот ещё не выполнен).
-- Повторно не прогонять, если версия к тому времени выше 24.

create or replace function sim_version() returns int
language sql immutable as $$ select 24 $$;

-- неотыгранные налёты играть новыми правилами можно — перештамповываем
update attacks
   set simulation_version = sim_version(),
       resolving_token = null,
       resolving_at = null
 where status = 'pending';
