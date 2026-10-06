import type { Order, OrderFilter, OrderInput } from '../types';

export const DAY_MS = 86_400_000;
export const warehouseTimezone = 'Europe/Prague';
const dateFormat = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: warehouseTimezone });
const timestampFormat = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: warehouseTimezone });
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: warehouseTimezone, year: 'numeric', month: '2-digit', day: '2-digit' });

export function waitingDays(createdAt: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - Date.parse(createdAt)) / DAY_MS));
}

export function daysLabel(days: number) {
  return `${days} ${days === 1 ? 'den' : days >= 2 && days <= 4 ? 'dny' : 'dní'}`;
}

export function ordersLabel(count: number) {
  return `${count} ${count === 1 ? 'zakázka' : count >= 2 && count <= 4 ? 'zakázky' : 'zakázek'}`;
}

export function urgency(order: Pick<Order, 'status' | 'created_at'>, now = Date.now()): 'normal' | 'warning' | 'overdue' | 'shipped' {
  if (order.status === 'shipped') return 'shipped';
  const days = waitingDays(order.created_at, now);
  return days >= 14 ? 'overdue' : days >= 10 ? 'warning' : 'normal';
}

export function prioritySort(orders: Order[], now = Date.now()) {
  const priorities = { overdue: 0, warning: 1, normal: 2, shipped: 3 };
  return [...orders].sort((a, b) => priorities[urgency(a, now)] - priorities[urgency(b, now)] || Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
}

export function formatDate(value: string) { return dateFormat.format(new Date(value)); }
export function formatTimestamp(value: string) { return timestampFormat.format(new Date(value)); }
export function isToday(value: string | null, now = Date.now()) { return value !== null && dayFormat.format(new Date(value)) === dayFormat.format(new Date(now)); }
export function deliveryDuration(order: Order) {
  if (!order.shipped_at) return '—';
  const hours = Math.max(0, Math.floor((Date.parse(order.shipped_at) - Date.parse(order.created_at)) / 3_600_000));
  return hours < 24 ? `${hours} h` : `${daysLabel(Math.floor(hours / 24))} ${hours % 24} h`;
}

export function matchesFilter(order: Order, filter: OrderFilter, now = Date.now()) {
  if (filter === 'all') return true;
  if (filter === 'pending' || filter === 'shipped') return order.status === filter;
  return urgency(order, now) === filter;
}

export function stats(orders: Order[], now = Date.now()) {
  return {
    pending: orders.filter(o => o.status === 'pending').length,
    warning: orders.filter(o => urgency(o, now) === 'warning').length,
    overdue: orders.filter(o => urgency(o, now) === 'overdue').length,
    today: orders.filter(o => o.status === 'shipped' && isToday(o.shipped_at, now)).length,
  };
}

export function validateOrder(input: OrderInput, now = Date.now()): string | null {
  if (!input.order_number.trim()) return 'Vyplňte číslo zakázky.';
  if (input.order_number.trim().length > 80) return 'Číslo zakázky může mít nejvýše 80 znaků.';
  if ((input.customer ?? '').trim().length > 200) return 'Název zákazníka může mít nejvýše 200 znaků.';
  if (input.note.length > 5000) return 'Poznámka může mít nejvýše 5 000 znaků.';
  if ((input.products?.length ?? 0) > 200) return 'Zakázka může mít nejvýše 200 produktů.';
  for (const [index, item] of (input.products ?? []).entries()) {
    if (!item.name.trim() || item.name.length > 500 || item.code.length > 80 || item.variant.length > 100) return `Zkontrolujte název, kód a variantu produktu ${index + 1}.`;
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1_000_000) return `Počet kusů produktu ${index + 1} musí být celé číslo od 1 do 1 000 000.`;
    if (item.produced_quantity !== null && (!Number.isInteger(item.produced_quantity) || item.produced_quantity < 0 || item.produced_quantity > 1_000_000)) return `Zkontrolujte počet vyrobených kusů produktu ${index + 1}.`;
  }
  if ((input.source_order_number?.length ?? 0) > 80 || (input.customer_code?.length ?? 0) > 80 || (input.source_file_name?.length ?? 0) > 255) return 'Údaje z PDF jsou příliš dlouhé. Zkraťte číslo objednávky, kód zákazníka nebo název souboru.';
  if (input.requested_ship_date) {
    const value = input.requested_ship_date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) return 'Zadejte platný termín z PDF.';
  }
  if (input.created_at) {
    const date = Date.parse(input.created_at);
    if (!Number.isFinite(date)) return 'Zadejte platné datum vytvoření.';
    if (date > now) return 'Datum vytvoření nesmí být v budoucnosti.';
  }
  return null;
}

// datetime-local je čas v časové zóně zařízení; převádíme jej vždy do UTC timestampu.
export function toLocalInput(value: string) {
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 19);
}
