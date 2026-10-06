-- Průběžné balení produktů. Vyžaduje migraci 202610060004_pdf_products.sql.
-- Starší produkty bez packed_quantity mají automaticky význam 0 zabalených kusů.
begin;

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
    if item ? 'packed_quantity' then
      if jsonb_typeof(item->'packed_quantity') is distinct from 'number' then return false; end if;
      if (item->>'packed_quantity')::numeric < 0
        or (item->>'packed_quantity')::numeric > (item->>'quantity')::numeric
        or trunc((item->>'packed_quantity')::numeric) <> (item->>'packed_quantity')::numeric then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.valid_products(jsonb) from public, anon, authenticated;

-- Změna po jednom kuse, atomicky pod zámkem zakázky. Nespoléhá na číslo
-- z klienta a nepřepisuje balení jiných produktů při souběžné práci.
create or replace function public.pack_product(
  p_order_id uuid, p_product_index integer, p_delta integer, p_expected_product jsonb
)
returns setof public.orders
language plpgsql security definer set search_path = ''
as $$
declare
  result public.orders;
  item jsonb;
  packed integer;
  next_packed integer;
begin
  if auth.uid() is null or (select public.current_role()) is null then
    raise exception 'Active signed-in account required' using errcode = '42501';
  end if;
  if p_delta is null or p_delta not in (-1, 1) or p_product_index is null or p_product_index < 0 then
    raise exception 'Invalid packing operation' using errcode = '22023';
  end if;
  select * into result from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if result.status <> 'pending' then
    raise exception 'Shipped orders cannot be packed' using errcode = 'P0003';
  end if;
  if p_product_index >= jsonb_array_length(result.products) then
    raise exception 'Product changed' using errcode = 'P0004';
  end if;
  item := result.products->p_product_index;
  if p_expected_product is null or (item - 'packed_quantity') is distinct from (p_expected_product - 'packed_quantity') then
    raise exception 'Product changed; reload order' using errcode = 'P0004';
  end if;
  packed := coalesce((item->>'packed_quantity')::integer, 0);
  next_packed := packed + p_delta;
  if next_packed < 0 or next_packed > (item->>'quantity')::integer then
    raise exception 'Packing limit reached' using errcode = 'P0005';
  end if;
  update public.orders
  set products = jsonb_set(products, array[p_product_index::text, 'packed_quantity'], to_jsonb(next_packed), true)
  where id = p_order_id returning * into result;
  return next result;
  return;
end;
$$;
revoke all on function public.pack_product(uuid, integer, integer, jsonb) from public, anon;
grant execute on function public.pack_product(uuid, integer, integer, jsonb) to authenticated;

-- Stávající trigger zaznamená skutečného uživatele, aktualizuje updated_at
-- a uloží změnu do soukromého auditu. Realtime událost obnoví další prohlížeče.
commit;
