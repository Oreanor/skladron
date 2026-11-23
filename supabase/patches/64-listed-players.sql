-- «Показывать всех» в панели врагов и отказ от налёта незнакомца.
--
-- Открытый игрок (profiles.listed) видит всех открытых, даже незнакомых, и
-- они его; ближайшие по силе склада (upgrade_power) — сверху. Добавленный из
-- этого списка — обычный друг, только налёт от него защитник вправе
-- отклонить (decline_raid): налёт снимается, цена возвращается нападающему,
-- а у того в журнале он остаётся отклонённым.
--
-- Выполнять после 63-raid-retake.sql и до деплоя клиента. Можно выполнять
-- повторно.

alter table profiles add column if not exists listed boolean not null default false;

alter table attacks drop constraint if exists attacks_status_check;
alter table attacks add constraint attacks_status_check
  check (status in ('pending', 'resolved', 'declined'));

-- Сила склада: сколько боевых уровней прокачано сверх стартовых. Страховка
-- и кредит в бою не помогают и в силу не идут. Тот же список — POWER_KINDS
-- на клиенте.
create or replace function upgrade_power(levels jsonb) returns int
language sql immutable as $$
  select coalesce(sum(greatest(0, coalesce((levels ->> k)::int, 1) - 1)), 0)::int
    from unnest(array['drones', 'guns', 'rockets', 'sprays', 'traps',
                      'nets', 'balloons', 'mg', 'water']) as k;
$$;

-- Кто с кем познакомился, когда оба были открыты всем («показывать всех»):
-- кто добавил — кого. Налёт от такого знакомого защитник вправе отклонить —
-- незнакомец мог прийти просто за лёгкой добычей. Пишет add_rival.
create table if not exists listed_met (
  player uuid not null references profiles on delete cascade,
  other uuid not null references profiles on delete cascade,
  primary key (player, other)
);
alter table listed_met enable row level security;
revoke all on table listed_met from anon, authenticated;

-- Познакомились ли двое через общий список, кто бы кого ни добавил.
create or replace function strangers(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from listed_met m
                  where (m.player = a and m.other = b) or (m.player = b and m.other = a));
$$;

-- «Показывать всех»: открыться всем открытым или закрыться.
create or replace function set_listed(value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update profiles set listed = coalesce(value, false) where id = auth.uid();
end;
$$;

-- Открытые игроки — только тому, кто открыт сам: видят друг друга лишь те,
-- кто согласился быть на виду. Ближайшие по силе — сверху; уже знакомых нет.
-- Добавленный из списка — такой же друг, как по почте.
create or replace function listed_players()
returns table (email text, name text, avatar text, level int, power int)
language sql security definer set search_path = public stable as $$
  select p.email,
         coalesce(p.base_name, p.display_name, split_part(p.email, '@', 1)),
         p.avatar,
         player_level(p.competition_best),
         upgrade_power(p.levels)
    from profiles p
    join profiles me on me.id = auth.uid() and me.listed
   where p.listed and p.founded and p.id <> me.id
     and not exists (select 1 from jsonb_array_elements(me.enemies) e
                      where lower(e->>'email') = lower(p.email))
   order by abs(upgrade_power(p.levels) - upgrade_power(me.levels)), p.created_at
   limit 50;
$$;

create or replace function add_rival(target_email text)
returns table (email text, name text)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  me profiles;
  target profiles;
  card jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select p.* into me from profiles p where p.id = uid;
  select p.* into target
    from profiles p where lower(p.email) = lower(btrim(target_email)) limit 1;
  if not found then raise exception 'player with this email has not joined yet'; end if;
  if target.id = uid then raise exception 'cannot add yourself'; end if;

  -- Оба открыты всем и прежде знакомы не были — значит, нашли друг друга в
  -- общем списке: запоминаем, налёт от такого можно отклонить.
  if me.listed and target.listed
     and not exists (select 1 from jsonb_array_elements(target.enemies) e
                      where lower(e->>'email') = lower(me.email))
     and not exists (select 1 from jsonb_array_elements(me.enemies) e
                      where lower(e->>'email') = lower(target.email)) then
    insert into listed_met (player, other) values (uid, target.id) on conflict do nothing;
  end if;

  -- карточка знакомства: склад придёт с разведки, счёт вражды — с боёв
  card := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', coalesce(me.base_name, me.display_name, split_part(me.email, '@', 1)),
    'email', me.email,
    'cells', '',
    'guns', '[]'::jsonb,
    'depots', '[]'::jsonb,
    'burnedByMe', 0,
    'burnedByThem', 0,
    'lastRaidAt', 0
  );

  update profiles
     set enemies = profiles.enemies || card
   where profiles.id = target.id
     and not exists (
       select 1 from jsonb_array_elements(profiles.enemies) e
        where lower(e->>'email') = lower(me.email)
     );

  email := target.email;
  name := coalesce(target.base_name, target.display_name, split_part(target.email, '@', 1));
  return next;
end;
$$;

-- decline_raid теперь отвечает, отменено ли знакомство
drop function if exists decline_raid(uuid);

