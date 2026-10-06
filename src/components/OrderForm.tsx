import { useState, type FormEvent } from 'react';
import type { Order, OrderInput, OrderStatus } from '../types';
import { useOrders } from '../data/OrdersProvider';
import { validateOrder, toLocalInput } from '../lib/orders';
import { errorMessage } from '../lib/errors';
import { Modal, ConfirmDialog } from './Modal';
import { useToast } from './Toast';

export function OrderForm({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const { create, update } = useOrders();
  const notify = useToast();
  const [number, setNumber] = useState(order?.order_number ?? '');
  const [customer, setCustomer] = useState(order?.customer ?? '');
  const [note, setNote] = useState(order?.note ?? '');
  const initialDate = order ? toLocalInput(order.created_at) : '';
  const [customDate, setCustomDate] = useState(Boolean(order));
  const [createdAt, setCreatedAt] = useState(initialDate);
  const [status, setStatus] = useState<OrderStatus>(order?.status ?? 'pending');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function input(): OrderInput {
    const result: OrderInput = { order_number: number.trim(), customer: customer.trim(), note: note.trim() };
    if (order) result.status = status;
    // Zachováme přesný původní timestamp, pokud uživatel datum neměnil.
    if (customDate && (!order || createdAt !== initialDate)) {
      const date = new Date(createdAt);
      result.created_at = Number.isFinite(date.getTime()) ? date.toISOString() : 'invalid';
    }
    return result;
  }

  async function save() {
    if (busy) return;
    const payload = input();
    const validation = validateOrder(payload);
    if (validation) { setError(validation); setConfirming(false); return; }
    setBusy(true);
    setError(null);
    try {
      if (order) await update(order, payload); else await create(payload);
      notify(order ? 'Zakázka byla upravena.' : 'Nová zakázka byla vytvořena.');
      onClose();
    } catch (err) { setError(errorMessage(err)); setConfirming(false); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validateOrder(input());
    if (validation) { setError(validation); return; }
    if (order && status !== order.status) setConfirming(true);
    else void save();
  }

  return <>
    <Modal title={order ? `Upravit zakázku ${order.order_number}` : 'Nová zakázka'} onClose={onClose} busy={busy} wide>
      <form onSubmit={submit}>
        <div className="modal-body form-stack"><p className="muted form-intro">{order ? 'Upravte údaje zakázky. Změna stavu vyžaduje potvrzení.' : 'Zakázka se po uložení ihned objeví v přehledu skladu.'}</p>
          <label>Číslo zakázky <span className="required">*</span><input autoFocus required maxLength={80} value={number} onChange={event => setNumber(event.target.value)} placeholder="Např. ZAK-2026-001" disabled={busy} /></label>
          <label>Zákazník <span className="required">*</span><input required maxLength={200} value={customer} onChange={event => setCustomer(event.target.value)} placeholder="Název zákazníka nebo společnosti" disabled={busy} /></label>
          <label>Poznámka <span className="optional">volitelné</span><textarea rows={4} maxLength={5000} value={note} onChange={event => setNote(event.target.value)} placeholder="Pokyny k expedici, balení nebo další informace…" disabled={busy} /><span className="field-help">{note.length.toLocaleString('cs-CZ')} / 5 000 znaků</span></label>
          {!order && <label className="checkbox-label"><input type="checkbox" checked={customDate} onChange={event => setCustomDate(event.target.checked)} disabled={busy} />Zadat datum vytvoření zpětně</label>}
          {customDate ? <label>Datum a čas vytvoření<input type="datetime-local" step="1" required max={toLocalInput(new Date().toISOString())} value={createdAt} onChange={event => setCreatedAt(event.target.value)} disabled={busy} /><span className="field-help">Časová zóna zařízení: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Stáří se počítá od tohoto okamžiku.</span></label> : <p className="field-help">Datum vytvoření nastaví databáze automaticky při uložení.</p>}
          {order && <label>Stav<select value={status} onChange={event => setStatus(event.target.value as OrderStatus)} disabled={busy}><option value="pending">Čeká na odeslání</option><option value="shipped">Odesláno</option></select></label>}
          {error && <p className="inline-error" role="alert">{error}</p>}
        </div>
        <div className="modal-footer"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Zrušit</button><button className="button primary" disabled={busy}>{busy ? 'Ukládání…' : order ? 'Uložit změny' : 'Vytvořit zakázku'}</button></div>
      </form>
    </Modal>
    {confirming && <ConfirmDialog title={status === 'shipped' ? 'Potvrdit odeslání?' : 'Vrátit zakázku do čekajících?'} confirmLabel={status === 'shipped' ? 'Potvrdit a uložit' : 'Vrátit a uložit'} busy={busy} onClose={() => setConfirming(false)} onConfirm={() => void save()}><p>{status === 'shipped' ? 'Potvrzujete, že byla zakázka fyzicky odeslána. Čas a vaše jméno zaznamená databáze.' : 'Zakázka se vrátí do aktivního seznamu. Původní záznam o odeslání zůstane uložen v databázovém auditu.'}</p><p><strong>{number} · {customer}</strong></p></ConfirmDialog>}
  </>;
}
