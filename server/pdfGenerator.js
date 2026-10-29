import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveUploadBufferFromUrl } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_FONT_REGULAR = path.join(__dirname, 'fonts', 'DejaVuSans.ttf');
const BUNDLED_FONT_BOLD = path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf');
const SYSTEM_FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const SYSTEM_FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

const FONT_REGULAR = fs.existsSync(BUNDLED_FONT_REGULAR) ? BUNDLED_FONT_REGULAR : SYSTEM_FONT_REGULAR;
const FONT_BOLD = fs.existsSync(BUNDLED_FONT_BOLD) ? BUNDLED_FONT_BOLD : SYSTEM_FONT_BOLD;

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

function resolveBusinessIdFromSettings(settings) {
  return Number(settings?.business_id || settings?.id || 1);
}

function createA4Document(title, settings) {
  const bizName = settings?.business_name || 'Stainless Steel Fabrication';
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 38, bottom: 48, left: 40, right: 40 },
    bufferPages: true,
    info: {
      Title: title,
      Author: bizName,
      Creator: `${bizName} — Business Management System`,
    },
  });
  doc._businessId = resolveBusinessIdFromSettings(settings);

  if (fs.existsSync(FONT_REGULAR)) doc.registerFont('Sans', FONT_REGULAR);
  if (fs.existsSync(FONT_BOLD)) doc.registerFont('SansBold', FONT_BOLD);

  return doc;
}

function fontRegular(doc) {
  return fs.existsSync(FONT_REGULAR) ? doc.font('Sans') : doc.font('Helvetica');
}

function fontBold(doc) {
  return fs.existsSync(FONT_BOLD) ? doc.font('SansBold') : doc.font('Helvetica-Bold');
}

