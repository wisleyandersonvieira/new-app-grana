import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

const buf = fs.readFileSync('/tmp/fatura.pdf');
const data = new Uint8Array(buf);
const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
console.log('PAGES:', pdf.numPages);

for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  console.log(`\n=== PAGE ${i} (w=${viewport.width.toFixed(0)} h=${viewport.height.toFixed(0)}) ===`);
  // Group by y
  const items = content.items.filter((it) => it.str && it.str.trim());
  const rows = new Map();
  for (const it of items) {
    const y = Math.round(it.transform[5]);
    let key = null;
    for (const k of rows.keys()) if (Math.abs(k - y) <= 3) { key = k; break; }
    if (key === null) key = y;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push({ x: it.transform[4], str: it.str, w: it.width });
  }
  const sortedKeys = [...rows.keys()].sort((a,b)=>b-a);
  for (const y of sortedKeys) {
    const tokens = rows.get(y).sort((a,b)=>a.x-b.x);
    const line = tokens.map(t => `[${t.x.toFixed(0)}]${t.str}`).join(' | ');
    console.log(`y=${y}: ${line}`);
  }
}
