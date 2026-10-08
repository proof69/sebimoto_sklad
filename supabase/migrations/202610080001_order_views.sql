-- Evidence prvního otevření; nemění zakázku ani její updated_at.
begin;
create table public.order_views (
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  viewed_at timestamptz not null default clock_timestamp(),
  primary key (order_id, user_id)
);
alter table public.order_views enable row level security;
revoke all on public.order_views from public, anon, authenticated;
grant select on public.order_views to authenticated;
create policy order_views_read on public.order_views for select to authenticated
using ((select public.current_role()) is not null);

create function public.mark_order_viewed(p_order_id uuid)
returns setof public.order_views
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or (select public.current_role()) is null then
    raise exception 'Active signed-in account required' using errcode = '42501';
  end if;
  perform 1 from public.orders where id = p_order_id for key share;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  insert into public.order_views(order_id, user_id) values (p_order_id, auth.uid())
  on conflict (order_id, user_id) do nothing;
  return query select * from public.order_views where order_id = p_order_id and user_id = auth.uid();
end;
$$;
revoke all on function public.mark_order_viewed(uuid) from public, anon;
grant execute on function public.mark_order_viewed(uuid) to authenticated;
alter publication supabase_realtime add table public.order_views;
commit;
