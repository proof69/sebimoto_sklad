import { Plus, Trash2 } from 'lucide-react';
import type { Product } from '../types';

export function ProductTable({ products }: { products: Product[] }) {
  if (!products.length) return null;
  return <div className="products-scroll"><table className="products-table"><caption className="sr-only">Produkty zakázky</caption><thead><tr><th>Kód</th><th>Produkt</th><th>Varianta</th><th>Kusů</th><th>Vyrobeno</th></tr></thead><tbody>{products.map((item, index) => <tr key={index}><td>{item.code || '—'}</td><td>{item.name}</td><td>{item.variant || '—'}</td><td>{item.quantity}</td><td>{item.produced_quantity ?? '—'}</td></tr>)}</tbody></table></div>;
}

export function ProductsSummary({ products = [] }: { products?: Product[] }) {
  if (!products.length) return null;
  return <details className="products-summary"><summary>Produkty ({products.length}) · celkem {products.reduce((total, p) => total + p.quantity, 0)} ks</summary><ProductTable products={products} /></details>;
}

export function ProductEditor({ products, onChange, disabled }: { products: Product[]; onChange: (products: Product[]) => void; disabled: boolean }) {
  const update = (index: number, patch: Partial<Product>) => onChange(products.map((item, i) => i === index ? { ...item, ...patch } : item));
  return <fieldset className="product-editor" disabled={disabled}><legend>Produkty <span className="optional">volitelné</span></legend>
    {products.map((item, index) => <div className="product-edit-row" key={index}><div className="product-edit-heading"><strong>Produkt {index + 1}</strong><button type="button" className="icon-button delete-icon" aria-label={`Odstranit produkt ${index + 1}`} onClick={() => onChange(products.filter((_, i) => i !== index))}><Trash2 size={18} /></button></div><div className="product-edit-fields"><label>Kód<input maxLength={80} value={item.code} onChange={e => update(index, { code: e.target.value })} /></label><label className="product-name-field">Název produktu<input required maxLength={500} value={item.name} onChange={e => update(index, { name: e.target.value })} /></label><label>Varianta<input maxLength={100} value={item.variant} onChange={e => update(index, { variant: e.target.value })} /></label><label>Počet kusů<input type="number" required min={1} max={1_000_000} step={1} value={Number.isFinite(item.quantity) ? item.quantity : ''} onChange={e => update(index, { quantity: e.target.value === '' ? NaN : Number(e.target.value) })} /></label><label>Vyrobené kusy<input type="number" min={0} max={1_000_000} step={1} value={item.produced_quantity === null || !Number.isFinite(item.produced_quantity) ? '' : item.produced_quantity} onChange={e => update(index, { produced_quantity: e.target.value === '' ? null : Number(e.target.value) })} /></label></div></div>)}
    <button className="button secondary" type="button" disabled={disabled || products.length >= 200} onClick={() => onChange([...products, { code: '', name: '', variant: '', quantity: 1, produced_quantity: null }])}><Plus size={17} />Přidat produkt</button>
  </fieldset>;
}
