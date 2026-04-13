import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

type TextToken = { x: number; y: number; str: string; width: number };

/**
 * Groups text items that share a similar Y position into the same line,
 * then sorts tokens left-to-right within each line and top-to-bottom
 * across lines. This reconstructs readable text from PDFs that use
 * multi-column or fragmented layouts (common in bank statements).
 */
function reconstructLines(tokens: TextToken[]): string[] {
  if (tokens.length === 0) return [];

  // Sort by Y descending (PDF coordinate system: Y grows upward)
  const sorted = [...tokens].sort((a, b) => b.y - a.y);

  // Group tokens into lines by Y proximity (within 3 units = same line)
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

  // Sort tokens within each line by X position (left to right)
  return lines.map((line) => {
    line.sort((a, b) => a.x - b.x);

    // Join tokens with appropriate spacing
    let result = '';
    for (let i = 0; i < line.length; i++) {
      if (i > 0) {
        const gap = line[i].x - (line[i - 1].x + line[i - 1].width);
        result += gap > 5 ? ' ' : '';
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

    const lines = reconstructLines(tokens);
    allLines.push(...lines);
  }

  return allLines.filter((l) => l.length > 0).join('\n');
}
