import express from 'express';
import compression from 'compression';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureDbReady,
  getStorageStatus,
  dbGet,
  dbAll,
  dbRun,
  runInTransaction,
  syncSequencesAfterRestore,
  saveUploadedFile,
  getUploadedFile,
  ROOT_DIR,
  UPLOADS_DIR,
  round2,
  nowISO,
  todayYMD,
  getSettings,
  previewNextDocNumber,
  allocateNextDocNumber,
  logActivity,
  recalculateInvoicePaymentState,
  refreshTimeSensitiveStatuses,
  computeCustomerStatementLedger,
} from './db.js';
import {
  generateQuotationPdf,
  generateInvoicePdf,
  generateServiceReportPdf,
  generateBillingStatementPdf,
} from './pdfGenerator.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Ensure iframe preview compatibility and optional CORS support
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  const allowedOrigin = (process.env.CORS_ORIGIN || '').trim();
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, X-Idempotency-Key, Authorization'
    );
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
  }
  next();
});

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Configure multer in-memory storage so uploads persist in the database across serverless instances
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Serve uploaded images/logos/signatures from persistent DB storage (with local disk fallback)
app.get(
  '/uploads/:filename',
  asyncHandler(async (req, res) => {
    await ensureDbReady();
    const fileObj = await getUploadedFile(req.params.filename);
    if (!fileObj) {
      return res.status(404).json({ error: 'Uploaded file not found.' });
    }
    res.setHeader('Content-Type', fileObj.mime_type || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(fileObj.buffer);
  })
);

// Health & storage readiness endpoint
app.get(
  '/api/health',
  asyncHandler(async (_req, res) => {
    await ensureDbReady();
    res.json({
      ok: true,
      timestamp: nowISO(),
      storage: getStorageStatus(),
    });
  })
);

// Attach direct internal workspace operator context & guard against unconfigured serverless writes
app.use(
  '/api',
  asyncHandler(async (req, res, next) => {
    await ensureDbReady();
    const storage = getStorageStatus();
    if (
      storage.setup_required &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())
    ) {
      return res.status(503).json({
        error: storage.message,
        setup_required: true,
      });
    }
    const settings = await getSettings();
    req.user = {
      id: null,
      full_name: settings?.authorized_representative || '',
      role: 'owner',
    };
    next();
  })
);

async function getIdempotencyHit(req, entityType) {
  const key = req.headers['x-idempotency-key'];
  if (!key || typeof key !== 'string') return null;
  const hit = await dbGet(
    'SELECT entity_id FROM idempotency_keys WHERE idem_key = ? AND entity_type = ?',
    [key, entityType]
  );
  return hit ? Number(hit.entity_id) : null;
}

async function saveIdempotencyKey(req, entityType, entityId) {
  const key = req.headers['x-idempotency-key'];
  if (!key || typeof key !== 'string') return;
  await dbRun(
    `INSERT INTO idempotency_keys (idem_key, entity_type, entity_id, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (idem_key) DO NOTHING`,
    [key, entityType, entityId, nowISO()]
  );
}

async function ensureCustomerForDocument(payload, userId) {
  if (payload.customer_id) {
    const found = await dbGet('SELECT id FROM customers WHERE id = ?', [
      Number(payload.customer_id),
    ]);
    if (found) return Number(found.id);
  }
  if (payload.save_as_customer && payload.customer_name?.trim()) {
    const existing = await dbGet(
      `SELECT id FROM customers
       WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM(?))
         AND LOWER(TRIM(company_name)) = LOWER(TRIM(?))
         AND is_archived = 0
       LIMIT 1`,
      [payload.customer_name.trim(), (payload.company_name || '').trim()]
    );

    if (existing) return Number(existing.id);

    const code = await allocateNextDocNumber('customer');
    const now = nowISO();
    const res = await dbRun(
      `INSERT INTO customers (
        customer_code, customer_name, company_name, contact_number, email,
        billing_address, project_locations, remarks, is_archived, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?, ?)`,
      [
        code,
        payload.customer_name.trim(),
        (payload.company_name || '').trim(),
        (payload.contact_number || payload.contact_details || '').trim(),
        (payload.customer_email || '').trim(),
        (payload.customer_address || '').trim(),
        (payload.project_location || payload.service_location || '').trim(),
        userId || null,
        now,
        now,
      ]
    );
    return Number(res.lastInsertRowid);
  }
  return null;
}

function computeTotalsFromItems(rawItems, discountType, discountValue, taxEnabled, taxRate) {
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .filter((it) => it && String(it.description || '').trim() !== '')
    .map((it, idx) => {
      const qty = Math.max(0, Number(it.quantity) || 0);
      const price = Math.max(0, round2(it.unit_price));
      const lineTotal = round2(qty * price);
      return {
        product_id: it.product_id ? Number(it.product_id) : null,
        sort_order: idx + 1,
        description: String(it.description).trim(),
        quantity: qty,
        unit: String(it.unit || 'pcs').trim() || 'pcs',
        unit_price: price,
        line_total: lineTotal,
      };
    });

  const subtotal = round2(items.reduce((acc, it) => acc + it.line_total, 0));
  const dType = discountType === 'percent' ? 'percent' : 'fixed';
  const dVal = Math.max(0, Number(discountValue) || 0);
  const rawDiscount =
    dType === 'percent' ? round2(subtotal * (Math.min(100, dVal) / 100)) : round2(dVal);
  const discountAmount = Math.min(subtotal, rawDiscount);
  const netAfterDiscount = round2(subtotal - discountAmount);

  const isTaxOn = Boolean(taxEnabled) && Number(taxRate) > 0;
  const tRate = isTaxOn ? Math.max(0, Number(taxRate) || 0) : 0;
  const taxAmount = isTaxOn ? round2(netAfterDiscount * (tRate / 100)) : 0;
  const grandTotal = round2(netAfterDiscount + taxAmount);

  return {
    items,
    subtotal,
    discount_type: dType,
    discount_value: dVal,
    discount_amount: discountAmount,
    tax_enabled: isTaxOn ? 1 : 0,
    tax_rate: tRate,
    tax_amount: taxAmount,
    grand_total: grandTotal,
  };
}

// ============================================================================
// UPLOADS (LOGOS, SIGNATURES, SERVICE PHOTOS)
// ============================================================================

app.post(
  '/api/uploads',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No image file provided.' });
    }
    const origExt = path.extname(req.file.originalname || '').toLowerCase() || '.png';
    const allowedExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
    const safeExt = allowedExts.includes(origExt) ? origExt : '.png';
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`;

    const saved = await saveUploadedFile({
      filename,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
    });
    res.json({ url: saved.url, filename: saved.filename });
  })
);

app.post(
  '/api/uploads/data-url',
  asyncHandler(async (req, res) => {
    const { data_url } = req.body || {};
    if (!data_url || typeof data_url !== 'string' || !data_url.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Valid image data URL is required.' });
    }
    const match = data_url.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Unsupported image format.' });
    }
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    const buffer = Buffer.from(match[2], 'base64');
    const filename = `sig-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
    const saved = await saveUploadedFile({ filename, mimeType, buffer });
    res.json({ url: saved.url, filename: saved.filename });
  })
);

// ============================================================================
// BUSINESS SETTINGS
// ============================================================================

app.get(
  '/api/settings',
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getSettings(), storage: getStorageStatus() });
  })
);

app.put(
  '/api/settings',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.business_name?.trim()) {
      return res.status(400).json({ error: 'Business name is required.' });
    }

    await dbRun(
      `UPDATE business_settings
       SET business_name = ?,
           logo_url = ?,
           address = ?,
           contact_number = ?,
           email = ?,
           facebook_url = ?,
           maps_url = ?,
           other_social_links = ?,
           operating_hours = ?,
           quotation_prefix = ?,
           invoice_prefix = ?,
           service_report_prefix = ?,
           billing_statement_prefix = ?,
           customer_prefix = ?,
           product_prefix = ?,
           payment_prefix = ?,
           doc_number_padding = ?,
           include_year_in_doc_num = ?,
           default_payment_terms = ?,
           default_quotation_validity_days = ?,
           default_invoice_due_days = ?,
           default_notes = ?,
           authorized_representative = ?,
           authorized_title = ?,
           signature_url = ?,
           tax_enabled = ?,
           tax_label = ?,
           tax_rate = ?,
           updated_at = ?
       WHERE id = 1`,
      [
        b.business_name.trim(),
        String(b.logo_url ?? '').trim(),
        String(b.address ?? '').trim(),
        String(b.contact_number ?? '').trim(),
        String(b.email ?? '').trim(),
        String(b.facebook_url ?? '').trim(),
        String(b.maps_url ?? '').trim(),
        String(b.other_social_links ?? '').trim(),
        String(b.operating_hours ?? '').trim(),
        String(b.quotation_prefix || 'QTN').trim().toUpperCase(),
        String(b.invoice_prefix || 'INV').trim().toUpperCase(),
        String(b.service_report_prefix || 'SR').trim().toUpperCase(),
        String(b.billing_statement_prefix || 'SOA').trim().toUpperCase(),
        String(b.customer_prefix || 'CUST').trim().toUpperCase(),
        String(b.product_prefix || 'ITEM').trim().toUpperCase(),
        String(b.payment_prefix || 'PAY').trim().toUpperCase(),
        Math.max(3, Math.min(8, Number(b.doc_number_padding) || 4)),
        b.include_year_in_doc_num ? 1 : 0,
        String(b.default_payment_terms ?? '').trim(),
        Math.max(0, Number(b.default_quotation_validity_days) || 15),
        Math.max(0, Number(b.default_invoice_due_days) || 15),
        String(b.default_notes ?? '').trim(),
        String(b.authorized_representative ?? '').trim(),
        String(b.authorized_title ?? 'Authorized Representative').trim(),
        String(b.signature_url ?? '').trim(),
        b.tax_enabled ? 1 : 0,
        String(b.tax_label || 'VAT').trim(),
        Math.max(0, Number(b.tax_rate) || 0),
        nowISO(),
      ]
    );

    await logActivity({
      entity_type: 'settings',
      entity_id: 1,
      action: 'updated',
      summary: 'Updated business profile & document settings',
      actor_name: req.user.full_name,
    });

    res.json({ settings: await getSettings() });
  })
);

// ============================================================================
// DASHBOARD & GLOBAL SEARCH
// ============================================================================

