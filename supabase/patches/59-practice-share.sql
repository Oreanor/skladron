-- Тест налёта можно показать по ссылке /replay/<id>, как повтор боя.
-- Можно выполнять повторно.

-- ---------- тест налёта по ссылке ----------
-- Тест налёта идёт только у игрока в браузере, записи налёта у него нет.
-- Чтобы показать его другим, клиент кладёт сюда всё, что нужно повтору:
-- склад, заказ и запись рук. Денег это не касается, так что принимаем как
-- есть, только с потолком на размер и частоту.

create table if not exists practice_replays (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  replay jsonb not null,
  simulation_version int not null,
  created_at timestamptz not null default now()
);
create index if not exists practice_replays_owner_at on practice_replays (owner_id, created_at);
alter table practice_replays enable row level security;

create or replace function share_practice(replay jsonb, sim_version int)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); new_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(replay) <> 'object' then raise exception 'bad replay'; end if;
  if octet_length(replay::text) > 500000 then raise exception 'replay too large'; end if;
  if (select count(*) from practice_replays p
       where p.owner_id = uid and p.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too many shared tests';
  end if;
  insert into practice_replays (owner_id, replay, simulation_version)
    values (uid, replay, sim_version) returning id into new_id;
  return new_id;
end;
$$;

create or replace function public_practice(replay_id uuid)
returns table (owner text, replay jsonb, simulation_version int, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select coalesce(p.base_name, p.display_name, split_part(p.email, '@', 1)),
         r.replay, r.simulation_version, r.created_at
    from practice_replays r join profiles p on p.id = r.owner_id
   where r.id = replay_id;
$$;

revoke all on function share_practice(jsonb, int) from public, anon;
grant execute on function share_practice(jsonb, int) to authenticated;
grant execute on function public_practice(uuid) to anon, authenticated;
