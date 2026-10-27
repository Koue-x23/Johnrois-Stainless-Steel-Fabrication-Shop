import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOADS_DIR } from './db.js';

const FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const FONT_MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';

export function formatPHP(amount) {
  const num = Number(amount) || 0;
  const isNeg = num < -0.004;
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNeg ? `-₱${formatted}` : `₱${formatted}`;
}

export function formatQty(val) {
  const num = Number(val) || 0;
  if (Number.isInteger(num)) return String(num);
  return num.toLocaleString('en-PH', { maximumFractionDigits: 3 });
}

export function formatDateDisplay(ymd) {
  if (!ymd) return '—';
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  });
}

function resolveUploadFilePath(urlPath) {
  if (!urlPath || typeof urlPath !== 'string') return null;
  if (!urlPath.startsWith('/uploads/')) return null;
  const filename = path.basename(urlPath);
  const full = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(full)) return null;
  const ext = path.extname(filename).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) return null;
  return full;
}

function createA4Document(title) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 38, bottom: 48, left: 40, right: 40 },
    bufferPages: true,
    info: {
      Title: title,
      Author: 'Johnrois Stainless Steel Fabrication Shop',
      Creator: 'Johnrois Business Management System',
    },
  });

  if (fs.existsSync(FONT_REGULAR)) doc.registerFont('Sans', FONT_REGULAR);
  if (fs.existsSync(FONT_BOLD)) doc.registerFont('SansBold', FONT_BOLD);
  if (fs.existsSync(FONT_MONO)) doc.registerFont('Mono', FONT_MONO);

  return doc;
}

function fontRegular(doc) {
  return fs.existsSync(FONT_REGULAR) ? doc.font('Sans') : doc.font('Helvetica');
}

function fontBold(doc) {
  return fs.existsSync(FONT_BOLD) ? doc.font('SansBold') : doc.font('Helvetica-Bold');
}

function drawBusinessHeader(doc, settings, docTitle, docNumber, statusLabel) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentWidth = right - left;
  let y = doc.page.margins.top;

  const logoPath = resolveUploadFilePath(settings.logo_url);
  let textStartX = left;

  if (logoPath) {
    try {
      doc.image(logoPath, left, y, { fit: [54, 54] });
      textStartX = left + 64;
    } catch (_) {
      textStartX = left;
    }
  }

  // Left side: Business Identity
  const maxBizWidth = contentWidth - (textStartX - left) - 185;
  fontBold(doc)
    .fontSize(13.5)
    .fillColor('#0f172a')
    .text(settings.business_name || 'Johnrois Stainless Steel Fabrication Shop', textStartX, y, {
      width: maxBizWidth,
    });

  let infoY = doc.y + 3;
  fontRegular(doc).fontSize(8.5).fillColor('#334155');
  if (settings.address) {
    doc.text(settings.address, textStartX, infoY, { width: maxBizWidth });
    infoY = doc.y + 1.5;
  }
  const contactParts = [];
  if (settings.contact_number) contactParts.push(`Tel/Mobile: ${settings.contact_number}`);
  if (settings.email) contactParts.push(`Email: ${settings.email}`);
  if (contactParts.length > 0) {
    doc.text(contactParts.join('  |  '), textStartX, infoY, { width: maxBizWidth });
    infoY = doc.y + 1.5;
  }
  if (settings.facebook_url) {
    doc.fillColor('#475569').text(settings.facebook_url.replace(/^https?:\/\//, ''), textStartX, infoY, {
      width: maxBizWidth,
    });
    infoY = doc.y + 1.5;
  }

  // Right side: Document Title & Number
  const rightBoxX = right - 175;
  fontBold(doc)
    .fontSize(15)
    .fillColor('#0f172a')
    .text(docTitle.toUpperCase(), rightBoxX, y, { width: 175, align: 'right' });

  fontBold(doc)
    .fontSize(10)
    .fillColor('#1e293b')
    .text(docNumber, rightBoxX, y + 20, { width: 175, align: 'right' });

  if (statusLabel) {
    fontRegular(doc)
      .fontSize(8.5)
      .fillColor('#475569')
      .text(`Status: ${statusLabel.toUpperCase()}`, rightBoxX, y + 35, { width: 175, align: 'right' });
  }

  const bottomHeaderY = Math.max(infoY, y + 54) + 8;
  doc
    .moveTo(left, bottomHeaderY)
    .lineTo(right, bottomHeaderY)
    .lineWidth(1.5)
    .strokeColor('#0f172a')
    .stroke();

  doc.y = bottomHeaderY + 12;
  doc.fillColor('#000000');
}

