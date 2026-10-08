import { lazy, Suspense, useMemo, useState } from 'react';
import { AlertTriangle, Download, FileUp, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useOrders } from '../data/OrdersProvider';
import { useNow } from '../hooks/useNow';
import { isToday, matchesFilter, ordersLabel, packingStats, prioritySort, stats } from '../lib/orders';
import { errorMessage } from '../lib/errors';
import { downloadHistory } from '../lib/csv';
import type { PdfDraft } from '../lib/pdf-parser';
import type { Order, OrderFilter } from '../types';
import { OrderList } from '../components/OrderList';
import { ConfirmDialog } from '../components/Modal';
import { StatsCards } from '../components/StatsCards';
import { useToast } from '../components/Toast';
import { ErrorState, Loading } from '../components/States';

const filters: { id: OrderFilter; label: string }[] = [
  { id: 'all', label: 'Všechny' }, { id: 'pending', label: 'Čekající' }, { id: 'warning', label: 'Blíží se termín' }, { id: 'overdue', label: 'Po termínu' }, { id: 'shipped', label: 'Odeslané' },
];
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('cs-CZ');
const OrderForm = lazy(() => import('../components/OrderForm').then(module => ({ default: module.OrderForm })));
const PdfImport = lazy(() => import('../components/PdfImport').then(module => ({ default: module.PdfImport })));
const OrderDetail = lazy(() => import('../components/OrderDetail').then(module => ({ default: module.OrderDetail })));

