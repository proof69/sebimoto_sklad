-- Nový režim: každý aktivní přihlášený uživatel má plný přístup k zakázkám.
-- Spusťte po 202610060001_initial.sql. Existující zakázky se nemění ani nemažou.
begin;

alter table public.profiles alter column role set default 'ADMIN'::public.app_role;

-- Nově vytvořené Auth účty automaticky získají profil. Metadata slouží jen pro
-- zobrazované jméno, nikdy pro rozhodování o oprávněních či aktivitě účtu.
create or replace function private.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(split_part(new.email, '@', 1), ''), 'Uživatel'
    ), 120),
    'ADMIN'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.create_profile_for_user() from public, anon, authenticated;
drop trigger if exists create_app_profile on auth.users;
create trigger create_app_profile after insert on auth.users
for each row execute function private.create_profile_for_user();

-- Doplní i existující účet bez profilu (včetně prvního přihlašovaného uživatele).
-- Zachová existující jména a deaktivace. Manuální přidělení role už není potřeba.
insert into public.profiles (id, display_name, role)
select u.id,
  left(coalesce(
    nullif(btrim(u.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(u.email, '@', 1), ''), 'Uživatel'
  ), 120),
  'ADMIN'::public.app_role
from auth.users u
where not coalesce(u.is_anonymous, false)
on conflict (id) do update set role = 'ADMIN'::public.app_role;

-- Historický sloupec role zůstává pro kompatibilitu, ale nerozlišuje oprávnění.
-- Všichni aktivní neanonymní uživatelé mají stejný přístup; deaktivace platí dál.
create or replace function public.current_role()
returns public.app_role language sql stable security definer set search_path = ''
as $$
  select 'ADMIN'::public.app_role
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = (select auth.uid()) and p.is_active and not coalesce(u.is_anonymous, false);
$$;
revoke all on function public.current_role() from public, anon;
grant execute on function public.current_role() to authenticated;

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
revoke all on public.profiles, public.orders from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.orders to authenticated;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.current_role()) is not null);

drop policy if exists orders_read on public.orders;
drop policy if exists orders_admin_insert on public.orders;
drop policy if exists orders_admin_update on public.orders;
drop policy if exists orders_admin_delete on public.orders;
drop policy if exists orders_authenticated_insert on public.orders;
drop policy if exists orders_authenticated_update on public.orders;
drop policy if exists orders_authenticated_delete on public.orders;

create policy orders_read on public.orders for select to authenticated
using ((select public.current_role()) is not null);
create policy orders_authenticated_insert on public.orders for insert to authenticated
with check ((select public.current_role()) is not null);
create policy orders_authenticated_update on public.orders for update to authenticated
using ((select public.current_role()) is not null)
with check ((select public.current_role()) is not null);
create policy orders_authenticated_delete on public.orders for delete to authenticated
using ((select public.current_role()) is not null);

create or replace function private.guard_order()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or (select public.current_role()) is null then
    raise exception 'Active signed-in account required' using errcode = '42501';
  end if;
  new.order_number := btrim(new.order_number);
  new.customer := btrim(new.customer);
  if new.created_at > clock_timestamp() then
    raise exception 'Creation time cannot be in the future' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := actor;
    if new.status = 'shipped' then
      new.shipped_at := clock_timestamp();
      new.shipped_by := actor;
    else
      new.shipped_at := null;
      new.shipped_by := null;
    end if;
  else
    new.id := old.id;
    new.created_by := old.created_by;
    if new.status = 'shipped' and old.status = 'pending' then
      new.shipped_at := clock_timestamp();
      new.shipped_by := actor;
    elsif new.status = 'pending' then
      new.shipped_at := null;
      new.shipped_by := null;
    else
      new.shipped_at := old.shipped_at;
      new.shipped_by := old.shipped_by;
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.guard_order() from public, anon, authenticated;

-- ship_order, audit, timestampy a ochrana proti dvojímu odeslání zůstávají aktivní.
commit;
