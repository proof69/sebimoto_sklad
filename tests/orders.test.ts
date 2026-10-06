import { describe, expect, it } from 'vitest';
import type { Order } from '../src/types';
import { DAY_MS, isToday, matchesFilter, packingStats, prioritySort, stats, urgency, validateOrder, waitingDays } from '../src/lib/orders';
import { csvCell, historyCsv } from '../src/lib/csv';
import { validateConfig } from '../src/lib/config';

const now = Date.parse('2026-10-06T10:00:00Z');
const order = (days: number, overrides: Partial<Order> = {}): Order => ({
  id: `id-${days}`, order_number: `ZAK-${days}`, customer: 'Zákazník', note: '',
  created_at: new Date(now - days * DAY_MS).toISOString(), updated_at: new Date(now).toISOString(),
  status: 'pending', shipped_at: null, created_by: 'admin', shipped_by: null, ...overrides,
  products: [], source_order_number: '', customer_code: '', requested_ship_date: null, source_file_name: '',
});

describe('14denní limit', () => {
  it.each([[0, 'normal'], [9, 'normal'], [10, 'warning'], [13, 'warning'], [14, 'overdue'], [17, 'overdue']] as const)('stáří %i dní má prioritu %s', (days, level) => {
    expect(urgency(order(days), now)).toBe(level);
  });
  it('mění prioritu přesně po 10 a 14 uplynulých dnech', () => {
    expect(urgency(order(10), now - 1)).toBe('normal');
    expect(urgency(order(14), now - 1)).toBe('warning');
  });
  it('označení zmizí u odeslané zakázky i po 100 dnech', () => {
    expect(urgency(order(100, { status: 'shipped' }), now)).toBe('shipped');
    expect(matchesFilter(order(100, { status: 'shipped' }), 'overdue', now)).toBe(false);
  });
  it('počítá uplynulý čas i přes změnu letního času', () => {
    expect(waitingDays('2026-10-24T12:00:00+02:00', Date.parse('2026-10-25T11:00:00+01:00'))).toBe(1);
  });
  it('řadí po termínu, upozornění, ostatní a nejstarší první', () => {
    expect(prioritySort([order(2), order(13), order(16), order(10), order(20), order(8)], now).map(o => o.order_number)).toEqual(['ZAK-20', 'ZAK-16', 'ZAK-13', 'ZAK-10', 'ZAK-8', 'ZAK-2']);
  });
  it('souhrny nepočítají odeslané jako opožděné', () => {
    expect(stats([order(3), order(10), order(17), order(30, { status: 'shipped', shipped_at: new Date(now).toISOString() })], now)).toEqual({ pending: 3, warning: 1, overdue: 1, today: 1 });
  });
  it('dnešní odeslání určuje v české časové zóně i okolo půlnoci', () => {
    expect(isToday('2026-10-05T22:30:00Z', Date.parse('2026-10-06T10:00:00Z'))).toBe(true);
    expect(isToday('2026-10-05T21:30:00Z', now)).toBe(false);
    expect(isToday(null, now)).toBe(false);
  });
});

describe('formuláře a export', () => {
  it('balení starších produktů začíná na nule a počítá chybějící kusy', () => {
    const product = { code: 'A', name: 'Produkt', variant: '', quantity: 4, produced_quantity: null };
    expect(packingStats([product])).toEqual({ packed: 0, required: 4, remaining: 4, completed: false });
    expect(packingStats([{ ...product, packed_quantity: 2 }])).toEqual({ packed: 2, required: 4, remaining: 2, completed: false });
    expect(packingStats([{ ...product, packed_quantity: 4 }]).completed).toBe(true);
    expect(validateOrder({ order_number: 'A', note: '', products: [{ ...product, packed_quantity: 5 }] })).toBeTruthy();
  });
  it('validuje povinná pole, délku a budoucí datum', () => {
    expect(validateOrder({ order_number: ' ', customer: 'A', note: '' }, now)).toBeTruthy();
    expect(validateOrder({ order_number: 'A', customer: ' ', note: '' }, now)).toBeNull();
    expect(validateOrder({ order_number: 'A', note: '' }, now)).toBeNull();
    expect(validateOrder({ order_number: 'A', customer: 'x'.repeat(201), note: '' }, now)).toBeTruthy();
    expect(validateOrder({ order_number: 'A', customer: 'B', note: 'x'.repeat(5001) }, now)).toBeTruthy();
    expect(validateOrder({ order_number: 'A', customer: 'B', note: '', created_at: new Date(now + 1).toISOString() }, now)).toBeTruthy();
    expect(validateOrder({ order_number: 'A', customer: 'B', note: '', created_at: 'invalid' }, now)).toBeTruthy();
    expect(validateOrder({ order_number: 'A', customer: 'B', note: '' }, now)).toBeNull();
  });
  it('CSV ošetří uvozovky, oddělovače, nové řádky a vzorce', () => {
    expect(csvCell('A;"B"\nC')).toBe('"A;""B""\nC"');
    expect(csvCell('=1+1')).toBe('"\'=1+1"');
    expect(csvCell(' \t@SUM(A1)')).toBe('"\' \t@SUM(A1)"');
  });
  it('export obsahuje jen odeslané zakázky a UTF-8 BOM pro český Excel', () => {
    const csv = historyCsv([order(3), order(4, { status: 'shipped', shipped_at: new Date(now).toISOString(), shipped_by: 'worker' })], new Map([['worker', { id: 'worker', display_name: 'Jan Novák', role: 'SKLADNIK', is_active: true }]]));
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toContain('Jan Novák');
    expect(csv).toContain('ZAK-4');
    expect(csv).not.toContain('ZAK-3');
  });
});

describe('veřejná konfigurace', () => {
  it('odmítá chybějící konfiguraci a secret klíč', () => {
    expect(validateConfig(undefined, undefined)).toBeTruthy();
    expect(validateConfig('https://example.supabase.co', 'sb_secret_wrong')).toBeTruthy();
    expect(validateConfig('https://example.supabase.co', 'sb_publishable_public')).toBeNull();
  });
  it('odmítá service_role JWT, přijímá veřejný anon JWT', () => {
    const jwt = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`;
    expect(validateConfig('https://example.supabase.co', jwt('service_role'))).toBeTruthy();
    expect(validateConfig('https://example.supabase.co', jwt('anon'))).toBeNull();
  });
});
