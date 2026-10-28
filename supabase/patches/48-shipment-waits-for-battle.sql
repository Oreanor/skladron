-- Ночная отгрузка ждёт конца идущего боя: ящики не уезжают из-под горящего
-- склада, а бой не считается по уже пустому. Можно выполнять повторно.

begin;

alter table profiles add column if not exists battle_until timestamptz;

-- Защитник вошёл в бой: до его конца ночная отгрузка ждёт. Двадцать минут
-- с запасом: бой без игрока сам кончается за пятнадцать.
create or replace function begin_battle()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update profiles set battle_until = now() + interval '20 minutes' where id = auth.uid();
end;
$$;

grant execute on function begin_battle() to authenticated;

create or replace function collect_income_for(uid uuid)
returns table (credits_added int, days int, sold_drones int, sold_credits int)
language plpgsql security definer set search_path = public as $$
declare
  prof profiles;
  intact int;
  passed int;
  paid int;
  gain int;
  cur_depots jsonb;
  drones_out int;
  sale int;
begin
  perform settle_loan(uid);
  select * into prof from profiles where id = uid for update;
  if not found then raise exception 'no profile'; end if;

  -- Идёт бой — отгрузка ждёт его конца: что сгорит, то сгорит, остальное
  -- уедет после. Иначе ящики уезжали бы посреди боя, а бой потом считался
  -- бы по пустому складу.
  if prof.battle_until is not null and prof.battle_until > now() then
    return query select 0, 0, 0, 0;
    return;
  end if;

  select b.intact_cells, b.drone_cells
    into intact, cur_depots
    from bases b where b.user_id = uid for update;

  -- Смена — сутки: аренда и отгрузка приходят в полночь по Лондону.
  -- Сколько лондонских полуночей прошло с прошлой выплаты, столько и смен.
  passed := (now() at time zone 'Europe/London')::date
          - (prof.last_income_at at time zone 'Europe/London')::date;
  if passed <= 0 then
    return query select 0, 0, 0, 0;
    return;
  end if;

  -- Аренды с клеток нет: доход склада — только отгрузка того, что лежит.
  paid := passed;
  gain := 0;

  -- А раз в отгрузку склад продаёт всё, что на нём лежит, вдвое дороже
  -- закупки. Продаётся то, что есть сейчас, а не за каждые прошедшие сутки.
  -- Цену берём с учётом уровня, ту же, по какой товар и покупался: иначе
  -- прокачка съедала бы маржу — на десятом уровне дрон обходился в 47, а
  -- уходил за те же 50.
  drones_out := depot_sum_kind(cur_depots, 'basic');
  sale := (drones_out * price_at('drone', coalesce((prof.levels->>'drones')::int, 1))
          * price('sale')) / 100;

  update bases
     set drone_cells = '[]'::jsonb,
         updated_at = now()
   where user_id = uid and jsonb_array_length(drone_cells) > 0;

  update profiles
     set credits = credits + gain + sale,
         drones = 0,
         last_income_at = now()
   where id = uid;

  return query select gain + sale, paid, drones_out, sale;
end;
$$;

-- на случай, если патч 46 ещё не выполнялся: старая сигнатура мешала бы
drop function if exists apply_battle_for(uuid, text, jsonb, jsonb, jsonb);

create or replace function apply_battle_for(
  player uuid, new_cells text, new_guns jsonb, new_depots jsonb, result jsonb,
  -- Премию за отбой платить? Миссия платит её только за новый рекорд номера.
  pay_bounty boolean default true
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
          + coalesce((result->>'killedByMg')::int, 0)
          + coalesce((result->>'killedByBalloons')::int, 0);
  -- Здесь про размер роя ничего не известно: бой мог быть и с ботом, и с
  -- атакой, отправленной при прежнем потолке. Точную сверку с числом
  -- высланных дронов делает resolve_attack; тут — только защита от чуши.
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

  -- Страховку считаем по своим данным, а не по присланным: сожжённые клетки
  -- уже сверены с картой, а потери в товаре и пушках видны как разница между
  -- тем, что было, и тем, что осталось. Вне боя они не исчезают.
  depots_lost := greatest(0, depot_value(cur_depots) - depot_value(new_depots));
  -- Базовый полис покрывает только расчистку клеток, каждый следующий
  -- уровень добавляет четверть стоимости сгоревшего товара и пушек.
  select least(100, greatest(0, coalesce((p.levels->>'insurance')::int, 1) - 1)
                     * price('insure_step'))
    into cover
    from profiles p where p.id = uid;
  payout := burned * price('insure_cell')
          + ((depots_lost
              + greatest(0, gun_count(cur_guns, 'gun') - gun_count(new_guns, 'gun'))
                * price('gun')
              + greatest(0, gun_count(cur_guns, 'rocket') - gun_count(new_guns, 'rocket'))
                * price('rocket')
              + greatest(0, gun_count(cur_guns, 'spray') - gun_count(new_guns, 'spray'))
                * price('spray')
              + greatest(0, gun_count(cur_guns, 'trap') - gun_count(new_guns, 'trap'))
                * price('trap')) * cover) / 100;

  -- Премия за отбой: чистый платит лучше; сожжённые клетки съедают грязную ставку.
  -- Страховка выше платится всегда: она возмещает ущерб, а не награждает.
  drones_sent := greatest(0, coalesce((result->>'dronesSent')::int, 0));
  if not pay_bounty then
    null;
  elsif burned = 0 then
    payout := payout + drones_sent * price('defend_clean');
  else
    payout := payout + greatest(
      0,
      drones_sent * price('defend_dirty') - burned * price('defend_burn')
    );
  end if;

  -- За сбитых не платят: деньги приносит товар, а не стрельба. Зато
  -- погорельцу выплачивается страховка и премия за отбой.
  update profiles
     set drones = depot_sum_kind(new_depots, 'basic'),
         credits = profiles.credits + payout,
         battle_until = null,
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

revoke all on function collect_income_for(uuid) from public, anon, authenticated;
grant execute on function collect_income_for(uuid) to service_role;
revoke all on function apply_battle_for(uuid, text, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function apply_battle_for(uuid, text, jsonb, jsonb, jsonb, boolean) to service_role;

commit;

notify pgrst, 'reload schema';
