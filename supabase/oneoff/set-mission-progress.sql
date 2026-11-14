-- Выставить игроку прогресс кампании: миссии 1..N пройдены, текущая — N+1,
-- уровень игрока (player_level) становится N.
--
-- Пройденным номерам без рекорда ставится 100% без повтора: переигрывать их
-- ради премии смысла нет. Уже записанные рекорды до N остаются (кроме
-- нулевых: такой номер не засчитан). Рекорды дальше N стираются — иначе они
-- не дали бы премии за новые номера. Прогресс ставится ровно на N, в том
-- числе если игрок был дальше.
-- Склад, кредиты, уровни и журнал не трогаем. Можно выполнять повторно.
--
-- Почту и N поменять на нужные. Выполнить в Supabase → SQL Editor целиком.

with target as (
  select 'player@example.com'::text as email, 33 as n
)
update profiles p
   set competition_at = t.n + 1,
       competition_best = (
         select coalesce(jsonb_object_agg(s::text,
                  case when (p.competition_best -> s::text ->> 'score')::int > 0
                       then p.competition_best -> s::text
                       else jsonb_build_object('score', 100, 'pct', 100, 'area', price('free')) end),
                  '{}'::jsonb)
           from generate_series(1, t.n) s)
  from target t
 where lower(p.email) = lower(t.email)
returning p.base_name, p.competition_at, player_level(p.competition_best) as level;