app.get(
  '/api/dashboard',
  asyncHandler(async (_req, res) => {
    await refreshTimeSensitiveStatuses();

    const quoteStats = await dbGet(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status IN ('Draft', 'Sent') THEN 1 ELSE 0 END), 0) as pending,
        COALESCE(SUM(CASE WHEN status = 'Draft' THEN 1 ELSE 0 END), 0) as draft_count,
        COALESCE(SUM(CASE WHEN status = 'Sent' THEN 1 ELSE 0 END), 0) as sent_count,
        COALESCE(SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END), 0) as approved,
        COALESCE(SUM(grand_total), 0) as total_quoted_amount
      FROM quotations
      WHERE is_archived = 0
    `);

    const invoiceStats = await dbGet(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status IN ('Unpaid', 'Partially Paid', 'Overdue') AND remaining_balance > 0.009 THEN 1 ELSE 0 END), 0) as unpaid,
        COALESCE(SUM(CASE WHEN status = 'Unpaid' THEN 1 ELSE 0 END), 0) as strictly_unpaid,
        COALESCE(SUM(CASE WHEN status = 'Partially Paid' THEN 1 ELSE 0 END), 0) as partially_paid,
        COALESCE(SUM(CASE WHEN status = 'Overdue' THEN 1 ELSE 0 END), 0) as overdue,
        COALESCE(SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END), 0) as paid,
        COALESCE(SUM(total_amount_due), 0) as total_billed,
        COALESCE(SUM(amount_paid), 0) as total_collected,
        COALESCE(SUM(remaining_balance), 0) as total_receivables
      FROM invoices
      WHERE is_archived = 0
    `);

    const stRow = await dbGet(
      'SELECT COUNT(*) as cnt FROM billing_statements WHERE is_archived = 0'
    );
    const statementCount = Number(stRow?.cnt || 0);

    const serviceReportStats = await dbGet(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status IN ('Scheduled', 'In Progress') THEN 1 ELSE 0 END), 0) as active_jobs,
        COALESCE(SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END), 0) as completed_jobs
      FROM service_reports
      WHERE is_archived = 0
    `);

    const custRow = await dbGet('SELECT COUNT(*) as cnt FROM customers WHERE is_archived = 0');
    const customerCount = Number(custRow?.cnt || 0);

    const recentTransactions = await dbAll(`
      SELECT * FROM (
        SELECT 'quotation' as doc_type, id, quotation_number as doc_number, customer_name, date_issued as doc_date, grand_total as amount, status, created_at
        FROM quotations WHERE is_archived = 0
        UNION ALL
        SELECT 'invoice' as doc_type, id, invoice_number as doc_number, customer_name, invoice_date as doc_date, total_amount_due as amount, status, created_at
        FROM invoices WHERE is_archived = 0
        UNION ALL
        SELECT 'service_report' as doc_type, id, report_number as doc_number, customer_name, service_date as doc_date, materials_total_cost as amount, status, created_at
        FROM service_reports WHERE is_archived = 0
        UNION ALL
        SELECT 'billing_statement' as doc_type, id, statement_number as doc_number, customer_name, statement_date as doc_date, outstanding_balance as amount, 'Issued' as status, created_at
        FROM billing_statements WHERE is_archived = 0
      ) AS recent_docs
      ORDER BY created_at DESC
      LIMIT 12
    `);

    const recentCustomerActivity = await dbAll(`
      SELECT *
      FROM activity_logs
      WHERE entity_type IN ('quotation', 'invoice', 'payment', 'service_report', 'billing_statement', 'customer')
      ORDER BY id DESC
      LIMIT 15
    `);

    res.json({
      metrics: {
        total_quotations: Number(quoteStats?.total || 0),
        pending_quotations: Number(quoteStats?.pending || 0),
        draft_quotations: Number(quoteStats?.draft_count || 0),
        sent_quotations: Number(quoteStats?.sent_count || 0),
        approved_quotations: Number(quoteStats?.approved || 0),
        total_quoted_amount: round2(quoteStats?.total_quoted_amount),

        total_invoices: Number(invoiceStats?.total || 0),
        unpaid_invoices: Number(invoiceStats?.unpaid || 0),
        strictly_unpaid_invoices: Number(invoiceStats?.strictly_unpaid || 0),
        partially_paid_invoices: Number(invoiceStats?.partially_paid || 0),
        overdue_invoices: Number(invoiceStats?.overdue || 0),
        paid_invoices: Number(invoiceStats?.paid || 0),
        total_billed: round2(invoiceStats?.total_billed),
        total_collected: round2(invoiceStats?.total_collected),
        total_receivables: round2(invoiceStats?.total_receivables),

        total_billing_statements: statementCount,
        total_service_reports: Number(serviceReportStats?.total || 0),
        active_service_reports: Number(serviceReportStats?.active_jobs || 0),
        completed_service_reports: Number(serviceReportStats?.completed_jobs || 0),
        total_customers: customerCount,
      },
      recent_transactions: recentTransactions,
      recent_customer_activity: recentCustomerActivity,
    });
  })
);

app.get(
  '/api/search',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ results: [] });
    const like = `%${q}%`;

    const quotes = await dbAll(
      `SELECT 'quotation' as type, id, quotation_number as title, customer_name as subtitle, status, grand_total as amount
       FROM quotations
       WHERE is_archived = 0 AND (quotation_number LIKE ? OR customer_name LIKE ? OR company_name LIKE ? OR project_name LIKE ?)
       ORDER BY id DESC LIMIT 6`,
      [like, like, like, like]
    );

    const invoices = await dbAll(
      `SELECT 'invoice' as type, id, invoice_number as title, customer_name as subtitle, status, total_amount_due as amount
       FROM invoices
       WHERE is_archived = 0 AND (invoice_number LIKE ? OR customer_name LIKE ? OR company_name LIKE ? OR reference_quotation_number LIKE ?)
       ORDER BY id DESC LIMIT 6`,
      [like, like, like, like]
    );

    const reports = await dbAll(
      `SELECT 'service_report' as type, id, report_number as title, customer_name as subtitle, status, materials_total_cost as amount
       FROM service_reports
       WHERE is_archived = 0 AND (report_number LIKE ? OR customer_name LIKE ? OR equipment_serviced LIKE ? OR technician_name LIKE ?)
       ORDER BY id DESC LIMIT 6`,
      [like, like, like, like]
    );

    const statements = await dbAll(
      `SELECT 'billing_statement' as type, id, statement_number as title, customer_name as subtitle, 'Statement' as status, outstanding_balance as amount
       FROM billing_statements
       WHERE is_archived = 0 AND (statement_number LIKE ? OR customer_name LIKE ? OR company_name LIKE ?)
       ORDER BY id DESC LIMIT 6`,
      [like, like, like]
    );

    const customers = await dbAll(
      `SELECT 'customer' as type, id, customer_name as title, customer_code || CASE WHEN company_name != '' THEN ' • ' || company_name ELSE '' END as subtitle, 'Active' as status, NULL as amount
       FROM customers
       WHERE is_archived = 0 AND (customer_name LIKE ? OR company_name LIKE ? OR customer_code LIKE ? OR contact_number LIKE ?)
       ORDER BY id DESC LIMIT 6`,
      [like, like, like, like]
    );

    res.json({
      results: [...quotes, ...invoices, ...reports, ...statements, ...customers],
    });
  })
);

// ============================================================================
// CUSTOMERS MODULE
// ============================================================================

app.get(
  '/api/customers',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || 'active');

    let where = 'WHERE 1=1';
    const params = [];
    if (status === 'active') where += ' AND c.is_archived = 0';
    else if (status === 'archived') where += ' AND c.is_archived = 1';

    if (search) {
      where += ` AND (c.customer_code LIKE ? OR c.customer_name LIKE ? OR c.company_name LIKE ? OR c.contact_number LIKE ? OR c.email LIKE ? OR c.billing_address LIKE ?)`;
      const lk = `%${search}%`;
      params.push(lk, lk, lk, lk, lk, lk);
    }

    const customers = await dbAll(
      `SELECT c.*,
        (SELECT COUNT(*) FROM quotations q WHERE q.customer_id = c.id AND q.is_archived = 0) as quotation_count,
        (SELECT COUNT(*) FROM invoices i WHERE i.customer_id = c.id AND i.is_archived = 0) as invoice_count,
        (SELECT COALESCE(SUM(i.total_amount_due), 0) FROM invoices i WHERE i.customer_id = c.id AND i.is_archived = 0) as total_billed,
        (SELECT COALESCE(SUM(i.remaining_balance), 0) FROM invoices i WHERE i.customer_id = c.id AND i.is_archived = 0) as outstanding_balance
       FROM customers c
       ${where}
       ORDER BY c.customer_name ASC, c.id DESC`,
      params
    );

    res.json({ customers });
  })
);

app.get(
  '/api/customers/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const customer = await dbGet('SELECT * FROM customers WHERE id = ?', [id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    await refreshTimeSensitiveStatuses();

    const quotations = await dbAll(
      `SELECT id, quotation_number, date_issued, valid_until, project_name, grand_total, status, created_at
       FROM quotations WHERE customer_id = ? AND is_archived = 0 ORDER BY date_issued DESC, id DESC`,
      [id]
    );

    const invoices = await dbAll(
      `SELECT id, invoice_number, invoice_date, due_date, total_amount_due, amount_paid, remaining_balance, status, created_at
       FROM invoices WHERE customer_id = ? AND is_archived = 0 ORDER BY invoice_date DESC, id DESC`,
      [id]
    );

    const payments = await dbAll(
      `SELECT p.*, i.invoice_number
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       WHERE i.customer_id = ? AND i.is_archived = 0
       ORDER BY p.payment_date DESC, p.id DESC`,
      [id]
    );

    const service_reports = await dbAll(
      `SELECT id, report_number, service_date, job_type, equipment_serviced, status, materials_total_cost, created_at
       FROM service_reports WHERE customer_id = ? AND is_archived = 0 ORDER BY service_date DESC, id DESC`,
      [id]
    );

    const billing_statements = await dbAll(
      `SELECT id, statement_number, statement_date, period_from, period_to, total_charges, total_payments, outstanding_balance, created_at
       FROM billing_statements WHERE customer_id = ? AND is_archived = 0 ORDER BY statement_date DESC, id DESC`,
      [id]
    );

    res.json({
      customer,
      history: {
        quotations,
        invoices,
        payments,
        service_reports,
        billing_statements,
      },
    });
  })
);

app.post(
  '/api/customers',
  asyncHandler(async (req, res) => {
    const idemHit = await getIdempotencyHit(req, 'customer');
    if (idemHit) {
      const existing = await dbGet('SELECT * FROM customers WHERE id = ?', [idemHit]);
      if (existing) return res.json({ customer: existing });
    }

    const b = req.body || {};
    if (!b.customer_name?.trim()) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }

    const created = await runInTransaction(async () => {
      const code = await allocateNextDocNumber('customer');
      const now = nowISO();
      const info = await dbRun(
        `INSERT INTO customers (
          customer_code, customer_name, company_name, contact_number, email,
          billing_address, project_locations, remarks, is_archived, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          code,
          b.customer_name.trim(),
          String(b.company_name || '').trim(),
          String(b.contact_number || '').trim(),
          String(b.email || '').trim(),
          String(b.billing_address || '').trim(),
          String(b.project_locations || '').trim(),
          String(b.remarks || '').trim(),
          req.user.id,
          now,
          now,
        ]
      );
      const id = Number(info.lastInsertRowid);
      await saveIdempotencyKey(req, 'customer', id);
      await logActivity({
        entity_type: 'customer',
        entity_id: id,
        document_number: code,
        customer_id: id,
        customer_name: b.customer_name.trim(),
        action: 'created',
        summary: `Registered customer ${b.customer_name.trim()} (${code})`,
        actor_name: req.user.full_name,
      });
      return dbGet('SELECT * FROM customers WHERE id = ?', [id]);
    });

    res.status(201).json({ customer: created });
  })
);

app.put(
  '/api/customers/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT * FROM customers WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Customer not found.' });

    const b = req.body || {};
    if (!b.customer_name?.trim()) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }

    await dbRun(
      `UPDATE customers
       SET customer_name = ?,
           company_name = ?,
           contact_number = ?,
           email = ?,
           billing_address = ?,
           project_locations = ?,
           remarks = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        b.customer_name.trim(),
        String(b.company_name || '').trim(),
        String(b.contact_number || '').trim(),
        String(b.email || '').trim(),
        String(b.billing_address || '').trim(),
        String(b.project_locations || '').trim(),
        String(b.remarks || '').trim(),
        nowISO(),
        id,
      ]
    );

    const updated = await dbGet('SELECT * FROM customers WHERE id = ?', [id]);
    res.json({ customer: updated });
  })
);

app.patch(
  '/api/customers/:id/archive',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT * FROM customers WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Customer not found.' });

    const archived = req.body?.is_archived ? 1 : 0;
    await dbRun('UPDATE customers SET is_archived = ?, updated_at = ? WHERE id = ?', [
      archived,
      nowISO(),
      id,
    ]);

    await logActivity({
      entity_type: 'customer',
      entity_id: id,
      document_number: existing.customer_code,
      customer_id: id,
      customer_name: existing.customer_name,
      action: archived ? 'archived' : 'restored',
      summary: `${archived ? 'Archived' : 'Restored'} customer ${existing.customer_name}`,
      actor_name: req.user.full_name,
    });

    res.json({ customer: await dbGet('SELECT * FROM customers WHERE id = ?', [id]) });
  })
);

app.delete(
  '/api/customers/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT * FROM customers WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Customer not found.' });

    const activeRefs = await dbGet(
      `SELECT
        (SELECT COUNT(*) FROM quotations WHERE customer_id = ? AND is_archived = 0) as quotes,
        (SELECT COUNT(*) FROM invoices WHERE customer_id = ? AND is_archived = 0) as invoices,
        (SELECT COUNT(*) FROM service_reports WHERE customer_id = ? AND is_archived = 0) as reports,
        (SELECT COUNT(*) FROM billing_statements WHERE customer_id = ? AND is_archived = 0) as statements`,
      [id, id, id, id]
    );

    const totalActiveRefs =
      Number(activeRefs?.quotes || 0) +
      Number(activeRefs?.invoices || 0) +
      Number(activeRefs?.reports || 0) +
      Number(activeRefs?.statements || 0);

    if (totalActiveRefs > 0) {
      return res.status(409).json({
        error: `Cannot permanently delete "${existing.customer_name}" while they have ${totalActiveRefs} active linked document(s). Archive this customer instead, or delete their linked documents first.`,
      });
    }

    await runInTransaction(async () => {
      // Remove any archived billing statements whose FK ON DELETE RESTRICT would block deletion
      await dbRun('DELETE FROM billing_statements WHERE customer_id = ? AND is_archived = 1', [id]);
      await dbRun('DELETE FROM customers WHERE id = ?', [id]);
      await logActivity({
        entity_type: 'customer',
        entity_id: id,
        document_number: existing.customer_code,
        customer_id: null,
        customer_name: existing.customer_name,
        action: 'deleted',
        summary: `Deleted customer ${existing.customer_name} (${existing.customer_code})`,
        actor_name: req.user.full_name,
      });
    });

    res.json({ ok: true });
  })
);

// ============================================================================
// PRODUCTS & SERVICES MODULE
// ============================================================================

app.get(
  '/api/products',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const category = String(req.query.category || '');
    const status = String(req.query.status || 'active');

    let where = 'WHERE 1=1';
    const params = [];
    if (status === 'active') where += ' AND is_archived = 0';
    else if (status === 'archived') where += ' AND is_archived = 1';

    if (category && category !== 'all') {
      where += ' AND category = ?';
      params.push(category);
    }
    if (search) {
      where +=
        ' AND (item_code LIKE ? OR name LIKE ? OR description LIKE ? OR material_grade LIKE ?)';
      const lk = `%${search}%`;
      params.push(lk, lk, lk, lk);
    }

    const products = await dbAll(
      `SELECT * FROM products_services ${where} ORDER BY name ASC, id DESC`,
      params
    );
    res.json({ products });
  })
);

app.post(
  '/api/products',
  asyncHandler(async (req, res) => {
    const idemHit = await getIdempotencyHit(req, 'product');
    if (idemHit) {
      const existing = await dbGet('SELECT * FROM products_services WHERE id = ?', [idemHit]);
      if (existing) return res.json({ product: existing });
    }

    const b = req.body || {};
    if (!b.name?.trim()) {
      return res.status(400).json({ error: 'Product or service name is required.' });
    }

    const product = await runInTransaction(async () => {
      const code = await allocateNextDocNumber('product');
      const now = nowISO();
      const info = await dbRun(
        `INSERT INTO products_services (
          item_code, name, description, category, material_grade, unit, unit_price, is_archived, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          code,
          b.name.trim(),
          String(b.description || '').trim(),
          String(b.category || 'Fabrication').trim(),
          String(b.material_grade || '').trim(),
          String(b.unit || 'unit').trim(),
          Math.max(0, round2(b.unit_price)),
          now,
          now,
        ]
      );
      const id = Number(info.lastInsertRowid);
      await saveIdempotencyKey(req, 'product', id);
      return dbGet('SELECT * FROM products_services WHERE id = ?', [id]);
    });

    res.status(201).json({ product });
  })
);