function drawTwoColumnMetaBox(doc, leftTitle, leftPairs, rightTitle, rightPairs) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const totalW = right - left;
  const gap = 16;
  const colW = (totalW - gap) / 2;
  const startY = doc.y;

  // Measure left column
  let leftY = startY + 8;
  fontBold(doc).fontSize(8).fillColor('#475569').text(leftTitle.toUpperCase(), left + 10, leftY, { width: colW - 20 });
  leftY = doc.y + 4;
  for (const [label, value] of leftPairs) {
    if (!value && value !== 0) continue;
    fontBold(doc).fontSize(8.5).fillColor('#0f172a').text(`${label}: `, left + 10, leftY, { continued: true, width: colW - 20 });
    fontRegular(doc).fontSize(8.5).fillColor('#1e293b').text(String(value), { width: colW - 20 });
    leftY = doc.y + 2.5;
  }

  // Right column
  const rightX = left + colW + gap;
  let rightY = startY + 8;
  fontBold(doc).fontSize(8).fillColor('#475569').text(rightTitle.toUpperCase(), rightX + 10, rightY, { width: colW - 20 });
  rightY = doc.y + 4;
  for (const [label, value] of rightPairs) {
    if (!value && value !== 0) continue;
    fontBold(doc).fontSize(8.5).fillColor('#0f172a').text(`${label}: `, rightX + 10, rightY, { continued: true, width: colW - 20 });
    fontRegular(doc).fontSize(8.5).fillColor('#1e293b').text(String(value), { width: colW - 20 });
    rightY = doc.y + 2.5;
  }

  const boxH = Math.max(leftY, rightY) - startY + 8;
  doc.save();
  doc.lineWidth(0.6).strokeColor('#cbd5e1');
  doc.rect(left, startY, colW, boxH).stroke();
  doc.rect(rightX, startY, colW, boxH).stroke();
  doc.restore();

  doc.y = startY + boxH + 14;
}

function ensureSpace(doc, neededHeight, onNewPage) {
  const bottomLimit = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottomLimit) {
    doc.addPage();
    if (onNewPage) onNewPage();
  }
}

function drawTableHeader(doc, columns) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const headerH = 22;
  const y = doc.y;

  doc.save();
  doc.rect(left, y, right - left, headerH).fill('#0f172a');
  doc.restore();

  let x = left;
  fontBold(doc).fontSize(8).fillColor('#ffffff');
  for (const col of columns) {
    doc.text(col.label, x + 6, y + 6.5, {
      width: col.width - 12,
      align: col.align || 'left',
      lineBreak: false,
    });
    x += col.width;
  }
  doc.fillColor('#000000');
  doc.y = y + headerH;
}

function drawItemizedTable(doc, columns, rows) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const bottomLimit = doc.page.height - doc.page.margins.bottom;

  drawTableHeader(doc, columns);

  rows.forEach((row, idx) => {
    fontRegular(doc).fontSize(8.5);
    let maxCellH = 14;
    for (const col of columns) {
      const val = String(row[col.key] ?? '');
      const h = doc.heightOfString(val, { width: col.width - 12 });
      if (h + 10 > maxCellH) maxCellH = h + 10;
    }

    if (doc.y + maxCellH > bottomLimit) {
      doc.addPage();
      drawTableHeader(doc, columns);
    }

    const rowY = doc.y;
    if (idx % 2 === 1) {
      doc.save();
      doc.rect(left, rowY, right - left, maxCellH).fill('#f8fafc');
      doc.restore();
    }

    let x = left;
    for (const col of columns) {
      const val = String(row[col.key] ?? '');
      if (col.bold) fontBold(doc).fontSize(8.5).fillColor('#0f172a');
      else fontRegular(doc).fontSize(8.5).fillColor('#1e293b');
      doc.text(val, x + 6, rowY + 5, {
        width: col.width - 12,
        align: col.align || 'left',
      });
      x += col.width;
    }

    doc
      .moveTo(left, rowY + maxCellH)
      .lineTo(right, rowY + maxCellH)
      .lineWidth(0.4)
      .strokeColor('#cbd5e1')
      .stroke();

    doc.y = rowY + maxCellH;
  });

  doc.y += 10;
}

