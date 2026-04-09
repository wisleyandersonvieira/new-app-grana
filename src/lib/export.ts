import * as XLSX from 'xlsx';
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

// ─── EXCEL ────────────────────────────────────────────────────────
export function exportToExcel(
  data: Record<string, any>[],
  columns: ExportColumn[],
  filename: string
) {
  const rows = data.map((row) =>
    columns.reduce((acc, col) => {
      const val = row[col.key];
      if (col.currency && typeof val === 'number') {
        acc[col.header] = formatCurrency(val);
      } else {
        acc[col.header] = val ?? '';
      }
      return acc;
    }, {} as Record<string, any>)
  );

  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto-width: measure header and data widths
  const colWidths = columns.map((col, i) => {
    let max = col.header.length;
    rows.forEach((r) => {
      const cell = String(r[col.header] ?? '');
      if (cell.length > max) max = cell.length;
    });
    return { wch: Math.min(Math.max(max + 2, col.width ?? 10), 50) };
  });
  ws['!cols'] = colWidths;

  // Bold header row — set style on first row cells
  columns.forEach((_, i) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
    if (ws[cellRef]) {
      ws[cellRef].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: '1E3977' } },
        color: { rgb: 'FFFFFF' },
      };
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Export multi-sheet Excel workbook
 */
export function exportToExcelMultiSheet(
  sheets: { name: string; data: Record<string, any>[]; columns: ExportColumn[] }[],
  filename: string
) {
  const wb = XLSX.utils.book_new();

  sheets.forEach(({ name, data, columns }) => {
    const rows = data.map((row) =>
      columns.reduce((acc, col) => {
        const val = row[col.key];
        if (col.currency && typeof val === 'number') {
          acc[col.header] = formatCurrency(val);
        } else {
          acc[col.header] = val ?? '';
        }
        return acc;
      }, {} as Record<string, any>)
    );

    const ws = XLSX.utils.json_to_sheet(rows);

    const colWidths = columns.map((col) => {
      let max = col.header.length;
      rows.forEach((r) => {
        const cell = String(r[col.header] ?? '');
        if (cell.length > max) max = cell.length;
      });
      return { wch: Math.min(Math.max(max + 2, col.width ?? 10), 50) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
  });

  XLSX.writeFile(wb, `${filename}.xlsx`);
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
      return val ?? '';
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

  doc.save(`${filename}.pdf`);
}
