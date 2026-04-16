import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

type TextToken = { x: number; y: number; str: string; width: number };

/**
 * Splits tokens into columns when a page has a clear two-column layout.
 * Detects the split by looking for a gap in X positions.
 */
function splitIntoColumns(tokens: TextToken[], pageWidth: number): TextToken[][] {
  if (tokens.length === 0) return [[]];

  const midpoint = pageWidth / 2;
  const Y_TOL = 3;
  const COL_GAP_THRESHOLD = 40; // minimum X gap to consider a column split

  // 1. Group tokens into visual rows by Y proximity
  const sorted = [...tokens].sort((a, b) => b.y - a.y);
  const visualRows: TextToken[][] = [];
  let curRow: TextToken[] = [sorted[0]];
  let curY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - curY) <= Y_TOL) {
      curRow.push(sorted[i]);
    } else {
      visualRows.push(curRow);
      curRow = [sorted[i]];
      curY = sorted[i].y;
    }
  }
  visualRows.push(curRow);

  // 2. For each visual row, check for a large X gap that indicates two columns.
  //    Split such rows into sub-rows at the gap.
  const subRows: TextToken[][] = [];
  for (const row of visualRows) {
    if (row.length <= 1) {
      subRows.push(row);
      continue;
    }
    const byX = [...row].sort((a, b) => a.x - b.x);
    // Find the largest gap
    let maxGap = 0;
    let gapIdx = -1;
    for (let i = 1; i < byX.length; i++) {
      const gap = byX[i].x - (byX[i - 1].x + byX[i - 1].width);
      if (gap > maxGap) {
        maxGap = gap;
        gapIdx = i;
      }
    }
    // Only split if the gap is large AND the split point is near the midpoint
    if (maxGap > COL_GAP_THRESHOLD && gapIdx > 0) {
      const gapCenter = (byX[gapIdx - 1].x + byX[gapIdx - 1].width + byX[gapIdx].x) / 2;
      // The gap should be roughly around the page midpoint (within 30% of page width)
      if (Math.abs(gapCenter - midpoint) < pageWidth * 0.3) {
        subRows.push(byX.slice(0, gapIdx));
        subRows.push(byX.slice(gapIdx));
        continue;
      }
    }
    subRows.push(row);
  }

  // 3. Assign each sub-row to left or right column based on its leftmost token
  const leftTokens: TextToken[] = [];
  const rightTokens: TextToken[] = [];

  for (const row of subRows) {
    const minX = Math.min(...row.map((t) => t.x));
    if (minX < midpoint - 10) {
      leftTokens.push(...row);
    } else {
      rightTokens.push(...row);
    }
  }

  // Only split if both sides have a reasonable number of tokens
  if (leftTokens.length > 5 && rightTokens.length > 5) {
    return [leftTokens, rightTokens];
  }

  return [tokens];
}

/**
 * Groups tokens by Y position (within tolerance) and reconstructs lines
 * by sorting tokens left-to-right within each group.
 */
function tokensToLines(tokens: TextToken[]): string[] {
  if (tokens.length === 0) return [];

  const sorted = [...tokens].sort((a, b) => b.y - a.y);

  const lines: TextToken[][] = [];
  let currentLine: TextToken[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - currentY) <= 3) {
      currentLine.push(sorted[i]);
    } else {
      lines.push(currentLine);
      currentLine = [sorted[i]];
      currentY = sorted[i].y;
    }
  }
  lines.push(currentLine);

  return lines.map((line) => {
    line.sort((a, b) => a.x - b.x);
    let result = '';
    for (let i = 0; i < line.length; i++) {
      if (i > 0) {
        const gap = line[i].x - (line[i - 1].x + line[i - 1].width);
        result += gap > 3 ? ' ' : '';
      }
      result += line[i].str;
    }
    return result.trim();
  });
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allLines: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const tokens: TextToken[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const castItem = item as { str: string; transform: number[]; width: number };
      tokens.push({
        x: castItem.transform[4],
        y: castItem.transform[5],
        str: castItem.str,
        width: castItem.width,
      });
    }

    // Split into columns if the page has a two-column layout
    const columns = splitIntoColumns(tokens, viewport.width);
    for (const colTokens of columns) {
      const lines = tokensToLines(colTokens);
      allLines.push(...lines);
    }
  }

  return allLines.filter((l) => l.length > 0).join('\n');
}