function drawTotalsBlock(doc, summaryRows) {
  const right = doc.page.width - doc.page.margins.right;
  const boxWidth = 235;
  const boxX = right - boxWidth;

  ensureSpace(doc, summaryRows.length * 20 + 18);

  let y = doc.y;
  for (const row of summaryRows) {
    const rowH = row.isGrand ? 24 : 18;
    if (row.isGrand) {
      doc.save();
      doc.rect(boxX, y, boxWidth, rowH).fill('#0f172a');
      doc.restore();
      fontBold(doc).fontSize(9.5).fillColor('#ffffff');
      doc.text(row.label, boxX + 8, y + 6, { width: 115, align: 'left' });
      doc.text(row.value, boxX + 123, y + 6, { width: boxWidth - 131, align: 'right' });
    } else {
      fontRegular(doc).fontSize(8.5).fillColor('#334155');
      doc.text(row.label, boxX + 8, y + 4, { width: 115, align: 'left' });
      fontBold(doc).fontSize(8.5).fillColor(row.highlightColor || '#0f172a');
      doc.text(row.value, boxX + 123, y + 4, { width: boxWidth - 131, align: 'right' });
      doc
        .moveTo(boxX, y + rowH)
        .lineTo(right, y + rowH)
        .lineWidth(0.4)
        .strokeColor('#e2e8f0')
        .stroke();
    }
    y += rowH;
  }
  doc.fillColor('#000000');
  doc.y = y + 14;
}

function drawTermsAndNotes(doc, sections) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  for (const [heading, text] of sections) {
    if (!text || !String(text).trim()) continue;
    fontRegular(doc).fontSize(8.5);
    const h = doc.heightOfString(String(text), { width }) + 22;
    ensureSpace(doc, h);

    fontBold(doc).fontSize(8.5).fillColor('#0f172a').text(heading.toUpperCase(), left, doc.y);
    fontRegular(doc).fontSize(8.5).fillColor('#334155').text(String(text).trim(), left, doc.y + 2, { width });
    doc.y += 10;
  }
}

function drawSignatureArea(doc, blocks) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const totalW = right - left;
  const count = blocks.length;
  const gap = 24;
  const colW = (totalW - gap * (count - 1)) / count;

  ensureSpace(doc, 92);
  const startY = doc.y + 10;

  blocks.forEach((blk, idx) => {
    const x = left + idx * (colW + gap);
    fontRegular(doc).fontSize(8).fillColor('#475569').text(blk.heading, x, startY, { width: colW });

    const sigPath = resolveUploadFilePath(blk.signatureUrl);
    if (sigPath) {
      try {
        doc.image(sigPath, x + 8, startY + 14, { fit: [120, 36] });
      } catch (_) {
        // ignore invalid image
      }
    }

    const lineY = startY + 54;
    doc.moveTo(x, lineY).lineTo(x + colW, lineY).lineWidth(0.75).strokeColor('#0f172a').stroke();

    fontBold(doc)
      .fontSize(8.5)
      .fillColor('#0f172a')
      .text(blk.name || ' ', x, lineY + 4, { width: colW });

    if (blk.subtitle) {
      fontRegular(doc)
        .fontSize(7.5)
        .fillColor('#475569')
        .text(blk.subtitle, x, lineY + 16, { width: colW });
    }
  });

  doc.y = startY + 82;
}

function stampPageFooters(doc, settings, docLabel) {
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(range.start + i);
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const footerY = doc.page.height - 30;

    doc.moveTo(left, footerY - 5).lineTo(right, footerY - 5).lineWidth(0.4).strokeColor('#cbd5e1').stroke();

    fontRegular(doc).fontSize(7.5).fillColor('#64748b');
    doc.text(
      `${settings.business_name || 'Johnrois Stainless Steel Fabrication Shop'}  •  ${docLabel}`,
      left,
      footerY,
      { width: (right - left) * 0.7, align: 'left', lineBreak: false }
    );
    doc.text(`Page ${i + 1} of ${totalPages}`, left, footerY, {
      width: right - left,
      align: 'right',
      lineBreak: false,
    });

    doc.page.margins.bottom = oldBottom;
  }
}

function finalizePdfBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export async function generateQuotationPdf(quotation, items, settings) {
  const doc = createA4Document(`Quotation ${quotation.quotation_number}`);
  drawBusinessHeader(doc, settings, 'Quotation', quotation.quotation_number, quotation.status);

  drawTwoColumnMetaBox(
    doc,
    'Prepared For',
    [
      ['Customer', quotation.customer_name],
      ['Company', quotation.company_name],
      ['Address', quotation.customer_address],
      ['Contact No.', quotation.contact_number],
    ],
    'Quotation & Project Details',
    [
      ['Date Issued', formatDateDisplay(quotation.date_issued)],
      ['Valid Until', formatDateDisplay(quotation.valid_until)],
      ['Project Name', quotation.project_name],
      ['Project Location', quotation.project_location],
    ]
  );

  const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cols = [
    { key: 'num', label: '#', width: 28, align: 'center' },
    { key: 'description', label: 'DESCRIPTION OF PRODUCTS / SERVICES', width: contentW - 28 - 55 - 52 - 88 - 92, align: 'left' },
    { key: 'quantity', label: 'QTY', width: 55, align: 'right' },
    { key: 'unit', label: 'UNIT', width: 52, align: 'center' },
    { key: 'unit_price', label: 'UNIT PRICE', width: 88, align: 'right' },
    { key: 'line_total', label: 'LINE TOTAL', width: 92, align: 'right', bold: true },
  ];

  const rows = items.map((it, i) => ({
    num: i + 1,
    description: it.description,
    quantity: formatQty(it.quantity),
    unit: it.unit || 'pcs',
    unit_price: formatPHP(it.unit_price),
    line_total: formatPHP(it.line_total),
  }));

  drawItemizedTable(doc, cols, rows);

  const summary = [{ label: 'Subtotal', value: formatPHP(quotation.subtotal) }];
  if (Number(quotation.discount_amount) > 0) {
    const discLabel =
      quotation.discount_type === 'percent'
        ? `Discount (${quotation.discount_value}%)`
        : 'Discount';
    summary.push({ label: discLabel, value: `-${formatPHP(quotation.discount_amount)}` });
  }
  if (Number(quotation.tax_enabled) === 1 && Number(quotation.tax_amount) > 0) {
    summary.push({
      label: `${quotation.tax_label || 'Tax'} (${quotation.tax_rate}%)`,
      value: formatPHP(quotation.tax_amount),
    });
  }
  summary.push({ label: 'GRAND TOTAL', value: formatPHP(quotation.grand_total), isGrand: true });

  drawTotalsBlock(doc, summary);

  drawTermsAndNotes(doc, [
    ['Payment Terms', quotation.payment_terms],
    ['Delivery / Completion Schedule', quotation.delivery_schedule],
    ['Remarks / Scope Notes', quotation.remarks],
  ]);

  drawSignatureArea(doc, [
    {
      heading: 'Prepared By:',
      name: quotation.prepared_by || '',
      subtitle: settings.business_name,
      signatureUrl: '',
    },
    {
      heading: 'Authorized Signature:',
      name: quotation.authorized_signatory || settings.authorized_representative || '',
      subtitle: settings.authorized_title || 'Authorized Representative',
      signatureUrl: settings.signature_url,
    },
    {
      heading: 'Customer Conformance / Acceptance:',
      name: quotation.customer_name || '',
      subtitle: 'Signature Over Printed Name & Date',
      signatureUrl: '',
    },
  ]);

  stampPageFooters(doc, settings, `Quotation ${quotation.quotation_number}`);
  return finalizePdfBuffer(doc);
}

