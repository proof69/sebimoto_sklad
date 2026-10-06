import { AlertTriangle, CheckCheck, Clock3, Package } from 'lucide-react';
import { stats } from '../lib/orders';
import type { Order, OrderFilter } from '../types';

export function StatsCards({ orders, now, onFilter }: { orders: Order[]; now: number; onFilter: (filter: OrderFilter) => void }) {
  const counts = stats(orders, now);
  const cards = [
    { title: 'Čeká na odeslání', value: counts.pending, icon: Package, tone: 'normal', filter: 'pending', note: 'Všechny aktivní zakázky' },
    { title: 'Blíží se termín', value: counts.warning, icon: Clock3, tone: 'warning', filter: 'warning', note: 'Čekají 10–13 dní' },
    { title: 'Po termínu', value: counts.overdue, icon: AlertTriangle, tone: 'overdue', filter: 'overdue', note: 'Čekají 14 dní a více' },
    { title: 'Dnes odesláno', value: counts.today, icon: CheckCheck, tone: 'shipped', filter: 'shipped', note: 'Odesláno dnes · český čas' },
  ] as const;
  return <div className="stats-grid">{cards.map(({ title, value, icon: Icon, tone, filter, note }) => <button className={`stat-card ${tone}`} key={title} onClick={() => onFilter(filter)}><div className="stat-top"><span>{title}</span><span className="stat-icon"><Icon size={20} /></span></div><strong>{value.toLocaleString('cs-CZ')}</strong><span className="stat-note">{note}</span></button>)}</div>;
}
