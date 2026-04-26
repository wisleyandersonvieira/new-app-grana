// Simulate the pdf-text extraction pipeline using node-side pdfjs
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

const buf = fs.readFileSync('/tmp/fatura.pdf');
const data = new Uint8Array(buf);
const pdf = await pdfjsLib.getDocument({ data }).promise;

const pages = [];
const allTextItems = [];

for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const textItems = [];
  for (const item of content.items) {
    if (!item.str || !item.str.trim()) continue;
    const raw = { str: item.str, transform: [...item.transform], width: item.width ?? 0, pageNumber: i };
    textItems.push(raw);
    allTextItems.push(raw);
  }
  pages.push({ pageNumber: i, width: viewport.width, height: viewport.height, columns: [], tokens: textItems.map(t => ({...t, x: t.transform[4], y: t.transform[5]})), textItems });
}

const doc = { text: '', pages, textItems: allTextItems };

// Now import the parser
const { parseItauMonthlyDocument } = await import('./src/lib/fatura-import/parsers/itau-parser-mensal.ts');

const result = parseItauMonthlyDocument(doc, { competencia: '2026-04', dueDate: '2026-04-10', statementDate: '2026-04-03' });

console.log('\n=== ITEMS ===');
console.log('Total items:', result.items.length);
console.log('Expected total:', result.diagnostics.expectedTotal);
console.log('Captured sum:', result.diagnostics.capturedSum);
console.log('Difference:', result.diagnostics.difference);
console.log('\nItems by page/column/section:');
for (const e of result.diagnostics.itemsByPageColumnSection) {
  console.log(`  page=${e.pageNumber} col=${e.columnIndex} section=${e.section}: ${e.count} items, total=${e.total}`);
}
console.log('\nImported items:');
for (const it of result.items) {
  console.log(`  ${it.data_compra} | ${it.descricao_original} | ${it.valor} | ${it.parcelas ?? '-'}`);
}
console.log('\n=== DIAGNOSTICS ===');
console.log('Ignored date lines:', result.diagnostics.ignoredDateLines.length);
for (const ign of result.diagnostics.ignoredDateLines.slice(0, 30)) {
  console.log(`  [${ign.section} p${ign.pageNumber} c${ign.columnIndex}] ${ign.reason}: ${ign.line}`);
}
console.log('Orphan amounts:', result.diagnostics.orphanAmountLines.length);
for (const orf of result.diagnostics.orphanAmountLines.slice(0, 30)) {
  console.log(`  [${orf.section} p${orf.pageNumber} c${orf.columnIndex}] ${orf.line}`);
}
console.log('Failures:', result.diagnostics.failures.length);
for (const f of result.diagnostics.failures.slice(0, 30)) {
  console.log(`  [${f.section} p${f.pageNumber} c${f.columnIndex}] ${f.reason}: ${f.line}`);
}
