/**
 * Format a number as Brazilian Real currency
 */
export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Parse a Brazilian currency string (e.g. "1.234,56" or "1234,56" or "1234.56") to a number
 * Handles both Brazilian (1.234,56) and standard (1234.56) formats
 */
export function parseCurrencyInput(value: string): number {
  if (!value) return 0;
  let cleaned = value.replace(/[R$\s]/g, '').trim();
  // If has both dot and comma, determine format:
  // Brazilian: 1.234,56 → dots are thousands, comma is decimal
  // Standard: 1,234.56 → commas are thousands, dot is decimal
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // If comma comes after last dot → Brazilian format (1.234,56)
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // Standard format (1,234.56)
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    // Only comma: treat as decimal separator (Brazilian)
    cleaned = cleaned.replace(/,/g, '.');
  }
  // Only dots or no separator: standard parseFloat handles it
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format input as Brazilian currency while typing (without R$ prefix)
 */
export function formatCurrencyInput(value: string): string {
  // Remove non-digits
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  
  // Convert to number with 2 decimal places
  const num = parseInt(digits, 10) / 100;
  
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Get month name in Portuguese
 */
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function getMonthName(month: number): string {
  return MONTH_NAMES[month] || '';
}

/**
 * Format a competencia string (YYYY-MM) for display
 */
export function formatCompetencia(comp: string): string {
  const [year, month] = comp.split('-');
  return `${getMonthName(parseInt(month, 10) - 1)}/${year}`;
}

/**
 * Get current competencia as YYYY-MM
 */
export function getCurrentCompetencia(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Navigate competencia by offset months
 */
export function offsetCompetencia(comp: string, offset: number): string {
  const [year, month] = comp.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get first and last day of a competencia
 */
export function getCompetenciaRange(comp: string): { start: string; end: string } {
  const [year, month] = comp.split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}
