-- Неотыгранные налёты и миссии — на нынешнюю версию боя (17), с них же
-- снимаем зависшие заявки на расчёт. Бой по налёту чужой версии сервер не
-- засчитывал, и налёт возвращался в очередь: его приходилось переигрывать.
-- Состав волн и зерно остаются — просто играется он по нынешним правилам.
-- Выполнить в Supabase → SQL Editor. Прогонять повторно можно.

create or replace function sim_version() returns int
language sql immutable as $$ select 17 $$;

update attacks
   set simulation_version = sim_version(),
       resolving_token = null,
       resolving_at = null
 where status = 'pending';

-- что осталось в очереди и на какой версии: всё должно быть на 17
select simulation_version, count(*) from attacks where status = 'pending' group by 1;