app.put(
  '/api/products/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT * FROM products_services WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Item not found.' });

    const b = req.body || {};
    if (!b.name?.trim()) {
      return res.status(400).json({ error: 'Product or service name is required.' });
    }

    await dbRun(
      `UPDATE products_services
       SET name = ?, description = ?, category = ?, material_grade = ?, unit = ?, unit_price = ?, is_archived = ?, updated_at = ?
       WHERE id = ?`,
      [
        b.name.trim(),
        String(b.description || '').trim(),
        String(b.category || 'Fabrication').trim(),
        String(b.material_grade || '').trim(),
        String(b.unit || 'unit').trim(),
        Math.max(0, round2(b.unit_price)),
        b.is_archived !== undefined ? (b.is_archived ? 1 : 0) : existing.is_archived,
        nowISO(),
        id,
      ]
    );

    res.json({ product: await dbGet('SELECT * FROM products_services WHERE id = ?', [id]) });
  })
);

app.patch(
  '/api/products/:id/archive',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT * FROM products_services WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Item not found.' });

    const archived = req.body?.is_archived ? 1 : 0;
    await dbRun('UPDATE products_services SET is_archived = ?, updated_at = ? WHERE id = ?', [
      archived,
      nowISO(),
      id,
    ]);
    res.json({ product: await dbGet('SELECT * FROM products_services WHERE id = ?', [id]) });
  })
);

app.delete(
  '/api/products/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT * FROM products_services WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Item not found.' });

    await dbRun('DELETE FROM products_services WHERE id = ?', [id]);
    res.json({ ok: true });
  })
);

// ============================================================================
// QUOTATIONS MODULE
// ============================================================================

async function getFullQuotation(id) {
  const quotation = await dbGet('SELECT * FROM quotations WHERE id = ? AND is_archived = 0', [id]);
  if (!quotation) return null;
  const items = await dbAll(
    'SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC, id ASC',
    [id]
  );
  let converted_invoice_id = quotation.converted_invoice_id || null;
  let converted_invoice_number = '';
  if (converted_invoice_id) {
    const inv = await dbGet(
      'SELECT id, invoice_number FROM invoices WHERE id = ? AND is_archived = 0',
      [converted_invoice_id]
    );
    if (inv) {
      converted_invoice_number = inv.invoice_number;
    } else {
      converted_invoice_id = null;
    }
  }
  return { ...quotation, converted_invoice_id, converted_invoice_number, items };
}

app.get(
  '/api/quotations/next-number',
  asyncHandler(async (req, res) => {
    const dateStr = String(req.query.date || todayYMD());
    res.json({ next_number: await previewNextDocNumber('quotation', dateStr) });
  })
);

app.get(
  '/api/quotations',
  asyncHandler(async (req, res) => {
    await refreshTimeSensitiveStatuses();
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || 'all');
    const dateFrom = String(req.query.date_from || '');
    const dateTo = String(req.query.date_to || '');

    let where = 'WHERE is_archived = 0';
    const params = [];
    if (status && status !== 'all') {
      if (status === 'Pending') {
        where += ` AND status IN ('Draft', 'Sent')`;
      } else {
        where += ' AND status = ?';
        params.push(status);
      }
    }
    if (dateFrom) {
      where += ' AND date_issued >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      where += ' AND date_issued <= ?';
      params.push(dateTo);
    }
    if (search) {
      where +=
        ' AND (quotation_number LIKE ? OR customer_name LIKE ? OR company_name LIKE ? OR project_name LIKE ? OR project_location LIKE ?)';
      const lk = `%${search}%`;
      params.push(lk, lk, lk, lk, lk);
    }

    const quotations = await dbAll(
      `SELECT * FROM quotations ${where} ORDER BY date_issued DESC, id DESC`,
      params
    );
    res.json({ quotations });
  })
);

app.get(
  '/api/quotations/:id',
  asyncHandler(async (req, res) => {
    await refreshTimeSensitiveStatuses();
    const full = await getFullQuotation(Number(req.params.id));
    if (!full) return res.status(404).json({ error: 'Quotation not found.' });
    res.json({ quotation: full });
  })
);

app.post(
  '/api/quotations',
  asyncHandler(async (req, res) => {
    const idemHit = await getIdempotencyHit(req, 'quotation');
    if (idemHit) {
      const existing = await getFullQuotation(idemHit);
      if (existing) return res.json({ quotation: existing });
    }

    const b = req.body || {};
    if (!b.customer_name?.trim()) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }
    if (!b.date_issued) {
      return res.status(400).json({ error: 'Date issued is required.' });
    }

    const calc = computeTotalsFromItems(
      b.items,
      b.discount_type,
      b.discount_value,
      b.tax_enabled,
      b.tax_rate
    );
    if (calc.items.length === 0) {
      return res
        .status(400)
        .json({ error: 'Please add at least one line item with a description.' });
    }

    const validStatuses = ['Draft', 'Sent', 'Approved', 'Rejected', 'Expired'];
    const status = validStatuses.includes(b.status) ? b.status : 'Draft';

    const createdId = await runInTransaction(async () => {
      const customerId = await ensureCustomerForDocument(b, req.user.id);
      const qNumber = await allocateNextDocNumber('quotation', b.date_issued);
      const settings = await getSettings();
      const now = nowISO();

      const info = await dbRun(
        `INSERT INTO quotations (
          quotation_number, date_issued, valid_until, customer_id, customer_name, company_name,
          customer_address, contact_number, customer_email, project_name, project_location,
          subtotal, discount_type, discount_value, discount_amount,
          tax_enabled, tax_label, tax_rate, tax_amount, grand_total,
          payment_terms, delivery_schedule, remarks, prepared_by, authorized_signatory,
          status, is_archived, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          qNumber,
          b.date_issued,
          String(b.valid_until || '').trim(),
          customerId,
          b.customer_name.trim(),
          String(b.company_name || '').trim(),
          String(b.customer_address || '').trim(),
          String(b.contact_number || '').trim(),
          String(b.customer_email || '').trim(),
          String(b.project_name || '').trim(),
          String(b.project_location || '').trim(),
          calc.subtotal,
          calc.discount_type,
          calc.discount_value,
          calc.discount_amount,
          calc.tax_enabled,
          String(b.tax_label || settings.tax_label || 'VAT').trim(),
          calc.tax_rate,
          calc.tax_amount,
          calc.grand_total,
          String(b.payment_terms ?? '').trim(),
          String(b.delivery_schedule ?? '').trim(),
          String(b.remarks ?? '').trim(),
          String(b.prepared_by || req.user.full_name || '').trim(),
          String(b.authorized_signatory || settings.authorized_representative || '').trim(),
          status,
          req.user.id,
          now,
          now,
        ]
      );

      const qId = Number(info.lastInsertRowid);
      for (const it of calc.items) {
        await dbRun(
          `INSERT INTO quotation_items (quotation_id, product_id, sort_order, description, quantity, unit, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            qId,
            it.product_id,
            it.sort_order,
            it.description,
            it.quantity,
            it.unit,
            it.unit_price,
            it.line_total,
          ]
        );
      }

      await saveIdempotencyKey(req, 'quotation', qId);
      await logActivity({
        entity_type: 'quotation',
        entity_id: qId,
        document_number: qNumber,
        customer_id: customerId,
        customer_name: b.customer_name.trim(),
        action: 'created',
        summary: `Created quotation ${qNumber} for ${b.customer_name.trim()} (${status})`,
        amount: calc.grand_total,
        actor_name: req.user.full_name,
      });

      return qId;
    });

    res.status(201).json({ quotation: await getFullQuotation(createdId) });
  })
);