export async function generateInvoicePdf(invoice, items, payments, settings) {
  const doc = createA4Document(`Invoice ${invoice.invoice_number}`);
  drawBusinessHeader(doc, settings, 'Billing Invoice', invoice.invoice_number, invoice.status);

  drawTwoColumnMetaBox(
    doc,
    'Bill To',
    [
      ['Customer', invoice.customer_name],
      ['Company', invoice.company_name],
      ['Address', invoice.customer_address],
      ['Contact No.', invoice.contact_number],
    ],
    'Invoice Details',
    [
      ['Invoice Date', formatDateDisplay(invoice.invoice_date)],
      ['Due Date', formatDateDisplay(invoice.due_date)],
      ['Ref. Quotation', invoice.reference_quotation_number || '—'],
      ['Project', invoice.project_name || '—'],
    ]
  );

  const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cols = [
    { key: 'num', label: '#', width: 28, align: 'center' },
    { key: 'description', label: 'DESCRIPTION OF PRODUCTS / SERVICES', width: contentW - 28 - 55 - 52 - 88 - 92, align: 'left' },
    { key: 'quantity', label: 'QTY', width: 55, align: 'right' },
    { key: 'unit', label: 'UNIT', width: 52, align: 'center' },
    { key: 'unit_price', label: 'UNIT PRICE', width: 88, align: 'right' },
    { key: 'line_total', label: 'LINE TOTAL', width: 92, align: 'right', bold: true },
  ];

  const rows = items.map((it, i) => ({
    num: i + 1,
    description: it.description,
    quantity: formatQty(it.quantity),
    unit: it.unit || 'pcs',
    unit_price: formatPHP(it.unit_price),
    line_total: formatPHP(it.line_total),
  }));

  drawItemizedTable(doc, cols, rows);

  const summary = [{ label: 'Subtotal', value: formatPHP(invoice.subtotal) }];
  if (Number(invoice.discount_amount) > 0) {
    const discLabel =
      invoice.discount_type === 'percent'
        ? `Discount (${invoice.discount_value}%)`
        : 'Discount';
    summary.push({ label: discLabel, value: `-${formatPHP(invoice.discount_amount)}` });
  }
  if (Number(invoice.tax_enabled) === 1 && Number(invoice.tax_amount) > 0) {
    summary.push({
      label: `${invoice.tax_label || 'Tax'} (${invoice.tax_rate}%)`,
      value: formatPHP(invoice.tax_amount),
    });
  }
  summary.push({ label: 'Total Amount Due', value: formatPHP(invoice.total_amount_due) });
  summary.push({ label: 'Amount Paid', value: formatPHP(invoice.amount_paid) });
  summary.push({
    label: 'REMAINING BALANCE',
    value: formatPHP(invoice.remaining_balance),
    isGrand: true,
  });

  drawTotalsBlock(doc, summary);

  if (payments && payments.length > 0) {
    ensureSpace(doc, 60);
    fontBold(doc).fontSize(8.5).fillColor('#0f172a').text('RECORDED PAYMENT HISTORY', doc.page.margins.left, doc.y);
    doc.y += 4;
    const payCols = [
      { key: 'payment_number', label: 'RECEIPT / REF #', width: 105, align: 'left' },
      { key: 'payment_date', label: 'PAYMENT DATE', width: 85, align: 'left' },
      { key: 'payment_method', label: 'METHOD', width: 105, align: 'left' },
      { key: 'notes', label: 'REFERENCE / NOTES', width: contentW - 105 - 85 - 105 - 95, align: 'left' },
      { key: 'amount', label: 'AMOUNT PAID', width: 95, align: 'right', bold: true },
    ];
    const payRows = payments.map((p) => ({
      payment_number: p.payment_number,
      payment_date: formatDateDisplay(p.payment_date),
      payment_method: p.payment_method,
      notes: [p.reference_number ? `Ref: ${p.reference_number}` : '', p.notes || ''].filter(Boolean).join(' — ') || '—',
      amount: formatPHP(p.amount),
    }));
    drawItemizedTable(doc, payCols, payRows);
  }

  drawTermsAndNotes(doc, [
    ['Payment Terms', invoice.payment_terms],
    ['Remarks', invoice.remarks],
  ]);

  drawSignatureArea(doc, [
    {
      heading: 'Prepared By:',
      name: invoice.prepared_by || '',
      subtitle: settings.business_name,
      signatureUrl: '',
    },
    {
      heading: 'Authorized Signature:',
      name: invoice.authorized_signatory || settings.authorized_representative || '',
      subtitle: settings.authorized_title || 'Authorized Representative',
      signatureUrl: settings.signature_url,
    },
    {
      heading: 'Received By:',
      name: invoice.customer_name || '',
      subtitle: 'Signature Over Printed Name & Date',
      signatureUrl: '',
    },
  ]);

  stampPageFooters(doc, settings, `Invoice ${invoice.invoice_number}`);
  return finalizePdfBuffer(doc);
}

