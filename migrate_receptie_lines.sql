-- Reception persistence: stores received quantities per order line

create table if not exists public.reception_lines (
  order_id bigint primary key references public.orders(id) on delete cascade,
  cantitate_primita integer not null default 0,
  checked_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create index if not exists reception_lines_checked_by_idx on public.reception_lines (checked_by);

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
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'pharmacist_admin'
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
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'pharmacist_admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'pharmacist_admin'
  )
);

create or replace function public.set_reception_lines_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_reception_lines_updated_at on public.reception_lines;
create trigger trg_set_reception_lines_updated_at
before update on public.reception_lines
for each row
execute function public.set_reception_lines_updated_at();
