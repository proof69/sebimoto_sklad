import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useOrders } from '../data/OrdersProvider';
import { formatTimestamp } from '../lib/orders';

export function OrderViews({ orderId }: { orderId: string }) {
  const { profile } = useAuth();
  const { views, viewsReady, viewsError, profiles } = useOrders();
  const readers = views.filter(v => v.order_id === orderId);
  const seen = readers.some(v => v.user_id === profile?.id);
  return <div className="order-views" aria-live="polite">
    <span className={`view-status ${seen ? 'seen' : ''}`}>
      {seen ? <Eye size={16} /> : <EyeOff size={16} />}
      {seen ? 'Už jste viděl(a)' : viewsError ? 'Zobrazení nelze ověřit' : !viewsReady ? 'Načítání zobrazení…' : 'Pro vás nové'}
    </span>
    {viewsError && <span className="view-error">{viewsError}</span>}
    {readers.length > 0 && <span className="order-readers"><Eye size={15} aria-hidden="true" /> Zobrazili: {readers.map((v, i) => <span key={v.user_id} title={`První zobrazení: ${formatTimestamp(v.viewed_at)}`}>{i > 0 && ', '}{profiles.get(v.user_id)?.display_name ?? 'Neznámý uživatel'}{v.user_id === profile?.id && ' (vy)'}</span>)}</span>}
  </div>;
}
