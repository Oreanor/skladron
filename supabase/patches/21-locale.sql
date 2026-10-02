-- Язык игрока на сервере: бот пишет в телеграм на языке игры, а не только
-- по-русски. Версию боя не меняет.
-- Выполнить в Supabase → SQL Editor до деплоя клиента. Можно прогнать повторно.

alter table profiles add column if not exists locale text;

-- Язык игрока: на нём бот пишет в телеграм. Клиент сообщает тот, что
-- выбран в игре, — при входе и при каждой смене.
create or replace function set_locale(l text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if l not in ('ru', 'en', 'es', 'pt', 'fr', 'de', 'it') then raise exception 'bad locale'; end if;
  update profiles set locale = l where id = auth.uid();
end;
$$;

grant execute on function set_locale to authenticated;

notify pgrst, 'reload schema';
