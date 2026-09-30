-- Версия боя 17: направление спирали выбирает нападающий (сторона волны:
-- чётная — по часовой, нечётная — против), а не случай.
-- Выполнить в Supabase → SQL Editor до деплоя клиента.

create or replace function sim_version() returns int
language sql immutable as $$ select 17 $$;

-- неотыгранные налёты играть новыми правилами можно — перештамповываем
update attacks
   set simulation_version = sim_version()
 where status = 'pending' and simulation_version <> sim_version();
