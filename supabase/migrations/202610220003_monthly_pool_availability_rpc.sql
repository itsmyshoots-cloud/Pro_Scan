-- Read-only helper used by the Daily Production Plan UI.
-- A monthly serial is available when it has not been reserved by a production plan.

create or replace function public.get_monthly_plan_available_qty(p_monthly_plan_id uuid)
returns integer
language sql
security definer
set search_path = public, private
as $$
  select count(*)::integer
  from public.monthly_plan_serials mps
  where mps.monthly_plan_id = p_monthly_plan_id
    and not exists (
      select 1
      from public.plan_serials ps
      where ps.monthly_plan_serial_id = mps.id
         or ps.serial_number = mps.serial_number
    );
$$;

revoke all on function public.get_monthly_plan_available_qty(uuid) from public;
grant execute on function public.get_monthly_plan_available_qty(uuid) to anon, authenticated;
