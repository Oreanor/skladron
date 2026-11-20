-- Налёт, который снимают не боем, возвращает нападающему его цену.
--
-- «Начать сначала» у защитника стирало все неотыгранные налёты на него, а
-- нападающий терял и дронов, и доплату за начинку — молча, налёт просто
-- пропадал из журнала. Теперь перед удалением ему возвращается ровно
-- списанное при запуске: дроны по цене его уровня на тот момент (он
-- записан в налёте) и доплата за начинку по той же цене.
--
-- Возврат кредитами, а не дронами: ящики на складе раскладывает клиент, и
-- сервер не знает, куда положить тысячу дронов.
--
-- Уже удалённым налётам это не поможет — их строк больше нет.
-- Можно выполнять повторно.

begin;

-- Сколько стоил налёт нападающему при запуске.
create or replace function raid_price(a attacks) returns int
language sql immutable as $$
  select a.drones * price_at('drone', a.drone_level)
       + waves_surcharge(a.waves, price_at('drone', a.drone_level));
$$;

-- Вернуть нападающим цену неотыгранных налётов на этого игрока и удалить их.
-- Миссии (налёт на самого себя) бесплатны — их просто удаляем.
create or replace function drop_pending_raids(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a attacks;
begin
  for a in
    select * from attacks
     where defender_id = uid and status = 'pending'
     for update
  loop
    if a.competition_stage is null and a.attacker_id <> uid then
      update profiles set credits = credits + raid_price(a) where id = a.attacker_id;
    end if;
    delete from attacks where id = a.id;
  end loop;
end;
$$;
revoke execute on function drop_pending_raids(uuid) from public, anon, authenticated;

create or replace function restart_game()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

  update bases
     set cells = starter_map(),
         guns = starter_guns(), drone_cells = '[]'::jsonb,
         intact_cells = price('free'), updated_at = now()
   where user_id = uid;

  update profiles
     set credits = price('start'),
         drones = 0,
         loan = 0,
         loan_due = null,
         founded = true,
         last_income_at = now(),
         competition_at = 1,
         competition_best = '{}'::jsonb,
         levels = '{"drones":1,"guns":1,"rockets":1,"sprays":1,"traps":1,"balloons":1,"scouts":1,"mg":1,"water":1,"insurance":1,"loan":1}'::jsonb,
         stats = '{"battles":0,"dronesKilled":0,"cellsBurned":0,"cellsRepaired":0,
                   "wipes":0,"raids":0,"looted":0}'::jsonb
   where id = uid;

  -- Налёты, которые ждали старый склад, начинать сначала не должны. Но и
  -- нападающий не должен терять их: цена возвращается ему.
  perform drop_pending_raids(uid);
end;
$$;

commit;
