-- Подушка после вайпа, премия за отбой, заём до 10 000.
-- Выполнить в Supabase SQL Editor на живой базе.

create or replace function price(kind text) returns int
language sql immutable as $$
  select case kind
    when 'cell'   then 10
    when 'repair' then 5
    when 'scrap'  then 5
    when 'gun'    then 100
    when 'spray'  then 150
    when 'trap'   then 200
    when 'refund' then 50
    when 'drones' then 1000
    when 'drone'  then 25
    when 'income' then 10
    when 'sale'   then 2
    when 'loot'   then 50
    when 'insure_cell'  then 5
    when 'insure_step'  then 25
    when 'free'   then 25
    when 'found'  then 25
    when 'upgrade' then 5000
    when 'price_step' then 10
    when 'loan_min'   then 1000
    when 'loan_max'   then 10000
    when 'loan_rate'  then 10
    when 'loan_hours' then 24
    when 'max_raid' then 500
    when 'start'    then 10000
    when 'defend_clean' then 15
    when 'defend_dirty' then 6
    when 'defend_burn'  then 8
    when 'queued'   then 3
    when 'pay_plain'  then 0
    when 'pay_heavy'  then 50
    when 'pay_jammer' then 40
    when 'pay_foamer' then 30
  end;
$$;

create or replace function wipe_base()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

  update bases
     set cells = starter_map(),
         guns = '[]'::jsonb, drone_cells = '[]'::jsonb,
         intact_cells = price('free'), updated_at = now()
   where user_id = uid;

  update profiles
     set credits = greatest(profiles.credits, price('start')),
         drones = 0, founded = false, last_income_at = now(),
         stats = jsonb_set(stats, '{wipes}', to_jsonb((stats->>'wipes')::int + 1))
   where id = uid;
end;
$$;

create or replace function apply_battle_for(
  player uuid, new_cells text, new_guns jsonb, new_depots jsonb, result jsonb
)
returns table (credits int, intact int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := player;
  bin bytea := rle_decode(new_cells);
  cur bytea;
  cur_guns jsonb;
  cur_depots jsonb;
  i int;
  old_v int;
  new_v int;
  intact_now int := 0;
  burned int := 0;
  killed int;
  depots_lost int;
  payout int;
  cover int;
  drones_sent int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if octet_length(bin) <> 10000 then raise exception 'bad map size'; end if;

  select b.cells, b.guns, b.drone_cells into cur, cur_guns, cur_depots
    from bases b where b.user_id = uid for update;
  if cur is null then raise exception 'no base'; end if;

  cur_depots := normalize_depots(cur_depots);
  new_depots := normalize_depots(new_depots);

  for i in 0..9999 loop
    old_v := get_byte(cur, i);
    new_v := get_byte(bin, i);
    if old_v = 1 then
      if new_v = 1 then
        intact_now := intact_now + 1;
      elsif new_v = 3 then
        burned := burned + 1;
      else
        raise exception 'bad battle transition at cell %', i;
      end if;
    elsif old_v in (2, 3) then
      if new_v <> 3 then raise exception 'battle may not repair cell %', i; end if;
    elsif old_v = 4 then
      if new_v <> 0 then raise exception 'bad scorch transition at cell %', i; end if;
    elsif new_v <> 0 then
      raise exception 'battle may not build at cell %', i;
    end if;
  end loop;

  if not battle_guns_valid(cur_guns, new_guns, bin, new_depots) then
    raise exception 'battle may only remove existing guns';
  end if;
  if not battle_depots_valid(cur_depots, new_depots, bin, new_guns) then
    raise exception 'battle may only remove existing depots';
  end if;

  killed := coalesce((result->>'killedByGuns')::int, 0)
          + coalesce((result->>'killedByMg')::int, 0);
  if killed < 0 or killed > 100000 then
    raise exception 'bad killed drone count';
  end if;
  if burned <> coalesce((result->>'burned')::int, -1) then
    raise exception 'burned cell count does not match map';
  end if;

  update bases
     set cells = bin, guns = new_guns, drone_cells = new_depots,
         intact_cells = intact_now, updated_at = now()
   where user_id = uid;

  depots_lost := greatest(0, depot_value(cur_depots) - depot_value(new_depots));
  select least(100, greatest(0, coalesce((p.levels->>'insurance')::int, 1) - 1)
                     * price('insure_step'))
    into cover
    from profiles p where p.id = uid;
  payout := burned * price('insure_cell')
          + ((depots_lost
              + greatest(0, gun_count(cur_guns, 'gun') - gun_count(new_guns, 'gun'))
                * price('gun')
              + greatest(0, gun_count(cur_guns, 'spray') - gun_count(new_guns, 'spray'))
                * price('spray')
              + greatest(0, gun_count(cur_guns, 'trap') - gun_count(new_guns, 'trap'))
                * price('trap')) * cover) / 100;

  drones_sent := greatest(0, coalesce((result->>'dronesSent')::int, 0));
  if burned = 0 then
    payout := payout + drones_sent * price('defend_clean');
  else
    payout := payout + greatest(
      0,
      drones_sent * price('defend_dirty') - burned * price('defend_burn')
    );
  end if;

  update profiles
     set drones = depot_sum(new_depots),
         credits = profiles.credits + payout,
         stats = profiles.stats
       || jsonb_build_object(
            'battles', (profiles.stats->>'battles')::int + 1,
            'dronesKilled', (profiles.stats->>'dronesKilled')::int + killed,
            'cellsBurned', (profiles.stats->>'cellsBurned')::int + burned)
   where profiles.id = uid
   returning profiles.credits into credits;

  intact := intact_now;
  return next;
end;
$$;
