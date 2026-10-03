-- Ещё шесть языков: украинский, польский, турецкий, китайский, японский,
-- корейский. Бот пишет игроку на выбранном в игре языке. Версию боя не
-- меняет.
-- Выполнить в Supabase → SQL Editor до деплоя клиента. Можно прогнать повторно.

create or replace function set_locale(l text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if l not in ('ru', 'en', 'es', 'pt', 'fr', 'de', 'it', 'uk', 'pl', 'tr', 'zh', 'ja', 'ko') then raise exception 'bad locale'; end if;
  update profiles set locale = l where id = auth.uid();
end;
$$;

grant execute on function set_locale to authenticated;
