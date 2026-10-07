-- Правка своего сообщения: в переписке с соперником и в обсуждении боя.
-- Клиент даёт править последнее своё (стрелка вверх в пустом поле, как
-- везде); сервер проверяет только, что сообщение твоё, и те же пределы,
-- что при отправке. Версию боя не меняет.
-- Выполнить в Supabase → SQL Editor ДО деплоя клиента. Можно прогнать повторно.

create or replace function edit_message(msg uuid, body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  note text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  note := left(btrim(coalesce(body, '')), 500);
  if note = '' then raise exception 'empty message'; end if;
  update rival_messages m set body = note where m.id = msg and m.from_id = uid;
  if not found then raise exception 'no such message'; end if;
end;
$$;

create or replace function edit_battle_comment(comment_id uuid, message text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  note text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  note := btrim(coalesce(message, ''));
  if note = '' then raise exception 'empty message'; end if;
  if length(note) > 500 then raise exception 'message too long'; end if;
  update battle_comments c set body = note where c.id = comment_id and c.author_id = uid;
  if not found then raise exception 'no such message'; end if;
end;
$$;

grant execute on function edit_message(uuid, text), edit_battle_comment(uuid, text) to authenticated;

notify pgrst, 'reload schema';
