-- Разовая сшивка знакомств: если ты кого-то добавил, а он тебя нет —
-- добавляем тебя ему. Дальше это делает сама игра (add_rival в schema.sql),
-- так что скрипт нужен только для тех, кто добавлялся раньше.
--
-- Выполнять руками в Supabase → SQL Editor, целиком. Ничего не удаляет:
-- только дописывает недостающие карточки.

begin;

with links as (
  -- кто у кого записан
  select p.id as owner_id, lower(e->>'email') as mail
    from profiles p, jsonb_array_elements(p.enemies) e
   where e->>'email' is not null
),
cards as (
  -- карточки, которых не хватает у второй стороны; сразу пачкой на каждого
  select l.mail,
         jsonb_agg(
           jsonb_build_object(
             'id', gen_random_uuid()::text,
             'name', coalesce(o.base_name, o.display_name, split_part(o.email, '@', 1)),
             'email', o.email,
             'cells', '',
             'guns', '[]'::jsonb,
             'depots', '[]'::jsonb,
             'burnedByMe', 0,
             'burnedByThem', 0,
             'lastRaidAt', 0
           )
         ) as add
    from links l
    join profiles o on o.id = l.owner_id
    join profiles t on lower(t.email) = l.mail
   where o.id <> t.id
     and not exists (
       select 1 from jsonb_array_elements(t.enemies) x
        where lower(x->>'email') = lower(o.email)
     )
   group by l.mail
)
update profiles t
   set enemies = t.enemies || c.add
  from cards c
 where lower(t.email) = c.mail;

-- у кого сколько соперников стало
select coalesce(base_name, email) as player,
       jsonb_array_length(enemies) as rivals
  from profiles
 order by rivals desc;

commit;
