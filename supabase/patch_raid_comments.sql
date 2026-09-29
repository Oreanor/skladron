-- Комментарии к налёту: короткая записка при отправке, ответ перед боем, реплики после.
-- Таблица battle_comments уже есть; расширяем send_attack, pending_attacks и add_battle_comment.
--
-- Применить: Supabase → SQL Editor → этот файл целиком.

drop function if exists send_attack(text, jsonb, int);

create or replace function send_attack(
  target_email text,
  attack_waves jsonb,
  attack_seed int,
  opener text default null
) returns table (id uuid, depots jsonb, credits int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  target profiles;
  cur bytea;
  cur_guns jsonb;
  cur_depots jsonb;
  next_depots jsonb;
  order_id uuid;
  drone_count int;
  surcharge int;
  head jsonb;
  note text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform check_waves(attack_waves);
  drone_count := waves_drones(attack_waves);
  if drone_count < 1 or drone_count > price('max_raid') then
    raise exception 'bad drone count';
  end if;
  head := attack_waves -> 0;

  select p.* into target
    from profiles p
   where lower(p.email) = lower(btrim(target_email))
   limit 1;
  if not found then raise exception 'player with this email has not joined yet'; end if;
  if target.id = uid then raise exception 'cannot attack yourself'; end if;
  if not target.founded then raise exception 'target warehouse is not founded'; end if;

  if (select count(*) from attacks a
       where a.attacker_id = uid and a.defender_id = target.id
         and a.status = 'pending') >= price('queued') then
    raise exception 'too many raids already queued against this warehouse';
  end if;

  select b.cells, b.guns, b.drone_cells into cur, cur_guns, cur_depots
    from bases b where b.user_id = uid for update;
  if cur is null then raise exception 'no base'; end if;

  next_depots := take_from_depots(cur_depots, drone_count, 'basic');

  select waves_surcharge(
           attack_waves,
           price_at(price('drone'), coalesce((p.levels->>'drones')::int, 1))
         )
    into surcharge
    from profiles p where p.id = uid;

  update bases set drone_cells = next_depots, updated_at = now() where user_id = uid;
  update profiles
     set drones = depot_sum(next_depots),
         credits = profiles.credits - surcharge,
         stats = jsonb_set(stats, '{raids}', to_jsonb((stats->>'raids')::int + 1))
   where profiles.id = uid and profiles.credits >= surcharge
   returning profiles.credits into credits;

  if not found then raise exception 'not enough credits for these warheads'; end if;

  insert into attacks (
    attacker_id, defender_id, drones, pattern, direction, seed, waves,
    drone_level, simulation_version
  )
  values (uid, target.id, drone_count,
          head->>'pattern', coalesce((head->>'direction')::int, 0),
          attack_seed, attack_waves,
          (select coalesce((p.levels->>'drones')::int, 1) from profiles p where p.id = uid),
          3)
  returning attacks.id into order_id;
  note := left(btrim(coalesce(opener, '')), 500);
  if note <> '' then
    insert into battle_comments (attack_id, author_id, body)
    values (order_id, uid, note);
  end if;
  id := order_id;
  depots := next_depots;
  return next;
end;
$$;

create or replace function pending_attacks()
returns table (
  id uuid, from_name text, created_at timestamptz, activated_at timestamptz,
  drones int, pattern text, direction int, seed int, waves jsonb, drone_level int,
  simulation_version int,
  from_email text,
  opener text
)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  head uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select a.id into head
    from attacks a
   where a.defender_id = uid and a.status = 'pending'
   order by a.created_at
   limit 1;

  if head is not null then
    update attacks set activated_at = now()
     where attacks.id = head and attacks.activated_at is null;
  end if;

  return query
    select a.id,
           coalesce(p.base_name, p.display_name, split_part(p.email, '@', 1)),
           a.created_at, a.activated_at, a.drones, a.pattern, a.direction, a.seed,
           a.waves, a.drone_level, a.simulation_version, p.email,
           (select c.body
              from battle_comments c
             where c.attack_id = a.id and c.author_id = a.attacker_id
             order by c.created_at
             limit 1)
      from attacks a
      join profiles p on p.id = a.attacker_id
     where a.defender_id = uid and a.status = 'pending'
     order by a.created_at;
end;
$$;

create or replace function add_battle_comment(target uuid, message text)
returns table (id uuid, author text, body text, created_at timestamptz, mine boolean)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  fresh battle_comments;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from attacks a
     where a.id = target and (a.attacker_id = uid or a.defender_id = uid)
  ) then
    raise exception 'not a participant';
  end if;

  insert into battle_comments (attack_id, author_id, body)
  values (target, uid, btrim(message))
  returning * into fresh;

  select fresh.id,
         coalesce(p.base_name, p.display_name, split_part(p.email, '@', 1)),
         fresh.body, fresh.created_at, true
    into id, author, body, created_at, mine
    from profiles p where p.id = uid;
  return next;
end;
$$;