app.put(
  '/api/quotations/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT * FROM quotations WHERE id = ? AND is_archived = 0', [
      id,
    ]);
    if (!existing) return res.status(404).json({ error: 'Quotation not found.' });

    const b = req.body || {};
    if (!b.customer_name?.trim()) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }

    const calc = computeTotalsFromItems(
      b.items,
      b.discount_type,
      b.discount_value,
      b.tax_enabled,
      b.tax_rate
    );
    if (calc.items.length === 0) {
      return res.status(400).json({ error: 'Please include at least one line item.' });
    }

    const validStatuses = ['Draft', 'Sent', 'Approved', 'Rejected', 'Expired'];
    const status = validStatuses.includes(b.status) ? b.status : existing.status;

    await runInTransaction(async () => {
      const customerId = await ensureCustomerForDocument(b, req.user.id);
      const settings = await getSettings();
      await dbRun(
        `UPDATE quotations
         SET date_issued = ?, valid_until = ?, customer_id = ?, customer_name = ?, company_name = ?,
             customer_address = ?, contact_number = ?, customer_email = ?, project_name = ?, project_location = ?,
             subtotal = ?, discount_type = ?, discount_value = ?, discount_amount = ?,
             tax_enabled = ?, tax_label = ?, tax_rate = ?, tax_amount = ?, grand_total = ?,
             payment_terms = ?, delivery_schedule = ?, remarks = ?, prepared_by = ?, authorized_signatory = ?,
             status = ?, updated_at = ?
         WHERE id = ?`,
        [
          b.date_issued || existing.date_issued,
          String(b.valid_until ?? '').trim(),
          customerId,
          b.customer_name.trim(),
          String(b.company_name ?? '').trim(),
          String(b.customer_address ?? '').trim(),
          String(b.contact_number ?? '').trim(),
          String(b.customer_email ?? '').trim(),
          String(b.project_name ?? '').trim(),
          String(b.project_location ?? '').trim(),
          calc.subtotal,
          calc.discount_type,
          calc.discount_value,
          calc.discount_amount,
          calc.tax_enabled,
          String(b.tax_label || settings.tax_label || 'VAT').trim(),
          calc.tax_rate,
          calc.tax_amount,
          calc.grand_total,
          String(b.payment_terms ?? '').trim(),
          String(b.delivery_schedule ?? '').trim(),
          String(b.remarks ?? '').trim(),
          String(b.prepared_by ?? '').trim(),
          String(b.authorized_signatory ?? '').trim(),
          status,
          nowISO(),
          id,
        ]
      );

      await dbRun('DELETE FROM quotation_items WHERE quotation_id = ?', [id]);
      for (const it of calc.items) {
        await dbRun(
          `INSERT INTO quotation_items (quotation_id, product_id, sort_order, description, quantity, unit, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            it.product_id,
            it.sort_order,
            it.description,
            it.quantity,
            it.unit,
            it.unit_price,
            it.line_total,
          ]
        );
      }

      await logActivity({
        entity_type: 'quotation',
        entity_id: id,
        document_number: existing.quotation_number,
        customer_id: customerId,
        customer_name: b.customer_name.trim(),
        action: 'updated',
        summary: `Updated quotation ${existing.quotation_number} (${status})`,
        amount: calc.grand_total,
        actor_name: req.user.full_name,
      });
    });

    res.json({ quotation: await getFullQuotation(id) });
  })
);

app.patch(
  '/api/quotations/:id/status',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT * FROM quotations WHERE id = ? AND is_archived = 0', [
      id,
    ]);
    if (!existing) return res.status(404).json({ error: 'Quotation not found.' });

    const { status } = req.body || {};
    const validStatuses = ['Draft', 'Sent', 'Approved', 'Rejected', 'Expired'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid quotation status.' });
    }

    await dbRun('UPDATE quotations SET status = ?, updated_at = ? WHERE id = ?', [
      status,
      nowISO(),
      id,
    ]);

    await logActivity({
      entity_type: 'quotation',
      entity_id: id,
      document_number: existing.quotation_number,
      customer_id: existing.customer_id,
      customer_name: existing.customer_name,
      action: 'status_changed',
      summary: `Marked quotation ${existing.quotation_number} as ${status}`,
      amount: existing.grand_total,
      actor_name: req.user.full_name,
    });

    res.json({ quotation: await getFullQuotation(id) });
  })
);

app.post(
  '/api/quotations/:id/convert-to-invoice',
  asyncHandler(async (req, res) => {
    const qId = Number(req.params.id);
    const fullQuote = await getFullQuotation(qId);
    if (!fullQuote) return res.status(404).json({ error: 'Quotation not found.' });

    if (fullQuote.status !== 'Approved') {
      return res.status(400).json({
        error:
          'Only an Approved quotation can be converted into an invoice. Please mark the quotation as Approved first.',
      });
    }

    if (fullQuote.converted_invoice_id && !req.body?.allow_additional) {
      const existingInv = await dbGet(
        'SELECT id, invoice_number FROM invoices WHERE id = ? AND is_archived = 0',
        [fullQuote.converted_invoice_id]
      );
      if (existingInv) {
        return res.status(409).json({
          error: `This quotation has already been converted to Invoice ${existingInv.invoice_number}.`,
          existing_invoice_id: existingInv.id,
          existing_invoice_number: existingInv.invoice_number,
        });
      }
    }

    const createdInvoiceId = await runInTransaction(async () => {
      const settings = await getSettings();
      const invDate = todayYMD();
      const dueDays = Number(settings.default_invoice_due_days) || 15;
      const dueObj = new Date(`${invDate}T00:00:00Z`);
      dueObj.setUTCDate(dueObj.getUTCDate() + dueDays);
      const dueDate = dueObj.toISOString().slice(0, 10);

      const invNumber = await allocateNextDocNumber('invoice', invDate);
      const now = nowISO();

      const info = await dbRun(
        `INSERT INTO invoices (
          invoice_number, invoice_date, due_date, customer_id, customer_name, company_name,
          customer_address, contact_number, customer_email, quotation_id, reference_quotation_number,
          project_name, subtotal, discount_type, discount_value, discount_amount,
          tax_enabled, tax_label, tax_rate, tax_amount, total_amount_due,
          amount_paid, remaining_balance, payment_method, payment_date,
          payment_terms, remarks, prepared_by, authorized_signatory,
          status, is_archived, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '', '', ?, ?, ?, ?, 'Unpaid', 0, ?, ?, ?)`,
        [
          invNumber,
          invDate,
          dueDate,
          fullQuote.customer_id,
          fullQuote.customer_name,
          fullQuote.company_name,
          fullQuote.customer_address,
          fullQuote.contact_number,
          fullQuote.customer_email,
          fullQuote.id,
          fullQuote.quotation_number,
          fullQuote.project_name,
          fullQuote.subtotal,
          fullQuote.discount_type,
          fullQuote.discount_value,
          fullQuote.discount_amount,
          fullQuote.tax_enabled,
          fullQuote.tax_label,
          fullQuote.tax_rate,
          fullQuote.tax_amount,
          fullQuote.grand_total,
          fullQuote.grand_total,
          fullQuote.payment_terms || settings.default_payment_terms || '',
          fullQuote.remarks || '',
          req.user.full_name || fullQuote.prepared_by || '',
          fullQuote.authorized_signatory || settings.authorized_representative || '',
          req.user.id,
          now,
          now,
        ]
      );

      const invId = Number(info.lastInsertRowid);
      for (const it of fullQuote.items) {
        await dbRun(
          `INSERT INTO invoice_items (invoice_id, product_id, sort_order, description, quantity, unit, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invId,
            it.product_id,
            it.sort_order,
            it.description,
            it.quantity,
            it.unit,
            it.unit_price,
            it.line_total,
          ]
        );
      }

      await dbRun(
        'UPDATE quotations SET converted_invoice_id = ?, updated_at = ? WHERE id = ?',
        [invId, now, fullQuote.id]
      );

      await logActivity({
        entity_type: 'invoice',
        entity_id: invId,
        document_number: invNumber,
        customer_id: fullQuote.customer_id,
        customer_name: fullQuote.customer_name,
        action: 'converted_from_quotation',
        summary: `Converted quotation ${fullQuote.quotation_number} to invoice ${invNumber}`,
        amount: fullQuote.grand_total,
        actor_name: req.user.full_name,
      });

      return invId;
    });

    res.status(201).json({ invoice: await getFullInvoice(createdInvoiceId) });
  })
);

app.delete(
  '/api/quotations/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT * FROM quotations WHERE id = ? AND is_archived = 0', [
      id,
    ]);
    if (!existing) return res.status(404).json({ error: 'Quotation not found.' });
    await dbRun('UPDATE quotations SET is_archived = 1, updated_at = ? WHERE id = ?', [
      nowISO(),
      id,
    ]);
    await logActivity({
      entity_type: 'quotation',
      entity_id: id,
      document_number: existing.quotation_number,
      customer_id: existing.customer_id,
      customer_name: existing.customer_name,
      action: 'deleted',
      summary: `Deleted quotation ${existing.quotation_number}`,
      actor_name: req.user.full_name,
    });
    res.json({ ok: true });
  })
);

app.get(
  '/api/quotations/:id/pdf',
  asyncHandler(async (req, res) => {
    const full = await getFullQuotation(Number(req.params.id));
    if (!full) return res.status(404).json({ error: 'Quotation not found.' });
    const settings = await getSettings();
    const pdfBuf = await generateQuotationPdf(full, full.items, settings);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${full.quotation_number}.pdf"`);
    res.send(pdfBuf);
  })
);

// ============================================================================
// INVOICES & PAYMENTS MODULE
// ============================================================================

async function getFullInvoice(id) {
  const invoice = await dbGet('SELECT * FROM invoices WHERE id = ? AND is_archived = 0', [id]);
  if (!invoice) return null;
  const items = await dbAll(
    'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC',
    [id]
  );
  const payments = await dbAll(
    'SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC, id DESC',
    [id]
  );
  return { ...invoice, items, payments };
}

app.get(
  '/api/invoices/next-number',
  asyncHandler(async (req, res) => {
    const dateStr = String(req.query.date || todayYMD());
    res.json({ next_number: await previewNextDocNumber('invoice', dateStr) });
  })
);

app.get(
  '/api/invoices',
  asyncHandler(async (req, res) => {
    await refreshTimeSensitiveStatuses();
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || 'all');
    const dateFrom = String(req.query.date_from || '');
    const dateTo = String(req.query.date_to || '');
    const customerId = req.query.customer_id ? Number(req.query.customer_id) : null;

    let where = 'WHERE is_archived = 0';
    const params = [];

    if (customerId) {
      where += ' AND customer_id = ?';
      params.push(customerId);
    }
    if (status && status !== 'all') {
      if (status === 'Open') {
        where += ` AND status IN ('Unpaid', 'Partially Paid', 'Overdue')`;
      } else {
        where += ' AND status = ?';
        params.push(status);
      }
    }
    if (dateFrom) {
      where += ' AND invoice_date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      where += ' AND invoice_date <= ?';
      params.push(dateTo);
    }
    if (search) {
      where +=
        ' AND (invoice_number LIKE ? OR customer_name LIKE ? OR company_name LIKE ? OR reference_quotation_number LIKE ? OR project_name LIKE ?)';
      const lk = `%${search}%`;
      params.push(lk, lk, lk, lk, lk);
    }

    const invoices = await dbAll(
      `SELECT * FROM invoices ${where} ORDER BY invoice_date DESC, id DESC`,
      params
    );
    res.json({ invoices });
  })
);

app.get(
  '/api/invoices/:id',
  asyncHandler(async (req, res) => {
    await refreshTimeSensitiveStatuses();
    const full = await getFullInvoice(Number(req.params.id));
    if (!full) return res.status(404).json({ error: 'Invoice not found.' });
    res.json({ invoice: full });
  })
);

app.post(
  '/api/invoices',
  asyncHandler(async (req, res) => {
    const idemHit = await getIdempotencyHit(req, 'invoice');
    if (idemHit) {
      const existing = await getFullInvoice(idemHit);
      if (existing) return res.json({ invoice: existing });
    }

    const b = req.body || {};
    if (!b.customer_name?.trim()) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }
    if (!b.invoice_date) {
      return res.status(400).json({ error: 'Invoice date is required.' });
    }

    const calc = computeTotalsFromItems(
      b.items,
      b.discount_type,
      b.discount_value,
      b.tax_enabled,
      b.tax_rate
    );
    if (calc.items.length === 0) {
      return res.status(400).json({ error: 'Please add at least one line item.' });
    }

    const initialPayment = Math.max(0, round2(b.initial_payment_amount || 0));
    if (initialPayment > calc.grand_total + 0.01) {
      return res.status(400).json({ error: 'Initial payment cannot exceed total amount due.' });
    }

    const createdId = await runInTransaction(async () => {
      const customerId = await ensureCustomerForDocument(b, req.user.id);
      const invNumber = await allocateNextDocNumber('invoice', b.invoice_date);
      const settings = await getSettings();
      const now = nowISO();

      const info = await dbRun(
        `INSERT INTO invoices (
          invoice_number, invoice_date, due_date, customer_id, customer_name, company_name,
          customer_address, contact_number, customer_email, quotation_id, reference_quotation_number,
          project_name, subtotal, discount_type, discount_value, discount_amount,
          tax_enabled, tax_label, tax_rate, tax_amount, total_amount_due,
          amount_paid, remaining_balance, payment_method, payment_date,
          payment_terms, remarks, prepared_by, authorized_signatory,
          status, is_archived, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '', '', ?, ?, ?, ?, 'Unpaid', 0, ?, ?, ?)`,
        [
          invNumber,
          b.invoice_date,
          String(b.due_date || '').trim(),
          customerId,
          b.customer_name.trim(),
          String(b.company_name || '').trim(),
          String(b.customer_address || '').trim(),
          String(b.contact_number || '').trim(),
          String(b.customer_email || '').trim(),
          b.quotation_id ? Number(b.quotation_id) : null,
          String(b.reference_quotation_number || '').trim(),
          String(b.project_name || '').trim(),
          calc.subtotal,
          calc.discount_type,
          calc.discount_value,
          calc.discount_amount,
          calc.tax_enabled,
          String(b.tax_label || settings.tax_label || 'VAT').trim(),
          calc.tax_rate,
          calc.tax_amount,
          calc.grand_total,
          calc.grand_total,
          String(b.payment_terms ?? '').trim(),
          String(b.remarks ?? '').trim(),
          String(b.prepared_by || req.user.full_name || '').trim(),
          String(b.authorized_signatory || settings.authorized_representative || '').trim(),
          req.user.id,
          now,
          now,
        ]
      );

      const invId = Number(info.lastInsertRowid);
      for (const it of calc.items) {
        await dbRun(
          `INSERT INTO invoice_items (invoice_id, product_id, sort_order, description, quantity, unit, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invId,
            it.product_id,
            it.sort_order,
            it.description,
            it.quantity,
            it.unit,
            it.unit_price,
            it.line_total,
          ]
        );
      }

      if (initialPayment > 0) {
        const payNo = await allocateNextDocNumber('payment', b.payment_date || b.invoice_date);
        await dbRun(
          `INSERT INTO payments (
            payment_number, invoice_id, customer_id, payment_date, amount,
            payment_method, reference_number, notes, recorded_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            payNo,
            invId,
            customerId,
            b.payment_date || b.invoice_date,
            initialPayment,
            String(b.payment_method || 'Cash').trim(),
            String(b.payment_reference || '').trim(),
            'Initial payment recorded upon invoice issuance',
            req.user.full_name,
            now,
            now,
          ]
        );
      }

      await recalculateInvoicePaymentState(invId);
      await saveIdempotencyKey(req, 'invoice', invId);

      await logActivity({
        entity_type: 'invoice',
        entity_id: invId,
        document_number: invNumber,
        customer_id: customerId,
        customer_name: b.customer_name.trim(),
        action: 'created',
        summary: `Issued invoice ${invNumber} to ${b.customer_name.trim()}`,
        amount: calc.grand_total,
        actor_name: req.user.full_name,
      });

      if (initialPayment > 0) {
        await logActivity({
          entity_type: 'payment',
          entity_id: invId,
          document_number: invNumber,
          customer_id: customerId,
          customer_name: b.customer_name.trim(),
          action: 'payment_recorded',
          summary: `Recorded payment of ₱${initialPayment.toLocaleString('en-PH', {
            minimumFractionDigits: 2,
          })} for ${invNumber}`,
          amount: initialPayment,
          actor_name: req.user.full_name,
        });
      }

      return invId;
    });

    res.status(201).json({ invoice: await getFullInvoice(createdId) });
  })
);

