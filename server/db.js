import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

const IS_VERCEL = Boolean(process.env.VERCEL);
const TURSO_URL = (process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || '').trim();
const TURSO_TOKEN = (process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || '').trim();
const POSTGRES_URL = (
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  ''
).trim();
const CUSTOM_SQLITE_PATH = (process.env.SQLITE_DB_PATH || '').trim();

function resolveWritableDir(preferredDir, fallbackSubdir) {
  try {
    if (!fs.existsSync(preferredDir)) {
      fs.mkdirSync(preferredDir, { recursive: true });
    }
    fs.accessSync(preferredDir, fs.constants.W_OK);
    return { dir: preferredDir, writable: true };
  } catch (_) {
    const tmpDir = path.join(os.tmpdir(), 'johnrois-erp', fallbackSubdir);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    return { dir: tmpDir, writable: false };
  }
}

const dataDirInfo = resolveWritableDir(path.join(ROOT_DIR, 'data'), 'data');
const uploadsDirInfo = resolveWritableDir(path.join(ROOT_DIR, 'uploads'), 'uploads');

export const DATA_DIR = dataDirInfo.dir;
export const UPLOADS_DIR = uploadsDirInfo.dir;
export const DB_PATH = CUSTOM_SQLITE_PATH || path.join(DATA_DIR, 'johnrois.sqlite');

const txContext = new AsyncLocalStorage();

let adapter = null;
let initPromise = null;
let storageStatus = {
  engine: 'initializing',
  persistent: false,
  is_serverless: IS_VERCEL,
  setup_required: false,
  message: '',
};

export function getStorageStatus() {
  return storageStatus;
}

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

// ============================================================================
// PORTABLE SQL HELPERS FOR POSTGRESQL TRANSLATION
// ============================================================================

const SERIAL_ID_TABLES = new Set([
  'users',
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
]);

function translateSqlForPostgres(sql, wantReturningId = false) {
  let out = '';
  let paramIdx = 0;
  let inSingle = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      out += ch;
      if (inSingle && sql[i + 1] === "'") {
        out += "'";
        i++;
      } else {
        inSingle = !inSingle;
      }
      continue;
    }
    if (!inSingle && ch === '?') {
      paramIdx++;
      out += `$${paramIdx}`;
    } else {
      out += ch;
    }
  }

  // Case-insensitive LIKE in PostgreSQL to match SQLite's default ASCII LIKE behavior
  out = out.replace(/\bLIKE\b/gi, 'ILIKE');

  if (wantReturningId) {
    const trimmed = out.trim().replace(/;$/, '');
    const insertMatch = trimmed.match(/^INSERT\s+INTO\s+([a-zA-Z0-9_]+)/i);
    if (
      insertMatch &&
      SERIAL_ID_TABLES.has(insertMatch[1].toLowerCase()) &&
      !/\bRETURNING\b/i.test(trimmed) &&
      !/\bON\s+CONFLICT\b/i.test(trimmed)
    ) {
      out = `${trimmed} RETURNING id`;
    }
  }

  return out;
}

// ============================================================================
// SCHEMA DEFINITIONS (SQLITE/LIBSQL & POSTGRESQL)
// ============================================================================

