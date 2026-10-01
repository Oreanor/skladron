-- Версия боя 19: ракета держит одну цель на весь полёт. Потеряла её —
-- не ищет другую, а летит прямо и уходит с поля. Раньше ракета, пока на
-- поле был хоть один дрон, кого-нибудь да убивала.
-- Выполнить в Supabase → SQL Editor до деплоя клиента (вместо
-- patches/11-rocket-range.sql или после него — версия в обоих одна, 19).

create or replace function sim_version() returns int
language sql immutable as $$ select 19 $$;

-- неотыгранные налёты играть новыми правилами можно — перештамповываем
update attacks
   set simulation_version = sim_version(),
       resolving_token = null,
       resolving_at = null
 where status = 'pending';