app.put(
  '/api/invoices/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT * FROM invoices WHERE id = ? AND is_archived = 0', [id]);
    if (!existing) return res.status(404).json({ error: 'Invoice not found.' });

    const b = req.body || {};
    if (!b.customer_name?.trim()) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }

    const calc = computeTotalsFromItems(
      b.items,
      b.discount_type,
      b.discount_value,
      b.tax_enabled,
      b.tax_rate
    );
    if (calc.items.length === 0) {
      return res.status(400).json({ error: 'Please include at least one line item.' });
    }

    if (calc.grand_total + 0.01 < Number(existing.amount_paid || 0)) {
      return res.status(400).json({
        error: `Total amount due (₱${calc.grand_total.toFixed(
          2
        )}) cannot be less than payments already recorded (₱${Number(
          existing.amount_paid || 0
        ).toFixed(2)}).`,
      });
    }

    await runInTransaction(async () => {
      const customerId = await ensureCustomerForDocument(b, req.user.id);
      const settings = await getSettings();

      await dbRun(
        `UPDATE invoices
         SET invoice_date = ?, due_date = ?, customer_id = ?, customer_name = ?, company_name = ?,
             customer_address = ?, contact_number = ?, customer_email = ?, reference_quotation_number = ?,
             project_name = ?, subtotal = ?, discount_type = ?, discount_value = ?, discount_amount = ?,
             tax_enabled = ?, tax_label = ?, tax_rate = ?, tax_amount = ?, total_amount_due = ?,
             payment_terms = ?, remarks = ?, prepared_by = ?, authorized_signatory = ?, updated_at = ?
         WHERE id = ?`,
        [
          b.invoice_date || existing.invoice_date,
          String(b.due_date ?? '').trim(),
          customerId,
          b.customer_name.trim(),
          String(b.company_name ?? '').trim(),
          String(b.customer_address ?? '').trim(),
          String(b.contact_number ?? '').trim(),
          String(b.customer_email ?? '').trim(),
          String(b.reference_quotation_number ?? '').trim(),
          String(b.project_name ?? '').trim(),
          calc.subtotal,
          calc.discount_type,
          calc.discount_value,
          calc.discount_amount,
          calc.tax_enabled,
          String(b.tax_label || settings.tax_label || 'VAT').trim(),
          calc.tax_rate,
          calc.tax_amount,
          calc.grand_total,
          String(b.payment_terms ?? '').trim(),
          String(b.remarks ?? '').trim(),
          String(b.prepared_by ?? '').trim(),
          String(b.authorized_signatory ?? '').trim(),
          nowISO(),
          id,
        ]
      );

      await dbRun('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);
      for (const it of calc.items) {
        await dbRun(
          `INSERT INTO invoice_items (invoice_id, product_id, sort_order, description, quantity, unit, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            it.product_id,
            it.sort_order,
            it.description,
            it.quantity,
            it.unit,
            it.unit_price,
            it.line_total,
          ]
        );
      }

      await dbRun('UPDATE payments SET customer_id = ? WHERE invoice_id = ?', [customerId, id]);
      await recalculateInvoicePaymentState(id);

      await logActivity({
        entity_type: 'invoice',
        entity_id: id,
        document_number: existing.invoice_number,
        customer_id: customerId,
        customer_name: b.customer_name.trim(),
        action: 'updated',
        summary: `Updated invoice ${existing.invoice_number}`,
        amount: calc.grand_total,
        actor_name: req.user.full_name,
      });
    });

    res.json({ invoice: await getFullInvoice(id) });
  })
);

app.post(
  '/api/invoices/:id/payments',
  asyncHandler(async (req, res) => {
    const invoiceId = Number(req.params.id);
    const idemHit = await getIdempotencyHit(req, 'payment');
    if (idemHit) {
      return res.json({ invoice: await getFullInvoice(invoiceId) });
    }

    const inv = await dbGet('SELECT * FROM invoices WHERE id = ? AND is_archived = 0', [invoiceId]);
    if (!inv) return res.status(404).json({ error: 'Invoice not found.' });

    const b = req.body || {};
    const amount = round2(b.amount);
    if (amount <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than ₱0.00.' });
    }
    if (amount > round2(inv.remaining_balance) + 0.01) {
      return res.status(400).json({
        error: `Payment amount (₱${amount.toFixed(
          2
        )}) exceeds the remaining balance (₱${round2(inv.remaining_balance).toFixed(2)}).`,
      });
    }

    const payDate = b.payment_date || todayYMD();
    const method = String(b.payment_method || 'Cash').trim();

    await runInTransaction(async () => {
      const payNo = await allocateNextDocNumber('payment', payDate);
      const now = nowISO();
      const info = await dbRun(
        `INSERT INTO payments (
          payment_number, invoice_id, customer_id, payment_date, amount,
          payment_method, reference_number, notes, recorded_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payNo,
          invoiceId,
          inv.customer_id,
          payDate,
          amount,
          method,
          String(b.reference_number || '').trim(),
          String(b.notes || '').trim(),
          req.user.full_name,
          now,
          now,
        ]
      );

      const payId = Number(info.lastInsertRowid);
      await recalculateInvoicePaymentState(invoiceId);
      await saveIdempotencyKey(req, 'payment', payId);

      await logActivity({
        entity_type: 'payment',
        entity_id: invoiceId,
        document_number: inv.invoice_number,
        customer_id: inv.customer_id,
        customer_name: inv.customer_name,
        action: 'payment_recorded',
        summary: `Payment ${payNo} (${method}) received for ${inv.invoice_number}`,
        amount,
        actor_name: req.user.full_name,
      });
    });

    res.status(201).json({ invoice: await getFullInvoice(invoiceId) });
  })
);

app.get(
  '/api/payments',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const method = String(req.query.method || 'all');
    const dateFrom = String(req.query.date_from || '');
    const dateTo = String(req.query.date_to || '');

    let where = 'WHERE i.is_archived = 0';
    const params = [];
    if (method && method !== 'all') {
      where += ' AND p.payment_method = ?';
      params.push(method);
    }
    if (dateFrom) {
      where += ' AND p.payment_date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      where += ' AND p.payment_date <= ?';
      params.push(dateTo);
    }
    if (search) {
      where +=
        ' AND (p.payment_number LIKE ? OR i.invoice_number LIKE ? OR i.customer_name LIKE ? OR p.reference_number LIKE ?)';
      const lk = `%${search}%`;
      params.push(lk, lk, lk, lk);
    }

    const payments = await dbAll(
      `SELECT p.*, i.invoice_number, i.customer_name, i.company_name, i.total_amount_due, i.remaining_balance, i.status as invoice_status
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       ${where}
       ORDER BY p.payment_date DESC, p.id DESC`,
      params
    );

    res.json({ payments });
  })
);

app.delete(
  '/api/payments/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const payment = await dbGet('SELECT * FROM payments WHERE id = ?', [id]);
    if (!payment) return res.status(404).json({ error: 'Payment record not found.' });

    await runInTransaction(async () => {
      const inv = await dbGet(
        'SELECT invoice_number, customer_name, customer_id FROM invoices WHERE id = ?',
        [payment.invoice_id]
      );
      await dbRun('DELETE FROM payments WHERE id = ?', [id]);
      await recalculateInvoicePaymentState(payment.invoice_id);

      await logActivity({
        entity_type: 'payment',
        entity_id: payment.invoice_id,
        document_number: inv?.invoice_number || payment.payment_number,
        customer_id: inv?.customer_id || null,
        customer_name: inv?.customer_name || '',
        action: 'payment_voided',
        summary: `Removed payment ${payment.payment_number} from ${
          inv?.invoice_number || 'invoice'
        }`,
        amount: payment.amount,
        actor_name: req.user.full_name,
      });
    });

    res.json({ ok: true, invoice: await getFullInvoice(payment.invoice_id) });
  })
);

app.delete(
  '/api/invoices/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT * FROM invoices WHERE id = ? AND is_archived = 0', [id]);
    if (!existing) return res.status(404).json({ error: 'Invoice not found.' });

    await runInTransaction(async () => {
      const now = nowISO();
      await dbRun('UPDATE invoices SET is_archived = 1, updated_at = ? WHERE id = ?', [now, id]);
      await dbRun(
        'UPDATE quotations SET converted_invoice_id = NULL, updated_at = ? WHERE converted_invoice_id = ?',
        [now, id]
      );
      await logActivity({
        entity_type: 'invoice',
        entity_id: id,
        document_number: existing.invoice_number,
        customer_id: existing.customer_id,
        customer_name: existing.customer_name,
        action: 'deleted',
        summary: `Deleted invoice ${existing.invoice_number}`,
        actor_name: req.user.full_name,
      });
    });

    res.json({ ok: true });
  })
);

app.get(
  '/api/invoices/:id/pdf',
  asyncHandler(async (req, res) => {
    await refreshTimeSensitiveStatuses();
    const full = await getFullInvoice(Number(req.params.id));
    if (!full) return res.status(404).json({ error: 'Invoice not found.' });
    const settings = await getSettings();
    const pdfBuf = await generateInvoicePdf(full, full.items, full.payments, settings);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${full.invoice_number}.pdf"`);
    res.send(pdfBuf);
  })
);

// ============================================================================
// SERVICE REPORTS MODULE
// ============================================================================

async function getFullServiceReport(id) {
  const report = await dbGet('SELECT * FROM service_reports WHERE id = ? AND is_archived = 0', [
    id,
  ]);
  if (!report) return null;
  const materials = await dbAll(
    'SELECT * FROM service_report_materials WHERE service_report_id = ? ORDER BY sort_order ASC, id ASC',
    [id]
  );
  const photos = await dbAll(
    'SELECT * FROM service_report_photos WHERE service_report_id = ? ORDER BY id ASC',
    [id]
  );
  return { ...report, materials, photos };
}

app.get(
  '/api/service-reports/next-number',
  asyncHandler(async (req, res) => {
    const dateStr = String(req.query.date || todayYMD());
    res.json({ next_number: await previewNextDocNumber('service_report', dateStr) });
  })
);

app.get(
  '/api/service-reports',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || 'all');
    const dateFrom = String(req.query.date_from || '');
    const dateTo = String(req.query.date_to || '');

    let where = 'WHERE is_archived = 0';
    const params = [];
    if (status && status !== 'all') {
      where += ' AND status = ?';
      params.push(status);
    }
    if (dateFrom) {
      where += ' AND service_date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      where += ' AND service_date <= ?';
      params.push(dateTo);
    }
    if (search) {
      where +=
        ' AND (report_number LIKE ? OR customer_name LIKE ? OR service_location LIKE ? OR equipment_serviced LIKE ? OR technician_name LIKE ?)';
      const lk = `%${search}%`;
      params.push(lk, lk, lk, lk, lk);
    }

    const reports = await dbAll(
      `SELECT * FROM service_reports ${where} ORDER BY service_date DESC, id DESC`,
      params
    );
    res.json({ service_reports: reports });
  })
);

app.get(
  '/api/service-reports/:id',
  asyncHandler(async (req, res) => {
    const full = await getFullServiceReport(Number(req.params.id));
    if (!full) return res.status(404).json({ error: 'Service report not found.' });
    res.json({ service_report: full });
  })
);

