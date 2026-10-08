import * as ExcelJS from 'exceljs';
import PDFDocument = require('pdfkit');
import { Report } from './reports.service';

/** CSV with formula-injection protection (cells starting with = + - @ are prefixed with a quote). */
export function toCsv(r: Report): string {
  const esc = (v: any) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + [r.columns.map((c) => esc(c.label)).join(','), ...r.rows.map((row) => r.columns.map((c) => esc(row[c.key])).join(','))].join('\r\n');
}

export async function toXlsx(r: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IDAS Inventory System';
  const ws = wb.addWorksheet(r.title.slice(0, 30).replace(/[\\/*?:[\]]/g, '-'));
  ws.columns = r.columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, c.label.length + 4) }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5A1A1F' } };
  for (const row of r.rows) ws.addRow(Object.fromEntries(r.columns.map((c) => [c.key, typeof row[c.key] === 'string' && /^[=+\-@]/.test(row[c.key]) ? "'" + row[c.key] : row[c.key]])));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toPdf(r: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: r.columns.length > 6 ? 'landscape' : 'portrait', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    doc.fontSize(16).fillColor('#5a1a1f').text('IDAS Lab – University of Peradeniya');
    doc.fontSize(13).fillColor('#000').text(r.title);
    doc.fontSize(8).fillColor('#666').text(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC${r.summary ? ' · ' + r.summary : ''}`).moveDown(0.8);
    const width = doc.page.width - 72, cw = width / r.columns.length;
    const drawRow = (cells: string[], bold = false) => {
      const y = doc.y;
      const h = Math.max(...cells.map((t, i) => doc.fontSize(7.5).heightOfString(t, { width: cw - 4 }))) + 4;
      if (y + h > doc.page.height - 40) { doc.addPage(); return drawRow(cells, bold); }
      cells.forEach((t, i) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor(bold ? '#5a1a1f' : '#000').text(t, 36 + i * cw, y + 2, { width: cw - 4 }));
      doc.y = y + h; doc.moveTo(36, doc.y).lineTo(36 + width, doc.y).strokeColor('#ddd').stroke();
    };
    drawRow(r.columns.map((c) => c.label), true);
    for (const row of r.rows) drawRow(r.columns.map((c) => String(row[c.key] ?? '')));
    if (!r.rows.length) doc.moveDown().fontSize(9).fillColor('#666').text('No records.');
    doc.end();
  });
}
