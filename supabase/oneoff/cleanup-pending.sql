-- Разовая чистка: удалить все неотыгранные налёты и миссии. Комментарии под
-- ними уходят каскадом. Нападающим возвращается цена налёта кредитами —
-- дроны и доплата за начинку (raid_price, патч 60).
-- Выполнить в Supabase → SQL Editor целиком. Отменить нельзя.

begin;

update profiles p
   set credits = p.credits + s.total
  from (select a.attacker_id, sum(raid_price(a)) as total
          from attacks a
         where a.status = 'pending'
           and a.competition_stage is null
           and a.attacker_id <> a.defender_id
         group by a.attacker_id) s
 where p.id = s.attacker_id;

delete from attacks where status = 'pending';

commit;

-- должно быть 0
select count(*) as pending_left from attacks where status = 'pending';