const SQLITE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
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
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS business_settings (
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
  )`,
  `CREATE TABLE IF NOT EXISTS document_sequences (
    seq_key TEXT PRIMARY KEY,
    last_val INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS idempotency_keys (
    idem_key TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS uploaded_files (
    filename TEXT PRIMARY KEY,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    data_base64 TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
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
  )`,
  `CREATE TABLE IF NOT EXISTS products_services (
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
  )`,
  `CREATE TABLE IF NOT EXISTS quotations (
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
  )`,
  `CREATE TABLE IF NOT EXISTS quotation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products_services(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'pcs',
    unit_price REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS invoices (
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
  )`,
  `CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products_services(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'pcs',
    unit_price REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
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
  )`,
  `CREATE TABLE IF NOT EXISTS service_reports (
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
  )`,
  `CREATE TABLE IF NOT EXISTS service_report_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_report_id INTEGER NOT NULL REFERENCES service_reports(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    material_name TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT 'pcs',
    unit_cost REAL NOT NULL DEFAULT 0,
    line_cost REAL NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS service_report_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_report_id INTEGER NOT NULL REFERENCES service_reports(id) ON DELETE CASCADE,
    photo_type TEXT NOT NULL CHECK(photo_type IN ('before', 'after')),
    photo_url TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS billing_statements (
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
  )`,
  `CREATE TABLE IF NOT EXISTS billing_statement_lines (
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
  )`,
  `CREATE TABLE IF NOT EXISTS activity_logs (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status)`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_service_reports_customer ON service_reports(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_billing_statements_customer ON billing_statements(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC)`,
];

function toPostgresDdl(sqliteStmt) {
  return sqliteStmt
    .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
    .replace(/\s+COLLATE\s+NOCASE/gi, '')
    .replace(/\bREAL\b/gi, 'DOUBLE PRECISION');
}

// ============================================================================
// ADAPTER INITIALIZERS
// ============================================================================

async function createPostgresAdapter(connectionString) {
  const pgMod = await import('pg');
  const pg = pgMod.default || pgMod;
  // Parse BIGINT (OID 20) & NUMERIC (OID 1700) as JS numbers to match SQLite semantics
  pg.types.setTypeParser(20, (val) => (val === null ? null : Number(val)));
  pg.types.setTypeParser(1700, (val) => (val === null ? null : Number(val)));

  const needsSsl =
    !/localhost|127\.0\.0\.1/.test(connectionString) &&
    !/sslmode=disable/i.test(connectionString);

  const pool = new pg.Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });

  const getExecutor = () => txContext.getStore() || pool;

  return {
    type: 'postgres',
    async initSchema() {
      for (const stmt of SQLITE_SCHEMA_STATEMENTS) {
        await pool.query(toPostgresDdl(stmt));
      }
    },
    async get(sql, params = []) {
      const pgSql = translateSqlForPostgres(sql, false);
      const res = await getExecutor().query(pgSql, params);
      return res.rows[0] || undefined;
    },
    async all(sql, params = []) {
      const pgSql = translateSqlForPostgres(sql, false);
      const res = await getExecutor().query(pgSql, params);
      return res.rows;
    },
    async run(sql, params = []) {
      const pgSql = translateSqlForPostgres(sql, true);
      const res = await getExecutor().query(pgSql, params);
      return {
        changes: res.rowCount || 0,
        lastInsertRowid: res.rows?.[0]?.id ?? null,
      };
    },
    async transaction(fn) {
      if (txContext.getStore()) {
        return fn();
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await txContext.run(client, fn);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch (_) {}
        throw err;
      } finally {
        client.release();
      }
    },
    async syncSequencesAfterRestore() {
      for (const tbl of SERIAL_ID_TABLES) {
        await pool.query(
          `SELECT setval(pg_get_serial_sequence('${tbl}', 'id'), COALESCE((SELECT MAX(id) FROM ${tbl}), 1), (SELECT MAX(id) IS NOT NULL FROM ${tbl}))`
        );
      }
    },
  };
}

async function createLibsqlAdapter(url, authToken) {
  const { createClient } = await import('@libsql/client');
  const client = createClient({
    url,
    authToken: authToken || undefined,
  });

  const getExecutor = () => txContext.getStore() || client;

  const normalizeRow = (row) => {
    if (!row) return undefined;
    const plain = {};
    for (const k of Object.keys(row)) {
      const v = row[k];
      plain[k] = typeof v === 'bigint' ? Number(v) : v;
    }
    return plain;
  };

  return {
    type: 'turso',
    async initSchema() {
      for (const stmt of SQLITE_SCHEMA_STATEMENTS) {
        await client.execute(stmt);
      }
    },
    async get(sql, params = []) {
      const res = await getExecutor().execute({ sql, args: params });
      return normalizeRow(res.rows[0]);
    },
    async all(sql, params = []) {
      const res = await getExecutor().execute({ sql, args: params });
      return res.rows.map(normalizeRow);
    },
    async run(sql, params = []) {
      const res = await getExecutor().execute({ sql, args: params });
      return {
        changes: res.rowsAffected || 0,
        lastInsertRowid:
          res.lastInsertRowid !== undefined && res.lastInsertRowid !== null
            ? Number(res.lastInsertRowid)
            : null,
      };
    },
    async transaction(fn) {
      if (txContext.getStore()) {
        return fn();
      }
      const tx = await client.transaction('write');
      try {
        const result = await txContext.run(tx, fn);
        await tx.commit();
        return result;
      } catch (err) {
        try {
          await tx.rollback();
        } catch (_) {}
        throw err;
      } finally {
        tx.close();
      }
    },
    async syncSequencesAfterRestore() {},
  };
}

async function createNodeSqliteAdapter(sqliteFilePath) {
  const { DatabaseSync } = await import('node:sqlite');
  const dir = path.dirname(sqliteFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const sqlite = new DatabaseSync(sqliteFilePath);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec('PRAGMA busy_timeout = 5000;');

  let inTx = false;

  return {
    type: 'sqlite',
    rawDb: sqlite,
    async initSchema() {
      for (const stmt of SQLITE_SCHEMA_STATEMENTS) {
        sqlite.exec(stmt);
      }
    },
    async get(sql, params = []) {
      return sqlite.prepare(sql).get(...params);
    },
    async all(sql, params = []) {
      return sqlite.prepare(sql).all(...params);
    },
    async run(sql, params = []) {
      const info = sqlite.prepare(sql).run(...params);
      return {
        changes: Number(info.changes || 0),
        lastInsertRowid:
          info.lastInsertRowid !== undefined && info.lastInsertRowid !== null
            ? Number(info.lastInsertRowid)
            : null,
      };
    },
    async transaction(fn) {
      if (inTx) {
        return fn();
      }
      sqlite.exec('BEGIN IMMEDIATE TRANSACTION;');
      inTx = true;
      try {
        const result = await fn();
        sqlite.exec('COMMIT;');
        return result;
      } catch (err) {
        try {
          sqlite.exec('ROLLBACK;');
        } catch (_) {}
        throw err;
      } finally {
        inTx = false;
      }
    },
    async syncSequencesAfterRestore() {},
  };
}

export async function ensureDbReady() {
  if (adapter) return adapter;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (POSTGRES_URL) {
      adapter = await createPostgresAdapter(POSTGRES_URL);
      storageStatus = {
        engine: 'postgres',
        persistent: true,
        is_serverless: IS_VERCEL,
        setup_required: false,
        message: 'Connected to persistent PostgreSQL database.',
      };
    } else if (TURSO_URL) {
      adapter = await createLibsqlAdapter(TURSO_URL, TURSO_TOKEN);
      storageStatus = {
        engine: 'turso',
        persistent: true,
        is_serverless: IS_VERCEL,
        setup_required: false,
        message: 'Connected to persistent Turso / LibSQL cloud database.',
      };
    } else if (IS_VERCEL && !CUSTOM_SQLITE_PATH) {
      const ephemeralPath = path.join(os.tmpdir(), 'johnrois-ephemeral.sqlite');
      adapter = await createNodeSqliteAdapter(ephemeralPath);
      storageStatus = {
        engine: 'sqlite-ephemeral',
        persistent: false,
        is_serverless: true,
        setup_required: true,
        message:
          'Persistent database is not configured on Vercel yet. Connect Neon / Vercel Postgres (DATABASE_URL) or Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN) in Vercel Project Settings → Storage / Environment Variables so saved records and uploads persist permanently across cold starts and redeployments.',
      };
    } else {
      adapter = await createNodeSqliteAdapter(DB_PATH);
      storageStatus = {
        engine: 'sqlite',
        persistent: dataDirInfo.writable || Boolean(CUSTOM_SQLITE_PATH),
        is_serverless: false,
        setup_required: false,
        message: `Connected to persistent SQLite database (${DB_PATH}).`,
      };
    }

    await adapter.initSchema();

    // Ensure singleton business_settings row exists using ONLY verified public details & editable blank fields
    const existingSettings = await adapter.get('SELECT id FROM business_settings WHERE id = 1');
    if (!existingSettings) {
      await adapter.run(
        `INSERT INTO business_settings (
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
        )`,
        [nowISO()]
      );
    }

    return adapter;
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

export async function dbGet(sql, params = []) {
  const ad = await ensureDbReady();
  return ad.get(sql, params);
}

export async function dbAll(sql, params = []) {
  const ad = await ensureDbReady();
  return ad.all(sql, params);
}

export async function dbRun(sql, params = []) {
  const ad = await ensureDbReady();
  return ad.run(sql, params);
}

export async function runInTransaction(fn) {
  const ad = await ensureDbReady();
  return ad.transaction(fn);
}

export async function syncSequencesAfterRestore() {
  const ad = await ensureDbReady();
  return ad.syncSequencesAfterRestore();
}

// ============================================================================
// PERSISTENT FILE UPLOADS (STORED IN DATABASE + LOCAL CACHE WHEN WRITABLE)
// ============================================================================

const EXT_TO_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export async function saveUploadedFile({ filename, mimeType, buffer }) {
  const safeName = path.basename(filename);
  const ext = path.extname(safeName).toLowerCase();
  const resolvedMime = mimeType || EXT_TO_MIME[ext] || 'application/octet-stream';
  const b64 = buffer.toString('base64');

  await dbRun(
    `INSERT INTO uploaded_files (filename, mime_type, byte_size, data_base64, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (filename) DO UPDATE SET
       mime_type = EXCLUDED.mime_type,
       byte_size = EXCLUDED.byte_size,
       data_base64 = EXCLUDED.data_base64,
       created_at = EXCLUDED.created_at`,
    [safeName, resolvedMime, buffer.length, b64, nowISO()]
  );

  // Also cache to local uploads directory when writable for fast static access
  if (uploadsDirInfo.writable) {
    try {
      fs.writeFileSync(path.join(UPLOADS_DIR, safeName), buffer);
    } catch (_) {}
  }

  return {
    url: `/uploads/${safeName}`,
    filename: safeName,
    mime_type: resolvedMime,
  };
}

export async function getUploadedFile(filename) {
  const safeName = path.basename(String(filename || ''));
  if (!safeName || safeName === '.gitkeep') return null;

  const row = await dbGet(
    'SELECT filename, mime_type, data_base64 FROM uploaded_files WHERE filename = ?',
    [safeName]
  );
  if (row && row.data_base64) {
    return {
      filename: row.filename,
      mime_type: row.mime_type,
      buffer: Buffer.from(row.data_base64, 'base64'),
    };
  }

  // Fallback to legacy local disk file if present, and migrate into DB
  const diskPath = path.join(UPLOADS_DIR, safeName);
  if (fs.existsSync(diskPath) && fs.statSync(diskPath).isFile()) {
    const buffer = fs.readFileSync(diskPath);
    const ext = path.extname(safeName).toLowerCase();
    const mime_type = EXT_TO_MIME[ext] || 'image/png';
    try {
      await saveUploadedFile({ filename: safeName, mimeType: mime_type, buffer });
    } catch (_) {}
    return { filename: safeName, mime_type, buffer };
  }

  return null;
}

export async function resolveUploadBufferFromUrl(urlPath) {
  if (!urlPath || typeof urlPath !== 'string') return null;
  let cleanPath = urlPath.trim();
  try {
    if (/^https?:\/\//i.test(cleanPath)) {
      cleanPath = new URL(cleanPath).pathname;
    }
  } catch (_) {}
  if (!cleanPath.includes('/uploads/')) return null;
  const fname = path.basename(cleanPath);
  const fileObj = await getUploadedFile(fname);
  if (!fileObj) return null;
  // PDFKit supports PNG and JPEG buffers natively
  if (!['image/png', 'image/jpeg', 'image/jpg'].includes(fileObj.mime_type.toLowerCase())) {
    const ext = path.extname(fname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) return null;
  }
  return fileObj.buffer;
}

// ============================================================================
// BUSINESS SETTINGS, SEQUENCES & ACCOUNTING DOMAIN LOGIC
// ============================================================================

export async function getSettings() {
  return dbGet('SELECT * FROM business_settings WHERE id = 1');
}

export function formatDocNumber(settings, type, nextVal, yearStr) {
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

export async function previewNextDocNumber(type, dateStr = todayYMD()) {
  const settings = await getSettings();
  const yearStr = dateStr && dateStr.length >= 4 ? dateStr.slice(0, 4) : todayYMD().slice(0, 4);
  const seqKey =
    type === 'customer' || type === 'product'
      ? type.toUpperCase()
      : `${type.toUpperCase()}-${yearStr}`;
  const row = await dbGet('SELECT last_val FROM document_sequences WHERE seq_key = ?', [seqKey]);
  const nextVal = (row ? Number(row.last_val) : 0) + 1;
  return formatDocNumber(settings, type, nextVal, yearStr);
}

export async function allocateNextDocNumber(type, dateStr = todayYMD()) {
  const settings = await getSettings();
  const yearStr = dateStr && dateStr.length >= 4 ? dateStr.slice(0, 4) : todayYMD().slice(0, 4);
  const seqKey =
    type === 'customer' || type === 'product'
      ? type.toUpperCase()
      : `${type.toUpperCase()}-${yearStr}`;

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

  let attempts = 0;
  while (attempts < 1000) {
    attempts++;
    const existing = await dbGet('SELECT last_val FROM document_sequences WHERE seq_key = ?', [
      seqKey,
    ]);
    const nextVal = (existing ? Number(existing.last_val) : 0) + 1;
    if (existing) {
      await dbRun('UPDATE document_sequences SET last_val = ? WHERE seq_key = ?', [
        nextVal,
        seqKey,
      ]);
    } else {
      await dbRun('INSERT INTO document_sequences (seq_key, last_val) VALUES (?, ?)', [
        seqKey,
        nextVal,
      ]);
    }
    const candidate = formatDocNumber(settings, type, nextVal, yearStr);
    const collision = await dbGet(`SELECT id FROM ${table} WHERE ${col} = ?`, [candidate]);
    if (!collision) return candidate;
  }
  throw new Error(`Unable to allocate unique document number for ${type}`);
}

export async function logActivity({
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
  await dbRun(
    `INSERT INTO activity_logs (
      entity_type, entity_id, document_number, customer_id, customer_name,
      action, summary, amount, actor_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entity_type,
      entity_id,
      document_number || '',
      customer_id,
      customer_name || '',
      action,
      summary,
      amount !== null && amount !== undefined ? round2(amount) : null,
      actor_name || 'Shop Workspace',
      nowISO(),
    ]
  );
}

export async function recalculateInvoicePaymentState(invoiceId) {
  const inv = await dbGet('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
  if (!inv) return null;

  const payAgg = await dbGet(
    `SELECT COALESCE(SUM(amount), 0) as total_paid
     FROM payments
     WHERE invoice_id = ?`,
    [invoiceId]
  );

  const latestPayment = await dbGet(
    `SELECT payment_method, payment_date
     FROM payments
     WHERE invoice_id = ?
     ORDER BY payment_date DESC, id DESC
     LIMIT 1`,
    [invoiceId]
  );

  const amountPaid = round2(payAgg?.total_paid || 0);
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

  await dbRun(
    `UPDATE invoices
     SET amount_paid = ?,
         remaining_balance = ?,
         payment_method = ?,
         payment_date = ?,
         status = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      amountPaid,
      remaining,
      latestPayment ? latestPayment.payment_method : '',
      latestPayment ? latestPayment.payment_date : '',
      status,
      nowISO(),
      invoiceId,
    ]
  );

  return dbGet('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
}

export async function refreshTimeSensitiveStatuses() {
  if (!storageStatus.persistent) return;
  const today = todayYMD();
  await dbRun(
    `UPDATE invoices
     SET status = 'Overdue'
     WHERE is_archived = 0
       AND remaining_balance > 0.009
       AND due_date != ''
       AND due_date < ?
       AND status != 'Overdue'`,
    [today]
  );

  await dbRun(
    `UPDATE quotations
     SET status = 'Expired'
     WHERE is_archived = 0
       AND status = 'Sent'
       AND valid_until != ''
       AND valid_until < ?`,
    [today]
  );
}

export async function computeCustomerStatementLedger(customerId, periodFrom, periodTo) {
  const prevInvRow = await dbGet(
    `SELECT COALESCE(SUM(total_amount_due), 0) as total
     FROM invoices
     WHERE customer_id = ?
       AND is_archived = 0
       AND invoice_date < ?`,
    [customerId, periodFrom]
  );

  const prevPayRow = await dbGet(
    `SELECT COALESCE(SUM(p.amount), 0) as total
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     WHERE i.customer_id = ?
       AND i.is_archived = 0
       AND p.payment_date < ?`,
    [customerId, periodFrom]
  );

  const previousBalance = round2((prevInvRow?.total || 0) - (prevPayRow?.total || 0));

  const periodInvoices = await dbAll(
    `SELECT id, invoice_number, invoice_date, project_name, reference_quotation_number, total_amount_due
     FROM invoices
     WHERE customer_id = ?
       AND is_archived = 0
       AND invoice_date >= ?
       AND invoice_date <= ?
     ORDER BY invoice_date ASC, id ASC`,
    [customerId, periodFrom, periodTo]
  );

  const periodPayments = await dbAll(
    `SELECT p.id, p.payment_number, p.payment_date, p.amount, p.payment_method, p.reference_number, p.notes,
            i.invoice_number, i.invoice_date
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     WHERE i.customer_id = ?
       AND i.is_archived = 0
       AND p.payment_date >= ?
       AND p.payment_date <= ?
     ORDER BY p.payment_date ASC, p.id ASC`,
    [customerId, periodFrom, periodTo]
  );

  const rawEntries = [];

  for (const inv of periodInvoices) {
    const descParts = [`Invoice ${inv.invoice_number}`];
    if (inv.project_name) descParts.push(`— ${inv.project_name}`);
    else if (inv.reference_quotation_number) descParts.push(`(Ref: ${inv.reference_quotation_number})`);
    rawEntries.push({
      tx_date: inv.invoice_date,
      sort_priority: 1,
      tx_type: 'invoice',
      source_id: Number(inv.id),
      reference_number: inv.invoice_number,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      description: descParts.join(' '),
      debit: round2(inv.total_amount_due),
      credit: 0,
    });
  }

  for (const pay of periodPayments) {
    const details = [`Payment ${pay.payment_number} (${pay.payment_method}) for ${pay.invoice_number}`];
    if (pay.reference_number) details.push(`[Ref: ${pay.reference_number}]`);
    rawEntries.push({
      tx_date: pay.payment_date,
      sort_priority: 2,
      tx_type: 'payment',
      source_id: Number(pay.id),
      reference_number: pay.payment_number,
      invoice_number: pay.invoice_number,
      invoice_date: pay.invoice_date,
      description: details.join(' '),
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
