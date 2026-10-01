-- Версия боя 22: зенитка стреляет, только довернув ствол на точку
-- упреждения, а башня у неё вдвое медленнее (2 рад/с).
-- Выполнить в Supabase → SQL Editor до деплоя клиента (можно вместо
-- 13-gun-shell-speed.sql и 14-gun-lead.sql, если они ещё не выполнены).
-- Повторно не прогонять, если версия к тому времени выше 22.

create or replace function sim_version() returns int
language sql immutable as $$ select 22 $$;

-- неотыгранные налёты играть новыми правилами можно — перештамповываем
update attacks
   set simulation_version = sim_version(),
       resolving_token = null,
       resolving_at = null
 where status = 'pending';
