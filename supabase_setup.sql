-- NEW, SEPARATE SUPABASE PROJECT ONLY. Run once in SQL Editor.
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','alex','ivan','sergey'))
);
create table if not exists public.appointments (
 id uuid primary key default gen_random_uuid(),
 car text not null,
 client text not null default '', phone text not null default '',
 work text not null default '', note text not null default '',
 master_id text not null check(master_id in ('alex','ivan','sergey')),
 start_at timestamp without time zone not null,
 end_at timestamp without time zone not null,
 service_end date not null,
 status text not null default 'planned' check(status in ('planned','work','ready','cancelled')),
 color text not null default '#4b8cff',
 created_at timestamptz not null default now(),
 constraint valid_work_range check(end_at > start_at),
 constraint valid_service_range check(service_end >= start_at::date)
);
create index if not exists appointments_start_idx on public.appointments(start_at);
alter table public.profiles enable row level security;
alter table public.appointments enable row level security;
-- Role is read from DB, not from a user-editable browser setting.
create or replace function public.my_garage_role() returns text
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = (select auth.uid()) $$;
revoke all on function public.my_garage_role() from public;
grant execute on function public.my_garage_role() to authenticated;
drop policy if exists profile_self_read on public.profiles;
create policy profile_self_read on public.profiles for select to authenticated using (id = (select auth.uid()));
-- No browser inserts/updates of profiles. Assign roles manually in SQL Editor.
drop policy if exists appointments_read on public.appointments;
drop policy if exists appointments_insert on public.appointments;
drop policy if exists appointments_update on public.appointments;
drop policy if exists appointments_delete on public.appointments;
create policy appointments_read on public.appointments for select to authenticated
 using (public.my_garage_role() = 'owner' or master_id = public.my_garage_role());
create policy appointments_insert on public.appointments for insert to authenticated
 with check (public.my_garage_role() = 'owner' or master_id = public.my_garage_role());
create policy appointments_update on public.appointments for update to authenticated
 using (public.my_garage_role() = 'owner' or master_id = public.my_garage_role())
 with check (public.my_garage_role() = 'owner' or master_id = public.my_garage_role());
create policy appointments_delete on public.appointments for delete to authenticated
 using (public.my_garage_role() = 'owner' or master_id = public.my_garage_role());
do $$ begin
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='appointments') then
  alter publication supabase_realtime add table public.appointments;
 end if;
end $$;
-- After creating users in Authentication > Users, assign roles with their actual emails:
-- insert into public.profiles(id,role)
-- select id, 'owner' from auth.users where email='owner@example.com'
-- on conflict (id) do update set role=excluded.role;
-- Repeat with 'alex', 'ivan', 'sergey' for the three master accounts.
