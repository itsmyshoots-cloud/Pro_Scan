-- Fix editing an existing Draft plan, including changing its production date.
-- PostgreSQL cannot combine jsonb_to_recordset() WITH ORDINALITY with a typed column-definition list.
-- Use jsonb_array_elements() WITH ORDINALITY and extract the JSON object fields instead.

create or replace function public.update_draft_production_plan(
  p_plan_id uuid,
  p_production_date date,
  p_brand text,
  p_product_name text,
  p_model text,
  p_production_line text,
  p_planned_qty integer,
  p_hourly_targets jsonb,
  p_serial_pairs jsonb,
  p_shift_name text,
  p_shift_start time,
  p_shift_end time,
  p_manpower_count integer
)
returns public.production_plans
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  existing_plan public.production_plans%rowtype;
  updated_plan public.production_plans%rowtype;
  pair_count integer;
  hourly_total integer;
begin
  if coalesce(private.custom_app_role(), '') not in ('planner', 'super_admin') then
    raise exception 'Only Planner or Super Admin can edit production plans';
  end if;

  select * into existing_plan
  from public.production_plans
  where id = p_plan_id
  for update;

  if not found then
    raise exception 'Production plan was not found';
  end if;

  if existing_plan.status <> 'draft' then
    raise exception 'Only Draft production plans can be edited';
  end if;

  if exists (
    select 1
    from public.plan_serials
    where plan_id = p_plan_id and status = 'scanned'
  ) then
    raise exception 'Draft plan has scanned serials';
  end if;

  if p_production_date is null
     or nullif(btrim(coalesce(p_product_name, '')), '') is null
     or nullif(btrim(coalesce(p_model, '')), '') is null
     or nullif(btrim(coalesce(p_production_line, '')), '') is null then
    raise exception 'Enter a production date, product, model, and line';
  end if;

  if p_shift_start is null or p_shift_end is null or p_shift_end <= p_shift_start then
    raise exception 'Shift start and end times are invalid';
  end if;

  if coalesce(p_manpower_count, 0) < 0 then
    raise exception 'Manpower cannot be negative';
  end if;

  if p_planned_qty is null or p_planned_qty < 1 then
    raise exception 'Planned quantity must be at least one';
  end if;

  if jsonb_typeof(p_serial_pairs) <> 'array'
     or jsonb_array_length(p_serial_pairs) <> p_planned_qty then
    raise exception 'Planned quantity must match the selected quantity entries';
  end if;

  pair_count := jsonb_array_length(p_serial_pairs);

  if exists (
    select 1
    from jsonb_to_recordset(p_serial_pairs) as pair(label_number text, serial_number text)
    where nullif(btrim(coalesce(pair.label_number, '')), '') is null
       or nullif(btrim(coalesce(pair.serial_number, '')), '') is null
  ) then
    raise exception 'Each quantity allocation needs a label and serial number';
  end if;

  if (
    select count(distinct upper(btrim(pair.label_number)))
    from jsonb_to_recordset(p_serial_pairs) as pair(label_number text, serial_number text)
  ) <> pair_count or (
    select count(distinct upper(btrim(pair.serial_number)))
    from jsonb_to_recordset(p_serial_pairs) as pair(label_number text, serial_number text)
  ) <> pair_count then
    raise exception 'Label and serial values must be unique';
  end if;

  if jsonb_typeof(p_hourly_targets) <> 'array' or jsonb_array_length(p_hourly_targets) = 0 then
    raise exception 'At least one hourly target is required';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_hourly_targets) as item(value)
    where coalesce(item.value->>'hour', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(item.value->>'planned_qty', '') !~ '^[0-9]+$'
  ) then
    raise exception 'Hourly targets contain invalid values';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_hourly_targets)
  ) <> (
    select count(distinct item.value->>'hour')
    from jsonb_array_elements(p_hourly_targets) as item(value)
  ) then
    raise exception 'Hourly target times must be unique';
  end if;

  select coalesce(sum((item.value->>'planned_qty')::integer), 0)
  into hourly_total
  from jsonb_array_elements(p_hourly_targets) as item(value);

  if hourly_total <> p_planned_qty then
    raise exception 'Hourly targets must total the planned quantity';
  end if;

  if exists (
    select 1
    from public.production_plans other_plan
    where other_plan.id <> p_plan_id
      and other_plan.production_date = p_production_date
      and other_plan.production_line = btrim(p_production_line)
      and other_plan.status <> 'cancelled'
      and coalesce(other_plan.shift_start, time '00:00') < p_shift_end
      and coalesce(other_plan.shift_end, time '00:00') > p_shift_start
  ) then
    raise exception 'This production line already has an overlapping production plan for the selected time';
  end if;

  if exists (
    select 1
    from public.plan_serials existing
    join jsonb_to_recordset(p_serial_pairs) as incoming(label_number text, serial_number text)
      on upper(btrim(existing.serial_number)) = upper(btrim(incoming.serial_number))
      or upper(btrim(existing.label_number)) = upper(btrim(incoming.label_number))
    where existing.plan_id <> p_plan_id
  ) then
    raise exception 'Serial or label is allocated to another plan';
  end if;

  if exists (
    select 1
    from public.serial_numbers registry
    join jsonb_to_recordset(p_serial_pairs) as incoming(label_number text, serial_number text)
      on upper(btrim(registry.serial_number)) = upper(btrim(incoming.serial_number))
    where not exists (
      select 1 from public.plan_serials own
      where own.plan_id = p_plan_id
        and upper(btrim(own.serial_number)) = upper(btrim(registry.serial_number))
    )
  ) then
    raise exception 'Serial exists in serial registry';
  end if;

  update public.production_plans
  set production_date = p_production_date,
      brand = coalesce(nullif(btrim(p_brand), ''), 'Unspecified'),
      product_name = btrim(p_product_name),
      model = btrim(p_model),
      production_line = btrim(p_production_line),
      planned_qty = p_planned_qty,
      hourly_targets = p_hourly_targets,
      shift_name = coalesce(nullif(btrim(p_shift_name), ''), 'Shift A'),
      shift_start = p_shift_start,
      shift_end = p_shift_end,
      shift_planned_qty = p_planned_qty,
      manpower_count = coalesce(p_manpower_count, 0)
  where id = p_plan_id and status = 'draft'
  returning * into updated_plan;

  if not found then
    raise exception 'Plan is no longer Draft';
  end if;

  delete from public.plan_serials where plan_id = p_plan_id;

  -- Rebuild the allocation in the same order as the form and restore monthly-pool
  -- references by matching each allocated serial to its Monthly Plan pool row.
  insert into public.plan_serials(
    plan_id, monthly_plan_serial_id, label_number, serial_number, sequence_no, status
  )
  select
    p_plan_id,
    monthly_match.id,
    btrim(pair.value->>'label_number'),
    btrim(pair.value->>'serial_number'),
    pair.ordinality::integer,
    'pending'
  from jsonb_array_elements(p_serial_pairs) with ordinality as pair(value, ordinality)
  left join lateral (
    select mps.id
    from public.monthly_plan_serials mps
    where upper(btrim(mps.serial_number)) = upper(btrim(pair.value->>'serial_number'))
    order by mps.sequence_no
    limit 1
  ) as monthly_match on true
  order by pair.ordinality;

  return updated_plan;
end;
$$;

revoke all on function public.update_draft_production_plan(
  uuid, date, text, text, text, text, integer, jsonb, jsonb, text, time, time, integer
) from public;

grant execute on function public.update_draft_production_plan(
  uuid, date, text, text, text, text, integer, jsonb, jsonb, text, time, time, integer
) to anon, authenticated;
