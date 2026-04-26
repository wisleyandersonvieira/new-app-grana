import { extractPdfText } from './src/lib/fatura-import/pdf-text.ts';
import fs from 'fs';

const buf = fs.readFileSync('/tmp/fatura.pdf');
const file = new File([buf], 'fatura.pdf', { type: 'application/pdf' });
const result = await extractPdfText(file);
console.log('PAGES:', result.pages.length);
result.pages.forEach((p) => {
  console.log(`\n=== PAGE ${p.pageNumber} (${p.columns.length} cols, w=${p.width}) ===`);
  p.columns.forEach((c) => {
    console.log(`-- column ${c.columnIndex} (${c.lines.length} lines) --`);
    c.lines.forEach((l) => console.log(`y=${l.y.toFixed(0)} xMin=${l.xMin.toFixed(0)} xMax=${l.xMax.toFixed(0)}: ${l.text}`));
  });
});