export function OrdersPage({ mode }: { mode: 'warehouse' | 'admin' | 'history' }) {
  const { orders, profiles, loading, error, reload, ship, remove, packingBusyOrders } = useOrders();
  const now = useNow();
  const notify = useToast();
  const [filter, setFilter] = useState<OrderFilter>(mode === 'history' ? 'shipped' : 'pending');
  const [query, setQuery] = useState('');
  const [todayOnly, setTodayOnly] = useState(false);
  const [form, setForm] = useState<{ order: Order | null; draft?: PdfDraft } | null>(null);
  const [pdfImport, setPdfImport] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [action, setAction] = useState<{ type: 'ship' | 'delete'; order: Order } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const admin = mode === 'admin';
  const history = mode === 'history';
  const counts = stats(orders, now);
  const detail = orders.find(o => o.id === detailId);

  const visibleOrders = useMemo(() => {
    const term = normalized(query.trim());
    const matching = orders.filter(o => matchesFilter(o, history ? 'shipped' : filter, now) && (!todayOnly || isToday(o.shipped_at, now)) && (!term || normalized(o.order_number).includes(term) || normalized(o.customer).includes(term) || normalized(o.customer_code ?? '').includes(term)));
    if (history || filter === 'shipped') return matching.sort((a, b) => Date.parse(b.shipped_at ?? '') - Date.parse(a.shipped_at ?? '') || a.id.localeCompare(b.id));
    return prioritySort(matching, now);
  }, [orders, history, filter, now, todayOnly, query]);

  function selectFilter(next: OrderFilter) { setFilter(next); setTodayOnly(false); }
  function cardFilter(next: OrderFilter) { setFilter(next); setTodayOnly(next === 'shipped'); }
  function openAction(type: 'ship' | 'delete', order: Order) { setActionError(null); setAction({ type, order }); }

  async function confirm() {
    if (!action || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      if (action.type === 'ship') await ship(action.order); else await remove(action.order);
      notify(action.type === 'ship' ? 'Zakázka byla označena jako odeslaná.' : 'Zakázka byla odstraněna.');
      setAction(null);
    } catch (err) {
      const message = errorMessage(err);
      setActionError(message);
      notify(message, 'error');
    } finally { setBusy(false); }
  }

  return <>
    <div className="page-heading"><div><span className="eyebrow">{history ? 'DOKONČENÉ ZAKÁZKY' : admin ? 'SPRÁVA ZAKÁZEK' : 'KAŽDÝ DEN POD KONTROLOU'}</span><h1>{history ? 'Historie odeslání' : admin ? 'Administrace' : 'Přehled skladu'}</h1><p className="muted">{history ? 'Přehled odeslaných zakázek, časů a lidí, kteří je vyřídili.' : admin ? 'Vytvářejte zakázky a mějte celou expedici na jednom místě.' : 'Nejdříve vyřiďte nejstarší zakázky. Každé odeslání potvrďte.'}</p></div>{!history && <div className="heading-actions"><button className="button secondary" onClick={() => setPdfImport(true)}><FileUp size={19} />Importovat PDF</button><button className="button primary" onClick={() => setForm({ order: null })}><Plus size={20} />Nová zakázka</button></div>}{history && <button className="button secondary" disabled={loading || Boolean(error) || !visibleOrders.length} onClick={() => { downloadHistory(visibleOrders, profiles); notify('Historie zakázek byla exportována do CSV.'); }}><Download size={19} />Exportovat CSV</button>}</div>
    {!history && !loading && <StatsCards orders={orders} now={now} onFilter={cardFilter} />}
    {!history && !loading && counts.overdue > 0 && <div className="overdue-banner" role="status"><div className="overdue-banner-icon"><AlertTriangle size={24} /></div><div><strong>{ordersLabel(counts.overdue)} po termínu. Nutné odeslat.</strong><p>{counts.overdue === 1 ? 'Čeká nejméně 14 dní. Vyřiďte ji přednostně.' : 'Čekají nejméně 14 dní. Vyřiďte je přednostně.'}</p></div><button className="text-button" onClick={() => selectFilter('overdue')}>Zobrazit zakázky<span aria-hidden="true">→</span></button></div>}
    <section className="orders-section" aria-label={history ? 'Seznam odeslaných zakázek' : 'Seznam zakázek'}>
      <div className="section-heading"><h2>{history ? 'Odeslané zakázky' : todayOnly ? 'Dnes odeslané zakázky' : filter === 'all' ? 'Všechny zakázky' : filter === 'shipped' ? 'Odeslané zakázky' : 'Aktivní zakázky'}<span className="section-count">{loading ? '…' : visibleOrders.length}</span></h2><span className="sort-hint"><SlidersHorizontal size={15} />{history || filter === 'shipped' ? 'Nejnovější odeslání první' : 'Podle priority a stáří'}</span></div>
      <div className="list-toolbar">{!history && <div className="filter-tabs" role="group" aria-label="Filtr zakázek">{filters.map(item => <button key={item.id} className={filter === item.id ? 'active' : ''} aria-pressed={filter === item.id} onClick={() => selectFilter(item.id)}>{item.label}</button>)}</div>}<label className="search-field"><Search size={18} /><span className="sr-only">Hledat podle čísla zakázky, zákazníka nebo kódu zákazníka</span><input type="search" placeholder="Číslo zakázky, zákazník nebo kód…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
      {todayOnly && <div className="today-filter"><span>Zobrazeno pouze dnešní odeslání</span><button className="text-button" onClick={() => setTodayOnly(false)}>Zobrazit všechna odeslání</button></div>}
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : <OrderList orders={visibleOrders} now={now} admin={!history} onShip={history ? undefined : order => openAction('ship', order)} onEdit={order => setForm({ order })} onDelete={order => openAction('delete', order)} onDetail={order => setDetailId(order.id)} resetKey={`${filter}-${query}-${todayOnly}`} />}
    </section>
    {!history && <p className="priority-legend"><span><i className="legend-dot normal" />0–9 dní · standardní</span><span><i className="legend-dot warning" />10–13 dní · blíží se termín</span><span><i className="legend-dot overdue" />14+ dní · po termínu</span></p>}
    <Suspense fallback={<div className="dialog-loading" role="status">Načítání dialogu…</div>}>
      {form && <OrderForm order={form.order} draft={form.draft} onClose={() => setForm(null)} />}
      {pdfImport && <PdfImport onClose={() => setPdfImport(false)} onImported={draft => { setPdfImport(false); setForm({ order: null, draft }); }} />}
      {detail && <OrderDetail order={detail} now={now} onClose={() => setDetailId(null)} />}
    </Suspense>
    {detailId && !detail && !loading && <ConfirmDialog title="Zakázka už není v seznamu" confirmLabel="Zavřít" busy={false} onClose={() => setDetailId(null)} onConfirm={() => setDetailId(null)}><p>Zakázka byla mezitím odstraněna nebo se změnila vaše oprávnění.</p></ConfirmDialog>}
    {action && <ConfirmDialog title={action.type === 'ship' ? 'Byla zakázka fyzicky odeslána?' : 'Odstranit zakázku?'} confirmLabel={action.type === 'ship' ? 'Ano, označit jako odesláno' : 'Odstranit zakázku'} destructive={action.type === 'delete'} busy={busy || packingBusyOrders.has(action.order.id)} onClose={() => setAction(null)} onConfirm={() => void confirm()}><p><strong>{action.order.order_number}</strong><br />{action.order.customer}</p><p>{action.type === 'ship' ? 'Potvrzením přesunete zakázku do historie. Zaznamená se přesný čas a vaše jméno.' : 'Zakázka bude odstraněna ze seznamu. Tuto akci nelze vrátit.'}</p>{action.type === 'ship' && packingStats((orders.find(o => o.id === action.order.id) ?? action.order).products ?? []).remaining > 0 && <p className="packing-shipping-warning" role="alert">Pozor: zbývá zabalit {packingStats((orders.find(o => o.id === action.order.id) ?? action.order).products ?? []).remaining} ks. Odeslání potvrďte pouze tehdy, pokud je zakázka skutečně kompletní a odeslaná.</p>}{actionError && <p className="inline-error" role="alert">{actionError}</p>}</ConfirmDialog>}
  </>;
}
