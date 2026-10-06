-- Zákazník je nepovinný. Prázdná hodnota se ukládá jako '', nikoli NULL.
-- Existující zakázky a jejich zákazníci zůstávají zachované.
begin;

alter table public.orders drop constraint if exists orders_customer_check;
alter table public.orders add constraint orders_customer_check
  check (length(btrim(customer)) <= 200);
alter table public.orders alter column customer set default '';

commit;
