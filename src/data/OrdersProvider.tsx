import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { database } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import type { Order, OrderInput, OrderView, Profile } from '../types';

interface OrdersState {
  views: OrderView[];
  viewsReady: boolean;
  viewsError: string | null;
  markViewed: (orderId: string) => Promise<void>;
  orders: Order[];
  profiles: Map<string, Profile>;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  realtime: 'connecting' | 'live' | 'fallback';
  lastUpdated: number | null;
  reload: () => Promise<void>;
  create: (input: OrderInput) => Promise<void>;
  update: (order: Order, input: OrderInput) => Promise<void>;
  remove: (order: Order) => Promise<void>;
  ship: (order: Order) => Promise<void>;
  pack: (order: Order, productIndex: number, delta: 1 | -1, stage?: 'prepared' | 'packed') => Promise<void>;
  packingBusyOrders: Set<string>;
}
const OrdersContext = createContext<OrdersState | null>(null);

// PostgREST vrací standardně nejvýše 1 000 řádků. Stránkujeme celý seznam.
async function readAllOrders(): Promise<Order[]> {
  const rows: Order[] = [];
  let cursor: string | null = null;
  const size = 500;
  while (true) {
    let query = database().from('orders').select('*').order('id', { ascending: true }).limit(size);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...data);
    if (data.length < size) return rows;
    cursor = data[data.length - 1].id;
  }
}

