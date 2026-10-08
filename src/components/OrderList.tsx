import { useEffect, useState } from 'react';
import { ArrowRight, Check, Clock3, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { Order } from '../types';
import { daysLabel, deliveryDuration, formatDate, formatTimestamp, ordersLabel, urgency, waitingDays } from '../lib/orders';
import { useOrders } from '../data/OrdersProvider';
import { ProductsSummary } from './Products';
import { EmptyState } from './States';
import { OrderViews } from './OrderViews';

export function UrgencyBadge({ order, now }: { order: Order; now: number }) {
  const level = urgency(order, now);
  if (level === 'shipped') return <span className="badge shipped"><Check size={14} />Odesláno</span>;
  const days = waitingDays(order.created_at, now);
  return <span className={`badge ${level}`}>{level === 'overdue' ? 'PO TERMÍNU' : level === 'warning' ? 'BLÍŽÍ SE TERMÍN' : 'ČEKÁ NA ODESLÁNÍ'}<span className="badge-divider">·</span>{daysLabel(days)}</span>;
}

export function OrderList({ orders, now, admin = false, onShip, onEdit, onDelete, onDetail, resetKey }: { orders: Order[]; now: number; admin?: boolean; onShip?: (order: Order) => void; onEdit?: (order: Order) => void; onDelete?: (order: Order) => void; onDetail: (order: Order) => void; resetKey: string }) {
  const { profiles, packingBusyOrders } = useOrders();
  const [page, setPage] = useState(1);
  const size = 20;
  const pageCount = Math.max(1, Math.ceil(orders.length / size));
  const currentPage = Math.min(page, pageCount);
  useEffect(() => { setPage(1); }, [resetKey]);
  if (!orders.length) return <EmptyState title="Žádné zakázky k zobrazení" text="V tomto přehledu nejsou žádné zakázky. Zkuste změnit filtr nebo vyhledávání." />;
  return <>
    <div className="order-list">
      {orders.slice((currentPage - 1) * size, currentPage * size).map(order => {
        const level = urgency(order, now);
        return <article className={`order-card ${level}`} key={order.id}>
          <div className="order-indicator" aria-hidden="true">{order.status === 'shipped' ? <Check size={22} /> : <PackageGlyph />}</div>
          <div className="order-content"><div className="order-topline"><button className="order-number" onClick={() => onDetail(order)}>{order.order_number}<ArrowRight size={15} /></button><UrgencyBadge order={order} now={now} /></div><h3>{order.customer}</h3>{order.note && <p className="order-note">{order.note}</p>}<div className="order-meta"><span><Clock3 size={14} />Přidáno {formatDate(order.created_at)}</span>{order.status === 'shipped' ? <><span>Odesláno {formatTimestamp(order.shipped_at!)}</span><span>Za {deliveryDuration(order)}</span><span>Odeslal: {profiles.get(order.shipped_by ?? '')?.display_name ?? 'Neznámý uživatel'}</span></> : <span className={level === 'overdue' ? 'overdue-text' : ''}>{level === 'overdue' ? `NUTNÉ ODESLAT · čeká ${daysLabel(waitingDays(order.created_at, now))}` : `Čeká ${daysLabel(waitingDays(order.created_at, now))}`}</span>}</div></div>
          <div className="order-actions">{order.status === 'pending' && onShip && <button className={`button ship-button ${level === 'overdue' ? 'danger' : 'primary'}`} disabled={packingBusyOrders.has(order.id)} onClick={() => onShip(order)}><Check size={18} /><span>Označit jako odesláno</span></button>}{admin && <div className="admin-card-actions"><button className="icon-button" aria-label={`Upravit zakázku ${order.order_number}`} title="Upravit" onClick={() => onEdit?.(order)}><Pencil size={18} /></button><button className="icon-button delete-icon" aria-label={`Odstranit zakázku ${order.order_number}`} title="Odstranit" onClick={() => onDelete?.(order)}><Trash2 size={18} /></button></div>}{!onShip && !admin && <button className="icon-button" aria-label={`Detail zakázky ${order.order_number}`} onClick={() => onDetail(order)}><MoreHorizontal size={22} /></button>}</div>
          <div className="order-products"><OrderViews orderId={order.id} />{order.products?.length > 0 && <ProductsSummary products={order.products} order={order} />}</div>
        </article>;
      })}
    </div>
    {pageCount > 1 && <nav className="pagination" aria-label="Stránkování zakázek"><span>Strana {currentPage} z {pageCount} · {ordersLabel(orders.length)}</span><div><button className="button secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Předchozí</button><button className="button secondary" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Další</button></div></nav>}
  </>;
}

function PackageGlyph() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m3 7 9-5 9 5v10l-9 5-9-5Z" /><path d="m3 7 9 5 9-5M12 12v10M7.5 4.5l9 5V14" /></svg>;
}
