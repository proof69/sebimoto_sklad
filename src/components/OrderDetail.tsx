import type { Order } from '../types';
import { useOrders } from '../data/OrdersProvider';
import { ProductTable } from './Products';
import { formatDate, formatTimestamp, deliveryDuration, waitingDays } from '../lib/orders';
import { Modal } from './Modal';
import { UrgencyBadge } from './OrderList';

export function OrderDetail({ order, now, onClose }: { order: Order; now: number; onClose: () => void }) {
  const { profiles } = useOrders();
  return <Modal title={`Zakázka ${order.order_number}`} onClose={onClose} wide>
    <div className="modal-body"><UrgencyBadge order={order} now={now} /><h3 className="detail-customer">{order.customer}</h3><dl className="detail-grid"><div><dt>Datum vytvoření</dt><dd>{formatTimestamp(order.created_at)}</dd></div><div><dt>Vytvořil</dt><dd>{profiles.get(order.created_by)?.display_name ?? 'Neznámý uživatel'}</dd></div><div><dt>{order.status === 'shipped' ? 'Datum odeslání' : 'Čeká na odeslání'}</dt><dd>{order.shipped_at ? formatTimestamp(order.shipped_at) : `${waitingDays(order.created_at, now)} dní`}</dd></div><div><dt>{order.status === 'shipped' ? 'Odeslal' : 'Standardní limit'}</dt><dd>{order.status === 'shipped' ? profiles.get(order.shipped_by ?? '')?.display_name ?? 'Neznámý uživatel' : '14 dní od vytvoření'}</dd></div>{order.status === 'shipped' && <div><dt>Doba do odeslání</dt><dd>{deliveryDuration(order)}</dd></div>}<div><dt>Poslední změna</dt><dd>{formatTimestamp(order.updated_at)}</dd></div></dl><div className="detail-note"><h4>Poznámka</h4><p>{order.note || 'Bez poznámky.'}</p></div></div>
    <section className="detail-products"><dl className="detail-grid">{order.source_order_number && <div><dt>Číslo objednávky</dt><dd>{order.source_order_number}</dd></div>}{order.customer_code && <div><dt>Kód zákazníka</dt><dd>{order.customer_code}</dd></div>}{order.requested_ship_date && <div><dt>Termín z PDF</dt><dd>{formatDate(`${order.requested_ship_date}T12:00:00Z`)}</dd></div>}{order.source_file_name && <div><dt>Zdrojové PDF</dt><dd>{order.source_file_name}</dd></div>}</dl><h3>Produkty ({order.products?.length ?? 0})</h3><ProductTable products={order.products ?? []} order={order} />{!order.products?.length && <p className="muted">Produkty nebyly zadány.</p>}</section>
    <div className="modal-footer"><button className="button secondary" onClick={onClose}>Zavřít detail</button></div>
  </Modal>;
}