-- Отклонить налёт знакомого через общий список. Нападающему — его цена, как
-- у снятого без боя; в его журнале налёт остаётся отклонённым. Если это был
-- первый же налёт между вами, знакомство не состоялось: оба пропадают из
-- списков врагов друг друга. Отдаёт true, если знакомство отменено.
create or replace function decline_raid(attack_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  a attacks;
  first_raid boolean;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into a from attacks
   where id = attack_id and defender_id = uid and status = 'pending'
     and resolving_token is null
   for update;
  if not found then raise exception 'raid not found'; end if;
  if a.attacker_id = uid or not strangers(uid, a.attacker_id) then
    raise exception 'only raids from strangers can be declined';
  end if;

  first_raid := not exists (
    select 1 from attacks b
     where b.id <> a.id and b.status <> 'pending'
       and ((b.attacker_id = uid and b.defender_id = a.attacker_id)
         or (b.attacker_id = a.attacker_id and b.defender_id = uid)));

  update profiles set credits = credits + raid_price(a) where id = a.attacker_id;
  update attacks set status = 'declined', resolved_at = now() where id = a.id;

  if first_raid then
    update profiles me
       set enemies = coalesce((select jsonb_agg(e) from jsonb_array_elements(me.enemies) e
                                where lower(e->>'email') <> lower(other.email)), '[]'::jsonb)
      from profiles other
     where (me.id = uid and other.id = a.attacker_id)
        or (me.id = a.attacker_id and other.id = uid);
    delete from listed_met m
     where (m.player = uid and m.other = a.attacker_id)
        or (m.player = a.attacker_id and m.other = uid);
  end if;
  return first_raid;
end;
$$;

-- у очереди и журнала поменялся состав колонок
drop function if exists pending_attacks();
drop function if exists raid_log();

create or replace function pending_attacks()
returns table (
  id uuid, from_name text, created_at timestamptz, activated_at timestamptz,
  drones int, pattern text, direction int, seed int, waves jsonb, drone_level int,
  simulation_version int,
  from_email text,
  avatar text,
  opener text,
  competition_stage int,
  retake_of uuid,
  declinable boolean
)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  head uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- Часы идут только у первой атаки в очереди: пропускать нельзя, а у тех,
  -- что ждут позади, время ещё не начиналось. Отметку ставим при первой же
  -- выдаче списка — это и есть «первый показ». Налёт на самого себя (миссия,
  -- переигровка) в очередь не встаёт: его играют сразу, и часов ему не нужно.
  select a.id into head
    from attacks a
   where a.defender_id = uid and a.status = 'pending'
     and a.attacker_id <> a.defender_id
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
           a.waves, a.drone_level, a.simulation_version, p.email, p.avatar,
           (select c.body
              from battle_comments c
             where c.attack_id = a.id and c.author_id = a.attacker_id
             order by c.created_at
             limit 1),
           a.competition_stage,
           a.retake_of,
           -- от знакомого через общий список налёт можно отклонить
           a.attacker_id <> uid and strangers(uid, a.attacker_id)
      from attacks a
      -- у переигровки «напал» тот, кто прислал исходный налёт
      left join attacks src on src.id = a.retake_of
      join profiles p on p.id = coalesce(src.attacker_id, a.attacker_id)
     where a.defender_id = uid and a.status = 'pending'
     order by a.created_at;
end;
$$;

create or replace function raid_log()
returns table (
  id uuid, side text, foe text, foe_email text, at timestamptz, pending boolean,
  drones int, loot int, destroyed boolean, burned int, burned_pct int, has_replay boolean,
  retake_best int, declined boolean
)
language sql security definer set search_path = public stable as $$
  -- Свои налёты видны и до боя: защитник ещё не отбивался, показывать
  -- нечего, но знать, что рой в пути, полезно. Почта второй стороны — чтобы
  -- по нику в журнале открыть его карточку: имя склада не уникально.
  select a.id,
         case when a.attacker_id = auth.uid() then 'attack' else 'defence' end,
         case
           when a.attacker_id = auth.uid()
             then coalesce(d.base_name, d.display_name, split_part(d.email, '@', 1))
           else coalesce(t.base_name, t.display_name, split_part(t.email, '@', 1))
         end,
         case when a.attacker_id = auth.uid() then d.email else t.email end,
         coalesce(a.resolved_at, a.created_at),
         a.status = 'pending',
         a.drones, a.loot, a.destroyed,
         coalesce((a.result->>'burned')::int, 0),
         -- какая доля склада сгорела: по ней видно, удачен ли налёт
         case when a.intact_before > 0
              then (coalesce((a.result->>'burned')::int, 0) * 100) / a.intact_before end,
         a.snap_cells is not null,
         a.retake_best,
         a.status = 'declined'
    from attacks a
    join profiles t on t.id = a.attacker_id
    join profiles d on d.id = a.defender_id
   -- налётов на себя тут нет: у миссий свой журнал, переигровка — счёт в исходном бою
   where a.attacker_id <> a.defender_id
     and not (auth.uid() = any (a.hidden_by))
     and (
       (a.attacker_id = auth.uid() and a.status in ('pending', 'resolved', 'declined'))
       or (a.defender_id = auth.uid() and a.status = 'resolved')
     )
   order by coalesce(a.resolved_at, a.created_at) desc
   limit 30;
$$;

grant execute on function set_listed, listed_players, decline_raid, pending_attacks, raid_log to authenticated;

notify pgrst, 'reload schema';
