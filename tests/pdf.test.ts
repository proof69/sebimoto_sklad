import { describe, expect, it } from 'vitest';
import { czechCalendarDate, parseOrderPdf, pragueMidnight, type PdfCell } from '../src/lib/pdf-parser';
import { validateOrder } from '../src/lib/orders';

const cell = (text: string, x: number, y: number, page = 1): PdfCell => ({ text, x, y, page });
function sample(): PdfCell[] {
  return [cell('Zakázka', 27, 42), cell('00001234', 103, 42), cell('Kód zákazníka', 30, 106), cell('00000001', 102, 108), cell('Objednávka', 233, 105), cell('00005678', 288, 108), cell('Založeno:', 366, 106), cell('05.10.2026', 414, 106), cell('Termín:', 482, 106), cell('5.10.2026', 519, 106), cell('Popis', 27, 138), cell('Testovací popis bez osobních údajů', 27, 152), cell('Produkt', 26, 206), cell('Varianta', 323, 206), cell('Počet kusů', 380, 206), cell('Počet vyrobených kusů', 468, 206), cell('TEST-001', 27, 224), cell('První produkt', 108, 224), cell('A', 322, 224), cell('2', 418, 225), cell('TEST-002', 27, 240), cell('Druhý produkt', 108, 241), cell('B', 322, 240), cell('3', 418, 241), cell('1', 550, 241), cell('Celkem:', 332, 331), cell('5', 418, 332), cell('Počet položek: 2', 24, 357), cell('Vytvořeno 6.10.2026 10:09:08 uživatelem', 24, 803)];
}
describe('import PDF zakázky', () => {
  it('zachová nuly v číslech a používá Založeno, nikoli datum vytištění', () => {
    const parsed = parseOrderPdf(sample().reverse(), 'test.pdf');
    expect(parsed.order_number).toBe('00001234');
    expect(parsed.source_order_number).toBe('00005678');
    expect(parsed.customer_code).toBe('00000001');
    expect(parsed.created_at).toBe('2026-10-04T22:00:00.000Z');
    expect(parsed.requested_ship_date).toBe('2026-10-05');
    expect(parsed.note).toBe('Testovací popis bez osobních údajů');
    expect(parsed.customer).toBe('');
    expect(parsed.products).toEqual([{ code: 'TEST-001', name: 'První produkt', variant: 'A', quantity: 2, produced_quantity: null }, { code: 'TEST-002', name: 'Druhý produkt', variant: 'B', quantity: 3, produced_quantity: 1 }]);
    expect(validateOrder(parsed, Date.parse('2026-10-06T12:00:00Z'))).toBeNull();
  });
  it('varuje při chybějících údajích a nesouladu počtu produktů', () => {
    expect(parseOrderPdf([cell('Neznámý dokument', 10, 10)], 'unknown.pdf').warnings.length).toBeGreaterThanOrEqual(3);
    expect(parseOrderPdf(sample().map(c => c.text === 'Počet položek: 2' ? { ...c, text: 'Počet položek: 3' } : c), 'test.pdf').warnings.some(w => w.includes('načteno bylo 2'))).toBe(true);
  });
  it('nesloučí produkty ze dvou různých zakázek do jedné', () => {
    expect(() => parseOrderPdf([...sample(), cell('Zakázka 00009999', 27, 42, 2)], 'combined.pdf')).toThrow('více různých zakázek');
  });
  it('nepřijímá neplatné datum a respektuje změnu letního času', () => {
    expect(czechCalendarDate('31.2.2026')).toBeNull();
    expect(czechCalendarDate('1. 10. 2026')).toBe('2026-10-01');
    expect(pragueMidnight('2026-01-05')).toBe('2026-01-04T23:00:00.000Z');
  });
  it('validace odmítne neplatné množství a příliš mnoho produktů', () => {
    const parsed = parseOrderPdf(sample(), 'test.pdf');
    expect(validateOrder({ ...parsed, products: [{ ...parsed.products![0], quantity: 0 }] })).toBeTruthy();
    expect(validateOrder({ ...parsed, products: Array(201).fill(parsed.products![0]) })).toBeTruthy();
  });
});
