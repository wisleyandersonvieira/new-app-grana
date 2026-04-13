const decoder = new TextDecoder('latin1');

async function inflatePdfStream(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    return decoder.decode(bytes);
  }

  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    const response = new Response(stream);
    return await response.text();
  } catch {
    return decoder.decode(bytes);
  }
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
        const hex = piece.slice(1, -1).replace(/\s+/g, '');
        if (hex.length >= 2) {
          strings.push(new TextDecoder().decode(Uint8Array.from(hex.match(/.{1,2}/g)?.map((p) => parseInt(p, 16)) ?? [])));
        }
      }
    }
  }

  return strings;
}

function sanitizePdfText(text: string): string {
  return text
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
