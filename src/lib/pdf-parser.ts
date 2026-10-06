import type { OrderInput, Product } from '../types';

export type PdfCell = { text: string; x: number; y: number; page: number };
export type PdfDraft = OrderInput & { warnings: string[] };
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function pdfRows(cells: PdfCell[]) {
  const rows: { page: number; y: number; cells: PdfCell[]; text: string }[] = [];
  for (const cell of [...cells].filter(c => c.text.trim()).sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)) {
    let row = rows.at(-1);
    if (!row || row.page !== cell.page || Math.abs(row.y - cell.y) > 3.5) {
      row = { page: cell.page, y: cell.y, cells: [], text: '' };
      rows.push(row);
    }
    row.cells.push(cell);
  }
  for (const row of rows) { row.cells.sort((a, b) => a.x - b.x); row.text = row.cells.map(c => c.text.trim()).join(' '); }
  return rows;
}

export function czechCalendarDate(value: string): string | null {
  const match = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function pragueMidnight(date: string) {
  const base = Date.parse(`${date}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(base));
  const hours = Number(parts.find(p => p.type === 'hour')?.value);
  const minutes = Number(parts.find(p => p.type === 'minute')?.value);
  return new Date(base - (hours * 60 + minutes) * 60_000).toISOString();
}

export function parseOrderPdf(cells: PdfCell[], filename: string): PdfDraft {
  const rows = pdfRows(cells);
  const text = rows.map(r => r.text).join('\n');
  const numbers = new Set([...text.matchAll(/Zak[áa]zka\s*:?\s*([\w/\-]+)/gi)].map(match => match[1]));
  if (numbers.size > 1) throw new Error('PDF obsahuje více různých zakázek. Importujte každou zakázku samostatně.');
  const warnings: string[] = [];
  const number = /Zak[áa]zka\s*:?\s*([\w/\-]+)/i.exec(text)?.[1] ?? '';
  const sourceOrder = /Objedn[áa]vka\s*:?\s*([\w/\-]+)/i.exec(text)?.[1] ?? '';
  const customerCode = /K[óo]d\s+z[áa]kazn[ií]ka\s*:?\s*([\w/\-]+)/i.exec(text)?.[1] ?? '';
  const dateText = /Zalo[žz]eno\s*:?\s*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i.exec(text)?.[1];
  const date = dateText ? czechCalendarDate(dateText) : null;
  const deadlineText = /Term[ií]n\s*:?\s*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i.exec(text)?.[1];
  const deadline = deadlineText ? czechCalendarDate(deadlineText) : null;
  if (!number) warnings.push('Číslo zakázky nebylo rozpoznáno. Doplňte ho ručně.');
  if (!date) warnings.push('Datum „Založeno“ nebylo rozpoznáno. Zadejte skutečné datum vytvoření.');
  else warnings.push('PDF uvádí pouze datum. Čas vytvoření je nastaven na 00:00 v české časové zóně.');
  if (deadlineText && !deadline) warnings.push('Termín v PDF není platné datum. Zkontrolujte jej.');

  const products: Product[] = [];
  let columns: { variant: number; quantity: number; produced: number } | null = null;
  let inTable = false;
  let page = 0;
  for (const row of rows) {
    if (row.page !== page) { page = row.page; inTable = false; columns = null; }
    const variant = row.cells.find(c => normalized(c.text).trim() === 'varianta');
    const quantity = row.cells.find(c => normalized(c.text).trim() === 'pocet kusu');
    const produced = row.cells.find(c => normalized(c.text).includes('pocet vyrobenych'));
    if (variant && quantity && produced && normalized(row.text).includes('produkt')) {
      columns = { variant: variant.x - 3, quantity: quantity.x - 3, produced: produced.x - 3 };
      inTable = true; continue;
    }
    if (/^(celkem|pocet polozek|vytvoreno|strana)\b/.test(normalized(row.text))) { inTable = false; continue; }
    if (!inTable || !columns) continue;
    const left = row.cells.filter(c => c.x < columns!.variant);
    const variantText = row.cells.filter(c => c.x >= columns!.variant && c.x < columns!.quantity).map(c => c.text).join(' ').trim();
    const quantityText = row.cells.filter(c => c.x >= columns!.quantity && c.x < columns!.produced).map(c => c.text).join('').trim();
    const producedText = row.cells.filter(c => c.x >= columns!.produced).map(c => c.text).join('').trim();
    if (!left.length) continue;
    if (!quantityText && !variantText && products.length) {
      products[products.length - 1].name += ' ' + left.map(c => c.text).join(' '); continue;
    }
    const combined = left.map(c => c.text.trim()).join(' ');
    const match = /^(\S+)\s+(.+)$/.exec(combined);
    if (!match || !/^\d[\d\s]*$/.test(quantityText)) {
      warnings.push(`Některou produktovou řádku se nepodařilo načíst: ${combined.slice(0, 80)}. Zkontrolujte položky.`); continue;
    }
    const quantityValue = Number(quantityText.replace(/\s/g, ''));
    const producedValue = producedText ? Number(producedText.replace(/\s/g, '')) : null;
    products.push({ code: match[1], name: match[2], variant: variantText, quantity: quantityValue, produced_quantity: producedValue });
  }
  const count = /Po[čc]et\s+polo[žz]ek\s*:?\s*(\d+)/i.exec(text)?.[1];
  if (count && Number(count) !== products.length) warnings.push(`PDF uvádí ${count} položek, načteno bylo ${products.length}. Před uložením seznam opravte.`);
  if (!products.length) warnings.push('Produkty nebyly rozpoznány. Můžete je přidat ručně.');
  const descriptionStart = rows.findIndex(row => normalized(row.text).trim() === 'popis');
  const description: string[] = [];
  if (descriptionStart >= 0) {
    for (const row of rows.slice(descriptionStart + 1)) {
      if (normalized(row.text).includes('produkt') && normalized(row.text).includes('varianta')) break;
      description.push(row.text);
    }
  }
  return { order_number: number, customer: '', note: description.join('\n'), created_at: date ? pragueMidnight(date) : undefined, products, source_order_number: sourceOrder, customer_code: customerCode, requested_ship_date: deadline, source_file_name: filename, warnings };
}
