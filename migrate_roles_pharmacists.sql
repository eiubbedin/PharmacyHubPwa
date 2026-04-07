-- Roles: split pharmacists into admin vs staff
-- NOTE: run this in Supabase SQL editor

-- 0) Allow new roles in profiles.role
alter table public.profiles
drop constraint if exists profiles_role_check;

alter table public.profiles
add constraint profiles_role_check
check (role in ('pharmacist', 'pharmacist_admin', 'pharmacist_staff', 'department'));

-- 1) Ensure existing pharmacists become admin by default
update public.profiles
set role = 'pharmacist_admin'
where role = 'pharmacist';

-- 2) Assign explicit roles by email
update public.profiles p
set role = 'pharmacist_admin'
from auth.users u
where u.id = p.user_id
  and lower(u.email) = lower('eiubbedin@icloud.com');

update public.profiles p
set role = 'pharmacist_staff'
from auth.users u
where u.id = p.user_id
  and lower(u.email) = lower('eiubmihaela@heliofarm.ro');

-- 3) Enforce final allowed roles (optional, but recommended)
alter table public.profiles
drop constraint if exists profiles_role_check;

alter table public.profiles
add constraint profiles_role_check
check (role in ('pharmacist_admin', 'pharmacist_staff', 'department'));

-- 4) Reception policies: allow only pharmacist_admin
alter table public.reception_lines enable row level security;

drop policy if exists reception_lines_select_pharmacists on public.reception_lines;
drop policy if exists reception_lines_select_pharmacist_admin on public.reception_lines;
create policy reception_lines_select_pharmacist_admin
on public.reception_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles pr
    where pr.user_id = auth.uid()
      and pr.role = 'pharmacist_admin'
  )
);

drop policy if exists reception_lines_upsert_pharmacists on public.reception_lines;
drop policy if exists reception_lines_upsert_pharmacist_admin on public.reception_lines;
create policy reception_lines_upsert_pharmacist_admin
on public.reception_lines
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles pr
    where pr.user_id = auth.uid()
      and pr.role = 'pharmacist_admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles pr
    where pr.user_id = auth.uid()
      and pr.role = 'pharmacist_admin'
  )
);
