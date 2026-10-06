// Umělé PDF bez zákaznických dat, vhodné i pro veřejné CI.
export function samplePdf() {
  const line = (x: number, y: number, text: string) => `BT /F1 10 Tf ${x} ${842 - y} Td (${text}) Tj ET`;
  const content = [line(27, 42, 'Zakazka'), line(105, 42, 'PDF-TEST-001'), line(30, 106, 'Kod zakaznika'), line(103, 106, 'CUST-001'), line(233, 106, 'Objednavka'), line(295, 106, 'OBJ-001'), line(366, 106, 'Zalozeno:'), line(420, 106, '05.10.2026'), line(27, 138, 'Popis'), line(27, 152, 'Testovaci poznamka'), line(26, 206, 'Produkt'), line(323, 206, 'Varianta'), line(380, 206, 'Pocet kusu'), line(468, 206, 'Pocet vyrobenych kusu'), line(27, 224, 'SKU-001'), line(108, 224, 'Testovaci produkt'), line(322, 224, 'A'), line(418, 224, '2'), line(550, 224, '1'), line(332, 331, 'Celkem:'), line(24, 357, 'Pocet polozek: 1')].join('\n');
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}
