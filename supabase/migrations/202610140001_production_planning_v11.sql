-- Production planning v1.1: shift allocation, manpower and carry-forward support.

alter table public.production_plans
  add column if not exists shift_name text not null default 'Shift A',
  add column if not exists shift_start time,
  add column if not exists shift_end time,
  add column if not exists shift_planned_qty integer,
  add column if not exists manpower_count integer not null default 0,
  add column if not exists carry_forward_from_plan_id uuid references public.production_plans(id),
  add column if not exists carry_forward_qty integer not null default 0,
  add column if not exists carry_forward_plan_id uuid references public.production_plans(id);

-- Backfill the new shift fields from the existing hourly target JSON.
update public.production_plans
set
  shift_start = coalesce(shift_start, (select min((value->>'hour')::time) from jsonb_array_elements(coalesce(hourly_targets,'[]'::jsonb)) value)),
  shift_end = coalesce(shift_end, (select max((value->>'hour')::time) + interval '1 hour' from jsonb_array_elements(coalesce(hourly_targets,'[]'::jsonb)) value)),
  shift_planned_qty = coalesce(shift_planned_qty, planned_qty)
where shift_start is null or shift_end is null or shift_planned_qty is null;

update public.production_plans
set shift_start = coalesce(shift_start, time '09:00'),
    shift_end = coalesce(shift_end, time '18:00'),
    shift_planned_qty = coalesce(shift_planned_qty, planned_qty)
where shift_start is null or shift_end is null or shift_planned_qty is null;

alter table public.production_plans
  drop constraint if exists production_plans_shift_qty_check,
  drop constraint if exists production_plans_manpower_check;

alter table public.production_plans
  add constraint production_plans_shift_qty_check check (shift_planned_qty is null or shift_planned_qty >= 0),
  add constraint production_plans_manpower_check check (manpower_count >= 0);

create index if not exists production_plans_line_date_idx
  on public.production_plans (production_line, production_date, shift_start, shift_end);
create index if not exists production_plans_carry_forward_idx
  on public.production_plans (carry_forward_from_plan_id);
create index if not exists plan_serials_plan_status_idx
  on public.plan_serials (plan_id, status);

-- Creates the next-day carry-forward plan for unfinished quantities.
-- It is intentionally idempotent: a source plan is processed only once.
create or replace function public.ensure_production_carry_forward(p_target_date date)
returns setof public.production_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_plan public.production_plans%rowtype;
  new_plan public.production_plans%rowtype;
  scanned_qty integer;
  pending_qty integer;
  source_hours integer;
  actual_rate integer;
  planned_rate integer;
  rate_per_hour integer;
  needed_hours integer;
  candidate_start time;
  candidate_end time;
  occupied record;
  target_start time;
  target_end time;
  hourly_payload jsonb;
  source_pairs jsonb;
begin
  if p_target_date is null then
    raise exception 'Target production date is required';
  end if;

  if coalesce((select private.custom_app_role()), '') not in ('planner','super_admin') then
    raise exception 'Only Planner or Super Admin can create carry-forward production plans';
  end if;

  for source_plan in
    select p.*
    from public.production_plans p
    where p.production_date < p_target_date
      and p.status <> 'cancelled'
      and p.carry_forward_plan_id is null
      and p.planned_qty > 0
    order by p.production_date, p.created_at
  loop
    select count(*) into scanned_qty
    from public.plan_serials ps
    where ps.plan_id = source_plan.id and ps.status = 'scanned';

    pending_qty := greatest(0, coalesce(source_plan.planned_qty,0) - scanned_qty);
    if pending_qty = 0 then
      update public.production_plans
      set status = 'completed', carry_forward_qty = 0
      where id = source_plan.id and status <> 'cancelled';
      continue;
    end if;

    source_hours := greatest(1, floor(extract(epoch from (coalesce(source_plan.shift_end,time '18:00') - coalesce(source_plan.shift_start,time '09:00'))) / 3600)::integer);
    actual_rate := case when source_hours > 0 then floor(scanned_qty::numeric / source_hours) else 0 end;
    planned_rate := case when source_hours > 0 then floor(coalesce(source_plan.planned_qty,0)::numeric / source_hours) else 0 end;
    rate_per_hour := greatest(1, coalesce(nullif(actual_rate,0), nullif(planned_rate,0), 1));
    needed_hours := greatest(1, ceil(pending_qty::numeric / rate_per_hour)::integer);

    target_start := coalesce(source_plan.shift_start, time '09:00');
    target_end := coalesce(source_plan.shift_end, time '18:00');
    candidate_start := target_start;

    -- Find the first free block on the target date for this production line.
    for occupied in
      select p.shift_start, p.shift_end
      from public.production_plans p
      where p.production_date = p_target_date
        and p.production_line = source_plan.production_line
        and p.status <> 'cancelled'
        and p.shift_start is not null
        and p.shift_end is not null
      order by p.shift_start
    loop
      if candidate_start + make_interval(hours => needed_hours) <= occupied.shift_start then
        exit;
      end if;
      if candidate_start < occupied.shift_end then
        candidate_start := occupied.shift_end;
      end if;
    end loop;

    candidate_end := candidate_start + make_interval(hours => needed_hours);

    -- Keep carry-forward work on the first available block. If it crosses the
    -- original shift end, the stored shift simply expands to the required hours.
    hourly_payload := (
      select coalesce(jsonb_agg(jsonb_build_object(
        'hour', to_char(candidate_start + make_interval(hours => g), 'HH24:MI'),
        'planned_qty', case
          when g < needed_hours - 1 then rate_per_hour
          else greatest(0, pending_qty - rate_per_hour * (needed_hours - 1))
        end
      ) order by g), '[]'::jsonb)
      from generate_series(0, needed_hours - 1) g
    );

    select coalesce(jsonb_agg(jsonb_build_object(
      'label_number', ps.label_number,
      'serial_number', ps.serial_number
    ) order by ps.sequence_no), '[]'::jsonb)
    into source_pairs
    from public.plan_serials ps
    where ps.plan_id = source_plan.id and ps.status = 'pending';

    insert into public.production_plans (
      production_date, product_name, model, production_line, planned_qty,
      status, brand, hourly_targets, shift_name, shift_start, shift_end,
      shift_planned_qty, manpower_count, carry_forward_from_plan_id, carry_forward_qty
    ) values (
      p_target_date, source_plan.product_name, source_plan.model, source_plan.production_line,
      pending_qty, 'draft', source_plan.brand, hourly_payload,
      coalesce(source_plan.shift_name,'Shift A'), candidate_start, candidate_end,
      pending_qty, coalesce(source_plan.manpower_count,0), source_plan.id, pending_qty
    ) returning * into new_plan;

    update public.plan_serials
    set plan_id = new_plan.id
    where plan_id = source_plan.id and status = 'pending';

    update public.production_plans
    set status = 'completed', carry_forward_qty = pending_qty, carry_forward_plan_id = new_plan.id
    where id = source_plan.id;

    return next new_plan;
  end loop;

  return;
end;
$$;

revoke all on function public.ensure_production_carry_forward(date) from public;
grant execute on function public.ensure_production_carry_forward(date) to anon, authenticated;
