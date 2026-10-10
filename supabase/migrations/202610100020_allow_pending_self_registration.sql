alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users
  add constraint app_users_role_check
  check (role = any (array['pending','super_admin','planner','operator']));

-- Pro Scan no longer uses one-time setup codes.
update public.app_users
set setup_token_hash = null, updated_at = now()
where setup_token_hash is not null;
