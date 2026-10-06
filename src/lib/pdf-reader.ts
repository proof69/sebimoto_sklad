import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseOrderPdf, type PdfCell } from './pdf-parser';

GlobalWorkerOptions.workerSrc = workerUrl;
export class PdfImportError extends Error {}
export async function importOrderPdf(file: File, signal: AbortSignal) {
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new PdfImportError('Vyberte soubor PDF.');
  if (file.size > 15 * 1024 * 1024) throw new PdfImportError('PDF může mít nejvýše 15 MB.');
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const abort = () => { void task.destroy(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) throw new DOMException('Import zrušen.', 'AbortError');
    const document = await task.promise;
    if (document.numPages > 25) throw new PdfImportError('PDF může mít nejvýše 25 stran.');
    const cells: PdfCell[] = [];
    for (let pageNo = 1; pageNo <= document.numPages; pageNo++) {
      const page = await document.getPage(pageNo);
      const content = await page.getTextContent();
      for (const item of content.items) if ('str' in item && item.str.trim()) cells.push({ text: item.str, x: item.transform[4], y: page.view[3] - item.transform[5], page: pageNo });
      page.cleanup();
    }
    if (!cells.length) throw new PdfImportError('PDF neobsahuje čitelný text. Naskenované dokumenty zatím nelze automaticky importovat.');
    try { return parseOrderPdf(cells, file.name); }
    catch (err) { throw new PdfImportError(err instanceof Error ? err.message : 'Údaje z PDF se nepodařilo rozpoznat.'); }
  } catch (error) {
    if (signal.aborted) throw new DOMException('Import zrušen.', 'AbortError');
    if (error instanceof Error && error.name === 'PasswordException') throw new PdfImportError('PDF je chráněné heslem. Importujte nechráněnou kopii.');
    if (error instanceof Error && error.name === 'InvalidPDFException') throw new PdfImportError('Soubor není platné PDF nebo je poškozený.');
    throw error;
  } finally { signal.removeEventListener('abort', abort); await task.destroy(); }
}