async function readAllProfiles(): Promise<Profile[]> {
  const rows: Profile[] = [];
  let cursor: string | null = null;
  while (true) {
    let query = database().from('profiles').select('*').order('id').limit(500);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
    cursor = data[data.length - 1].id;
  }
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [views, setViews] = useState<OrderView[]>([]);
  const [viewsReady, setViewsReady] = useState(false);
  const [viewsError, setViewsError] = useState<string | null>(null);
  const viewsRevision = useRef(0);
  const viewingRequests = useRef(new Set<string>());
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtime, setRealtime] = useState<OrdersState['realtime']>('connecting');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const revision = useRef(0);
  const alive = useRef(false);
  const packingRequests = useRef(new Set<string>());
  const [packingBusyOrders, setPackingBusyOrders] = useState<Set<string>>(new Set());

  const reloadViews = useCallback(async () => {
    const request = ++viewsRevision.current;
    try {
      const rows: OrderView[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await database().from('order_views').select('*').order('order_id').order('user_id').range(offset, offset + 499);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) break;
      }
      if (!alive.current || request !== viewsRevision.current) return;
      setViews(rows); setViewsReady(true); setViewsError(null);
    } catch (err) {
      if (alive.current && request === viewsRevision.current) {
        setViewsReady(false); setViewsError(errorMessage(err));
      }
    }
  }, []);

  const markViewed = useCallback(async (orderId: string) => {
    if (viewingRequests.current.has(orderId)) return;
    viewingRequests.current.add(orderId);
    try {
      const { data, error } = await database().rpc('mark_order_viewed', { p_order_id: orderId }).single();
      if (error) throw error;
      if (!alive.current) return;
      ++viewsRevision.current;
      setViews(current => [...current.filter(v => v.order_id !== data.order_id || v.user_id !== data.user_id), data]);
      void reloadViews();
    } finally { viewingRequests.current.delete(orderId); }
  }, [reloadViews]);

  const reload = useCallback(async () => {
    const request = ++revision.current;
    setRefreshing(true);
    try {
      const [data, people] = await Promise.all([readAllOrders(), readAllProfiles()]);
      if (!alive.current || revision.current !== request) return;
      setOrders(data);
      setProfiles(new Map(people.map(p => [p.id, p])));
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      if (alive.current && revision.current === request) setError(errorMessage(err));
    } finally {
      if (alive.current && revision.current === request) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void reloadViews();
    setLoading(true);
    void reload();
    let debounce: ReturnType<typeof setTimeout>;
    const queueReload = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { void reload(); void reloadViews(); }, 200);
    };
    const channel = database().channel(`warehouse-${profile?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, queueReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, queueReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_views' }, () => { void reloadViews(); })
      .subscribe(status => {
        if (!alive.current) return;
        if (status === 'SUBSCRIBED') { setRealtime('live'); queueReload(); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtime('fallback');
      });
    // Polling také zachytí smazání, které Postgres Changes s RLS nemusí doručit.
    const interval = setInterval(() => { void reload(); void reloadViews(); }, 30_000);
    const visible = () => { if (document.visibilityState === 'visible') { void reload(); void reloadViews(); } };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', queueReload);
    return () => {
      alive.current = false;
      ++viewsRevision.current;
      ++revision.current;
      clearTimeout(debounce);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', queueReload);
      void database().removeChannel(channel);
    };
  }, [profile?.id, reload, reloadViews]);

  const merge = useCallback((row: Order) => {
    // Zneplatní načítání zahájené před mutací, aby nepřepsalo nové lokální údaje.
    ++revision.current;
    setRefreshing(false);
    setOrders(current => [...current.filter(o => o.id !== row.id), row]);
    setLastUpdated(Date.now());
    setError(null);
  }, []);

  const create = useCallback(async (input: OrderInput) => {
    const { data, error: dbError } = await database().from('orders').insert(input).select().single();
    if (dbError) throw dbError;
    merge(data);
  }, [merge]);

  const update = useCallback(async (order: Order, input: OrderInput) => {
    const { data, error: dbError } = await database().from('orders').update(input).eq('id', order.id).eq('updated_at', order.updated_at).select().maybeSingle();
    if (dbError) throw dbError;
    if (!data) { void reload(); throw new Error('CONFLICT'); }
    merge(data);
  }, [merge, reload]);

  const remove = useCallback(async (order: Order) => {
    const { data, error: dbError } = await database().from('orders').delete().eq('id', order.id).eq('updated_at', order.updated_at).select('id');
    if (dbError) throw dbError;
    if (!data.length) { void reload(); throw new Error('CONFLICT'); }
    ++revision.current;
    setRefreshing(false);
    setOrders(current => current.filter(o => o.id !== order.id));
    setLastUpdated(Date.now());
  }, [reload]);

  const ship = useCallback(async (order: Order) => {
    const { data, error: dbError } = await database().rpc('ship_order', { p_order_id: order.id }).single();
    if (dbError) { void reload(); throw dbError; }
    merge(data);
  }, [merge, reload]);

  const pack = useCallback(async (order: Order, productIndex: number, delta: 1 | -1, stage: 'prepared' | 'packed' = 'packed') => {
    if (packingRequests.current.has(order.id)) return;
    const product = order.products?.[productIndex];
    if (!product) throw new Error('CONFLICT');
    packingRequests.current.add(order.id);
    setPackingBusyOrders(new Set(packingRequests.current));
    try {
      const { data, error: dbError } = await database().rpc(stage === 'prepared' ? 'prepare_product' : 'pack_product', { p_order_id: order.id, p_product_index: productIndex, p_delta: delta, p_expected_product: product }).single();
      if (dbError) { void reload(); throw dbError; }
      merge(data);
    } finally {
      packingRequests.current.delete(order.id);
      setPackingBusyOrders(new Set(packingRequests.current));
    }
  }, [merge, reload]);

  const value = useMemo(() => ({ orders, profiles, loading, refreshing, error, realtime, lastUpdated, reload, create, update, remove, ship, pack, packingBusyOrders }), [orders, profiles, loading, refreshing, error, realtime, lastUpdated, reload, create, update, remove, ship, pack, packingBusyOrders]);
  return <OrdersContext.Provider value={{ ...value, views, viewsReady, viewsError, markViewed }}>{children}</OrdersContext.Provider>;
}
export function useOrders() {
  const context = useContext(OrdersContext);
  if (!context) throw new Error('OrdersProvider nebyl inicializován.');
  return context;
}
