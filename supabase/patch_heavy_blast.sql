-- Версия симуляции 16: сбитая взрывчатка рвётся крестом, дроны больше не
-- исчезают с поля, а падают и разбиваются.
-- Выполнить в Supabase → SQL Editor после деплоя клиента.

create or replace function sim_version() returns int
language sql immutable as $$ select 16 $$;

-- Неотыгранные налёты играть новыми правилами можно — перештамповываем,
-- иначе очередь запрётся на первом же из них.
update attacks
   set simulation_version = sim_version()
 where status = 'pending'
   and (simulation_version is null or simulation_version <> sim_version());
