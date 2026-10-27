import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'johnrois.sqlite');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

export function round2(val) {
  const num = Number(val) || 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function nowISO() {
  return new Date().toISOString();
}

export function todayYMD() {
  return new Date().toISOString().slice(0, 10);
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner', 'staff', 'technician')) DEFAULT 'staff',
      is_active INTEGER NOT NULL DEFAULT 1,
      is_initial_setup INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS business_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      business_name TEXT NOT NULL DEFAULT 'Johnrois Stainless Steel Fabrication Shop',
      logo_url TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT 'Brgy. Ubalde, R. Castillo, Davao City, Davao del Sur, Philippines',
      contact_number TEXT NOT NULL DEFAULT '+63 917 421 7417',
      email TEXT NOT NULL DEFAULT '',
      facebook_url TEXT NOT NULL DEFAULT 'https://www.facebook.com/johnroiscanon',
      maps_url TEXT NOT NULL DEFAULT 'https://goo.gl/maps/t4FehxJHF1j5PdfZ6',
      other_social_links TEXT NOT NULL DEFAULT '',
      operating_hours TEXT NOT NULL DEFAULT 'Mon–Sat 8:00 AM – 5:00 PM | Sun 9:00 AM – 12:00 PM',
      quotation_prefix TEXT NOT NULL DEFAULT 'QTN',
      invoice_prefix TEXT NOT NULL DEFAULT 'INV',
      service_report_prefix TEXT NOT NULL DEFAULT 'SR',
      billing_statement_prefix TEXT NOT NULL DEFAULT 'SOA',
      customer_prefix TEXT NOT NULL DEFAULT 'CUST',
      product_prefix TEXT NOT NULL DEFAULT 'ITEM',
      payment_prefix TEXT NOT NULL DEFAULT 'PAY',
      doc_number_padding INTEGER NOT NULL DEFAULT 4,
      include_year_in_doc_num INTEGER NOT NULL DEFAULT 1,
      default_payment_terms TEXT NOT NULL DEFAULT '50% Downpayment upon confirmation; 50% Balance upon completion/delivery',
      default_quotation_validity_days INTEGER NOT NULL DEFAULT 15,
      default_invoice_due_days INTEGER NOT NULL DEFAULT 15,
      default_notes TEXT NOT NULL DEFAULT '',
      authorized_representative TEXT NOT NULL DEFAULT '',
      authorized_title TEXT NOT NULL DEFAULT 'Authorized Representative',
      signature_url TEXT NOT NULL DEFAULT '',
      tax_enabled INTEGER NOT NULL DEFAULT 0,
      tax_label TEXT NOT NULL DEFAULT 'VAT',
      tax_rate REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_sequences (
      seq_key TEXT PRIMARY KEY,
      last_val INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      idem_key TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_code TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      company_name TEXT NOT NULL DEFAULT '',
      contact_number TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      billing_address TEXT NOT NULL DEFAULT '',
      project_locations TEXT NOT NULL DEFAULT '',
      remarks TEXT NOT NULL DEFAULT '',
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Fabrication',
      material_grade TEXT NOT NULL DEFAULT '',
      unit TEXT NOT NULL DEFAULT 'unit',
      unit_price REAL NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_number TEXT UNIQUE NOT NULL,
      date_issued TEXT NOT NULL,
      valid_until TEXT NOT NULL DEFAULT '',
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      company_name TEXT NOT NULL DEFAULT '',
      customer_address TEXT NOT NULL DEFAULT '',
      contact_number TEXT NOT NULL DEFAULT '',
      customer_email TEXT NOT NULL DEFAULT '',
      project_name TEXT NOT NULL DEFAULT '',
      project_location TEXT NOT NULL DEFAULT '',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_type TEXT NOT NULL DEFAULT 'fixed' CHECK(discount_type IN ('fixed', 'percent')),
      discount_value REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_enabled INTEGER NOT NULL DEFAULT 0,
      tax_label TEXT NOT NULL DEFAULT 'VAT',
      tax_rate REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      grand_total REAL NOT NULL DEFAULT 0,
      payment_terms TEXT NOT NULL DEFAULT '',
      delivery_schedule TEXT NOT NULL DEFAULT '',
      remarks TEXT NOT NULL DEFAULT '',
      prepared_by TEXT NOT NULL DEFAULT '',
      authorized_signatory TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft', 'Sent', 'Approved', 'Rejected', 'Expired')),
      converted_invoice_id INTEGER DEFAULT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quotation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products_services(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'pcs',
      unit_price REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      invoice_date TEXT NOT NULL,
      due_date TEXT NOT NULL DEFAULT '',
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      company_name TEXT NOT NULL DEFAULT '',
      customer_address TEXT NOT NULL DEFAULT '',
      contact_number TEXT NOT NULL DEFAULT '',
      customer_email TEXT NOT NULL DEFAULT '',
      quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
      reference_quotation_number TEXT NOT NULL DEFAULT '',
      project_name TEXT NOT NULL DEFAULT '',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_type TEXT NOT NULL DEFAULT 'fixed' CHECK(discount_type IN ('fixed', 'percent')),
      discount_value REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_enabled INTEGER NOT NULL DEFAULT 0,
      tax_label TEXT NOT NULL DEFAULT 'VAT',
      tax_rate REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount_due REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      remaining_balance REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT '',
      payment_date TEXT NOT NULL DEFAULT '',
      payment_terms TEXT NOT NULL DEFAULT '',
      remarks TEXT NOT NULL DEFAULT '',
      prepared_by TEXT NOT NULL DEFAULT '',
      authorized_signatory TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Unpaid' CHECK(status IN ('Unpaid', 'Partially Paid', 'Paid', 'Overdue')),
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products_services(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'pcs',
      unit_price REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_number TEXT UNIQUE NOT NULL,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      reference_number TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      recorded_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_number TEXT UNIQUE NOT NULL,
      service_date TEXT NOT NULL,
      job_type TEXT NOT NULL DEFAULT 'Fabrication',
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      company_name TEXT NOT NULL DEFAULT '',
      contact_details TEXT NOT NULL DEFAULT '',
      service_location TEXT NOT NULL DEFAULT '',
      equipment_serviced TEXT NOT NULL DEFAULT '',
      reported_problem TEXT NOT NULL DEFAULT '',
      inspection_findings TEXT NOT NULL DEFAULT '',
      work_performed TEXT NOT NULL DEFAULT '',
      materials_total_cost REAL NOT NULL DEFAULT 0,
      technician_name TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL DEFAULT '',
      completion_time TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Scheduled' CHECK(status IN ('Scheduled', 'In Progress', 'Completed', 'Cancelled')),
      recommendations TEXT NOT NULL DEFAULT '',
      customer_acknowledgment INTEGER NOT NULL DEFAULT 0,
      customer_signatory_name TEXT NOT NULL DEFAULT '',
      acknowledgment_date TEXT NOT NULL DEFAULT '',
      technician_signature_url TEXT NOT NULL DEFAULT '',
      customer_signature_url TEXT NOT NULL DEFAULT '',
      remarks TEXT NOT NULL DEFAULT '',
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_report_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_report_id INTEGER NOT NULL REFERENCES service_reports(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      material_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'pcs',
      unit_cost REAL NOT NULL DEFAULT 0,
      line_cost REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS service_report_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_report_id INTEGER NOT NULL REFERENCES service_reports(id) ON DELETE CASCADE,
      photo_type TEXT NOT NULL CHECK(photo_type IN ('before', 'after')),
      photo_url TEXT NOT NULL,
      caption TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billing_statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_number TEXT UNIQUE NOT NULL,
      statement_date TEXT NOT NULL,
      period_from TEXT NOT NULL,
      period_to TEXT NOT NULL,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      customer_name TEXT NOT NULL,
      company_name TEXT NOT NULL DEFAULT '',
      customer_address TEXT NOT NULL DEFAULT '',
      contact_number TEXT NOT NULL DEFAULT '',
      customer_email TEXT NOT NULL DEFAULT '',
      previous_balance REAL NOT NULL DEFAULT 0,
      total_charges REAL NOT NULL DEFAULT 0,
      total_payments REAL NOT NULL DEFAULT 0,
      outstanding_balance REAL NOT NULL DEFAULT 0,
      payment_terms TEXT NOT NULL DEFAULT '',
      remarks TEXT NOT NULL DEFAULT '',
      prepared_by TEXT NOT NULL DEFAULT '',
      authorized_signatory TEXT NOT NULL DEFAULT '',
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billing_statement_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      billing_statement_id INTEGER NOT NULL REFERENCES billing_statements(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      tx_date TEXT NOT NULL,
      tx_type TEXT NOT NULL CHECK(tx_type IN ('invoice', 'payment')),
      source_id INTEGER NOT NULL,
      reference_number TEXT NOT NULL,
      invoice_number TEXT NOT NULL DEFAULT '',
      invoice_date TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      running_balance REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      document_number TEXT NOT NULL DEFAULT '',
      customer_id INTEGER,
      customer_name TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      amount REAL,
      actor_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
    CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_service_reports_customer ON service_reports(customer_id);
    CREATE INDEX IF NOT EXISTS idx_billing_statements_customer ON billing_statements(customer_id);
    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);
  `);

  // Initialize singleton business_settings row using ONLY verified public details & editable blank fields
  const existingSettings = db.prepare('SELECT id FROM business_settings WHERE id = 1').get();
  if (!existingSettings) {
    db.prepare(`
      INSERT INTO business_settings (
        id, business_name, logo_url, address, contact_number, email,
        facebook_url, maps_url, other_social_links, operating_hours,
        default_payment_terms, updated_at
      ) VALUES (
        1,
        'Johnrois Stainless Steel Fabrication Shop',
        '',
        'Brgy. Ubalde, R. Castillo, Davao City, Davao del Sur, Philippines',
        '+63 917 421 7417',
        '',
        'https://www.facebook.com/johnroiscanon',
        'https://goo.gl/maps/t4FehxJHF1j5PdfZ6',
        '',
        'Mon–Sat 8:00 AM – 5:00 PM | Sun 9:00 AM – 12:00 PM',
        '50% Downpayment upon confirmation; 50% Balance upon completion/delivery',
        ?
      )
    `).run(nowISO());
  }
}

export function getSettings() {
  return db.prepare('SELECT * FROM business_settings WHERE id = 1').get();
}

export function formatDocNumber(type, nextVal, yearStr) {
  const settings = getSettings();
  const pad = Math.max(3, Math.min(8, Number(settings.doc_number_padding) || 4));
  const includeYear = Number(settings.include_year_in_doc_num) === 1;
  const prefixMap = {
    quotation: settings.quotation_prefix || 'QTN',
    invoice: settings.invoice_prefix || 'INV',
    service_report: settings.service_report_prefix || 'SR',
    billing_statement: settings.billing_statement_prefix || 'SOA',
    customer: settings.customer_prefix || 'CUST',
    product: settings.product_prefix || 'ITEM',
    payment: settings.payment_prefix || 'PAY',
  };
  const prefix = (prefixMap[type] || 'DOC').trim().toUpperCase();
  const numPart = String(nextVal).padStart(pad, '0');
  if (type === 'customer' || type === 'product') {
    return `${prefix}-${numPart}`;
  }
  return includeYear ? `${prefix}-${yearStr}-${numPart}` : `${prefix}-${numPart}`;
}

export function previewNextDocNumber(type, dateStr = todayYMD()) {
  const yearStr = (dateStr && dateStr.length >= 4) ? dateStr.slice(0, 4) : todayYMD().slice(0, 4);
  const seqKey = (type === 'customer' || type === 'product') ? type.toUpperCase() : `${type.toUpperCase()}-${yearStr}`;
  const row = db.prepare('SELECT last_val FROM document_sequences WHERE seq_key = ?').get(seqKey);
  const nextVal = (row ? row.last_val : 0) + 1;
  return formatDocNumber(type, nextVal, yearStr);
}

export function allocateNextDocNumber(type, dateStr = todayYMD()) {
  const yearStr = (dateStr && dateStr.length >= 4) ? dateStr.slice(0, 4) : todayYMD().slice(0, 4);
  const seqKey = (type === 'customer' || type === 'product') ? type.toUpperCase() : `${type.toUpperCase()}-${yearStr}`;

  const tableColumnMap = {
    quotation: ['quotations', 'quotation_number'],
    invoice: ['invoices', 'invoice_number'],
    service_report: ['service_reports', 'report_number'],
    billing_statement: ['billing_statements', 'statement_number'],
    customer: ['customers', 'customer_code'],
    product: ['products_services', 'item_code'],
    payment: ['payments', 'payment_number'],
  };
  const [table, col] = tableColumnMap[type];

  let candidate = '';
  let attempts = 0;
  while (attempts < 1000) {
    attempts++;
    const existing = db.prepare('SELECT last_val FROM document_sequences WHERE seq_key = ?').get(seqKey);
    const nextVal = (existing ? existing.last_val : 0) + 1;
    if (existing) {
      db.prepare('UPDATE document_sequences SET last_val = ? WHERE seq_key = ?').run(nextVal, seqKey);
    } else {
      db.prepare('INSERT INTO document_sequences (seq_key, last_val) VALUES (?, ?)').run(seqKey, nextVal);
    }
    candidate = formatDocNumber(type, nextVal, yearStr);
    const collision = db.prepare(`SELECT id FROM ${table} WHERE ${col} = ?`).get(candidate);
    if (!collision) return candidate;
  }
  throw new Error(`Unable to allocate unique document number for ${type}`);
}

export function runInTransaction(fn) {
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch (_) {
      // ignore rollback error
    }
    throw err;
  }
}

export function logActivity({
  entity_type,
  entity_id = null,
  document_number = '',
  customer_id = null,
  customer_name = '',
  action,
  summary,
  amount = null,
  actor_name = '',
}) {
  db.prepare(`
    INSERT INTO activity_logs (
      entity_type, entity_id, document_number, customer_id, customer_name,
      action, summary, amount, actor_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entity_type,
    entity_id,
    document_number || '',
    customer_id,
    customer_name || '',
    action,
    summary,
    amount !== null && amount !== undefined ? round2(amount) : null,
    actor_name || 'System',
    nowISO()
  );
}

/**
 * Recalculates an invoice's amount_paid, remaining_balance, latest payment info, and status.
 */
export function recalculateInvoicePaymentState(invoiceId) {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!inv) return null;

  const payAgg = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_paid
    FROM payments
    WHERE invoice_id = ?
  `).get(invoiceId);

  const latestPayment = db.prepare(`
    SELECT payment_method, payment_date
    FROM payments
    WHERE invoice_id = ?
    ORDER BY payment_date DESC, id DESC
    LIMIT 1
  `).get(invoiceId);

  const amountPaid = round2(payAgg.total_paid);
  const totalDue = round2(inv.total_amount_due);
  const remaining = Math.max(0, round2(totalDue - amountPaid));
  const today = todayYMD();

  let status = 'Unpaid';
  if (totalDue > 0 && remaining <= 0.009) {
    status = 'Paid';
  } else if (totalDue === 0 && amountPaid >= 0) {
    status = 'Paid';
  } else if (inv.due_date && inv.due_date < today && remaining > 0.009) {
    status = 'Overdue';
  } else if (amountPaid > 0.009 && remaining > 0.009) {
    status = 'Partially Paid';
  } else {
    status = 'Unpaid';
  }

  db.prepare(`
    UPDATE invoices
    SET amount_paid = ?,
        remaining_balance = ?,
        payment_method = ?,
        payment_date = ?,
        status = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    amountPaid,
    remaining,
    latestPayment ? latestPayment.payment_method : '',
    latestPayment ? latestPayment.payment_date : '',
    status,
    nowISO(),
    invoiceId
  );

  return db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
}

/**
 * Synchronizes overdue invoice statuses and expired quotation statuses based on current date.
 */
export function refreshTimeSensitiveStatuses() {
  const today = todayYMD();
  db.prepare(`
    UPDATE invoices
    SET status = 'Overdue'
    WHERE is_archived = 0
      AND remaining_balance > 0.009
      AND due_date != ''
      AND due_date < ?
      AND status != 'Overdue'
  `).run(today);

  db.prepare(`
    UPDATE quotations
    SET status = 'Expired'
    WHERE is_archived = 0
      AND status = 'Sent'
      AND valid_until != ''
      AND valid_until < ?
  `).run(today);
}

/**
 * Computes accurate customer ledger for a Billing Statement over [periodFrom, periodTo].
 * Guaranteed zero duplicate rows: 1 debit per non-archived invoice, 1 credit per recorded payment.
 */
export function computeCustomerStatementLedger(customerId, periodFrom, periodTo) {
  const prevInvRow = db.prepare(`
    SELECT COALESCE(SUM(total_amount_due), 0) as total
    FROM invoices
    WHERE customer_id = ?
      AND is_archived = 0
      AND invoice_date < ?
  `).get(customerId, periodFrom);

  const prevPayRow = db.prepare(`
    SELECT COALESCE(SUM(p.amount), 0) as total
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id
    WHERE i.customer_id = ?
      AND i.is_archived = 0
      AND p.payment_date < ?
  `).get(customerId, periodFrom);

  const previousBalance = round2((prevInvRow?.total || 0) - (prevPayRow?.total || 0));

  const periodInvoices = db.prepare(`
    SELECT id, invoice_number, invoice_date, project_name, reference_quotation_number, total_amount_due
    FROM invoices
    WHERE customer_id = ?
      AND is_archived = 0
      AND invoice_date >= ?
      AND invoice_date <= ?
    ORDER BY invoice_date ASC, id ASC
  `).all(customerId, periodFrom, periodTo);

  const periodPayments = db.prepare(`
    SELECT p.id, p.payment_number, p.payment_date, p.amount, p.payment_method, p.reference_number, p.notes,
           i.invoice_number, i.invoice_date
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id
    WHERE i.customer_id = ?
      AND i.is_archived = 0
      AND p.payment_date >= ?
      AND p.payment_date <= ?
    ORDER BY p.payment_date ASC, p.id ASC
  `).all(customerId, periodFrom, periodTo);

  const rawEntries = [];
  for (const inv of periodInvoices) {
    const itemSummary = db.prepare(`
      SELECT description FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC LIMIT 2
    `).all(inv.id).map((r) => r.description).join('; ');
    const descParts = [];
    if (inv.project_name) descParts.push(inv.project_name);
    if (itemSummary) descParts.push(itemSummary);
    const desc = descParts.length > 0
      ? `Invoice Charge — ${descParts.join(' — ')}`
      : `Billing Invoice ${inv.invoice_number}`;

    rawEntries.push({
      tx_date: inv.invoice_date,
      tx_type: 'invoice',
      sort_priority: 1,
      source_id: inv.id,
      reference_number: inv.invoice_number,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      description: desc.slice(0, 240),
      debit: round2(inv.total_amount_due),
      credit: 0,
    });
  }

  for (const pay of periodPayments) {
    const methodPart = pay.payment_method ? ` (${pay.payment_method})` : '';
    const refPart = pay.reference_number ? ` [Ref: ${pay.reference_number}]` : '';
    rawEntries.push({
      tx_date: pay.payment_date,
      tx_type: 'payment',
      sort_priority: 2,
      source_id: pay.id,
      reference_number: pay.payment_number,
      invoice_number: pay.invoice_number,
      invoice_date: pay.invoice_date,
      description: `Payment Received for ${pay.invoice_number}${methodPart}${refPart}`.slice(0, 240),
      debit: 0,
      credit: round2(pay.amount),
    });
  }

  rawEntries.sort((a, b) => {
    if (a.tx_date !== b.tx_date) return a.tx_date.localeCompare(b.tx_date);
    if (a.sort_priority !== b.sort_priority) return a.sort_priority - b.sort_priority;
    return a.source_id - b.source_id;
  });

  let running = previousBalance;
  let totalCharges = 0;
  let totalPayments = 0;

  const lines = rawEntries.map((entry, idx) => {
    totalCharges = round2(totalCharges + entry.debit);
    totalPayments = round2(totalPayments + entry.credit);
    running = round2(running + entry.debit - entry.credit);
    return {
      sort_order: idx + 1,
      tx_date: entry.tx_date,
      tx_type: entry.tx_type,
      source_id: entry.source_id,
      reference_number: entry.reference_number,
      invoice_number: entry.invoice_number,
      invoice_date: entry.invoice_date,
      description: entry.description,
      debit: entry.debit,
      credit: entry.credit,
      running_balance: running,
    };
  });

  const outstandingBalance = round2(previousBalance + totalCharges - totalPayments);

  return {
    previous_balance: previousBalance,
    total_charges: totalCharges,
    total_payments: totalPayments,
    outstanding_balance: outstandingBalance,
    lines,
  };
}

initDatabase();
