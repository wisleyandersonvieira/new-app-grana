const decoder = new TextDecoder('latin1');

async function inflatePdfStream(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    return decoder.decode(bytes);
  }

  // Try both zlib-wrapped deflate (most common) and raw deflate (some PDF generators).
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
      const text = await new Response(stream).text();
      if (text.length > 0) return text;
    } catch {
      // continue to next format
    }
  }

  return decoder.decode(bytes);
}

function decodePdfLiteralString(value: string): string {
  return value
    .replace(/\\([\\()])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\(\d{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function extractTextOperators(content: string): string[] {
  const strings: string[] = [];
  const literalMatches = content.matchAll(/\((?:\\.|[^\\()])*\)\s*Tj/g);
  for (const match of literalMatches) {
    const literal = match[0].replace(/\)\s*Tj$/, '').slice(1);
    strings.push(decodePdfLiteralString(literal));
  }

  const arrayMatches = content.matchAll(/\[(.*?)\]\s*TJ/gs);
  for (const match of arrayMatches) {
    const pieces = match[1].match(/\((?:\\.|[^\\()])*\)|<([0-9A-Fa-f\s]+)>/g) ?? [];
    for (const piece of pieces) {
      if (piece.startsWith('(')) {
        strings.push(decodePdfLiteralString(piece.slice(1, -1)));
      } else {
        const hexStr = piece.slice(1, -1).replace(/\s+/g, '');
        if (hexStr.length >= 2) {
          const bytes = Uint8Array.from(hexStr.match(/.{1,2}/g)!.map((p) => parseInt(p, 16)));
          // Heuristic: if even-indexed bytes are mostly 0x00, this is a CIDFont with
          // 2-byte character codes stored as UTF-16BE (common in Brazilian bank PDFs).
          // Processing these as single-byte UTF-8 produces null-byte-polluted garbage.
          const isUtf16Be =
            bytes.length >= 4 &&
            bytes.length % 2 === 0 &&
            bytes.filter((b, i) => i % 2 === 0 && b === 0).length >= bytes.length / 4;
          strings.push(new TextDecoder(isUtf16Be ? 'utf-16be' : 'utf-8').decode(bytes));
        }
      }
    }
  }

  return strings;
}

function sanitizePdfText(text: string): string {
  return text
    .replace(/\x00/g, '')          // strip null bytes left by partially-decoded UTF-16BE
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim();
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const raw = decoder.decode(bytes);
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)];

  const chunks: string[] = [];
  for (const streamMatch of streams) {
    const chunkBytes = Uint8Array.from(streamMatch[1], (char) => char.charCodeAt(0));
    const inflated = await inflatePdfStream(chunkBytes);
    const textOps = extractTextOperators(inflated);
    if (textOps.length) {
      chunks.push(textOps.join('\n'));
      continue;
    }

    const printable = inflated.match(/[A-Za-zÀ-ÿ0-9$%\/.,:\- ]{8,}/g) ?? [];
    if (printable.length) chunks.push(printable.join('\n'));
  }

  if (chunks.length === 0) {
    const fallbackText = raw.match(/[A-Za-zÀ-ÿ0-9$%\/.,:\- ]{8,}/g)?.join('\n') ?? '';
    return sanitizePdfText(fallbackText);
  }

  return sanitizePdfText(chunks.join('\n'));
}
