-- Расширить готовые аватарки до «1»…«80». Выполнить в Supabase SQL Editor на живой базе.

create or replace function set_avatar(value text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if value is not null
     and value !~ '^([1-9]|[1-7][0-9]|80)$'
     and value not like 'https://%/storage/v1/object/public/avatars/%' then
    raise exception 'bad avatar';
  end if;
  if value is not null and strpos(value, '?') > 0 then
    value := split_part(value, '?', 1);
  end if;
  update profiles set avatar = value where id = uid;
end;
$$;
