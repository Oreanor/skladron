-- Стереть игроку рекорды миссий, оставшиеся от прошлой кампании.
--
-- Нужен после сброса, который не обнулил competition_best (старый
-- oneoff/reset.sql так и делал): номер снова открыт, но премии нет —
-- старый рекорд не перебить.
--
-- Уходят рекорды:
--   * номеров, до которых игрок в этой кампании ещё не дошёл
--     (номер >= competition_at);
--   * чей бой уже стёрт из журнала — значит, рекорд из прежней жизни.
-- Склад, кредиты, уровни и журнал не трогаем. Можно выполнять повторно.
--
-- Почту поменять на нужную. Выполнить в Supabase → SQL Editor целиком.

update profiles p
   set competition_best = coalesce((
         select jsonb_object_agg(k, v)
           from jsonb_each(p.competition_best) as e(k, v)
          where k::int < p.competition_at
            and exists (select 1 from attacks a
                         where a.id::text = v ->> 'id'
                           and a.defender_id = p.id)
       ), '{}'::jsonb)
 where lower(p.email) = lower('player@example.com')
returning p.base_name, p.competition_at, p.competition_best;
