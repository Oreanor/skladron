-- «Начать сначала» сбрасывает и миссии: кампания снова с первого номера,
-- лучшие счета обнуляются. Чертежи, соперники и журнал боёв остаются.
-- Можно выполнять повторно.

begin;

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
         levels = '{"drones":1,"guns":1,"rockets":1,"sprays":1,"traps":1,"balloons":1,"scouts":1,"mg":1,"water":1,"insurance":1}'::jsonb,
         stats = '{"battles":0,"dronesKilled":0,"cellsBurned":0,"cellsRepaired":0,
                   "wipes":0,"raids":0,"looted":0}'::jsonb
   where id = uid;

  -- налёты, которые ждали старый склад, начинать сначала не должны
  delete from attacks where defender_id = uid and status = 'pending';
end;
$$;

commit;
