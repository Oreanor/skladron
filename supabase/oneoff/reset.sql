-- Сброс прогресса ВСЕХ игроков. Разовая операция, отменить её нельзя.
--
-- Выполнять руками в Supabase → SQL Editor, целиком. В schema.sql этому
-- скрипту делать нечего: схему прогоняют после каждой правки, и сброс
-- срабатывал бы каждый раз.
--
-- Что остаётся: аккаунты, имена складов, списки соперников.
-- Что обнуляется: деньги, долг, площадь, пушки, контейнеры, уровни,
-- статистика, миссии с рекордами, очередь налётов и их история.

-- Предохранитель: без него скрипт падает и ничего не меняет. Чтобы сбросить
-- всех, впиши в строку ниже СБРОСИТЬ ВСЕХ вместо пустой строки.
do $$
begin
  if '' <> 'СБРОСИТЬ ВСЕХ' then
    raise exception 'reset.sql: предохранитель не снят — никто не сброшен';
  end if;
end;
$$;

begin;

-- Склады — обратно к стартовому пятачку в центре.
update bases
   set cells = starter_map(),
       guns = starter_guns(),
       drone_cells = '[]'::jsonb,
       intact_cells = price('free'),
       updated_at = now();

-- Кошельки, прокачка и счётчики — как у новичка.
update profiles
   set credits = price('start'),
       drones = 0,
       founded = true,
       last_income_at = now(),
       loan = 0,
       loan_due = null,
       competition_at = 1,
       competition_best = '{}'::jsonb,
       levels = '{"drones":1,"guns":1,"rockets":1,"sprays":1,"traps":1,"balloons":1,"scouts":1,"mg":1,"water":1,"insurance":1,"loan":1}'::jsonb,
       stats = '{"battles":0,"dronesKilled":0,"cellsBurned":0,"cellsRepaired":0,
                 "wipes":0,"raids":0,"looted":0}'::jsonb;

-- Налёты, ждавшие старые склады, и отчёты по ним больше ни о чём не говорят.
delete from attacks;

-- Сколько игроков затронуто.
select count(*) as players_reset from profiles;

commit;
