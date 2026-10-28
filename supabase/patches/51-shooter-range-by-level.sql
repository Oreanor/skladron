-- Версия боя 30: стрелок стреляет с той же дистанции, что пушка того же
-- уровня (по уровню дронов), а не всегда с 10 клеток.
-- Выполнить в Supabase → SQL Editor до деплоя клиента — или сразу после:
-- до патча сервер не примет налёты новой версии.
-- Повторно не прогонять, если версия к тому времени выше 30.

create or replace function sim_version() returns int
language sql immutable as $$ select 30 $$;

-- неотыгранные налёты играть новыми правилами можно — перештамповываем
update attacks
   set simulation_version = sim_version(),
       resolving_token = null,
       resolving_at = null
 where status = 'pending';
