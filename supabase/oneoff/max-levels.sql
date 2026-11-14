-- Прокачать игроку все улучшения до потолка: страховку до 5, остальное до 11
-- (те же потолки, что в upgrade() и maxLevel на клиенте). Денег не берёт.
-- Прочие ключи в levels не трогаем. Можно выполнять повторно.
--
-- Игрок ищется по нику или имени склада. Если подходит не ровно один,
-- скрипт падает и ничего не меняет.
-- Ник поменять на нужный. Выполнить в Supabase → SQL Editor целиком.

do $$
declare
  who text := 'Cuckoild';
  n int;
  uid uuid;
begin
  select count(*), min(id::text)::uuid into n, uid
    from profiles
   where base_name ilike who or display_name ilike who;
  if n <> 1 then
    raise exception '%: найдено игроков — %, нужен ровно один', who, n;
  end if;

  update profiles
     set levels = levels || '{"drones":11,"guns":11,"rockets":11,"sprays":11,"traps":11,
                              "balloons":11,"mg":11,"water":11,"insurance":5,"loan":11}'::jsonb
   where id = uid;

  raise notice '% (%) — всё на максимуме', who, uid;
end;
$$;

select display_name, base_name, levels
  from profiles
 where base_name ilike 'Cuckoild' or display_name ilike 'Cuckoild';
