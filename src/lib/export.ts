import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './financial';

interface ExportColumn {
  header: string;
  key: string;
  /** Mark column as currency for special formatting */
  currency?: boolean;
  /** Column width in characters (for Excel auto-width) */
  width?: number;
}

const sanitizeFilename = (filename: string) =>
  filename
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'exportacao';

const sanitizeCell = (value: unknown) => {
  if (value == null) return '';
  if (typeof value !== 'string') return value;
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, 5000);
  return /^[=+\-@\t\r]/.test(clean) ? `'${clean}` : clean;
};

const csvEscape = (value: unknown) => {
  const clean = String(sanitizeCell(value));
  return `"${clean.replace(/"/g, '""')}"`;
};

const downloadTextFile = (content: string, filename: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

// ─── EXCEL ────────────────────────────────────────────────────────
export function exportToExcel(
  data: Record<string, any>[],
  columns: ExportColumn[],
  filename: string
) {
  const header = columns.map((col) => csvEscape(col.header)).join(',');
  const rows = data.map((row) =>
    columns.map((col) => {
      const val = row[col.key];
      return csvEscape(col.currency && typeof val === 'number' ? formatCurrency(val) : val);
    }).join(',')
  );

  downloadTextFile(`\uFEFF${[header, ...rows].join('\n')}`, `${sanitizeFilename(filename)}.csv`, 'text/csv;charset=utf-8');
}

/**
 * Export multi-sheet Excel workbook
 */
export function exportToExcelMultiSheet(
  sheets: { name: string; data: Record<string, any>[]; columns: ExportColumn[] }[],
  filename: string
) {
  const content = sheets.flatMap(({ name, data, columns }) => {
    const header = columns.map((col) => csvEscape(col.header)).join(',');
    const rows = data.map((row) =>
      columns.map((col) => {
        const val = row[col.key];
        return csvEscape(col.currency && typeof val === 'number' ? formatCurrency(val) : val);
      }).join(',')
    );
    return [`# ${sanitizeCell(name)}`, header, ...rows, ''];
  }).join('\n');

  downloadTextFile(`\uFEFF${content}`, `${sanitizeFilename(filename)}.csv`, 'text/csv;charset=utf-8');
}

// ─── PDF ──────────────────────────────────────────────────────────
export function exportToPDF(
  data: Record<string, any>[],
  columns: ExportColumn[],
  title: string,
  filename: string,
  options?: { orientation?: 'portrait' | 'landscape' }
) {
  const orientation = options?.orientation ?? 'landscape';
  const doc = new jsPDF({ orientation });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ── Header band (#003366) ──
  doc.setFillColor(0, 51, 102);
  doc.rect(0, 0, pageW, 26, 'F');

  // Logo text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Grana', 14, 14);

  // Subtitle
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(title, 14, 22);

  // Date
  doc.setFontSize(8);
  doc.text(
    `Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`,
    pageW - 14,
    22,
    { align: 'right' }
  );

  const head = [columns.map((c) => c.header)];
  const body = data.map((row) =>
    columns.map((col) => {
      const val = row[col.key];
      if (col.currency && typeof val === 'number') return formatCurrency(val);
      return sanitizeCell(val);
    })
  );

  autoTable(doc, {
    head,
    body,
    startY: 30,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: {
      fillColor: [0, 51, 102],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { top: 30 },
    didDrawPage: (pageData) => {
      // Repeat header on each page
      doc.setFillColor(0, 51, 102);
      doc.rect(0, 0, pageW, 26, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Grana', 14, 14);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(title, 14, 22);

      // Footer with page number
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Página ${pageData.pageNumber} de ${pageCount}`,
        pageW / 2,
        pageH - 10,
        { align: 'center' }
      );
    },
  });

  doc.save(`${sanitizeFilename(filename)}.pdf`);
}
