import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

type TextToken = { x: number; y: number; str: string; width: number };
const ROW_Y_TOLERANCE = 3;

function groupTokensByVisualRows(tokens: TextToken[]): TextToken[][] {
  if (tokens.length === 0) return [];

  const sorted = [...tokens].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextToken[][] = [];

  let currentRow: TextToken[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let index = 1; index < sorted.length; index += 1) {
    const token = sorted[index];
    if (Math.abs(token.y - currentY) <= ROW_Y_TOLERANCE) {
      currentRow.push(token);
      continue;
    }

    rows.push(currentRow);
    currentRow = [token];
    currentY = token.y;
  }

  rows.push(currentRow);
  return rows;
}

/**
 * Splits tokens into columns when a page has a clear two-column layout.
 * Detects the split by looking for a gap in X positions.
 * Exported for unit testing.
 */
export function splitIntoColumns(tokens: TextToken[], pageWidth: number): TextToken[][] {
  if (tokens.length === 0) return [[]];

  const midpoint = pageWidth / 2;
  const visualRows = groupTokensByVisualRows(tokens);

  // 2) Detect whether the page really has two independent columns.
  //
  // Problem with the naive "minX" approach: when both columns share the same Y
  // (as in the Itaú two-column transaction table), the leftmost token of each
  // visual row always belongs to the LEFT column, so rightRowCount never grows
  // and the two-column layout is never detected.
  //
  // Fix: count left and right independently.
  // - leftRowCount  : rows whose leftmost token starts on the left half.
  // - rightRowCount : rows that have a token STARTING within the first 30% of
  //   the right half (i.e. t.x in [midpoint, midpoint + 0.3*pageWidth]).
  //
  //   A single far-right amount token on a one-column page starts near the right
  //   edge (x ≈ 85–90% of pageWidth), well outside this window, so it does NOT
  //   qualify. A real second-column token (date/description) starts right after
  //   the midpoint and IS detected even if it is the only token on that side.
  let leftRowCount = 0;
  let rightRowCount = 0;
  const rightColBoundary = midpoint + pageWidth * 0.3;
  let leftRichRows = 0;
  let rightRichRows = 0;

  for (const row of visualRows) {
    const minX = Math.min(...row.map((t) => t.x));
    if (minX < midpoint - 10) {
      leftRowCount += 1;
    }
    const hasRightColStart = row.some(
      (t) => t.x >= midpoint && t.x < rightColBoundary,
    );
    if (hasRightColStart) {
      rightRowCount += 1;
    }

    const leftTokensInRow = row.filter((t) => t.x + t.width / 2 < midpoint);
    const rightTokensInRow = row.filter((t) => t.x + t.width / 2 >= midpoint);
    if (leftTokensInRow.length >= 2) leftRichRows += 1;
    if (rightTokensInRow.length >= 2) rightRichRows += 1;
  }

  if (leftRowCount < 3 || rightRowCount < 3 || leftRichRows < 2 || rightRichRows < 2) {
    return [tokens];
  }

  // 3) Split each visual row into a left and/or right segment using the page midpoint.
  // This prevents rows from different columns but same Y from being merged together.
  const leftTokens: TextToken[] = [];
  const rightTokens: TextToken[] = [];

  for (const row of visualRows) {
    const leftRow = row.filter((token) => token.x + token.width / 2 < midpoint);
    const rightRow = row.filter((token) => token.x + token.width / 2 >= midpoint);

    if (leftRow.length > 0) leftTokens.push(...leftRow);
    if (rightRow.length > 0) rightTokens.push(...rightRow);
  }

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

  return groupTokensByVisualRows(tokens).map((line) => {
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
