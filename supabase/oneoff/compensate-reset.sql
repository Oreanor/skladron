-- Компенсация после случайного запуска oneoff/reset.sql (2026-11-14):
--   * всем игрокам +100000 кр;
--   * игроку «Cuckoild» (ник или имя склада) — кампания до миссии №91:
--     номера 1–90 пройдены на 100%, 91-й — текущий.
--
-- ВНИМАНИЕ: не повторять — каждый прогон начисляет деньги заново.
-- Если под «Cuckoild» подходит не ровно один игрок, скрипт падает и
-- ничего не меняет (ни деньги, ни миссии).
-- Выполнить в Supabase → SQL Editor целиком.

do $$
declare
  n int;
  uid uuid;
begin
  select count(*), min(id::text)::uuid into n, uid
    from profiles
   where base_name ilike 'Cuckoild' or display_name ilike 'Cuckoild';
  if n <> 1 then
    raise exception 'Cuckoild: найдено игроков — %, нужен ровно один', n;
  end if;

  update profiles set credits = credits + 100000;

  -- Рекорды без id боя: повтора у них нет, но уровень игрока и открытые
  -- номера считаются по ним. 100% — переигрывать ради премии смысла нет.
  update profiles
     set competition_at = 91,
         competition_best = (
           select jsonb_object_agg(s::text, jsonb_build_object(
                    'score', 100, 'pct', 100, 'area', price('free')))
             from generate_series(1, 90) s)
   where id = uid;

  raise notice 'всем +100000 кр; Cuckoild (%) — миссия №91', uid;
end;
$$;

select display_name, base_name, credits, competition_at,
       player_level(competition_best) as level
  from profiles
 order by credits desc;
