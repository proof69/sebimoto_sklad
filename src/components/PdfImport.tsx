import { useEffect, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { importOrderPdf, PdfImportError } from '../lib/pdf-reader';
import type { PdfDraft } from '../lib/pdf-parser';
import { Modal } from './Modal';
import { Loading } from './States';

export function PdfImport({ onImported, onClose }: { onImported: (draft: PdfDraft) => void; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function read(file: File) {
    if (loading) return;
    setLoading(true); setError(null); setFilename(file.name);
    const current = new AbortController(); controller.current = current;
    try { const draft = await importOrderPdf(file, current.signal); if (!current.signal.aborted) onImported(draft); }
    catch (err) { if (!current.signal.aborted) setError(err instanceof PdfImportError ? err.message : 'PDF se nepodařilo načíst. Zkuste soubor znovu vybrat nebo obnovte stránku.'); }
    finally { if (!current.signal.aborted) setLoading(false); }
  }
  return <Modal title="Import zakázky z PDF" onClose={() => { controller.current?.abort(); onClose(); }} wide>
    <div className="modal-body form-stack"><p className="muted">Vyberte PDF ve formátu zakázky Sebimoto. Před uložením zkontrolujete číslo, datum a všechny produkty. PDF se čte pouze v tomto prohlížeči.</p>
      {loading ? <Loading label={`Načítání ${filename}…`} /> : <label className="pdf-dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void read(file); }}><FileUp size={35} /><span>Vybrat PDF nebo přetáhnout soubor</span><input type="file" accept="application/pdf,.pdf" aria-label="Vybrat PDF zakázky" onChange={e => { const file = e.target.files?.[0]; if (file) void read(file); }} /><span className="field-help">Nejvýše 15 MB a 25 stran. Naskenované PDF bez textu není podporované.</span></label>}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div><div className="modal-footer"><button type="button" className="button secondary" onClick={() => { controller.current?.abort(); onClose(); }}>{loading ? 'Zrušit načítání' : 'Zavřít'}</button></div>
  </Modal>;
}