export async function generateServiceReportPdf(report, materials, photos, settings) {
  const doc = createA4Document(`Service Report ${report.report_number}`);
  drawBusinessHeader(doc, settings, 'Service Report', report.report_number, report.status);

  drawTwoColumnMetaBox(
    doc,
    'Customer & Site Information',
    [
      ['Customer', report.customer_name],
      ['Company', report.company_name],
      ['Contact Details', report.contact_details],
      ['Service Location', report.service_location],
    ],
    'Job & Dispatch Details',
    [
      ['Service Date', formatDateDisplay(report.service_date)],
      ['Job Type', report.job_type],
      ['Technician(s)', report.technician_name || '—'],
      [
        'Time Log',
        [report.start_time ? `In: ${report.start_time}` : '', report.completion_time ? `Out: ${report.completion_time}` : '']
          .filter(Boolean)
          .join('  |  ') || '—',
      ],
    ]
  );

  drawTermsAndNotes(doc, [
    ['Equipment / Product Serviced', report.equipment_serviced],
    ['Reported Problem / Client Request', report.reported_problem],
    ['Inspection Findings', report.inspection_findings],
    ['Work Performed', report.work_performed],
  ]);

  const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  if (materials && materials.length > 0) {
    ensureSpace(doc, 60);
    fontBold(doc).fontSize(8.5).fillColor('#0f172a').text('MATERIALS & PARTS USED', doc.page.margins.left, doc.y);
    doc.y += 4;
    const matCols = [
      { key: 'num', label: '#', width: 28, align: 'center' },
      { key: 'material_name', label: 'MATERIAL / PART DESCRIPTION', width: contentW - 28 - 60 - 55 - 88 - 92, align: 'left' },
      { key: 'quantity', label: 'QTY', width: 60, align: 'right' },
      { key: 'unit', label: 'UNIT', width: 55, align: 'center' },
      { key: 'unit_cost', label: 'UNIT COST', width: 88, align: 'right' },
      { key: 'line_cost', label: 'LINE COST', width: 92, align: 'right', bold: true },
    ];
    const matRows = materials.map((m, idx) => ({
      num: idx + 1,
      material_name: m.material_name,
      quantity: formatQty(m.quantity),
      unit: m.unit || 'pcs',
      unit_cost: Number(m.unit_cost) > 0 ? formatPHP(m.unit_cost) : '—',
      line_cost: Number(m.line_cost) > 0 ? formatPHP(m.line_cost) : '—',
    }));
    drawItemizedTable(doc, matCols, matRows);

    if (Number(report.materials_total_cost) > 0) {
      drawTotalsBlock(doc, [
        { label: 'TOTAL MATERIALS COST', value: formatPHP(report.materials_total_cost), isGrand: true },
      ]);
    }
  }

  drawTermsAndNotes(doc, [
    ['Recommendations / Follow-Up Actions', report.recommendations],
    ['Remarks', report.remarks],
  ]);

  // Optional Before & After Photos
  const validPhotos = (photos || []).filter((p) => resolveUploadFilePath(p.photo_url));
  if (validPhotos.length > 0) {
    ensureSpace(doc, 145);
    fontBold(doc).fontSize(8.5).fillColor('#0f172a').text('BEFORE & AFTER DOCUMENTATION PHOTOS', doc.page.margins.left, doc.y);
    doc.y += 6;
    const cardW = (contentW - 16) / 2;
    for (let i = 0; i < validPhotos.length; i += 2) {
      ensureSpace(doc, 130);
      const rowY = doc.y;
      for (let j = 0; j < 2 && i + j < validPhotos.length; j++) {
        const ph = validPhotos[i + j];
        const phPath = resolveUploadFilePath(ph.photo_url);
        const x = doc.page.margins.left + j * (cardW + 16);
        doc.rect(x, rowY, cardW, 118).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
        if (phPath) {
          try {
            doc.image(phPath, x + 6, rowY + 6, { fit: [cardW - 12, 86] });
          } catch (_) {
            // ignore
          }
        }
        fontBold(doc)
          .fontSize(7.5)
          .fillColor('#0f172a')
          .text(
            `${ph.photo_type.toUpperCase()}${ph.caption ? ` — ${ph.caption}` : ''}`,
            x + 6,
            rowY + 98,
            { width: cardW - 12, lineBreak: false }
          );
      }
      doc.y = rowY + 126;
    }
  }

  // Customer Acknowledgment note
  ensureSpace(doc, 115);
  const ackText =
    Number(report.customer_acknowledgment) === 1
      ? 'Customer Acknowledged: Work described above has been inspected and accepted as satisfactorily performed.'
      : 'Customer Acknowledgment: I hereby acknowledge the service inspection / work details documented above.';
  fontRegular(doc)
    .fontSize(8)
    .fillColor('#334155')
    .text(ackText, doc.page.margins.left, doc.y, { width: contentW });
  doc.y += 6;

  drawSignatureArea(doc, [
    {
      heading: 'Technician / Assigned Personnel:',
      name: report.technician_name || '',
      subtitle: 'Technician Signature',
      signatureUrl: report.technician_signature_url,
    },
    {
      heading: 'Customer Acknowledgment Signature:',
      name: report.customer_signatory_name || report.customer_name || '',
      subtitle: report.acknowledgment_date
        ? `Signed Date: ${formatDateDisplay(report.acknowledgment_date)}`
        : 'Signature Over Printed Name & Date',
      signatureUrl: report.customer_signature_url,
    },
  ]);

  stampPageFooters(doc, settings, `Service Report ${report.report_number}`);
  return finalizePdfBuffer(doc);
}

