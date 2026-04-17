// Leading \b omitted intentionally: Itaú truncates merchant names and appends
// the installment code directly (e.g. "FARMACIA E DROGARI02/02"), leaving no
// word boundary before the digits. The trailing \b is kept to avoid matching
// partial numbers inside longer digit sequences.
const INSTALLMENT_PATTERN = /0?([1-9]\d?)\/0?([1-9]\d?)\b/g;
const NOISE_PREFIX_BEFORE_DATE = /^[^0-9\p{L}]*(?=\d{1,2}\/\d{2}\b)/u;

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeInstallmentText(parcelas: string | null | undefined): string | null {
  if (!parcelas) return null;
  const match = parcelas.match(/0?(\d{1,2})\/0?(\d{1,2})/);
  if (!match) return null;
  return `${Number(match[1])}/${Number(match[2])}`;
}

export function parseBrazilianCurrency(raw: string): number {
  const normalized = raw
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .trim();

  if (!normalized) return Number.NaN;

  const isNegative = normalized.includes('-');
  const numeric = normalized.replace(/-/g, '').replace(/\./g, '').replace(',', '.');
  const value = Number.parseFloat(numeric);

  return isNegative ? -value : value;
}

export function inferTransactionDate(dayMonth: string, competencia: string): string | null {
  const [competenciaYear, competenciaMonth] = competencia.split('-').map(Number);
  const [day, transactionMonth] = dayMonth.split('/').map(Number);

  if (!competenciaYear || !competenciaMonth || !day || !transactionMonth) return null;

  const inferredYear = transactionMonth > competenciaMonth ? competenciaYear - 1 : competenciaYear;
  return `${inferredYear}-${String(transactionMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function removeNoisePrefixBeforeDate(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  return trimmed.replace(NOISE_PREFIX_BEFORE_DATE, '').trim();
}

export function extractInstallmentInfo(input: string): { parcelas: string | null; descricaoSemParcelas: string } {
  let parcelas: string | null = null;
  const descricaoSemParcelas = input.replace(INSTALLMENT_PATTERN, (_, atual, total) => {
    parcelas = `${Number(atual)}/${Number(total)}`;
    return ' ';
  });

  return {
    parcelas,
    descricaoSemParcelas: descricaoSemParcelas.replace(/\s+/g, ' ').trim(),
  };
}

export function normalizeStatementDescription(input: string): string {
  const { descricaoSemParcelas } = extractInstallmentInfo(removeNoisePrefixBeforeDate(input));
  return stripAccents(descricaoSemParcelas)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(?:aut|autorizacao|authorization|transacao|trx|nsu|pedido|doc)\s*\d+\b/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function startsWithUsefulPrefix(description: string, prefix: string): boolean {
  const normalizedDescription = normalizeStatementDescription(description);
  const normalizedPrefix = normalizeStatementDescription(prefix);
  return normalizedDescription.startsWith(normalizedPrefix);
}

export function tokenizeNormalizedDescription(input: string): string[] {
  return normalizeStatementDescription(input)
    .split(' ')
    .filter(Boolean);
}
