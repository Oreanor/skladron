-- Откатить кампанию игрока до миссии №25: она снова текущая и не пройдена,
-- рекорды номеров с 25-го и дальше стираются. Склад, кредиты, чертежи и
-- журнал боёв не трогаем. Можно выполнять повторно.
-- Выполнить в Supabase → SQL Editor целиком.

update profiles
   set competition_at = 25,
       competition_best = coalesce((
         select jsonb_object_agg(k, v)
           from jsonb_each(competition_best) as e(k, v)
          where k::int < 25
       ), '{}'::jsonb)
 where lower(email) = 'oreanor@gmail.com'
returning base_name, competition_at, competition_best;
