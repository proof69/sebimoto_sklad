import type { Order } from '../types';
import { useOrders } from '../data/OrdersProvider';
import { formatTimestamp, deliveryDuration, waitingDays } from '../lib/orders';
import { Modal } from './Modal';
import { UrgencyBadge } from './OrderList';

export function OrderDetail({ order, now, onClose }: { order: Order; now: number; onClose: () => void }) {
  const { profiles } = useOrders();
  return <Modal title={`Zakázka ${order.order_number}`} onClose={onClose} wide>
    <div className="modal-body"><UrgencyBadge order={order} now={now} /><h3 className="detail-customer">{order.customer}</h3><dl className="detail-grid"><div><dt>Datum vytvoření</dt><dd>{formatTimestamp(order.created_at)}</dd></div><div><dt>Vytvořil</dt><dd>{profiles.get(order.created_by)?.display_name ?? 'Neznámý uživatel'}</dd></div><div><dt>{order.status === 'shipped' ? 'Datum odeslání' : 'Čeká na odeslání'}</dt><dd>{order.shipped_at ? formatTimestamp(order.shipped_at) : `${waitingDays(order.created_at, now)} dní`}</dd></div><div><dt>{order.status === 'shipped' ? 'Odeslal' : 'Standardní limit'}</dt><dd>{order.status === 'shipped' ? profiles.get(order.shipped_by ?? '')?.display_name ?? 'Neznámý uživatel' : '14 dní od vytvoření'}</dd></div>{order.status === 'shipped' && <div><dt>Doba do odeslání</dt><dd>{deliveryDuration(order)}</dd></div>}<div><dt>Poslední změna</dt><dd>{formatTimestamp(order.updated_at)}</dd></div></dl><div className="detail-note"><h4>Poznámka</h4><p>{order.note || 'Bez poznámky.'}</p></div></div>
    <div className="modal-footer"><button className="button secondary" onClick={onClose}>Zavřít detail</button></div>
  </Modal>;
}
