-- Разовое начисление: +20000 кр игроку «Cuckoild» (ник или имя склада).
-- Только данные — схему и версию боя не меняет.
-- ВНИМАНИЕ: не повторять — каждый прогон начисляет заново. Если под имя
-- подходит не ровно один игрок, патч падает и ничего не меняет.

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
  update profiles set credits = credits + 20000 where id = uid;
  raise notice 'Cuckoild (%) получил 20000 кр', uid;
end;
$$;

select display_name, base_name, credits
  from profiles
 where base_name ilike 'Cuckoild' or display_name ilike 'Cuckoild';