app.post(
  '/api/service-reports',
  asyncHandler(async (req, res) => {
    const idemHit = await getIdempotencyHit(req, 'service_report');
    if (idemHit) {
      const existing = await getFullServiceReport(idemHit);
      if (existing) return res.json({ service_report: existing });
    }

    const b = req.body || {};
    if (!b.customer_name?.trim()) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }
    if (!b.service_date) {
      return res.status(400).json({ error: 'Service date is required.' });
    }

    const materials = (Array.isArray(b.materials) ? b.materials : [])
      .filter((m) => m && String(m.material_name || '').trim() !== '')
      .map((m, idx) => {
        const qty = Math.max(0, Number(m.quantity) || 0);
        const uCost = Math.max(0, round2(m.unit_cost));
        return {
          sort_order: idx + 1,
          material_name: String(m.material_name).trim(),
          quantity: qty,
          unit: String(m.unit || 'pcs').trim() || 'pcs',
          unit_cost: uCost,
          line_cost: round2(qty * uCost),
        };
      });

    const materialsTotal = round2(materials.reduce((acc, m) => acc + m.line_cost, 0));
    const validStatuses = ['Scheduled', 'In Progress', 'Completed', 'Cancelled'];
    const status = validStatuses.includes(b.status) ? b.status : 'Scheduled';

    const createdId = await runInTransaction(async () => {
      const customerId = await ensureCustomerForDocument(b, req.user.id);
      const rNumber = await allocateNextDocNumber('service_report', b.service_date);
      const now = nowISO();

      const info = await dbRun(
        `INSERT INTO service_reports (
          report_number, service_date, job_type, customer_id, customer_name, company_name,
          contact_details, service_location, equipment_serviced, reported_problem,
          inspection_findings, work_performed, materials_total_cost, technician_name,
          start_time, completion_time, status, recommendations, customer_acknowledgment,
          customer_signatory_name, acknowledgment_date, technician_signature_url,
          customer_signature_url, remarks, is_archived, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          rNumber,
          b.service_date,
          String(b.job_type || 'Fabrication').trim(),
          customerId,
          b.customer_name.trim(),
          String(b.company_name || '').trim(),
          String(b.contact_details || '').trim(),
          String(b.service_location || '').trim(),
          String(b.equipment_serviced || '').trim(),
          String(b.reported_problem || '').trim(),
          String(b.inspection_findings || '').trim(),
          String(b.work_performed || '').trim(),
          materialsTotal,
          String(b.technician_name || '').trim(),
          String(b.start_time || '').trim(),
          String(b.completion_time || '').trim(),
          status,
          String(b.recommendations || '').trim(),
          b.customer_acknowledgment ? 1 : 0,
          String(b.customer_signatory_name || '').trim(),
          String(b.acknowledgment_date || '').trim(),
          String(b.technician_signature_url || '').trim(),
          String(b.customer_signature_url || '').trim(),
          String(b.remarks || '').trim(),
          req.user.id,
          now,
          now,
        ]
      );

      const srId = Number(info.lastInsertRowid);
      for (const m of materials) {
        await dbRun(
          `INSERT INTO service_report_materials (service_report_id, sort_order, material_name, quantity, unit, unit_cost, line_cost)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [srId, m.sort_order, m.material_name, m.quantity, m.unit, m.unit_cost, m.line_cost]
        );
      }

      const photos = Array.isArray(b.photos) ? b.photos : [];
      for (const p of photos) {
        if (p?.photo_url) {
          await dbRun(
            `INSERT INTO service_report_photos (service_report_id, photo_type, photo_url, caption, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
              srId,
              p.photo_type === 'after' ? 'after' : 'before',
              String(p.photo_url).trim(),
              String(p.caption || '').trim(),
              now,
            ]
          );
        }
      }

      await saveIdempotencyKey(req, 'service_report', srId);
      await logActivity({
        entity_type: 'service_report',
        entity_id: srId,
        document_number: rNumber,
        customer_id: customerId,
        customer_name: b.customer_name.trim(),
        action: 'created',
        summary: `Logged service report ${rNumber} (${b.job_type || 'Fabrication'} — ${status})`,
        amount: materialsTotal > 0 ? materialsTotal : null,
        actor_name: req.user.full_name,
      });

      return srId;
    });

    res.status(201).json({ service_report: await getFullServiceReport(createdId) });
  })
);

app.put(
  '/api/service-reports/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT * FROM service_reports WHERE id = ? AND is_archived = 0', [
      id,
    ]);
    if (!existing) return res.status(404).json({ error: 'Service report not found.' });

    const b = req.body || {};
    if (!b.customer_name?.trim()) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }

    const materials = (Array.isArray(b.materials) ? b.materials : [])
      .filter((m) => m && String(m.material_name || '').trim() !== '')
      .map((m, idx) => {
        const qty = Math.max(0, Number(m.quantity) || 0);
        const uCost = Math.max(0, round2(m.unit_cost));
        return {
          sort_order: idx + 1,
          material_name: String(m.material_name).trim(),
          quantity: qty,
          unit: String(m.unit || 'pcs').trim() || 'pcs',
          unit_cost: uCost,
          line_cost: round2(qty * uCost),
        };
      });

    const materialsTotal = round2(materials.reduce((acc, m) => acc + m.line_cost, 0));
    const validStatuses = ['Scheduled', 'In Progress', 'Completed', 'Cancelled'];
    const status = validStatuses.includes(b.status) ? b.status : existing.status;

    await runInTransaction(async () => {
      const customerId = await ensureCustomerForDocument(b, req.user.id);
      const now = nowISO();

      await dbRun(
        `UPDATE service_reports
         SET service_date = ?, job_type = ?, customer_id = ?, customer_name = ?, company_name = ?,
             contact_details = ?, service_location = ?, equipment_serviced = ?, reported_problem = ?,
             inspection_findings = ?, work_performed = ?, materials_total_cost = ?, technician_name = ?,
             start_time = ?, completion_time = ?, status = ?, recommendations = ?, customer_acknowledgment = ?,
             customer_signatory_name = ?, acknowledgment_date = ?, technician_signature_url = ?,
             customer_signature_url = ?, remarks = ?, updated_at = ?
         WHERE id = ?`,
        [
          b.service_date || existing.service_date,
          String(b.job_type || 'Fabrication').trim(),
          customerId,
          b.customer_name.trim(),
          String(b.company_name ?? '').trim(),
          String(b.contact_details ?? '').trim(),
          String(b.service_location ?? '').trim(),
          String(b.equipment_serviced ?? '').trim(),
          String(b.reported_problem ?? '').trim(),
          String(b.inspection_findings ?? '').trim(),
          String(b.work_performed ?? '').trim(),
          materialsTotal,
          String(b.technician_name ?? '').trim(),
          String(b.start_time ?? '').trim(),
          String(b.completion_time ?? '').trim(),
          status,
          String(b.recommendations ?? '').trim(),
          b.customer_acknowledgment ? 1 : 0,
          String(b.customer_signatory_name ?? '').trim(),
          String(b.acknowledgment_date ?? '').trim(),
          String(b.technician_signature_url ?? '').trim(),
          String(b.customer_signature_url ?? '').trim(),
          String(b.remarks ?? '').trim(),
          now,
          id,
        ]
      );

      await dbRun('DELETE FROM service_report_materials WHERE service_report_id = ?', [id]);
      for (const m of materials) {
        await dbRun(
          `INSERT INTO service_report_materials (service_report_id, sort_order, material_name, quantity, unit, unit_cost, line_cost)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, m.sort_order, m.material_name, m.quantity, m.unit, m.unit_cost, m.line_cost]
        );
      }

      if (Array.isArray(b.photos)) {
        await dbRun('DELETE FROM service_report_photos WHERE service_report_id = ?', [id]);
        for (const p of b.photos) {
          if (p?.photo_url) {
            await dbRun(
              `INSERT INTO service_report_photos (service_report_id, photo_type, photo_url, caption, created_at)
               VALUES (?, ?, ?, ?, ?)`,
              [
                id,
                p.photo_type === 'after' ? 'after' : 'before',
                String(p.photo_url).trim(),
                String(p.caption || '').trim(),
                now,
              ]
            );
          }
        }
      }

      await logActivity({
        entity_type: 'service_report',
        entity_id: id,
        document_number: existing.report_number,
        customer_id: customerId,
        customer_name: b.customer_name.trim(),
        action: 'updated',
        summary: `Updated service report ${existing.report_number} (${status})`,
        amount: materialsTotal > 0 ? materialsTotal : null,
        actor_name: req.user.full_name,
      });
    });

    res.json({ service_report: await getFullServiceReport(id) });
  })
);

app.delete(
  '/api/service-reports/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT * FROM service_reports WHERE id = ? AND is_archived = 0', [
      id,
    ]);
    if (!existing) return res.status(404).json({ error: 'Service report not found.' });
    await dbRun('UPDATE service_reports SET is_archived = 1, updated_at = ? WHERE id = ?', [
      nowISO(),
      id,
    ]);
    await logActivity({
      entity_type: 'service_report',
      entity_id: id,
      document_number: existing.report_number,
      customer_id: existing.customer_id,
      customer_name: existing.customer_name,
      action: 'deleted',
      summary: `Deleted service report ${existing.report_number}`,
      actor_name: req.user.full_name,
    });
    res.json({ ok: true });
  })
);

app.get(
  '/api/service-reports/:id/pdf',
  asyncHandler(async (req, res) => {
    const full = await getFullServiceReport(Number(req.params.id));
    if (!full) return res.status(404).json({ error: 'Service report not found.' });
    const settings = await getSettings();
    const pdfBuf = await generateServiceReportPdf(full, full.materials, full.photos, settings);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${full.report_number}.pdf"`);
    res.send(pdfBuf);
  })
);

// ============================================================================
// BILLING STATEMENTS MODULE
// ============================================================================

async function getFullBillingStatement(id) {
  const statement = await dbGet(
    'SELECT * FROM billing_statements WHERE id = ? AND is_archived = 0',
    [id]
  );
  if (!statement) return null;
  const lines = await dbAll(
    'SELECT * FROM billing_statement_lines WHERE billing_statement_id = ? ORDER BY sort_order ASC, id ASC',
    [id]
  );
  return { ...statement, lines };
}

app.get(
  '/api/billing-statements/next-number',
  asyncHandler(async (req, res) => {
    const dateStr = String(req.query.date || todayYMD());
    res.json({ next_number: await previewNextDocNumber('billing_statement', dateStr) });
  })
);

app.get(
  '/api/billing-statements/preview',
  asyncHandler(async (req, res) => {
    const customerId = Number(req.query.customer_id);
    const periodFrom = String(req.query.period_from || '');
    const periodTo = String(req.query.period_to || '');

    if (!customerId || !periodFrom || !periodTo) {
      return res
        .status(400)
        .json({ error: 'Customer, period start date, and period end date are required.' });
    }
    if (periodFrom > periodTo) {
      return res
        .status(400)
        .json({ error: 'Billing period start date must be on or before end date.' });
    }

    const customer = await dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const ledger = await computeCustomerStatementLedger(customerId, periodFrom, periodTo);
    res.json({ customer, ledger });
  })
);

app.get(
  '/api/billing-statements',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const dateFrom = String(req.query.date_from || '');
    const dateTo = String(req.query.date_to || '');

    let where = 'WHERE is_archived = 0';
    const params = [];
    if (dateFrom) {
      where += ' AND statement_date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      where += ' AND statement_date <= ?';
      params.push(dateTo);
    }
    if (search) {
      where += ' AND (statement_number LIKE ? OR customer_name LIKE ? OR company_name LIKE ?)';
      const lk = `%${search}%`;
      params.push(lk, lk, lk);
    }

    const statements = await dbAll(
      `SELECT * FROM billing_statements ${where} ORDER BY statement_date DESC, id DESC`,
      params
    );
    res.json({ billing_statements: statements });
  })
);

app.get(
  '/api/billing-statements/:id',
  asyncHandler(async (req, res) => {
    const full = await getFullBillingStatement(Number(req.params.id));
    if (!full) return res.status(404).json({ error: 'Billing statement not found.' });
    res.json({ billing_statement: full });
  })
);

