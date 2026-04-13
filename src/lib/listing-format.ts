export function formatCompactCompetencia(comp: string | null | undefined): string {
  if (!comp) return '—';
  const [year, month] = comp.split('-');
  if (!year || !month) return comp;
  return `${month}/${year.slice(-2)}`;
}

export function formatDisplayDate(date: string | null | undefined): string {
  if (!date) return '—';
  const normalized = date.slice(0, 10);
  const [year, month, day] = normalized.split('-');
  if (!year || !month || !day) return date;
  return `${day}/${month}/${year}`;
}

export function formatInstallmentDisplay(current?: number | null, total?: number | null): string {
  if (!current || !total) return '—';
  return `${current}/${total}`;
}