export async function generateBillingStatementPdf(statement, lines, settings) {
  const doc = createA4Document(`Billing Statement ${statement.statement_number}`);
  drawBusinessHeader(doc, settings, 'Billing Statement', statement.statement_number, 'Statement of Account');

  drawTwoColumnMetaBox(
    doc,
    'Account Of',
    [
      ['Customer', statement.customer_name],
      ['Company', statement.company_name],
      ['Billing Address', statement.customer_address],
      ['Contact No.', statement.contact_number],
    ],
    'Statement Summary',
    [
      ['Statement Date', formatDateDisplay(statement.statement_date)],
      ['Billing Period', `${formatDateDisplay(statement.period_from)} to ${formatDateDisplay(statement.period_to)}`],
      ['Previous Balance', formatPHP(statement.previous_balance)],
      ['Outstanding Balance', formatPHP(statement.outstanding_balance)],
    ]
  );

  const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cols = [
    { key: 'tx_date', label: 'DATE', width: 66, align: 'left' },
    { key: 'invoice_number', label: 'INVOICE / REF #', width: 92, align: 'left' },
    { key: 'description', label: 'TRANSACTION DESCRIPTION', width: contentW - 66 - 92 - 78 - 78 - 86, align: 'left' },
    { key: 'debit', label: 'DEBIT (CHARGE)', width: 78, align: 'right' },
    { key: 'credit', label: 'CREDIT (PAID)', width: 78, align: 'right' },
    { key: 'running_balance', label: 'BALANCE', width: 86, align: 'right', bold: true },
  ];

  const tableRows = [
    {
      tx_date: formatDateDisplay(statement.period_from),
      invoice_number: '—',
      description: 'Balance Forwarded (Previous Balance prior to period)',
      debit: '—',
      credit: '—',
      running_balance: formatPHP(statement.previous_balance),
    },
    ...lines.map((ln) => ({
      tx_date: formatDateDisplay(ln.tx_date),
      invoice_number: ln.invoice_number || ln.reference_number,
      description: ln.description,
      debit: Number(ln.debit) > 0 ? formatPHP(ln.debit) : '—',
      credit: Number(ln.credit) > 0 ? formatPHP(ln.credit) : '—',
      running_balance: formatPHP(ln.running_balance),
    })),
  ];

  drawItemizedTable(doc, cols, tableRows);

  drawTotalsBlock(doc, [
    { label: 'Previous Balance', value: formatPHP(statement.previous_balance) },
    { label: 'Total Charges (Period)', value: formatPHP(statement.total_charges) },
    { label: 'Total Payments (Period)', value: `-${formatPHP(statement.total_payments)}` },
    { label: 'OUTSTANDING BALANCE', value: formatPHP(statement.outstanding_balance), isGrand: true },
  ]);

  drawTermsAndNotes(doc, [
    ['Payment Terms', statement.payment_terms],
    ['Remarks', statement.remarks],
  ]);

  drawSignatureArea(doc, [
    {
      heading: 'Prepared By:',
      name: statement.prepared_by || '',
      subtitle: settings.business_name,
      signatureUrl: '',
    },
    {
      heading: 'Authorized Signature:',
      name: statement.authorized_signatory || settings.authorized_representative || '',
      subtitle: settings.authorized_title || 'Authorized Representative',
      signatureUrl: settings.signature_url,
    },
    {
      heading: 'Received By:',
      name: statement.customer_name || '',
      subtitle: 'Signature Over Printed Name & Date',
      signatureUrl: '',
    },
  ]);

  stampPageFooters(doc, settings, `Billing Statement ${statement.statement_number}`);
  return finalizePdfBuffer(doc);
}
