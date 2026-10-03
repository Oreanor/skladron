-- Уровень игрока — номер последней пройденной миссии. Его видно в списке
-- врагов и в карточке соперника: base_names отдаёт его вместе с именем.
-- Версию боя не меняет.
-- Выполнить в Supabase → SQL Editor до деплоя клиента. Можно прогнать повторно.

drop function if exists base_names(text[]);
-- Уровень игрока — номер последней пройденной миссии: самой дальней, где
-- склад уцелел хоть сколько-то. Ничего не пройдено — ноль.
create or replace function player_level(best jsonb) returns int
language sql immutable as $$
  select coalesce(max(k::int), 0)
    from jsonb_each(coalesce(best, '{}'::jsonb)) as e(k, v)
   where coalesce((v->>'score')::int, 0) > 0;
$$;

create or replace function base_names(emails text[])
returns table (email text, name text, avatar text, level int)
language sql security definer set search_path = public as $$
  select p.email,
         coalesce(p.base_name, p.display_name, split_part(p.email, '@', 1)),
         p.avatar,
         player_level(p.competition_best)
    from profiles p
   where lower(p.email) = any (select lower(e) from unnest(emails) e);
$$;

grant execute on function base_names to authenticated;

notify pgrst, 'reload schema';
