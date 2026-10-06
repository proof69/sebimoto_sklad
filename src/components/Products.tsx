import { CheckCircle2, LoaderCircle, Minus, Plus, Trash2 } from 'lucide-react';
import type { Order, Product } from '../types';
import { useOrders } from '../data/OrdersProvider';
import { useToast } from './Toast';
import { errorMessage } from '../lib/errors';
import { packingStats } from '../lib/orders';

export function ProductTable({ products, order }: { products: Product[]; order?: Order }) {
  const { pack, packingBusyOrders } = useOrders();
  const notify = useToast();
  const canPack = order?.status === 'pending';
  const busy = order ? packingBusyOrders.has(order.id) : false;
  const change = async (index: number, delta: 1 | -1) => {
    if (!order || busy) return;
    try { await pack(order, index, delta); } catch (err) { notify(errorMessage(err), 'error'); }
  };
  if (!products.length) return null;
  return <div className="products-scroll"><table className="products-table"><caption className="sr-only">Produkty zakázky a průběh balení</caption><thead><tr><th>Kód</th><th>Produkt</th><th>Varianta</th><th>Kusů</th><th>Vyrobeno</th><th>Zabaleno</th></tr></thead><tbody>{products.map((item, index) => {
    const packed = item.packed_quantity ?? 0;
    const complete = packed === item.quantity;
    return <tr className={complete ? 'packing-complete' : ''} key={index}><td data-label="Kód">{item.code || '—'}</td><td data-label="Produkt">{item.name}</td><td data-label="Varianta">{item.variant || '—'}</td><td data-label="Kusů">{item.quantity}</td><td data-label="Vyrobeno">{item.produced_quantity ?? '—'}</td><td data-label="Zabaleno" className="packing-cell"><div className="packing-counter" aria-busy={busy}>{canPack && <button type="button" className="packing-button minus" aria-label={`Odebrat zabalený kus: ${item.name}`} disabled={busy || packed === 0} onClick={() => void change(index, -1)}><Minus size={19} /></button>}<span className="packing-value" aria-live="polite">{complete && <CheckCircle2 size={16} />}<strong>{packed} / {item.quantity}</strong></span>{canPack && <button type="button" className="packing-button plus" aria-label={`Zabalit jeden kus: ${item.name}`} disabled={busy || complete} onClick={() => void change(index, 1)}>{busy ? <LoaderCircle size={19} className="spin" /> : <Plus size={19} />}</button>}</div><span className="packing-item-note">{complete ? 'Zabaleno vše' : `Chybí ${item.quantity - packed} ks`}</span></td></tr>;
  })}</tbody></table></div>;
}

export function ProductsSummary({ products = [], order }: { products?: Product[]; order?: Order }) {
  if (!products.length) return null;
  const progress = packingStats(products);
  return <details className={`products-summary ${progress.completed ? 'all-packed' : ''}`}><summary>Produkty ({products.length}) · zabaleno {progress.packed} z {progress.required} ks{progress.completed && <span className="packing-done-badge">Vše zabaleno</span>}</summary><div className="packing-overview"><progress value={progress.packed} max={progress.required} aria-label="Průběh balení zakázky" /><p>{progress.completed ? 'Všechny produkty jsou v bedně.' : order?.status === 'shipped' ? `${progress.remaining} ks nebylo označeno jako zabalené.` : `Zbývá zabalit ${progress.remaining} ks.`}</p></div><ProductTable products={products} order={order} /></details>;
}

export function ProductEditor({ products, onChange, disabled }: { products: Product[]; onChange: (products: Product[]) => void; disabled: boolean }) {
  const update = (index: number, patch: Partial<Product>) => onChange(products.map((item, i) => i === index ? { ...item, ...patch } : item));
  return <fieldset className="product-editor" disabled={disabled}><legend>Produkty <span className="optional">volitelné</span></legend>
    {products.map((item, index) => <div className="product-edit-row" key={index}><div className="product-edit-heading"><strong>Produkt {index + 1}{(item.packed_quantity ?? 0) > 0 && <span className="product-packed-hint"> · zabaleno {item.packed_quantity} ks</span>}</strong><button type="button" className="icon-button delete-icon" aria-label={`Odstranit produkt ${index + 1}`} onClick={() => onChange(products.filter((_, i) => i !== index))}><Trash2 size={18} /></button></div><div className="product-edit-fields"><label>Kód<input maxLength={80} value={item.code} onChange={e => update(index, { code: e.target.value })} /></label><label className="product-name-field">Název produktu<input required maxLength={500} value={item.name} onChange={e => update(index, { name: e.target.value })} /></label><label>Varianta<input maxLength={100} value={item.variant} onChange={e => update(index, { variant: e.target.value })} /></label><label>Počet kusů<input type="number" required min={1} max={1_000_000} step={1} value={Number.isFinite(item.quantity) ? item.quantity : ''} onChange={e => update(index, { quantity: e.target.value === '' ? NaN : Number(e.target.value) })} /></label><label>Vyrobené kusy<input type="number" min={0} max={1_000_000} step={1} value={item.produced_quantity === null || !Number.isFinite(item.produced_quantity) ? '' : item.produced_quantity} onChange={e => update(index, { produced_quantity: e.target.value === '' ? null : Number(e.target.value) })} /></label></div></div>)}
    <button className="button secondary" type="button" disabled={disabled || products.length >= 200} onClick={() => onChange([...products, { code: '', name: '', variant: '', quantity: 1, produced_quantity: null }])}><Plus size={17} />Přidat produkt</button>
  </fieldset>;
}
