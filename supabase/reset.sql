-- Сброс прогресса ВСЕХ игроков. Разовая операция, отменить её нельзя.
--
-- Выполнять руками в Supabase → SQL Editor, целиком. В schema.sql этому
-- скрипту делать нечего: схему прогоняют после каждой правки, и сброс
-- срабатывал бы каждый раз.
--
-- Что остаётся: аккаунты, имена складов, списки соперников.
-- Что обнуляется: деньги, площадь, пушки, контейнеры, уровни, статистика,
-- очередь налётов и их история.

begin;

-- Склады — обратно к стартовому пятачку в центре.
update bases
   set cells = starter_map(),
       guns = '[]'::jsonb,
       drone_cells = '[]'::jsonb,
       intact_cells = 25,
       updated_at = now();

-- Кошельки, прокачка и счётчики — как у новичка.
update profiles
   set credits = 10000,
       drones = 0,
       founded = true,
       last_income_at = now(),
       levels = '{"drones":1,"guns":1,"scouts":1,"mg":1,"water":1}'::jsonb,
       stats = '{"battles":0,"dronesKilled":0,"cellsBurned":0,"cellsRepaired":0,
                 "wipes":0,"raids":0,"looted":0}'::jsonb;

-- Налёты, ждавшие старые склады, и отчёты по ним больше ни о чём не говорят.
delete from attacks;

-- Сколько игроков затронуто.
select count(*) as players_reset from profiles;

commit;
