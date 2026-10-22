-- Daily production planning consumes serials from the monthly production pool.
-- No serial PDF is uploaded during daily planning and no automatic carry-forward is created.

alter table public.production_plans
  add column if not exists monthly_plan_id uuid references public.monthly_production_plans(id),
  add column if not exists planned_manpower_count integer not null default 0,
  add column if not exists break_minutes integer not null default 0,
  add column if not exists planner_notes text;

alter table public.production_plans
  drop constraint if exists production_plans_planned_manpower_check,
  drop constraint if exists production_plans_break_minutes_check;

alter table public.production_plans
  add constraint production_plans_planned_manpower_check check (planned_manpower_count >= 0),
  add constraint production_plans_break_minutes_check check (break_minutes >= 0 and break_minutes <= 720);

create index if not exists production_plans_monthly_plan_idx
  on public.production_plans(monthly_plan_id, production_date);

alter table public.plan_serials
  add column if not exists monthly_plan_serial_id uuid references public.monthly_plan_serials(id);

create index if not exists plan_serials_monthly_plan_serial_idx
  on public.plan_serials(monthly_plan_serial_id);

-- Planner/super-admin can create a daily plan directly from the available monthly pool.
-- Available means the monthly serial has not already been allocated to any production plan.
create or replace function public.create_daily_production_plan_from_monthly(
  p_monthly_plan_id uuid,
  p_production_date date,
  p_production_line text,
  p_shift_name text,
  p_shift_start time,
  p_shift_end time,
  p_break_minutes integer,
  p_planned_qty integer,
  p_hourly_targets jsonb,
  p_planned_manpower_count integer,
  p_actual_manpower_count integer,
  p_notes text
)
returns public.production_plans
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  source_plan public.monthly_production_plans%rowtype;
  new_plan public.production_plans%rowtype;
  available_count integer;
  hourly_total integer;
  productive_minutes integer;
begin
  if coalesce(private.custom_app_role(),'') not in ('planner','super_admin') then
    raise exception 'Only Planner or Super Admin can create daily production plans';
  end if;

  select * into source_plan
  from public.monthly_production_plans
  where id = p_monthly_plan_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Monthly production plan was not found or is not active';
  end if;

  if p_production_date is null then
    raise exception 'Production date is required';
  end if;
  if nullif(btrim(coalesce(p_production_line,'')),'') is null then
    raise exception 'Production line is required';
  end if;
  if p_shift_start is null or p_shift_end is null or p_shift_end <= p_shift_start then
    raise exception 'Shift start and end times are invalid';
  end if;
  if coalesce(p_break_minutes,0) < 0 or coalesce(p_break_minutes,0) > 720 then
    raise exception 'Break minutes are invalid';
  end if;
  productive_minutes := floor(extract(epoch from (p_shift_end - p_shift_start)) / 60)::integer - coalesce(p_break_minutes,0);
  if productive_minutes < 60 then
    raise exception 'Shift must have at least 60 productive minutes after break time';
  end if;
  if p_planned_qty is null or p_planned_qty < 1 then
    raise exception 'Daily planned quantity must be at least one';
  end if;
  if coalesce(p_planned_manpower_count,0) < 0 or coalesce(p_actual_manpower_count,0) < 0 then
    raise exception 'Manpower values cannot be negative';
  end if;
  if jsonb_typeof(p_hourly_targets) <> 'array' or jsonb_array_length(p_hourly_targets) = 0 then
    raise exception 'At least one hourly production target is required';
  end if;

  select coalesce(sum((value->>'planned_qty')::integer),0)
  into hourly_total
  from jsonb_array_elements(p_hourly_targets) value;

  if hourly_total <> p_planned_qty then
    raise exception 'Hourly targets must total the daily planned quantity';
  end if;

  select count(*)
  into available_count
  from public.monthly_plan_serials mps
  where mps.monthly_plan_id = source_plan.id
    and not exists (
      select 1 from public.plan_serials ps
      where ps.monthly_plan_serial_id = mps.id
         or ps.serial_number = mps.serial_number
    );

  if p_planned_qty > available_count then
    raise exception 'Daily planned quantity % exceeds available monthly serials %', p_planned_qty, available_count;
  end if;

  if exists (
    select 1 from public.production_plans p
    where p.production_date = p_production_date
      and p.production_line = btrim(p_production_line)
      and p.status <> 'cancelled'
      and coalesce(p.shift_start,time '00:00') < p_shift_end
      and coalesce(p.shift_end,time '00:00') > p_shift_start
  ) then
    raise exception 'This production line already has an overlapping production plan for the selected time';
  end if;

  insert into public.production_plans (
    production_date, product_name, model, production_line, planned_qty,
    status, brand, hourly_targets, shift_name, shift_start, shift_end,
    shift_planned_qty, manpower_count, monthly_plan_id,
    planned_manpower_count, break_minutes, planner_notes,
    carry_forward_from_plan_id, carry_forward_qty, carry_forward_plan_id
  ) values (
    p_production_date, source_plan.product_name, source_plan.model,
    btrim(p_production_line), p_planned_qty, 'draft', source_plan.brand,
    p_hourly_targets, coalesce(nullif(btrim(p_shift_name),''),'Shift A'),
    p_shift_start, p_shift_end, p_planned_qty,
    coalesce(p_actual_manpower_count,0), source_plan.id,
    coalesce(p_planned_manpower_count,0), coalesce(p_break_minutes,0),
    nullif(btrim(coalesce(p_notes,'')),''), null, 0, null
  ) returning * into new_plan;

  insert into public.plan_serials (
    plan_id, monthly_plan_serial_id, label_number, serial_number, sequence_no, status
  )
  select
    new_plan.id, mps.id, mps.label_number, mps.serial_number,
    row_number() over(order by mps.sequence_no)::integer, 'pending'
  from public.monthly_plan_serials mps
  where mps.monthly_plan_id = source_plan.id
    and not exists (
      select 1 from public.plan_serials ps
      where ps.monthly_plan_serial_id = mps.id
         or ps.serial_number = mps.serial_number
    )
  order by mps.sequence_no
  limit p_planned_qty;

  if (select count(*) from public.plan_serials where plan_id = new_plan.id) <> p_planned_qty then
    delete from public.plan_serials where plan_id = new_plan.id;
    delete from public.production_plans where id = new_plan.id;
    raise exception 'Could not allocate the requested monthly serials atomically';
  end if;

  return new_plan;
end;
$$;

revoke all on function public.create_daily_production_plan_from_monthly(uuid,date,text,text,time,time,integer,integer,jsonb,integer,integer,text) from public;
grant execute on function public.create_daily_production_plan_from_monthly(uuid,date,text,text,time,time,integer,integer,jsonb,integer,integer,text) to anon, authenticated;