app.post(
  '/api/billing-statements',
  asyncHandler(async (req, res) => {
    const idemHit = await getIdempotencyHit(req, 'billing_statement');
    if (idemHit) {
      const existing = await getFullBillingStatement(idemHit);
      if (existing) return res.json({ billing_statement: existing });
    }

    const b = req.body || {};
    const customerId = Number(b.customer_id);
    if (!customerId) return res.status(400).json({ error: 'Please select an existing customer.' });
    if (!b.statement_date || !b.period_from || !b.period_to) {
      return res
        .status(400)
        .json({ error: 'Statement date and billing period range are required.' });
    }
    if (b.period_from > b.period_to) {
      return res
        .status(400)
        .json({ error: 'Billing period start date must be on or before end date.' });
    }

    const customer = await dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const createdId = await runInTransaction(async () => {
      const ledger = await computeCustomerStatementLedger(customerId, b.period_from, b.period_to);
      const stNumber = await allocateNextDocNumber('billing_statement', b.statement_date);
      const settings = await getSettings();
      const now = nowISO();

      const info = await dbRun(
        `INSERT INTO billing_statements (
          statement_number, statement_date, period_from, period_to,
          customer_id, customer_name, company_name, customer_address, contact_number, customer_email,
          previous_balance, total_charges, total_payments, outstanding_balance,
          payment_terms, remarks, prepared_by, authorized_signatory,
          is_archived, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          stNumber,
          b.statement_date,
          b.period_from,
          b.period_to,
          customer.id,
          String(b.customer_name || customer.customer_name).trim(),
          String(b.company_name ?? customer.company_name).trim(),
          String(b.customer_address ?? customer.billing_address).trim(),
          String(b.contact_number ?? customer.contact_number).trim(),
          String(b.customer_email ?? customer.email).trim(),
          ledger.previous_balance,
          ledger.total_charges,
          ledger.total_payments,
          ledger.outstanding_balance,
          String(b.payment_terms ?? settings.default_payment_terms ?? '').trim(),
          String(b.remarks ?? '').trim(),
          String(b.prepared_by || req.user.full_name || '').trim(),
          String(b.authorized_signatory || settings.authorized_representative || '').trim(),
          req.user.id,
          now,
          now,
        ]
      );

      const stId = Number(info.lastInsertRowid);
      for (const ln of ledger.lines) {
        await dbRun(
          `INSERT INTO billing_statement_lines (
            billing_statement_id, sort_order, tx_date, tx_type, source_id,
            reference_number, invoice_number, invoice_date, description, debit, credit, running_balance
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            stId,
            ln.sort_order,
            ln.tx_date,
            ln.tx_type,
            ln.source_id,
            ln.reference_number,
            ln.invoice_number,
            ln.invoice_date,
            ln.description,
            ln.debit,
            ln.credit,
            ln.running_balance,
          ]
        );
      }

      await saveIdempotencyKey(req, 'billing_statement', stId);
      await logActivity({
        entity_type: 'billing_statement',
        entity_id: stId,
        document_number: stNumber,
        customer_id: customer.id,
        customer_name: customer.customer_name,
        action: 'created',
        summary: `Generated billing statement ${stNumber} for ${customer.customer_name}`,
        amount: ledger.outstanding_balance,
        actor_name: req.user.full_name,
      });

      return stId;
    });

    res.status(201).json({ billing_statement: await getFullBillingStatement(createdId) });
  })
);

app.put(
  '/api/billing-statements/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet(
      'SELECT * FROM billing_statements WHERE id = ? AND is_archived = 0',
      [id]
    );
    if (!existing) return res.status(404).json({ error: 'Billing statement not found.' });

    const b = req.body || {};
    const customerId = Number(b.customer_id || existing.customer_id);
    const periodFrom = b.period_from || existing.period_from;
    const periodTo = b.period_to || existing.period_to;
    if (periodFrom > periodTo) {
      return res
        .status(400)
        .json({ error: 'Billing period start date must be on or before end date.' });
    }

    const customer = await dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    await runInTransaction(async () => {
      const ledger = await computeCustomerStatementLedger(customerId, periodFrom, periodTo);
      await dbRun(
        `UPDATE billing_statements
         SET statement_date = ?, period_from = ?, period_to = ?,
             customer_id = ?, customer_name = ?, company_name = ?, customer_address = ?,
             contact_number = ?, customer_email = ?,
             previous_balance = ?, total_charges = ?, total_payments = ?, outstanding_balance = ?,
             payment_terms = ?, remarks = ?, prepared_by = ?, authorized_signatory = ?, updated_at = ?
         WHERE id = ?`,
        [
          b.statement_date || existing.statement_date,
          periodFrom,
          periodTo,
          customerId,
          String(b.customer_name || customer.customer_name).trim(),
          String(b.company_name ?? customer.company_name).trim(),
          String(b.customer_address ?? customer.billing_address).trim(),
          String(b.contact_number ?? customer.contact_number).trim(),
          String(b.customer_email ?? customer.email).trim(),
          ledger.previous_balance,
          ledger.total_charges,
          ledger.total_payments,
          ledger.outstanding_balance,
          String(b.payment_terms ?? '').trim(),
          String(b.remarks ?? '').trim(),
          String(b.prepared_by ?? '').trim(),
          String(b.authorized_signatory ?? '').trim(),
          nowISO(),
          id,
        ]
      );

      await dbRun('DELETE FROM billing_statement_lines WHERE billing_statement_id = ?', [id]);
      for (const ln of ledger.lines) {
        await dbRun(
          `INSERT INTO billing_statement_lines (
            billing_statement_id, sort_order, tx_date, tx_type, source_id,
            reference_number, invoice_number, invoice_date, description, debit, credit, running_balance
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            ln.sort_order,
            ln.tx_date,
            ln.tx_type,
            ln.source_id,
            ln.reference_number,
            ln.invoice_number,
            ln.invoice_date,
            ln.description,
            ln.debit,
            ln.credit,
            ln.running_balance,
          ]
        );
      }

      await logActivity({
        entity_type: 'billing_statement',
        entity_id: id,
        document_number: existing.statement_number,
        customer_id: customerId,
        customer_name: customer.customer_name,
        action: 'updated',
        summary: `Recalculated & updated billing statement ${existing.statement_number}`,
        amount: ledger.outstanding_balance,
        actor_name: req.user.full_name,
      });
    });

    res.json({ billing_statement: await getFullBillingStatement(id) });
  })
);

app.delete(
  '/api/billing-statements/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet(
      'SELECT * FROM billing_statements WHERE id = ? AND is_archived = 0',
      [id]
    );
    if (!existing) return res.status(404).json({ error: 'Billing statement not found.' });
    await dbRun('UPDATE billing_statements SET is_archived = 1, updated_at = ? WHERE id = ?', [
      nowISO(),
      id,
    ]);
    await logActivity({
      entity_type: 'billing_statement',
      entity_id: id,
      document_number: existing.statement_number,
      customer_id: existing.customer_id,
      customer_name: existing.customer_name,
      action: 'deleted',
      summary: `Deleted billing statement ${existing.statement_number}`,
      actor_name: req.user.full_name,
    });
    res.json({ ok: true });
  })
);

app.get(
  '/api/billing-statements/:id/pdf',
  asyncHandler(async (req, res) => {
    const full = await getFullBillingStatement(Number(req.params.id));
    if (!full) return res.status(404).json({ error: 'Billing statement not found.' });
    const settings = await getSettings();
    const pdfBuf = await generateBillingStatementPdf(full, full.lines, settings);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${full.statement_number}.pdf"`);
    res.send(pdfBuf);
  })
);

// ============================================================================
// REPORTS & ANALYTICS MODULE
// ============================================================================

app.get(
  '/api/reports',
  asyncHandler(async (req, res) => {
    await refreshTimeSensitiveStatuses();
    const dateFrom = String(req.query.date_from || '2000-01-01');
    const dateTo = String(req.query.date_to || '2099-12-31');

    const invoicingSummary = await dbGet(
      `SELECT
        COUNT(*) as invoice_count,
        COALESCE(SUM(total_amount_due), 0) as total_invoiced,
        COALESCE(SUM(discount_amount), 0) as total_discounts,
        COALESCE(SUM(tax_amount), 0) as total_tax
       FROM invoices
       WHERE is_archived = 0 AND invoice_date >= ? AND invoice_date <= ?`,
      [dateFrom, dateTo]
    );

    const collectionsSummary = await dbGet(
      `SELECT
        COUNT(*) as payment_count,
        COALESCE(SUM(p.amount), 0) as total_collected
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       WHERE i.is_archived = 0 AND p.payment_date >= ? AND p.payment_date <= ?`,
      [dateFrom, dateTo]
    );

    const collectionsByMethod = await dbAll(
      `SELECT p.payment_method, COUNT(*) as count, COALESCE(SUM(p.amount), 0) as total
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       WHERE i.is_archived = 0 AND p.payment_date >= ? AND p.payment_date <= ?
       GROUP BY p.payment_method
       ORDER BY total DESC`,
      [dateFrom, dateTo]
    );

    const quotationBreakdown = await dbAll(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(grand_total), 0) as total_value
       FROM quotations
       WHERE is_archived = 0 AND date_issued >= ? AND date_issued <= ?
       GROUP BY status`,
      [dateFrom, dateTo]
    );

    const serviceBreakdown = await dbAll(
      `SELECT status, job_type, COUNT(*) as count, COALESCE(SUM(materials_total_cost), 0) as materials_cost
       FROM service_reports
       WHERE is_archived = 0 AND service_date >= ? AND service_date <= ?
       GROUP BY status, job_type`,
      [dateFrom, dateTo]
    );

    const openInvoices = await dbAll(
      `SELECT id, invoice_number, customer_name, company_name, invoice_date, due_date, total_amount_due, amount_paid, remaining_balance, status
       FROM invoices
       WHERE is_archived = 0 AND remaining_balance > 0.009
       ORDER BY due_date ASC, invoice_date ASC`
    );

    const todayMs = new Date(`${todayYMD()}T00:00:00Z`).getTime();
    const aging = {
      current: 0,
      days_1_30: 0,
      days_31_60: 0,
      days_61_plus: 0,
      total_outstanding: 0,
    };

    for (const inv of openInvoices) {
      const rem = Number(inv.remaining_balance || 0);
      aging.total_outstanding = round2(aging.total_outstanding + rem);
      if (!inv.due_date) {
        aging.current = round2(aging.current + rem);
        continue;
      }
      const dueMs = new Date(`${inv.due_date}T00:00:00Z`).getTime();
      const diffDays = Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) aging.current = round2(aging.current + rem);
      else if (diffDays <= 30) aging.days_1_30 = round2(aging.days_1_30 + rem);
      else if (diffDays <= 60) aging.days_31_60 = round2(aging.days_31_60 + rem);
      else aging.days_61_plus = round2(aging.days_61_plus + rem);
    }

    const topCustomers = await dbAll(
      `SELECT
        MAX(customer_name) as customer_name,
        MAX(company_name) as company_name,
        COUNT(*) as invoice_count,
        COALESCE(SUM(total_amount_due), 0) as total_billed,
        COALESCE(SUM(amount_paid), 0) as total_paid,
        COALESCE(SUM(remaining_balance), 0) as balance_due
       FROM invoices
       WHERE is_archived = 0 AND invoice_date >= ? AND invoice_date <= ?
       GROUP BY LOWER(TRIM(customer_name)), LOWER(TRIM(company_name))
       ORDER BY total_billed DESC
       LIMIT 10`,
      [dateFrom, dateTo]
    );

    res.json({
      period: { date_from: dateFrom, date_to: dateTo },
      invoicing: {
        invoice_count: Number(invoicingSummary?.invoice_count || 0),
        total_invoiced: round2(invoicingSummary?.total_invoiced),
        total_discounts: round2(invoicingSummary?.total_discounts),
        total_tax: round2(invoicingSummary?.total_tax),
      },
      collections: {
        payment_count: Number(collectionsSummary?.payment_count || 0),
        total_collected: round2(collectionsSummary?.total_collected),
        by_method: collectionsByMethod,
      },
      aging,
      open_invoices: openInvoices,
      quotation_breakdown: quotationBreakdown,
      service_breakdown: serviceBreakdown,
      top_customers: topCustomers,
    });
  })
);

// ============================================================================
// BACKUP, DATA EXPORT & RESTORE
// ============================================================================

app.get(
  '/api/backup/export',
  asyncHandler(async (_req, res) => {
    const tables = [
      'business_settings',
      'document_sequences',
      'customers',
      'products_services',
      'quotations',
      'quotation_items',
      'invoices',
      'invoice_items',
      'payments',
      'service_reports',
      'service_report_materials',
      'service_report_photos',
      'billing_statements',
      'billing_statement_lines',
      'activity_logs',
    ];

    const data = {};
    for (const t of tables) {
      data[t] = await dbAll(`SELECT * FROM ${t}`);
    }

    // Export all uploaded files from persistent DB table + any legacy disk files
    const uploadedFiles = {};
    const dbFiles = await dbAll('SELECT filename, data_base64 FROM uploaded_files');
    for (const row of dbFiles) {
      if (row.filename && row.data_base64) {
        uploadedFiles[row.filename] = row.data_base64;
      }
    }
    if (fs.existsSync(UPLOADS_DIR)) {
      for (const fname of fs.readdirSync(UPLOADS_DIR)) {
        if (fname === '.gitkeep' || uploadedFiles[fname]) continue;
        const fpath = path.join(UPLOADS_DIR, fname);
        if (fs.statSync(fpath).isFile()) {
          uploadedFiles[fname] = fs.readFileSync(fpath).toString('base64');
        }
      }
    }

    const payload = {
      system: 'Johnrois Stainless Steel Fabrication Shop — Business Management System',
      backup_version: '1.1',
      exported_at: nowISO(),
      tables: data,
      uploaded_files: uploadedFiles,
    };

    const filename = `johnrois-backup-${todayYMD()}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(payload, null, 2));
  })
);

