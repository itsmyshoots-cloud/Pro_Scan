-- Monthly production planning and serial-number pool.
-- Monthly plans own the serial pool; daily/shift plans will consume from this pool in the next phase.

create table if not exists public.monthly_production_plans (
  id uuid primary key default gen_random_uuid(),
  plan_month date not null,
  brand text not null,
  product_name text not null,
  model text not null,
  mrp numeric(12,2) not null default 0,
  total_qty integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_production_plans_month_check check (extract(day from plan_month) = 1),
  constraint monthly_production_plans_qty_check check (total_qty >= 0),
  constraint monthly_production_plans_mrp_check check (mrp >= 0),
  constraint monthly_production_plans_status_check check (status in ('active','closed','cancelled'))
);

create table if not exists public.monthly_plan_serials (
  id uuid primary key default gen_random_uuid(),
  monthly_plan_id uuid not null references public.monthly_production_plans(id) on delete cascade,
  label_number text not null,
  serial_number text not null,
  sequence_no integer not null,
  created_at timestamptz not null default now()
);

create unique index if not exists monthly_plan_serials_serial_unique
  on public.monthly_plan_serials (serial_number);
create unique index if not exists monthly_plan_serials_label_unique
  on public.monthly_plan_serials (label_number);
create unique index if not exists monthly_production_plan_model_month_unique
  on public.monthly_production_plans (plan_month, brand, model);
create index if not exists monthly_plan_serials_plan_idx
  on public.monthly_plan_serials (monthly_plan_id, sequence_no);

alter table public.monthly_production_plans enable row level security;
alter table public.monthly_plan_serials enable row level security;

grant select, insert, update on public.monthly_production_plans to anon, authenticated;
grant select, insert on public.monthly_plan_serials to anon, authenticated;

drop policy if exists "custom role read monthly plans" on public.monthly_production_plans;
create policy "custom role read monthly plans"
on public.monthly_production_plans for select to anon, authenticated
using (private.custom_app_role() in ('operator','planner','super_admin'));

drop policy if exists "custom management insert monthly plans" on public.monthly_production_plans;
create policy "custom management insert monthly plans"
on public.monthly_production_plans for insert to anon, authenticated
with check (private.custom_app_role() in ('planner','super_admin'));

drop policy if exists "custom management update monthly plans" on public.monthly_production_plans;
create policy "custom management update monthly plans"
on public.monthly_production_plans for update to anon, authenticated
using (private.custom_app_role() in ('planner','super_admin'))
with check (private.custom_app_role() in ('planner','super_admin'));

drop policy if exists "custom role read monthly serials" on public.monthly_plan_serials;
create policy "custom role read monthly serials"
on public.monthly_plan_serials for select to anon, authenticated
using (private.custom_app_role() in ('operator','planner','super_admin'));

drop policy if exists "custom management insert monthly serials" on public.monthly_plan_serials;
create policy "custom management insert monthly serials"
on public.monthly_plan_serials for insert to anon, authenticated
with check (private.custom_app_role() in ('planner','super_admin'));

create or replace function public.touch_monthly_production_plan()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_monthly_production_plan on public.monthly_production_plans;
create trigger touch_monthly_production_plan
before update on public.monthly_production_plans
for each row execute function public.touch_monthly_production_plan();

-- Keep the parent quantity synchronized with the actual unique serial pool.
create or replace function public.sync_monthly_plan_quantity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.monthly_plan_id, old.monthly_plan_id);
  update public.monthly_production_plans
  set total_qty = (select count(*) from public.monthly_plan_serials where monthly_plan_id = target_id),
      updated_at = now()
  where id = target_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_monthly_plan_quantity on public.monthly_plan_serials;
create trigger sync_monthly_plan_quantity
after insert or update or delete on public.monthly_plan_serials
for each row execute function public.sync_monthly_plan_quantity();

revoke all on function public.touch_monthly_production_plan() from public;
grant execute on function public.touch_monthly_production_plan() to anon, authenticated;
revoke all on function public.sync_monthly_plan_quantity() from public;
grant execute on function public.sync_monthly_plan_quantity() to anon, authenticated;
