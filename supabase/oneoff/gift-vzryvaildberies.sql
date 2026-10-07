-- Разовый подарок: +1 000 000 кредитов складу «Взрывайлдбериес».
-- Выполнить в Supabase → SQL Editor один раз: повторный запуск подарит ещё раз.

update profiles
   set credits = credits + 1000000
 where lower(email) = 'sanchezzzgg22@gmail.com'
returning base_name, credits;