app.post(
  '/api/backup/import',
  asyncHandler(async (req, res) => {
    const payload = req.body;
    if (!payload || !payload.tables || typeof payload.tables !== 'object') {
      return res.status(400).json({ error: 'Invalid backup file structure.' });
    }

    const ALLOWED_COLUMNS = {
      business_settings: [
        'id',
        'business_name',
        'logo_url',
        'address',
        'contact_number',
        'email',
        'facebook_url',
        'maps_url',
        'other_social_links',
        'operating_hours',
        'quotation_prefix',
        'invoice_prefix',
        'service_report_prefix',
        'billing_statement_prefix',
        'customer_prefix',
        'product_prefix',
        'payment_prefix',
        'doc_number_padding',
        'include_year_in_doc_num',
        'default_payment_terms',
        'default_quotation_validity_days',
        'default_invoice_due_days',
        'default_notes',
        'authorized_representative',
        'authorized_title',
        'signature_url',
        'tax_enabled',
        'tax_label',
        'tax_rate',
        'updated_at',
      ],
      document_sequences: ['seq_key', 'last_val'],
      customers: [
        'id',
        'customer_code',
        'customer_name',
        'company_name',
        'contact_number',
        'email',
        'billing_address',
        'project_locations',
        'remarks',
        'is_archived',
        'created_by',
        'created_at',
        'updated_at',
      ],
      products_services: [
        'id',
        'item_code',
        'name',
        'description',
        'category',
        'material_grade',
        'unit',
        'unit_price',
        'is_archived',
        'created_at',
        'updated_at',
      ],
      quotations: [
        'id',
        'quotation_number',
        'date_issued',
        'valid_until',
        'customer_id',
        'customer_name',
        'company_name',
        'customer_address',
        'contact_number',
        'customer_email',
        'project_name',
        'project_location',
        'subtotal',
        'discount_type',
        'discount_value',
        'discount_amount',
        'tax_enabled',
        'tax_label',
        'tax_rate',
        'tax_amount',
        'grand_total',
        'payment_terms',
        'delivery_schedule',
        'remarks',
        'prepared_by',
        'authorized_signatory',
        'status',
        'converted_invoice_id',
        'is_archived',
        'created_by',
        'created_at',
        'updated_at',
      ],
      quotation_items: [
        'id',
        'quotation_id',
        'product_id',
        'sort_order',
        'description',
        'quantity',
        'unit',
        'unit_price',
        'line_total',
      ],
      invoices: [
        'id',
        'invoice_number',
        'invoice_date',
        'due_date',
        'customer_id',
        'customer_name',
        'company_name',
        'customer_address',
        'contact_number',
        'customer_email',
        'quotation_id',
        'reference_quotation_number',
        'project_name',
        'subtotal',
        'discount_type',
        'discount_value',
        'discount_amount',
        'tax_enabled',
        'tax_label',
        'tax_rate',
        'tax_amount',
        'total_amount_due',
        'amount_paid',
        'remaining_balance',
        'payment_method',
        'payment_date',
        'payment_terms',
        'remarks',
        'prepared_by',
        'authorized_signatory',
        'status',
        'is_archived',
        'created_by',
        'created_at',
        'updated_at',
      ],
      invoice_items: [
        'id',
        'invoice_id',
        'product_id',
        'sort_order',
        'description',
        'quantity',
        'unit',
        'unit_price',
        'line_total',
      ],
      payments: [
        'id',
        'payment_number',
        'invoice_id',
        'customer_id',
        'payment_date',
        'amount',
        'payment_method',
        'reference_number',
        'notes',
        'recorded_by',
        'created_at',
        'updated_at',
      ],
      service_reports: [
        'id',
        'report_number',
        'service_date',
        'job_type',
        'customer_id',
        'customer_name',
        'company_name',
        'contact_details',
        'service_location',
        'equipment_serviced',
        'reported_problem',
        'inspection_findings',
        'work_performed',
        'materials_total_cost',
        'technician_name',
        'start_time',
        'completion_time',
        'status',
        'recommendations',
        'customer_acknowledgment',
        'customer_signatory_name',
        'acknowledgment_date',
        'technician_signature_url',
        'customer_signature_url',
        'remarks',
        'is_archived',
        'created_by',
        'created_at',
        'updated_at',
      ],
      service_report_materials: [
        'id',
        'service_report_id',
        'sort_order',
        'material_name',
        'quantity',
        'unit',
        'unit_cost',
        'line_cost',
      ],
      service_report_photos: [
        'id',
        'service_report_id',
        'photo_type',
        'photo_url',
        'caption',
        'created_at',
      ],
      billing_statements: [
        'id',
        'statement_number',
        'statement_date',
        'period_from',
        'period_to',
        'customer_id',
        'customer_name',
        'company_name',
        'customer_address',
        'contact_number',
        'customer_email',
        'previous_balance',
        'total_charges',
        'total_payments',
        'outstanding_balance',
        'payment_terms',
        'remarks',
        'prepared_by',
        'authorized_signatory',
        'is_archived',
        'created_by',
        'created_at',
        'updated_at',
      ],
      billing_statement_lines: [
        'id',
        'billing_statement_id',
        'sort_order',
        'tx_date',
        'tx_type',
        'source_id',
        'reference_number',
        'invoice_number',
        'invoice_date',
        'description',
        'debit',
        'credit',
        'running_balance',
      ],
      activity_logs: [
        'id',
        'entity_type',
        'entity_id',
        'document_number',
        'customer_id',
        'customer_name',
        'action',
        'summary',
        'amount',
        'actor_name',
        'created_at',
      ],
    };

    try {
      await runInTransaction(async () => {
        // Delete child tables before parent tables so foreign keys remain satisfied on all engines
        const orderedDelete = [
          'billing_statement_lines',
          'billing_statements',
          'service_report_photos',
          'service_report_materials',
          'service_reports',
          'payments',
          'invoice_items',
          'invoices',
          'quotation_items',
          'quotations',
          'products_services',
          'customers',
          'document_sequences',
          'idempotency_keys',
          'activity_logs',
        ];

        for (const t of orderedDelete) {
          await dbRun(`DELETE FROM ${t}`);
        }

        const insertRows = async (tableName, rows) => {
          if (!Array.isArray(rows) || rows.length === 0) return;
          const allowed = new Set(ALLOWED_COLUMNS[tableName] || []);
          const cols = Object.keys(rows[0]).filter((c) => allowed.has(c));
          if (cols.length === 0) return;
          const placeholders = cols.map(() => '?').join(', ');
          const sql = `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders})`;
          for (const r of rows) {
            const values = cols.map((c) => (c === 'created_by' ? null : (r[c] ?? null)));
            await dbRun(sql, values);
          }
        };

        if (
          Array.isArray(payload.tables.business_settings) &&
          payload.tables.business_settings.length > 0
        ) {
          await dbRun('DELETE FROM business_settings');
          await insertRows('business_settings', payload.tables.business_settings);
        }

        const orderedInsert = [
          'document_sequences',
          'customers',
          'products_services',
          'quotations',
          'quotation_items',
          'invoices',
          'invoice_items',
          'payments',
          'service_reports',
          'service_report_materials',
          'service_report_photos',
          'billing_statements',
          'billing_statement_lines',
          'activity_logs',
        ];
        for (const t of orderedInsert) {
          await insertRows(t, payload.tables[t]);
        }
      });

      await syncSequencesAfterRestore();

      if (payload.uploaded_files && typeof payload.uploaded_files === 'object') {
        for (const [fname, b64] of Object.entries(payload.uploaded_files)) {
          const safeName = path.basename(fname);
          if (safeName && typeof b64 === 'string') {
            await saveUploadedFile({
              filename: safeName,
              buffer: Buffer.from(b64, 'base64'),
            });
          }
        }
      }

      await logActivity({
        entity_type: 'settings',
        entity_id: 1,
        action: 'backup_restored',
        summary: 'Restored system database from backup file',
        actor_name: req.user.full_name,
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('Backup restore error:', err);
      res.status(400).json({ error: `Failed to restore backup: ${err.message}` });
    }
  })
);

app.get(
  '/api/backup/export-csv/:entity',
  asyncHandler(async (req, res) => {
    const entity = req.params.entity;
    const queryMap = {
      customers:
        'SELECT customer_code, customer_name, company_name, contact_number, email, billing_address, project_locations, remarks, created_at FROM customers WHERE is_archived = 0 ORDER BY id ASC',
      products:
        'SELECT item_code, name, category, material_grade, unit, unit_price, description, created_at FROM products_services WHERE is_archived = 0 ORDER BY id ASC',
      quotations:
        'SELECT quotation_number, date_issued, valid_until, customer_name, company_name, project_name, subtotal, discount_amount, tax_amount, grand_total, status, created_at FROM quotations WHERE is_archived = 0 ORDER BY id ASC',
      invoices:
        'SELECT invoice_number, invoice_date, due_date, customer_name, company_name, reference_quotation_number, total_amount_due, amount_paid, remaining_balance, status, created_at FROM invoices WHERE is_archived = 0 ORDER BY id ASC',
      payments:
        'SELECT p.payment_number, p.payment_date, i.invoice_number, i.customer_name, p.amount, p.payment_method, p.reference_number, p.recorded_by FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.is_archived = 0 ORDER BY p.id ASC',
      'service-reports':
        'SELECT report_number, service_date, job_type, customer_name, service_location, equipment_serviced, technician_name, materials_total_cost, status, created_at FROM service_reports WHERE is_archived = 0 ORDER BY id ASC',
      'billing-statements':
        'SELECT statement_number, statement_date, period_from, period_to, customer_name, previous_balance, total_charges, total_payments, outstanding_balance, created_at FROM billing_statements WHERE is_archived = 0 ORDER BY id ASC',
    };

    const sql = queryMap[entity];
    if (!sql) return res.status(400).json({ error: 'Unknown export entity.' });

    const rows = await dbAll(sql);
    const cols = rows.length > 0 ? Object.keys(rows[0]) : ['no_records'];
    const escapeCsv = (v) => {
      const s = String(v ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [
      cols.join(','),
      ...rows.map((r) => cols.map((c) => escapeCsv(r[c])).join(',')),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="johnrois-${entity}-${todayYMD()}.csv"`
    );
    res.send('\uFEFF' + lines.join('\r\n'));
  })
);

// ============================================================================
// STATIC FRONTEND SERVING & CENTRAL ERROR HANDLER
// ============================================================================

const DIST_DIR = path.join(ROOT_DIR, 'dist');
const LEGACY_BUNDLE_DIR = path.join(ROOT_DIR, 'app-bundle');
const STATIC_DIR = fs.existsSync(DIST_DIR) ? DIST_DIR : LEGACY_BUNDLE_DIR;

app.use(express.static(STATIC_DIR));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found.' });
  }
  const activeDir = fs.existsSync(path.join(DIST_DIR, 'index.html'))
    ? DIST_DIR
    : LEGACY_BUNDLE_DIR;
  const indexHtml = path.join(activeDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }
  res.status(200).send('Building frontend assets...');
});

// Central JSON error handler (Multer file-size errors, malformed JSON, unexpected server errors)
app.use((err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Uploaded image exceeds the 10 MB limit.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request payload is too large.' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON request body.' });
  }
  console.error('Server error:', err);
  res.status(err?.status || 500).json({
    error: err?.message || 'An unexpected server error occurred.',
  });
});

export default app;

const isDirectEntry =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectEntry && !process.env.VERCEL && process.env.NO_LISTEN !== '1') {
  ensureDbReady()
    .then(() => {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Johnrois Business Management System running on http://0.0.0.0:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to initialize database:', err);
      process.exit(1);
    });
}
