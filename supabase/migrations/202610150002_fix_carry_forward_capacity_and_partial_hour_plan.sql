CREATE OR REPLACE FUNCTION public.ensure_production_carry_forward(p_target_date date)
 RETURNS SETOF public.production_plans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  source_plan public.production_plans%rowtype;
  new_plan public.production_plans%rowtype;
  scanned_qty integer;
  pending_qty integer;
  source_hours integer;
  rate_per_hour integer;
  shift_capacity integer;
  candidate_start time;
  candidate_end time;
  target_date date;
  target_start time;
  hourly_payload jsonb;
  allocated_qty integer;
  remaining_qty integer;
  allocated_hours integer;
begin
  if p_target_date is null then raise exception 'Target production date is required'; end if;
  if coalesce((select private.custom_app_role()), '') not in ('planner','super_admin') then raise exception 'Only Planner or Super Admin can create carry-forward production plans'; end if;

  for source_plan in
    select p.* from public.production_plans p
    where p.production_date = p_target_date - 1
      and p.status <> 'cancelled'
      and p.carry_forward_plan_id is null
      and p.planned_qty > 0
    order by p.created_at
  loop
    select count(*) into scanned_qty
    from public.plan_serials ps
    where ps.plan_id = source_plan.id and ps.status = 'scanned';

    source_hours := greatest(1, floor(extract(epoch from (coalesce(source_plan.shift_end,time '18:00') - coalesce(source_plan.shift_start,time '09:00'))) / 3600)::integer);

    select greatest(1, coalesce(max(nullif((item->>'planned_qty')::integer,0)),0))
    into rate_per_hour
    from jsonb_array_elements(coalesce(source_plan.hourly_targets,'[]'::jsonb)) item;

    if coalesce(rate_per_hour,0) <= 0 then
      rate_per_hour := greatest(1, floor(coalesce(source_plan.shift_planned_qty,source_plan.planned_qty)::numeric / source_hours));
    end if;

    shift_capacity := rate_per_hour * source_hours;
    pending_qty := greatest(0, coalesce(source_plan.planned_qty,0) - greatest(scanned_qty,shift_capacity));
    if pending_qty = 0 then
      update public.production_plans set status = 'completed', carry_forward_qty = 0 where id = source_plan.id and status <> 'cancelled';
      continue;
    end if;

    target_date := p_target_date;
    target_start := coalesce(source_plan.shift_start,time '09:00');
    candidate_start := target_start;
    candidate_end := coalesce(source_plan.shift_end,time '18:00');

    loop
      exit when not exists (
        select 1 from public.production_plans p
        where p.production_date = target_date
          and p.production_line = source_plan.production_line
          and p.status <> 'cancelled'
          and p.shift_start is not null and p.shift_end is not null
          and candidate_start < p.shift_end and candidate_end > p.shift_start
      );
      target_date := target_date + 1;
    end loop;

    allocated_qty := least(pending_qty, shift_capacity);
    remaining_qty := greatest(0, pending_qty - allocated_qty);
    allocated_hours := greatest(1, least(source_hours, ceil(allocated_qty::numeric / rate_per_hour)::integer));

    hourly_payload := (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'hour', to_char(candidate_start + make_interval(hours=>g), 'HH24:MI'),
          'planned_qty', least(rate_per_hour, greatest(0, allocated_qty - rate_per_hour*g))
        ) order by g
      ), '[]'::jsonb)
      from generate_series(0, allocated_hours-1) g
    );

    insert into public.production_plans (
      production_date,product_name,model,production_line,planned_qty,status,brand,
      hourly_targets,shift_name,shift_start,shift_end,shift_planned_qty,manpower_count,
      carry_forward_from_plan_id,carry_forward_qty
    )
    values (
      target_date,source_plan.product_name,source_plan.model,source_plan.production_line,
      pending_qty,'draft',source_plan.brand,hourly_payload,
      coalesce(source_plan.shift_name,'Shift A'),target_start,candidate_end,
      shift_capacity,coalesce(source_plan.manpower_count,0),source_plan.id,remaining_qty
    )
    returning * into new_plan;

    update public.plan_serials set plan_id = new_plan.id where plan_id = source_plan.id and status = 'pending';
    update public.production_plans set status='completed', carry_forward_qty=pending_qty, carry_forward_plan_id=new_plan.id where id=source_plan.id;
    return next new_plan;
  end loop;
  return;
end;
$function$;
