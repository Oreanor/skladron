-- Разовая чистка: удалить все неотыгранные налёты и миссии. Комментарии под
-- ними уходят каскадом. Нападающим ничего не возвращается: дроны и доплата
-- за начинку пропадают вместе с налётом.
-- Выполнить в Supabase → SQL Editor. Отменить нельзя.

delete from attacks where status = 'pending';

-- должно быть 0
select count(*) as pending_left from attacks where status = 'pending';