async function drawBusinessHeader(doc, settings, docTitle, docNumber, statusLabel) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentWidth = right - left;
  const y = doc.page.margins.top;

  const bizId = doc._businessId || resolveBusinessIdFromSettings(settings);
  const logoBuf = await resolveUploadBufferFromUrl(settings.logo_url, bizId);
  let textStartX = left;

  if (logoBuf) {
    try {
      doc.image(logoBuf, left, y, { fit: [54, 54] });
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
    .text(settings.business_name || 'Stainless Steel Fabrication', textStartX, y, {
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

  let leftY = startY + 8;
  fontBold(doc).fontSize(8).fillColor('#475569').text(leftTitle.toUpperCase(), left + 10, leftY, { width: colW - 20 });
  leftY = doc.y + 4;
  for (const [label, value] of leftPairs) {
    if (!value && value !== 0) continue;
    fontBold(doc).fontSize(8.5).fillColor('#0f172a').text(`${label}: `, left + 10, leftY, { continued: true, width: colW - 20 });
    fontRegular(doc).fontSize(8.5).fillColor('#1e293b').text(String(value), { width: colW - 20 });
    leftY = doc.y + 2.5;
  }

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

async function drawSignatureArea(doc, blocks) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const totalW = right - left;
  const count = blocks.length;
  const gap = 24;
  const colW = (totalW - gap * (count - 1)) / count;

  ensureSpace(doc, 92);
  const startY = doc.y + 10;

  for (let idx = 0; idx < blocks.length; idx++) {
    const blk = blocks[idx];
    const x = left + idx * (colW + gap);
    fontRegular(doc).fontSize(8).fillColor('#475569').text(blk.heading, x, startY, { width: colW });

    const sigBuf = await resolveUploadBufferFromUrl(blk.signatureUrl, doc._businessId || 1);
    if (sigBuf) {
      try {
        doc.image(sigBuf, x + 8, startY + 14, { fit: [120, 36] });
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
  }

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
      `${settings.business_name || 'Stainless Steel Fabrication'}  •  ${docLabel}`,
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
  const doc = createA4Document(`Quotation ${quotation.quotation_number}`, settings);
  await drawBusinessHeader(doc, settings, 'Quotation', quotation.quotation_number, quotation.status);

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

  await drawSignatureArea(doc, [
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
  const doc = createA4Document(`Invoice ${invoice.invoice_number}`, settings);
  await drawBusinessHeader(doc, settings, 'Billing Invoice', invoice.invoice_number, invoice.status);

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

  await drawSignatureArea(doc, [
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
  const doc = createA4Document(`Service Report ${report.report_number}`, settings);
  await drawBusinessHeader(doc, settings, 'Service Report', report.report_number, report.status);

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

  // Optional Before & After Photos loaded from persistent DB storage
  const resolvedPhotos = [];
  for (const p of photos || []) {
    const buf = await resolveUploadBufferFromUrl(p.photo_url, doc._businessId || 1);
    if (buf) resolvedPhotos.push({ ...p, buf });
  }

  if (resolvedPhotos.length > 0) {
    ensureSpace(doc, 145);
    fontBold(doc).fontSize(8.5).fillColor('#0f172a').text('BEFORE & AFTER DOCUMENTATION PHOTOS', doc.page.margins.left, doc.y);
    doc.y += 6;
    const cardW = (contentW - 16) / 2;
    for (let i = 0; i < resolvedPhotos.length; i += 2) {
      ensureSpace(doc, 130);
      const rowY = doc.y;
      for (let j = 0; j < 2 && i + j < resolvedPhotos.length; j++) {
        const ph = resolvedPhotos[i + j];
        const x = doc.page.margins.left + j * (cardW + 16);
        doc.rect(x, rowY, cardW, 118).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
        try {
          doc.image(ph.buf, x + 6, rowY + 6, { fit: [cardW - 12, 86] });
        } catch (_) {
          // ignore
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

  await drawSignatureArea(doc, [
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
  const doc = createA4Document(`Billing Statement ${statement.statement_number}`, settings);
  await drawBusinessHeader(doc, settings, 'Billing Statement', statement.statement_number, 'Statement of Account');

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

  await drawSignatureArea(doc, [
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

// ============================================================================
// HR DOCUMENT PDF GENERATORS (PAYSLIP, CERTIFICATE OF EMPLOYMENT, EMPLOYEE ID)
// ============================================================================

function formatLongDate(ymd) {
  if (!ymd) return '—';
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatPayBasisLabel(basis) {
  switch (basis) {
    case 'daily':
      return 'Daily Rate';
    case 'semi_monthly':
      return 'Semi-Monthly';
    case 'monthly':
      return 'Monthly Salary';
    case 'hourly':
      return 'Hourly Rate';
    default:
      return basis || 'Standard';
  }
}

function formatSalaryPeriodLabel(period) {
  switch (period) {
    case 'daily':
      return 'per day';
    case 'semi_monthly':
      return 'semi-monthly';
    case 'hourly':
      return 'per hour';
    case 'annual':
      return 'per annum';
    case 'monthly':
    default:
      return 'per month';
  }
}

export async function generatePayslipPdf(payslip, settings) {
  const doc = createA4Document(`Payslip ${payslip.payslip_number}`, settings);
  await drawBusinessHeader(
    doc,
    settings,
    'Employee Payslip',
    payslip.payslip_number,
    payslip.status
  );

  const workSummary = [];
  if (Number(payslip.days_worked) > 0) workSummary.push(`${formatQty(payslip.days_worked)} day(s)`);
  if (Number(payslip.hours_worked) > 0) workSummary.push(`${formatQty(payslip.hours_worked)} hr(s)`);

  drawTwoColumnMetaBox(
    doc,
    'Employee Information',
    [
      ['Employee Name', payslip.employee_name],
      ['Employee ID', payslip.employee_code],
      ['Position / Title', payslip.position_title],
      ['Department', payslip.department],
    ],
    'Payroll Period & Basis',
    [
      [
        'Pay Period',
        `${formatDateDisplay(payslip.pay_period_start)} to ${formatDateDisplay(payslip.pay_period_end)}`,
      ],
      ['Payment Date', formatDateDisplay(payslip.payment_date)],
      [
        'Pay Basis & Rate',
        `${formatPayBasisLabel(payslip.pay_basis)} (${formatPHP(payslip.base_rate)})`,
      ],
      ['Attendance', workSummary.join(' / ') || null],
      ['Payment Method', payslip.payment_method],
    ]
  );

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const totalW = right - left;
  const gap = 14;
  const colW = (totalW - gap) / 2;

  let regularDesc = 'Basic / Regular Pay';
  if (payslip.pay_basis === 'daily' && Number(payslip.days_worked) > 0) {
    regularDesc = `Basic Pay (${formatPHP(payslip.base_rate)} × ${formatQty(payslip.days_worked)} days)`;
  } else if (payslip.pay_basis === 'hourly' && Number(payslip.hours_worked) > 0) {
    regularDesc = `Basic Pay (${formatPHP(payslip.base_rate)} × ${formatQty(payslip.hours_worked)} hrs)`;
  } else if (payslip.pay_basis === 'semi_monthly') {
    regularDesc = `Basic Pay (Semi-Monthly of ${formatPHP(payslip.base_rate)})`;
  } else if (payslip.pay_basis === 'monthly') {
    regularDesc = 'Basic Monthly Salary';
  }

  let otDesc = 'Overtime Pay';
  if (Number(payslip.overtime_hours) > 0 && Number(payslip.overtime_rate) > 0) {
    otDesc = `Overtime (${formatQty(payslip.overtime_hours)} hrs × ${formatPHP(payslip.overtime_rate)}/hr)`;
  } else if (Number(payslip.overtime_hours) > 0) {
    otDesc = `Overtime (${formatQty(payslip.overtime_hours)} hrs)`;
  }

  const earningsRows = [
    [regularDesc, formatPHP(payslip.regular_pay)],
    [otDesc, formatPHP(payslip.overtime_pay)],
    ['Allowances', formatPHP(payslip.allowances)],
    ['Bonuses / Incentives', formatPHP(payslip.bonuses)],
    [
      payslip.other_earnings_note
        ? `Other Earnings (${payslip.other_earnings_note})`
        : 'Other Earnings',
      formatPHP(payslip.other_earnings),
    ],
  ];

  const deductionRows = [
    ['SSS Contribution', formatPHP(payslip.sss_deduction)],
    ['PhilHealth Contribution', formatPHP(payslip.philhealth_deduction)],
    ['Pag-IBIG Contribution', formatPHP(payslip.pagibig_deduction)],
    ['Withholding Tax', formatPHP(payslip.withholding_tax)],
    ['Cash Advance', formatPHP(payslip.cash_advance)],
    [
      payslip.other_deductions_note
        ? `Other Deductions (${payslip.other_deductions_note})`
        : 'Other Deductions',
      formatPHP(payslip.other_deductions),
    ],
  ];

  const tableTop = doc.y + 4;
  // Section headers
  doc.save();
  doc.rect(left, tableTop, colW, 20).fill('#0f172a');
  doc.rect(left + colW + gap, tableTop, colW, 20).fill('#334155');
  doc.restore();

  fontBold(doc).fontSize(8.5).fillColor('#ffffff');
  doc.text('EARNINGS', left + 8, tableTop + 5.5, { width: colW - 80 });
  doc.text('AMOUNT', left + colW - 76, tableTop + 5.5, { width: 68, align: 'right' });

  doc.text('DEDUCTIONS', left + colW + gap + 8, tableTop + 5.5, { width: colW - 80 });
  doc.text('AMOUNT', left + totalW - 76, tableTop + 5.5, { width: 68, align: 'right' });

  const maxRows = Math.max(earningsRows.length, deductionRows.length);
  let rowY = tableTop + 20;
  const rowH = 22;

  for (let i = 0; i < maxRows; i++) {
    if (i % 2 === 1) {
      doc.save();
      doc.rect(left, rowY, colW, rowH).fill('#f8fafc');
      doc.rect(left + colW + gap, rowY, colW, rowH).fill('#f8fafc');
      doc.restore();
    }

    const eRow = earningsRows[i];
    if (eRow) {
      fontRegular(doc)
        .fontSize(8.2)
        .fillColor('#1e293b')
        .text(eRow[0], left + 8, rowY + 6, { width: colW - 86, lineBreak: false });
      fontRegular(doc)
        .fontSize(8.2)
        .fillColor('#0f172a')
        .text(eRow[1], left + colW - 78, rowY + 6, { width: 70, align: 'right' });
    }

    const dRow = deductionRows[i];
    if (dRow) {
      fontRegular(doc)
        .fontSize(8.2)
        .fillColor('#1e293b')
        .text(dRow[0], left + colW + gap + 8, rowY + 6, { width: colW - 86, lineBreak: false });
      fontRegular(doc)
        .fontSize(8.2)
        .fillColor('#0f172a')
        .text(dRow[1], left + totalW - 78, rowY + 6, { width: 70, align: 'right' });
    }

    doc.save();
    doc.lineWidth(0.4).strokeColor('#e2e8f0');
    doc.moveTo(left, rowY + rowH).lineTo(left + colW, rowY + rowH).stroke();
    doc.moveTo(left + colW + gap, rowY + rowH).lineTo(right, rowY + rowH).stroke();
    doc.restore();

    rowY += rowH;
  }

  // Subtotals row
  doc.save();
  doc.rect(left, rowY, colW, 24).fill('#f1f5f9').strokeColor('#cbd5e1').lineWidth(0.6).stroke();
  doc
    .rect(left + colW + gap, rowY, colW, 24)
    .fill('#f1f5f9')
    .strokeColor('#cbd5e1')
    .lineWidth(0.6)
    .stroke();
  doc.restore();

  fontBold(doc).fontSize(8.8).fillColor('#0f172a');
  doc.text('TOTAL EARNINGS', left + 8, rowY + 7, { width: colW - 90 });
  doc.text(formatPHP(payslip.total_earnings), left + colW - 86, rowY + 7, {
    width: 78,
    align: 'right',
  });

  doc.text('TOTAL DEDUCTIONS', left + colW + gap + 8, rowY + 7, { width: colW - 90 });
  doc.text(formatPHP(payslip.total_deductions), left + totalW - 86, rowY + 7, {
    width: 78,
    align: 'right',
  });

  // Net Pay Banner
  const netBoxY = rowY + 34;
  doc.save();
  doc.rect(left, netBoxY, totalW, 34).fill('#0f172a');
  doc.restore();

  fontBold(doc)
    .fontSize(11)
    .fillColor('#ffffff')
    .text('NET TAKE-HOME PAY', left + 14, netBoxY + 10, { width: 220 });
  fontBold(doc)
    .fontSize(13)
    .fillColor('#ffffff')
    .text(formatPHP(payslip.net_pay), right - 210, netBoxY + 9, { width: 196, align: 'right' });

  doc.y = netBoxY + 48;

  if (payslip.remarks) {
    drawTermsAndNotes(doc, [['Payroll Remarks', payslip.remarks]]);
  }

  await drawSignatureArea(doc, [
    {
      heading: 'Prepared By:',
      name: payslip.prepared_by || '',
      subtitle: settings.business_name,
      signatureUrl: '',
    },
    {
      heading: 'Approved By:',
      name: payslip.approved_by || settings.authorized_representative || '',
      subtitle: settings.authorized_title || 'Authorized Representative',
      signatureUrl: settings.signature_url,
    },
    {
      heading: 'Received By (Employee):',
      name: payslip.employee_name || '',
      subtitle: 'Signature Over Printed Name & Date',
      signatureUrl: payslip.employee_signature_url,
    },
  ]);

  stampPageFooters(doc, settings, `Payslip ${payslip.payslip_number}`);
  return finalizePdfBuffer(doc);
}

export async function generateCoePdf(coe, settings) {
  const doc = createA4Document(`Certificate of Employment ${coe.certificate_number}`, settings);
  const bizId = doc._businessId || 1;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentW = right - left;
  let y = doc.page.margins.top + 4;

  // Formal Letterhead
  const logoBuf = await resolveUploadBufferFromUrl(settings.logo_url, bizId);
  let textX = left;
  if (logoBuf) {
    try {
      doc.image(logoBuf, left, y, { fit: [56, 56] });
      textX = left + 68;
    } catch (_) {
      textX = left;
    }
  }

  fontBold(doc)
    .fontSize(14)
    .fillColor('#0f172a')
    .text(settings.business_name || 'Stainless Steel Fabrication', textX, y, {
      width: contentW - (textX - left),
    });

  fontRegular(doc).fontSize(9).fillColor('#334155');
  let headerY = doc.y + 3;
  if (settings.address) {
    doc.text(settings.address, textX, headerY, { width: contentW - (textX - left) });
    headerY = doc.y + 2;
  }
  const contacts = [];
  if (settings.contact_number) contacts.push(`Contact: ${settings.contact_number}`);
  if (settings.email) contacts.push(`Email: ${settings.email}`);
  if (contacts.length > 0) {
    doc.text(contacts.join('  •  '), textX, headerY, { width: contentW - (textX - left) });
    headerY = doc.y + 2;
  }

  const ruleY = Math.max(headerY, y + 58) + 10;
  doc.moveTo(left, ruleY).lineTo(right, ruleY).lineWidth(1.5).strokeColor('#0f172a').stroke();

  // Reference & Date
  let cursorY = ruleY + 18;
  fontRegular(doc).fontSize(9.5).fillColor('#334155');
  doc.text(`Reference No.: ${coe.certificate_number}`, left, cursorY, { width: contentW / 2 });
  doc.text(`Date: ${formatLongDate(coe.date_issued)}`, left + contentW / 2, cursorY, {
    width: contentW / 2,
    align: 'right',
  });

  // Title
  cursorY += 42;
  fontBold(doc)
    .fontSize(16)
    .fillColor('#0f172a')
    .text('CERTIFICATE OF EMPLOYMENT', left, cursorY, {
      width: contentW,
      align: 'center',
    });

  cursorY = doc.y + 32;
  fontBold(doc)
    .fontSize(10.5)
    .fillColor('#0f172a')
    .text('TO WHOM IT MAY CONCERN:', left, cursorY, { width: contentW });

  cursorY = doc.y + 18;
  fontRegular(doc).fontSize(10.5).fillColor('#0f172a');

  const isSeparated =
    Boolean(coe.end_date) ||
    ['Resigned', 'Inactive', 'End of Contract', 'Terminated', 'Separated'].includes(
      coe.employment_status
    );

  const startFormatted = formatLongDate(coe.start_date);
  const endFormatted = coe.end_date ? formatLongDate(coe.end_date) : 'present';
  const bizName = settings.business_name || 'Stainless Steel Fabrication';

  if (coe.custom_body && String(coe.custom_body).trim()) {
    doc.text(String(coe.custom_body).trim(), left, cursorY, {
      width: contentW,
      align: 'justify',
      lineGap: 4,
    });
    cursorY = doc.y + 16;
  } else {
    const idClause = coe.employee_code ? ` (Employee ID: ${coe.employee_code})` : '';
    const deptClause = coe.department ? ` under the ${coe.department} department` : '';
    const typeClause = coe.employment_type ? ` (${coe.employment_type})` : '';

    const p1 = isSeparated
      ? `This is to certify that ${coe.employee_name}${idClause} was employed with ${bizName} from ${startFormatted} until ${endFormatted}, holding the position of ${coe.position_title}${deptClause}${typeClause}. Employment status on record: ${coe.employment_status}.`
      : `This is to certify that ${coe.employee_name}${idClause} is employed with ${bizName} from ${startFormatted} up to the present, holding the position of ${coe.position_title}${deptClause}${typeClause} with current employment status: ${coe.employment_status}.`;

    doc.text(p1, left, cursorY, { width: contentW, align: 'justify', lineGap: 4 });
    cursorY = doc.y + 16;
  }

  if (Number(coe.include_salary) === 1 && Number(coe.salary_amount) > 0) {
    const verb = isSeparated ? 'received' : 'receives';
    const compParagraph = `During this employment, the above-named employee ${verb} a compensation of ${formatPHP(
      coe.salary_amount
    )} ${formatSalaryPeriodLabel(coe.salary_period)}.`;
    doc.text(compParagraph, left, cursorY, { width: contentW, align: 'justify', lineGap: 4 });
    cursorY = doc.y + 16;
  }

  const purposeText = coe.purpose?.trim()
    ? `for ${coe.purpose.trim()}`
    : 'for whatever legal purpose it may serve';
  const p3 = `This certification is issued upon the request of ${coe.employee_name} ${purposeText}.`;
  doc.text(p3, left, cursorY, { width: contentW, align: 'justify', lineGap: 4 });
  cursorY = doc.y + 16;

  const locationClause = settings.address ? ` at ${settings.address}` : '';
  const p4 = `Issued on ${formatLongDate(coe.date_issued)}${locationClause}.`;
  doc.text(p4, left, cursorY, { width: contentW, lineGap: 4 });

  // Signatory section
  const sigTop = Math.max(doc.y + 52, 470);
  const sigBlockW = 230;
  fontRegular(doc).fontSize(9.5).fillColor('#334155').text('Certified by:', left, sigTop);

  const sigImgBuf = await resolveUploadBufferFromUrl(coe.signature_url, bizId);
  if (sigImgBuf) {
    try {
      doc.image(sigImgBuf, left + 6, sigTop + 16, { fit: [135, 42] });
    } catch (_) {}
  }

  const sigLineY = sigTop + 64;
  doc
    .moveTo(left, sigLineY)
    .lineTo(left + sigBlockW, sigLineY)
    .lineWidth(0.8)
    .strokeColor('#0f172a')
    .stroke();

  fontBold(doc)
    .fontSize(10)
    .fillColor('#0f172a')
    .text(coe.signatory_name || ' ', left, sigLineY + 6, { width: sigBlockW });

  fontRegular(doc)
    .fontSize(9)
    .fillColor('#334155')
    .text(coe.signatory_title || 'Authorized Signatory', left, sigLineY + 20, {
      width: sigBlockW,
    });

  fontRegular(doc)
    .fontSize(8.5)
    .fillColor('#475569')
    .text(bizName, left, sigLineY + 33, { width: sigBlockW });

  stampPageFooters(doc, settings, `Certificate of Employment ${coe.certificate_number}`);
  return finalizePdfBuffer(doc);
}

export async function generateEmployeeIdPdf(card, settings) {
  const doc = createA4Document(`Employee ID ${card.employee_code}`, settings);
  const bizId = doc._businessId || 1;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentW = right - left;

  fontBold(doc)
    .fontSize(12)
    .fillColor('#0f172a')
    .text(
      `${settings.business_name || 'Stainless Steel Fabrication'} — Employee ID Print Sheet`,
      left,
      42,
      { width: contentW }
    );
  fontRegular(doc)
    .fontSize(8.5)
    .fillColor('#475569')
    .text(
      `Card Reference: ${card.card_number}  •  Print at 100% actual size for standard CR80 ID dimensions (54.0 mm × 85.6 mm).`,
      left,
      58,
      { width: contentW }
    );

  // Exact CR80 portrait dimensions in PDF points (1 mm = 2.83465 pt)
  const cardW = 153.07; // 54.0 mm
  const cardH = 242.65; // 85.6 mm
  const gap = 36;
  const startX = left + (contentW - (cardW * 2 + gap)) / 2;
  const startY = 96;

  const frontX = startX;
  const backX = startX + cardW + gap;

  // Labels above cards
  fontBold(doc).fontSize(8).fillColor('#64748b');
  doc.text('FRONT SIDE', frontX, startY - 14, { width: cardW, align: 'center' });
  doc.text('BACK SIDE', backX, startY - 14, { width: cardW, align: 'center' });

  // ---------------- FRONT CARD ----------------
  doc.save();
  doc.roundedRect(frontX, startY, cardW, cardH, 6).fill('#ffffff');
  doc.roundedRect(frontX, startY, cardW, cardH, 6).clip();

  // Header band
  doc.rect(frontX, startY, cardW, 48).fill('#0f172a');
  doc.rect(frontX, startY + 48, cardW, 3).fill('#0284c7');

  const logoBuf = await resolveUploadBufferFromUrl(settings.logo_url, bizId);
  let headerTextX = frontX + 8;
  let headerTextW = cardW - 16;
  if (logoBuf) {
    try {
      doc.save();
      doc.roundedRect(frontX + 8, startY + 9, 28, 28, 3).fill('#ffffff');
      doc.image(logoBuf, frontX + 10, startY + 11, { fit: [24, 24] });
      doc.restore();
      headerTextX = frontX + 41;
      headerTextW = cardW - 49;
    } catch (_) {}
  }

  fontBold(doc)
    .fontSize(7.2)
    .fillColor('#ffffff')
    .text(
      (settings.business_name || 'Stainless Steel Fabrication').toUpperCase(),
      headerTextX,
      startY + 11,
      { width: headerTextW, lineGap: 1 }
    );

  // Employee Photo Box (proportional fit — never stretches image)
  const photoBoxW = 72;
  const photoBoxH = 86;
  const photoX = frontX + (cardW - photoBoxW) / 2;
  const photoY = startY + 60;

  doc.save();
  doc.rect(photoX, photoY, photoBoxW, photoBoxH).fill('#f1f5f9');
  doc.restore();

  const empPhotoBuf = await resolveUploadBufferFromUrl(card.photo_url, bizId);
  if (empPhotoBuf) {
    try {
      doc.image(empPhotoBuf, photoX + 2, photoY + 2, {
        fit: [photoBoxW - 4, photoBoxH - 4],
        align: 'center',
        valign: 'center',
      });
    } catch (_) {}
  } else {
    const initials = String(card.full_name || 'EMP')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0].toUpperCase())
      .join('');
    fontBold(doc)
      .fontSize(16)
      .fillColor('#94a3b8')
      .text(initials, photoX, photoY + 34, { width: photoBoxW, align: 'center' });
  }

  doc
    .rect(photoX, photoY, photoBoxW, photoBoxH)
    .lineWidth(1)
    .strokeColor('#cbd5e1')
    .stroke();

  // Employee Name & Position
  fontBold(doc)
    .fontSize(9.5)
    .fillColor('#0f172a')
    .text(card.full_name, frontX + 8, photoY + photoBoxH + 8, {
      width: cardW - 16,
      align: 'center',
    });

  fontBold(doc)
    .fontSize(7.5)
    .fillColor('#0369a1')
    .text((card.position_title || '').toUpperCase(), frontX + 8, doc.y + 2, {
      width: cardW - 16,
      align: 'center',
    });

  if (card.department) {
    fontRegular(doc)
      .fontSize(6.8)
      .fillColor('#475569')
      .text(card.department, frontX + 8, doc.y + 1.5, {
        width: cardW - 16,
        align: 'center',
      });
  }

  // Bottom Employee ID Strip
  const idStripY = startY + cardH - 26;
  doc.rect(frontX, idStripY, cardW, 26).fill('#0f172a');
  fontBold(doc)
    .fontSize(8)
    .fillColor('#ffffff')
    .text(`ID NO: ${card.employee_code}`, frontX + 6, idStripY + 8, {
      width: cardW - 12,
      align: 'center',
    });

  doc.restore();
  doc
    .roundedRect(frontX, startY, cardW, cardH, 6)
    .lineWidth(0.8)
    .strokeColor('#64748b')
    .stroke();

  // ---------------- BACK CARD ----------------
  doc.save();
  doc.roundedRect(backX, startY, cardW, cardH, 6).fill('#ffffff');
  doc.roundedRect(backX, startY, cardW, cardH, 6).clip();

  doc.rect(backX, startY, cardW, 20).fill('#0f172a');
  fontBold(doc)
    .fontSize(6.8)
    .fillColor('#ffffff')
    .text('EMPLOYEE & EMERGENCY DETAILS', backX + 6, startY + 6.5, {
      width: cardW - 12,
      align: 'center',
    });

  let bY = startY + 28;
  const bPad = backX + 10;
  const bWidth = cardW - 20;

  const writeBackField = (label, val) => {
    if (!val) return;
    fontBold(doc).fontSize(6.2).fillColor('#64748b').text(label.toUpperCase(), bPad, bY, { width: bWidth });
    fontRegular(doc).fontSize(7).fillColor('#0f172a').text(String(val), bPad, doc.y + 0.5, { width: bWidth });
    bY = doc.y + 4;
  };

  if (card.emergency_contact_name || card.emergency_contact_number) {
    const emStr = [card.emergency_contact_name, card.emergency_contact_number]
      .filter(Boolean)
      .join(' • ');
    writeBackField('In Case of Emergency', emStr);
  }
  if (card.blood_type) {
    writeBackField('Blood Type', card.blood_type);
  }
  if (card.contact_number) {
    writeBackField('Employee Contact', card.contact_number);
  }
  if (card.address) {
    writeBackField('Address', card.address);
  }

  // Dates row
  fontBold(doc).fontSize(6.2).fillColor('#64748b').text('DATE ISSUED', bPad, bY, { width: bWidth / 2 });
  if (card.expiration_date) {
    fontBold(doc)
      .fontSize(6.2)
      .fillColor('#64748b')
      .text('VALID UNTIL', bPad + bWidth / 2, bY, { width: bWidth / 2 });
  }
  const dateValY = doc.y + 0.5;
  fontRegular(doc)
    .fontSize(7)
    .fillColor('#0f172a')
    .text(formatDateDisplay(card.date_issued), bPad, dateValY, { width: bWidth / 2 });
  if (card.expiration_date) {
    fontRegular(doc)
      .fontSize(7)
      .fillColor('#0f172a')
      .text(formatDateDisplay(card.expiration_date), bPad + bWidth / 2, dateValY, {
        width: bWidth / 2,
      });
  }

  // Authorized Signatory Area on Back
  const backSigLineY = startY + cardH - 58;
  const sigBuf = await resolveUploadBufferFromUrl(card.signature_url, bizId);
  if (sigBuf) {
    try {
      doc.image(sigBuf, backX + (cardW - 72) / 2, backSigLineY - 24, { fit: [72, 22] });
    } catch (_) {}
  }
  doc
    .moveTo(backX + 18, backSigLineY)
    .lineTo(backX + cardW - 18, backSigLineY)
    .lineWidth(0.6)
    .strokeColor('#0f172a')
    .stroke();
  fontBold(doc)
    .fontSize(6.8)
    .fillColor('#0f172a')
    .text(card.authorized_signatory || ' ', backX + 8, backSigLineY + 2.5, {
      width: cardW - 16,
      align: 'center',
    });
  fontRegular(doc)
    .fontSize(6)
    .fillColor('#475569')
    .text(card.authorized_title || 'Authorized Signatory', backX + 8, backSigLineY + 11, {
      width: cardW - 16,
      align: 'center',
    });

  // Return notice footer
  const returnText =
    card.back_notes?.trim() ||
    [
      `Property of ${settings.business_name || 'Stainless Steel Fabrication'}.`,
      settings.address,
      settings.contact_number ? `Tel: ${settings.contact_number}` : '',
    ]
      .filter(Boolean)
      .join(' ');

  doc.rect(backX, startY + cardH - 32, cardW, 32).fill('#f8fafc');
  fontRegular(doc)
    .fontSize(5.5)
    .fillColor('#475569')
    .text(returnText, backX + 7, startY + cardH - 28, {
      width: cardW - 14,
      align: 'center',
      lineGap: 0.8,
    });

  doc.restore();
  doc
    .roundedRect(backX, startY, cardW, cardH, 6)
    .lineWidth(0.8)
    .strokeColor('#64748b')
    .stroke();

  stampPageFooters(doc, settings, `Employee ID ${card.employee_code} (${card.card_number})`);
  return finalizePdfBuffer(doc);
}

