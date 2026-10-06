import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, children, onClose, busy = false, wide = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className={`modal ${wide ? 'wide' : ''}`} aria-labelledby={titleId} aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => { if (event.target === dialog.current && !busy) {
      const rect = dialog.current.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    } }}>
    <div className="modal-header"><h2 id={titleId}>{title}</h2><button className="icon-button" type="button" aria-label="Zavřít dialog" disabled={busy} onClick={onClose}><X size={22} /></button></div>
    {children}
  </dialog>;
}

export function ConfirmDialog({ title, children, confirmLabel, destructive = false, busy, onConfirm, onClose }: { title: string; children: ReactNode; confirmLabel: string; destructive?: boolean; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return <Modal title={title} onClose={onClose} busy={busy}>
    <div className="modal-body confirmation-copy">{children}</div>
    <div className="modal-footer"><button className="button secondary" autoFocus disabled={busy} onClick={onClose}>Zrušit</button><button className={`button ${destructive ? 'danger' : 'primary'}`} disabled={busy} onClick={onConfirm}>{busy ? 'Probíhá ukládání…' : confirmLabel}</button></div>
  </Modal>;
}
