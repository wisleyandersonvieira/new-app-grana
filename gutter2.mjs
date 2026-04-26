import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

const buf = fs.readFileSync('/tmp/fatura.pdf');
const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
for (let i = 2; i <= 4; i++) {
  const page = await pdf.getPage(i);
  const content = await page.getTextContent();
  const items = content.items.filter(it => it.str.trim()).map(it => ({ x: it.transform[4], width: it.width ?? 0 }));
  const pageWidth = page.getViewport({scale:1}).width;
  const midpoint = pageWidth / 2;

  const searchMin = midpoint - 60;
  const searchMax = midpoint + 80;
  const xs = items.map(i => i.x).filter((x) => x >= searchMin - 20 && x <= searchMax + 20).sort((a,b)=>a-b);
  let bestStart = midpoint, bestEnd = midpoint;
  for (let j = 1; j < xs.length; j++) {
    if (xs[j-1] > searchMax || xs[j] < searchMin) continue;
    if (xs[j] - xs[j-1] > bestEnd - bestStart) { bestStart = xs[j-1]; bestEnd = xs[j]; }
  }
  console.log(`Page ${i}: midpoint=${midpoint.toFixed(0)}, gap=[${bestStart.toFixed(0)}-${bestEnd.toFixed(0)}], split=${((bestStart+bestEnd)/2).toFixed(0)}, gapSize=${(bestEnd-bestStart).toFixed(0)}`);
}
