import type { Order, Profile } from '../types';
import { deliveryDuration, formatTimestamp } from './orders';

export function csvCell(value: string) {
  // Chrání i před spuštěním vzorce při otevření exportu v Excelu.
  const safe = /^[\s]*[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function historyCsv(orders: Order[], profiles: Map<string, Profile>) {
  const rows = [
    ['Číslo zakázky', 'Zákazník', 'Poznámka', 'Vytvořeno', 'Odesláno', 'Doba do odeslání', 'Odeslal', 'Číslo objednávky', 'Kód zákazníka', 'Termín z PDF', 'Produkty'],
    ...orders.filter(o => o.status === 'shipped').map(o => [o.order_number, o.customer, o.note, formatTimestamp(o.created_at), o.shipped_at ? formatTimestamp(o.shipped_at) : '', deliveryDuration(o), profiles.get(o.shipped_by ?? '')?.display_name ?? 'Neznámý uživatel', o.source_order_number ?? '', o.customer_code ?? '', o.requested_ship_date ?? '', (o.products ?? []).map(p => `${p.code} ${p.name} · ${p.variant || 'bez varianty'} · ${p.quantity} ks`).join('\n')]),
  ];
  return '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}

export function downloadHistory(orders: Order[], profiles: Map<string, Profile>) {
  const url = URL.createObjectURL(new Blob([historyCsv(orders, profiles)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `historie-zakazek-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
