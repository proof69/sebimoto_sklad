-- Spusťte jednou v SQL Editoru nového Supabase projektu.
-- Role se přidělují výhradně důvěryhodným SQL administrátorem, nikdy klientem.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('ADMIN', 'SKLADNIK');
create type public.order_status as enum ('pending', 'shipped');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  role public.app_role not null,
  is_active boolean not null default true
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null check (length(btrim(order_number)) between 1 and 80),
  customer text not null check (length(btrim(customer)) between 1 and 200),
  note text not null default '' check (length(note) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  status public.order_status not null default 'pending',
  shipped_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  shipped_by uuid references public.profiles(id) on delete restrict,
  constraint shipping_consistency check (
    (status = 'pending' and shipped_at is null and shipped_by is null)
    or (status = 'shipped' and shipped_at is not null and shipped_by is not null and shipped_at >= created_at)
  )
);

create unique index orders_number_unique on public.orders (lower(btrim(order_number)));
create index orders_pending_age on public.orders (created_at, id) where status = 'pending';
create index orders_shipped_history on public.orders (shipped_at desc, id) where status = 'shipped';

-- Audit zůstává i po ručním smazání zakázky nebo návratu do čekajících.
-- Není vystaven přes veřejné API, správa a retence patří databázovému správci.
create table private.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_record jsonb,
  new_record jsonb
);
revoke all on private.order_events from public, anon, authenticated;

create function public.current_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active;
$$;
revoke all on function public.current_role() from public, anon;
grant execute on function public.current_role() to authenticated;

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
revoke all on public.profiles, public.orders from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.orders to authenticated;

-- Vlastní profil lze přečíst i po deaktivaci, aby UI vysvětlilo zablokovaný účet.
create policy profiles_read on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.current_role()) is not null);
-- Žádné INSERT / UPDATE / DELETE policies ani grants pro profily.

create policy orders_read on public.orders for select to authenticated
using ((select public.current_role()) in ('ADMIN', 'SKLADNIK'));
create policy orders_admin_insert on public.orders for insert to authenticated
with check ((select public.current_role()) = 'ADMIN');
create policy orders_admin_update on public.orders for update to authenticated
using ((select public.current_role()) = 'ADMIN')
with check ((select public.current_role()) = 'ADMIN');
create policy orders_admin_delete on public.orders for delete to authenticated
using ((select public.current_role()) = 'ADMIN');

-- Autor a metadata odeslání se odvozují ze session i pro přímé admin API požadavky.
create function private.guard_order()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role := public.current_role();
begin
  if actor is null or actor_role is null then
    raise exception 'Account is not provisioned or is inactive' using errcode = '42501';
  end if;
  new.order_number := btrim(new.order_number);
  new.customer := btrim(new.customer);
  if new.created_at > clock_timestamp() then
    raise exception 'Creation time cannot be in the future' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if actor_role <> 'ADMIN' then
      raise exception 'Administrator required' using errcode = '42501';
    end if;
    new.created_by := actor;
    if new.status = 'shipped' then
      new.shipped_at := clock_timestamp();
      new.shipped_by := actor;
    else
      new.shipped_at := null;
      new.shipped_by := null;
    end if;
  else
    -- Dodatečná ochrana i při nechtěně rozšířené UPDATE policy v budoucnu.
    if actor_role = 'SKLADNIK' and (
      old.status <> 'pending' or new.status <> 'shipped'
      or new.id is distinct from old.id
      or new.order_number is distinct from old.order_number
      or new.customer is distinct from old.customer
      or new.note is distinct from old.note
      or new.created_at is distinct from old.created_at
      or new.created_by is distinct from old.created_by
    ) then
      raise exception 'Warehouse may only ship pending orders' using errcode = '42501';
    end if;
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
create trigger guard_order before insert or update on public.orders
for each row execute function private.guard_order();

create function private.audit_order()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.order_events (order_id, actor_id, operation, old_record, new_record)
  values (
    case when tg_op = 'DELETE' then old.id else new.id end,
    auth.uid(), tg_op,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end;
$$;
revoke all on function private.audit_order() from public, anon, authenticated;
create trigger audit_order after insert or update or delete on public.orders
for each row execute function private.audit_order();

-- Jediná mutace dostupná skladníkovi. Žádné klientem předané časy či user ID.
-- Zámek brání tomu, aby dvě souběžná potvrzení přepsala prvního odesílatele.
create function public.ship_order(p_order_id uuid)
returns setof public.orders
language plpgsql security definer set search_path = ''
as $$
declare
  result public.orders;
begin
  if (select public.current_role()) is null then
    raise exception 'Active account required' using errcode = '42501';
  end if;
  select * into result from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if result.status <> 'pending' then
    raise exception 'Order already shipped' using errcode = 'P0001';
  end if;
  update public.orders set status = 'shipped' where id = p_order_id returning * into result;
  return next result;
  return;
end;
$$;
revoke all on function public.ship_order(uuid) from public, anon;
grant execute on function public.ship_order(uuid) to authenticated;

-- Supabase Realtime; všechny události v UI znovu načítají data přes RLS.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.profiles;
  end if;
end;
$$;

commit;
