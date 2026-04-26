import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

const buf = fs.readFileSync('/tmp/fatura.pdf');
const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
for (let i = 2; i <= 3; i++) {
  const page = await pdf.getPage(i);
  const content = await page.getTextContent();
  const xs = content.items.filter(it => it.str.trim()).map(it => Math.round(it.transform[4]));
  // Histogram with binsize 5
  const hist = new Map();
  xs.forEach(x => hist.set(x, (hist.get(x) ?? 0) + 1));
  console.log(`\nPage ${i} x positions (sorted):`);
  [...hist.entries()].sort((a, b) => a[0] - b[0]).forEach(([x, c]) => {
    if (c >= 2) console.log(`  x=${x}: ${c}`);
  });
}
