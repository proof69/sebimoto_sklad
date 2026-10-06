-- Import PDF a produkty. Spusťte po prvních dvou migracích.
-- Zahrnuje také podporu nepovinného zákazníka pro dříve nasazené projekty.
begin;
alter table public.orders drop constraint if exists orders_customer_check;
alter table public.orders add constraint orders_customer_check check (length(btrim(customer)) <= 200);
alter table public.orders alter column customer set default '';

alter table public.orders add column if not exists products jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists source_order_number text not null default '' check (length(source_order_number) <= 80);
alter table public.orders add column if not exists customer_code text not null default '' check (length(customer_code) <= 80);
alter table public.orders add column if not exists requested_ship_date date;
alter table public.orders add column if not exists source_file_name text not null default '' check (length(source_file_name) <= 255);

create or replace function private.valid_products(value jsonb)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare item jsonb;
begin
  if jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 200 then return false; end if;
  for item in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item->'code') is distinct from 'string'
      or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'variant') is distinct from 'string'
      or jsonb_typeof(item->'quantity') is distinct from 'number'
      or length(item->>'code') > 80
      or length(btrim(item->>'name')) not between 1 and 500
      or length(item->>'variant') > 100 then return false; end if;
    if (item->>'quantity')::numeric not between 1 and 1000000
      or trunc((item->>'quantity')::numeric) <> (item->>'quantity')::numeric then return false; end if;
    if item->'produced_quantity' is null then return false; end if;
    if jsonb_typeof(item->'produced_quantity') <> 'null' then
      if jsonb_typeof(item->'produced_quantity') <> 'number' then return false; end if;
      if (item->>'produced_quantity')::numeric not between 0 and 1000000
        or trunc((item->>'produced_quantity')::numeric) <> (item->>'produced_quantity')::numeric then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;
-- CHECK se vyhodnocuje jako volající. Obal zachová soukromé schéma bez USAGE.
create or replace function public.valid_order_products(value jsonb)
returns boolean language sql immutable security definer set search_path = ''
as $$ select private.valid_products(value); $$;
revoke all on function private.valid_products(jsonb) from public, anon, authenticated;
revoke all on function public.valid_order_products(jsonb) from public, anon;
grant execute on function public.valid_order_products(jsonb) to authenticated;
alter table public.orders drop constraint if exists orders_products_check;
alter table public.orders add constraint orders_products_check check (public.valid_order_products(products));
-- RLS, audit a automatické serverové metadata zůstávají platné i pro nové sloupce.
commit;
