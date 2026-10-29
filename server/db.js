import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

const IS_VERCEL = Boolean(process.env.VERCEL);
const CUSTOM_SQLITE_PATH = (process.env.SQLITE_DB_PATH || '').trim();

// ============================================================================
// CANONICAL MULTI-BUSINESS TENANT REGISTRY
// ============================================================================

export const BUSINESS_DEFINITIONS = [
  {
    id: 1,
    slug: 'john-rois',
    aliases: ['1', 'john-rois', 'johnrois'],
    default_name: 'John Rois Stainless Steel Fabrication Shop',
    short_code: 'JR',
  },
  {
    id: 2,
    slug: 'jrec',
    aliases: ['2', 'jrec'],
    default_name: 'JREC Stainless Steel Fabrication',
    short_code: 'JREC',
  },
];

export function resolveBusinessIdentity(rawInput) {
  if (rawInput === null || rawInput === undefined) return null;
  const normalized = String(rawInput).trim().toLowerCase();
  if (!normalized) return null;
  for (const biz of BUSINESS_DEFINITIONS) {
    if (biz.aliases.includes(normalized)) {
      return biz;
    }
  }
  return null;
}

const EXPLICIT_POSTGRES_ENV_KEYS = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'NEON_DATABASE_URL',
  'NEON_POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
];

export function resolvePostgresConnection(env = process.env) {
  for (const key of EXPLICIT_POSTGRES_ENV_KEYS) {
    const val = (env[key] || '').trim();
    if (/^postgres(ql)?:\/\//i.test(val)) {
      return {
        connectionString: val,
        envSource: key,
        isNeon: /\.neon\.tech\b/i.test(val),
      };
    }
  }

  for (const [key, rawVal] of Object.entries(env)) {
    if (
      /(?:^|_)(?:DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL|DATABASE_URL_UNPOOLED|POSTGRES_URL_NON_POOLING)$/i.test(
        key
      )
    ) {
      const val = String(rawVal || '').trim();
      if (/^postgres(ql)?:\/\//i.test(val)) {
        return {
          connectionString: val,
          envSource: key,
          isNeon: /\.neon\.tech\b/i.test(val),
        };
      }
    }
  }

  const host = (env.PGHOST || env.POSTGRES_HOST || '').trim();
  const user = (env.PGUSER || env.POSTGRES_USER || '').trim();
  const password = env.PGPASSWORD || env.POSTGRES_PASSWORD || '';
  const database = (env.PGDATABASE || env.POSTGRES_DATABASE || '').trim();
  const port = (env.PGPORT || env.POSTGRES_PORT || '5432').trim();
  if (host && user && database) {
    const sslMode = /^(localhost|127\.0\.0\.1|::1)$/i.test(host) ? 'disable' : 'require';
    const built = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}?sslmode=${sslMode}`;
    return {
      connectionString: built,
      envSource: env.PGHOST ? 'PGHOST' : 'POSTGRES_HOST',
      isNeon: /\.neon\.tech\b/i.test(host),
    };
  }

  return null;
}

export function buildPgPoolConfig(rawConnectionString, env = process.env) {
  let cleanUrl = rawConnectionString.trim();
  let needsSsl =
    !/localhost|127\.0\.0\.1|::1/i.test(cleanUrl) && !/sslmode=disable/i.test(cleanUrl);

  try {
    const parsed = new URL(cleanUrl);
    const sslMode = (parsed.searchParams.get('sslmode') || env.PGSSLMODE || '').toLowerCase();
    const isLocalHost = /^(localhost|127\.0\.0\.1|::1)$/i.test(parsed.hostname);

    if (sslMode === 'disable' || sslMode === 'allow') {
      needsSsl = false;
    } else if (sslMode) {
      needsSsl = true;
    } else {
      needsSsl = !isLocalHost;
    }

    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('ssl');
    parsed.searchParams.delete('uselibpqcompat');
    parsed.searchParams.delete('channel_binding');
    cleanUrl = parsed.toString();
  } catch (_) {}

  const maxConnections = env.PG_POOL_MAX
    ? Math.max(1, Number(env.PG_POOL_MAX) || 3)
    : env.VERCEL
      ? 3
      : 10;

  return {
    connectionString: cleanUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
    enableChannelBinding: Boolean(needsSsl),
    max: maxConnections,
    idleTimeoutMillis: env.VERCEL ? 10000 : 30000,
    connectionTimeoutMillis: 15000,
    allowExitOnIdle: true,
    keepAlive: true,
  };
}

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
  migration_verified: false,
  message: '',
};

export function getStorageStatus() {
  return storageStatus;
}

export function round2(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function nowISO() {
  return new Date().toISOString();
}

export function todayYMD() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
  'employees',
  'payslips',
  'certificates_of_employment',
  'employee_id_cards',
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
// SCHEMA DEFINITIONS (MULTI-BUSINESS ISOLATED)
// ============================================================================

const BUSINESS_UNIQUE_CODE_COLUMNS = [
  ['customers', 'customer_code'],
  ['products_services', 'item_code'],
  ['quotations', 'quotation_number'],
  ['invoices', 'invoice_number'],
  ['payments', 'payment_number'],
  ['service_reports', 'report_number'],
  ['billing_statements', 'statement_number'],
  ['employees', 'employee_code'],
  ['payslips', 'payslip_number'],
  ['certificates_of_employment', 'certificate_number'],
  ['employee_id_cards', 'card_number'],
];

const BUSINESS_OWNED_TABLES = [
  'business_settings',
  'document_sequences',
  'idempotency_keys',
  'uploaded_files',
  'customers',
  'products_services',
  'quotations',
  'invoices',
  'payments',
  'service_reports',
  'billing_statements',
  'employees',
  'payslips',
  'certificates_of_employment',
  'employee_id_cards',
  'activity_logs',
];

const SQLITE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    default_name TEXT NOT NULL,
    short_code TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
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
    id INTEGER PRIMARY KEY,
    business_id INTEGER NOT NULL DEFAULT 1,
    business_name TEXT NOT NULL DEFAULT 'John Rois Stainless Steel Fabrication Shop',
    logo_url TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    contact_number TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    facebook_url TEXT NOT NULL DEFAULT '',
    maps_url TEXT NOT NULL DEFAULT '',
    other_social_links TEXT NOT NULL DEFAULT '',
    operating_hours TEXT NOT NULL DEFAULT '',
    quotation_prefix TEXT NOT NULL DEFAULT 'QTN',
    invoice_prefix TEXT NOT NULL DEFAULT 'INV',
    service_report_prefix TEXT NOT NULL DEFAULT 'SR',
    billing_statement_prefix TEXT NOT NULL DEFAULT 'SOA',
    customer_prefix TEXT NOT NULL DEFAULT 'CUST',
    product_prefix TEXT NOT NULL DEFAULT 'ITEM',
    payment_prefix TEXT NOT NULL DEFAULT 'PAY',
    employee_prefix TEXT NOT NULL DEFAULT 'EMP',
    payslip_prefix TEXT NOT NULL DEFAULT 'PSL',
    coe_prefix TEXT NOT NULL DEFAULT 'COE',
    id_card_prefix TEXT NOT NULL DEFAULT 'IDC',
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
    business_id INTEGER NOT NULL DEFAULT 1,
    last_val INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS idempotency_keys (
    idem_key TEXT PRIMARY KEY,
    business_id INTEGER NOT NULL DEFAULT 1,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS uploaded_files (
    filename TEXT PRIMARY KEY,
    business_id INTEGER NOT NULL DEFAULT 1,
    storage_path TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    data_base64 TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL DEFAULT 1,
    customer_code TEXT NOT NULL,
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
    updated_at TEXT NOT NULL,
    UNIQUE(business_id, customer_code)
  )`,
  `CREATE TABLE IF NOT EXISTS products_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL DEFAULT 1,
    item_code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Fabrication',
    material_grade TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT 'unit',
    unit_price REAL NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(business_id, item_code)
  )`,
  `CREATE TABLE IF NOT EXISTS quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL DEFAULT 1,
    quotation_number TEXT NOT NULL,
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
    updated_at TEXT NOT NULL,
    UNIQUE(business_id, quotation_number)
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
    business_id INTEGER NOT NULL DEFAULT 1,
    invoice_number TEXT NOT NULL,
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
    updated_at TEXT NOT NULL,
    UNIQUE(business_id, invoice_number)
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
    business_id INTEGER NOT NULL DEFAULT 1,
    payment_number TEXT NOT NULL,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    payment_date TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    reference_number TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    recorded_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(business_id, payment_number)
  )`,
  `CREATE TABLE IF NOT EXISTS service_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL DEFAULT 1,
    report_number TEXT NOT NULL,
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
    updated_at TEXT NOT NULL,
    UNIQUE(business_id, report_number)
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
    business_id INTEGER NOT NULL DEFAULT 1,
    statement_number TEXT NOT NULL,
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
    updated_at TEXT NOT NULL,
    UNIQUE(business_id, statement_number)
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
    business_id INTEGER NOT NULL DEFAULT 1,
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
  `CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL DEFAULT 1,
    employee_code TEXT NOT NULL,
    full_name TEXT NOT NULL,
    position_title TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT '',
    employment_type TEXT NOT NULL DEFAULT 'Regular',
    employment_status TEXT NOT NULL DEFAULT 'Active',
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    contact_number TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    emergency_contact_name TEXT NOT NULL DEFAULT '',
    emergency_contact_number TEXT NOT NULL DEFAULT '',
    pay_basis TEXT NOT NULL DEFAULT 'daily',
    default_rate REAL NOT NULL DEFAULT 0,
    photo_url TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(business_id, employee_code)
  )`,
  `CREATE TABLE IF NOT EXISTS payslips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL DEFAULT 1,
    payslip_number TEXT NOT NULL,
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    employee_code TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    position_title TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL DEFAULT '',
    pay_period_start TEXT NOT NULL,
    pay_period_end TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    pay_basis TEXT NOT NULL DEFAULT 'daily' CHECK(pay_basis IN ('daily', 'semi_monthly', 'monthly', 'hourly')),
    base_rate REAL NOT NULL DEFAULT 0,
    days_worked REAL NOT NULL DEFAULT 0,
    hours_worked REAL NOT NULL DEFAULT 0,
    regular_pay REAL NOT NULL DEFAULT 0,
    overtime_hours REAL NOT NULL DEFAULT 0,
    overtime_rate REAL NOT NULL DEFAULT 0,
    overtime_pay REAL NOT NULL DEFAULT 0,
    allowances REAL NOT NULL DEFAULT 0,
    bonuses REAL NOT NULL DEFAULT 0,
    other_earnings REAL NOT NULL DEFAULT 0,
    other_earnings_note TEXT NOT NULL DEFAULT '',
    sss_deduction REAL NOT NULL DEFAULT 0,
    philhealth_deduction REAL NOT NULL DEFAULT 0,
    pagibig_deduction REAL NOT NULL DEFAULT 0,
    withholding_tax REAL NOT NULL DEFAULT 0,
    cash_advance REAL NOT NULL DEFAULT 0,
    other_deductions REAL NOT NULL DEFAULT 0,
    other_deductions_note TEXT NOT NULL DEFAULT '',
    total_earnings REAL NOT NULL DEFAULT 0,
    total_deductions REAL NOT NULL DEFAULT 0,
    net_pay REAL NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    remarks TEXT NOT NULL DEFAULT '',
    prepared_by TEXT NOT NULL DEFAULT '',
    approved_by TEXT NOT NULL DEFAULT '',
    employee_signature_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Issued' CHECK(status IN ('Draft', 'Issued', 'Paid')),
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(business_id, payslip_number)
  )`,
  `CREATE TABLE IF NOT EXISTS certificates_of_employment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL DEFAULT 1,
    certificate_number TEXT NOT NULL,
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    employee_code TEXT NOT NULL DEFAULT '',
    employee_name TEXT NOT NULL,
    position_title TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT '',
    employment_type TEXT NOT NULL DEFAULT '',
    employment_status TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL DEFAULT '',
    date_issued TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT '',
    include_salary INTEGER NOT NULL DEFAULT 0,
    salary_amount REAL NOT NULL DEFAULT 0,
    salary_period TEXT NOT NULL DEFAULT 'monthly',
    custom_body TEXT NOT NULL DEFAULT '',
    signatory_name TEXT NOT NULL DEFAULT '',
    signatory_title TEXT NOT NULL DEFAULT '',
    signature_url TEXT NOT NULL DEFAULT '',
    remarks TEXT NOT NULL DEFAULT '',
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(business_id, certificate_number)
  )`,
  `CREATE TABLE IF NOT EXISTS employee_id_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL DEFAULT 1,
    card_number TEXT NOT NULL,
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    employee_code TEXT NOT NULL,
    full_name TEXT NOT NULL,
    position_title TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT '',
    photo_url TEXT NOT NULL DEFAULT '',
    contact_number TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    emergency_contact_name TEXT NOT NULL DEFAULT '',
    emergency_contact_number TEXT NOT NULL DEFAULT '',
    blood_type TEXT NOT NULL DEFAULT '',
    date_issued TEXT NOT NULL,
    expiration_date TEXT NOT NULL DEFAULT '',
    authorized_signatory TEXT NOT NULL DEFAULT '',
    authorized_title TEXT NOT NULL DEFAULT '',
    signature_url TEXT NOT NULL DEFAULT '',
    back_notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Expired', 'Revoked')),
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(business_id, card_number)
  )`,
];

function toPostgresDdl(sqliteStmt) {
  return sqliteStmt
    .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
    .replace(/\s+COLLATE\s+NOCASE/gi, '')
    .replace(/\bREAL\b/gi, 'DOUBLE PRECISION');
}

// ============================================================================
// SAFE NON-DESTRUCTIVE MIGRATIONS FOR EXISTING PRODUCTION DATABASES
// ============================================================================

const POSTGRES_COLUMN_MIGRATIONS = [
  "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS signature_url TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS other_social_links TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS operating_hours TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS authorized_representative TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS authorized_title TEXT NOT NULL DEFAULT 'Authorized Representative'",
  "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS tax_enabled INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS tax_label TEXT NOT NULL DEFAULT 'VAT'",
  "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS tax_rate DOUBLE PRECISION NOT NULL DEFAULT 0",
  "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS employee_prefix TEXT NOT NULL DEFAULT 'EMP'",
  "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS payslip_prefix TEXT NOT NULL DEFAULT 'PSL'",
  "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS coe_prefix TEXT NOT NULL DEFAULT 'COE'",
  "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS id_card_prefix TEXT NOT NULL DEFAULT 'IDC'",
  "ALTER TABLE document_sequences ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS storage_path TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_archived INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE products_services ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE products_services ADD COLUMN IF NOT EXISTS is_archived INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS converted_invoice_id INTEGER DEFAULT NULL",
  "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS is_archived INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_archived INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE payments ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE service_reports ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE service_reports ADD COLUMN IF NOT EXISTS technician_signature_url TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE service_reports ADD COLUMN IF NOT EXISTS customer_signature_url TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE service_reports ADD COLUMN IF NOT EXISTS is_archived INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE billing_statements ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE billing_statements ADD COLUMN IF NOT EXISTS is_archived INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE employees ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE payslips ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE certificates_of_employment ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE employee_id_cards ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1",
];

const POST_MIGRATION_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id)',
  'CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)',
  'CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id)',
  'CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id)',
  'CREATE INDEX IF NOT EXISTS idx_service_reports_customer ON service_reports(customer_id)',
  'CREATE INDEX IF NOT EXISTS idx_billing_statements_customer ON billing_statements(customer_id)',
  'CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active)',
  'CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id)',
  'CREATE INDEX IF NOT EXISTS idx_payslips_period ON payslips(pay_period_start, pay_period_end)',
  'CREATE INDEX IF NOT EXISTS idx_coe_employee ON certificates_of_employment(employee_id)',
  'CREATE INDEX IF NOT EXISTS idx_id_cards_employee ON employee_id_cards(employee_id)',
  'CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id)',
  'CREATE INDEX IF NOT EXISTS idx_products_business ON products_services(business_id)',
  'CREATE INDEX IF NOT EXISTS idx_quotations_business ON quotations(business_id)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_business ON invoices(business_id)',
  'CREATE INDEX IF NOT EXISTS idx_payments_business ON payments(business_id)',
  'CREATE INDEX IF NOT EXISTS idx_service_reports_business ON service_reports(business_id)',
  'CREATE INDEX IF NOT EXISTS idx_billing_statements_business ON billing_statements(business_id)',
  'CREATE INDEX IF NOT EXISTS idx_employees_business ON employees(business_id)',
  'CREATE INDEX IF NOT EXISTS idx_payslips_business ON payslips(business_id)',
  'CREATE INDEX IF NOT EXISTS idx_coe_business ON certificates_of_employment(business_id)',
  'CREATE INDEX IF NOT EXISTS idx_id_cards_business ON employee_id_cards(business_id)',
  'CREATE INDEX IF NOT EXISTS idx_activity_logs_business ON activity_logs(business_id)',
  'CREATE INDEX IF NOT EXISTS idx_uploaded_files_business ON uploaded_files(business_id)',
  ...BUSINESS_UNIQUE_CODE_COLUMNS.map(
    ([tbl, col]) => `CREATE UNIQUE INDEX IF NOT EXISTS uidx_${tbl}_biz_${col} ON ${tbl}(business_id, ${col})`
  ),
];

const SQLITE_COLUMN_MIGRATIONS = [
  "ALTER TABLE business_settings ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE business_settings ADD COLUMN employee_prefix TEXT NOT NULL DEFAULT 'EMP'",
  "ALTER TABLE business_settings ADD COLUMN payslip_prefix TEXT NOT NULL DEFAULT 'PSL'",
  "ALTER TABLE business_settings ADD COLUMN coe_prefix TEXT NOT NULL DEFAULT 'COE'",
  "ALTER TABLE business_settings ADD COLUMN id_card_prefix TEXT NOT NULL DEFAULT 'IDC'",
  "ALTER TABLE document_sequences ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE idempotency_keys ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE uploaded_files ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE uploaded_files ADD COLUMN storage_path TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE customers ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE products_services ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE quotations ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE invoices ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE payments ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE service_reports ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE billing_statements ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE employees ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE payslips ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE certificates_of_employment ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE employee_id_cards ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE activity_logs ADD COLUMN business_id INTEGER NOT NULL DEFAULT 1",
];

function isTransientPostgresError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  if (
    ['57P01', '57P02', '57P03', '08000', '08003', '08006', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE'].includes(
      code
    )
  ) {
    return true;
  }
  const msg = String(err.message || '');
  return /Connection terminated unexpectedly|Client has encountered a connection error|server closed the connection unexpectedly|terminating connection due to administrator command/i.test(
    msg
  );
}

function normalizePostgresParams(params = []) {
  return params.map((p) => {
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p === undefined) return null;
    return p;
  });
}

async function createPostgresAdapter(connectionString) {
  const pgMod = await import('pg');
  const pg = pgMod.default || pgMod;
  pg.types.setTypeParser(20, (val) => (val === null ? null : Number(val)));
  pg.types.setTypeParser(1700, (val) => (val === null ? null : Number(val)));

  const poolConfig = buildPgPoolConfig(connectionString);
  const pool = new pg.Pool(poolConfig);

  pool.on('error', (err) => {
    console.warn('[db:postgres] Idle pooled connection closed:', err?.message || err);
  });

  const queryWithRetry = async (pgSql, rawParams = []) => {
    const cleanParams = normalizePostgresParams(rawParams);
    const activeTx = txContext.getStore();
    if (activeTx) {
      return activeTx.query(pgSql, cleanParams);
    }
    try {
      return await pool.query(pgSql, cleanParams);
    } catch (err) {
      if (isTransientPostgresError(err)) {
        return pool.query(pgSql, cleanParams);
      }
      throw err;
    }
  };

  return {
    type: 'postgres',
    pool,
    async initSchema() {
      let client;
      try {
        client = await pool.connect();
      } catch (err) {
        if (isTransientPostgresError(err)) {
          client = await pool.connect();
        } else {
          throw err;
        }
      }
      let locked = false;
      try {
        await client.query('SELECT pg_advisory_lock(84729104)');
        locked = true;

        for (const stmt of SQLITE_SCHEMA_STATEMENTS) {
          await client.query(toPostgresDdl(stmt));
        }

        // Remove legacy singleton CHECK (id = 1) constraint on business_settings so row id=2 (JREC) can coexist safely
        const checkConstraints = await client.query(`
          SELECT con.conname
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
          WHERE nsp.nspname = current_schema()
            AND rel.relname = 'business_settings'
            AND con.contype = 'c'
        `);
        for (const row of checkConstraints.rows) {
          const safeConName = String(row.conname).replace(/"/g, '""');
          await client.query(`ALTER TABLE business_settings DROP CONSTRAINT IF EXISTS "${safeConName}"`);
        }

        for (const alterStmt of POSTGRES_COLUMN_MIGRATIONS) {
          await client.query(alterStmt);
        }

        // Replace legacy single-column UNIQUE constraints on code/number columns with composite (business_id, <col>) unique indexes
        for (const [tbl, col] of BUSINESS_UNIQUE_CODE_COLUMNS) {
          const singleUniqueRows = await client.query(
            `SELECT con.conname
             FROM pg_constraint con
             JOIN pg_class rel ON rel.oid = con.conrelid
             JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
             JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = con.conkey[1]
             WHERE nsp.nspname = current_schema()
               AND rel.relname = $1
               AND con.contype = 'u'
               AND array_length(con.conkey, 1) = 1
               AND att.attname = $2`,
            [tbl, col]
          );
          for (const uRow of singleUniqueRows.rows) {
            const safeConName = String(uRow.conname).replace(/"/g, '""');
            await client.query(`ALTER TABLE ${tbl} DROP CONSTRAINT IF EXISTS "${safeConName}"`);
          }
        }

        for (const idxStmt of POST_MIGRATION_INDEXES) {
          await client.query(idxStmt);
        }
      } finally {
        if (locked) {
          try {
            await client.query('SELECT pg_advisory_unlock(84729104)');
          } catch (_) {}
        }
        client.release();
      }
    },
    async get(sql, params = []) {
      const pgSql = translateSqlForPostgres(sql, false);
      const res = await queryWithRetry(pgSql, params);
      return res.rows[0] || undefined;
    },
    async all(sql, params = []) {
      const pgSql = translateSqlForPostgres(sql, false);
      const res = await queryWithRetry(pgSql, params);
      return res.rows;
    },
    async run(sql, params = []) {
      const pgSql = translateSqlForPostgres(sql, true);
      const res = await queryWithRetry(pgSql, params);
      return {
        changes: res.rowCount || 0,
        lastInsertRowid: res.rows?.[0]?.id ?? null,
      };
    },
    async transaction(fn) {
      if (txContext.getStore()) {
        return fn();
      }
      let client;
      try {
        client = await pool.connect();
      } catch (err) {
        if (isTransientPostgresError(err)) {
          client = await pool.connect();
        } else {
          throw err;
        }
      }
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
        await queryWithRetry(
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
      for (const alterStmt of SQLITE_COLUMN_MIGRATIONS) {
        try {
          await client.execute(alterStmt);
        } catch (_) {}
      }
      for (const idxStmt of POST_MIGRATION_INDEXES) {
        try {
          await client.execute(idxStmt);
        } catch (_) {}
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

function upgradeLegacySqliteIfNeeded(sqlite) {
  const bsMeta = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'business_settings'")
    .get();
  if (bsMeta?.sql && /CHECK\s*\(\s*id\s*=\s*1\s*\)/i.test(bsMeta.sql)) {
    sqlite.exec('PRAGMA foreign_keys = OFF;');
    try {
      sqlite.exec('ALTER TABLE business_settings RENAME TO _legacy_business_settings;');
      const createBsStmt = SQLITE_SCHEMA_STATEMENTS.find((s) =>
        s.includes('CREATE TABLE IF NOT EXISTS business_settings')
      );
      sqlite.exec(createBsStmt);
      const oldCols = sqlite
        .prepare('PRAGMA table_info(_legacy_business_settings)')
        .all()
        .map((c) => c.name);
      const newCols = sqlite
        .prepare('PRAGMA table_info(business_settings)')
        .all()
        .map((c) => c.name);
      const sharedCols = oldCols.filter((c) => newCols.includes(c));
      if (sharedCols.length > 0) {
        const colList = sharedCols.join(', ');
        sqlite.exec(
          `INSERT INTO business_settings (${colList}) SELECT ${colList} FROM _legacy_business_settings;`
        );
      }
      sqlite.exec('DROP TABLE _legacy_business_settings;');
    } finally {
      sqlite.exec('PRAGMA foreign_keys = ON;');
    }
  }

  // Upgrade any legacy single-column UNIQUE table in local SQLite dev DB to composite UNIQUE(business_id, col)
  for (const [tbl, col] of BUSINESS_UNIQUE_CODE_COLUMNS) {
    const meta = sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tbl);
    if (
      meta?.sql &&
      new RegExp(`\\b${col}\\s+TEXT\\s+UNIQUE`, 'i').test(meta.sql) &&
      !/UNIQUE\s*\(\s*business_id/i.test(meta.sql)
    ) {
      sqlite.exec('PRAGMA foreign_keys = OFF;');
      try {
        sqlite.exec(`ALTER TABLE ${tbl} RENAME TO _legacy_${tbl};`);
        const createStmt = SQLITE_SCHEMA_STATEMENTS.find((s) =>
          s.includes(`CREATE TABLE IF NOT EXISTS ${tbl} (`)
        );
        sqlite.exec(createStmt);
        const oldCols = sqlite
          .prepare(`PRAGMA table_info(_legacy_${tbl})`)
          .all()
          .map((c) => c.name);
        const newCols = sqlite
          .prepare(`PRAGMA table_info(${tbl})`)
          .all()
          .map((c) => c.name);
        const sharedCols = oldCols.filter((c) => newCols.includes(c));
        if (sharedCols.length > 0) {
          const colList = sharedCols.join(', ');
          sqlite.exec(`INSERT INTO ${tbl} (${colList}) SELECT ${colList} FROM _legacy_${tbl};`);
        }
        sqlite.exec(`DROP TABLE _legacy_${tbl};`);
      } finally {
        sqlite.exec('PRAGMA foreign_keys = ON;');
      }
    }
  }
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
      upgradeLegacySqliteIfNeeded(sqlite);
      for (const stmt of SQLITE_SCHEMA_STATEMENTS) {
        sqlite.exec(stmt);
      }
      for (const alterStmt of SQLITE_COLUMN_MIGRATIONS) {
        try {
          sqlite.exec(alterStmt);
        } catch (_) {}
      }
      for (const idxStmt of POST_MIGRATION_INDEXES) {
        sqlite.exec(idxStmt);
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

async function seedAndVerifyMultiBusinessData(ad) {
  const now = nowISO();

  // 1. Seed the two canonical businesses in `businesses`
  for (const biz of BUSINESS_DEFINITIONS) {
    await ad.run(
      `INSERT INTO businesses (id, slug, default_name, short_code, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [biz.id, biz.slug, biz.default_name, biz.short_code, now]
    );
  }

  // 2. Seed Business 1 (John Rois Stainless Steel Fabrication Shop) — preserves existing row 1 if present
  await ad.run(
    `INSERT INTO business_settings (
      id, business_id, business_name, logo_url, address, contact_number, email,
      facebook_url, maps_url, other_social_links, operating_hours,
      default_payment_terms, updated_at
    ) VALUES (
      1,
      1,
      'John Rois Stainless Steel Fabrication Shop',
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
    ON CONFLICT (id) DO NOTHING`,
    [now]
  );

  // Normalize untouched legacy default spelling on row 1 without modifying any other fields or logos
  await ad.run(
    `UPDATE business_settings
     SET business_name = 'John Rois Stainless Steel Fabrication Shop',
         business_id = 1
     WHERE id = 1 AND business_name = 'Johnrois Stainless Steel Fabrication Shop'`
  );
  await ad.run('UPDATE business_settings SET business_id = 1 WHERE id = 1 AND business_id != 1');

  // 3. Seed Business 2 (JREC Stainless Steel Fabrication) with independent clean settings & empty logo
  await ad.run(
    `INSERT INTO business_settings (
      id, business_id, business_name, logo_url, address, contact_number, email,
      facebook_url, maps_url, other_social_links, operating_hours,
      default_payment_terms, updated_at
    ) VALUES (
      2,
      2,
      'JREC Stainless Steel Fabrication',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '50% Downpayment upon confirmation; 50% Balance upon completion/delivery',
      ?
    )
    ON CONFLICT (id) DO NOTHING`,
    [now]
  );
  await ad.run('UPDATE business_settings SET business_id = 2 WHERE id = 2 AND business_id != 2');

  // 4. Namespace any pre-existing John Rois document_sequences keys under BIZ1: so JREC sequences start cleanly at 1
  await ad.run(
    `UPDATE document_sequences
     SET seq_key = 'BIZ1:' || seq_key,
         business_id = 1
     WHERE seq_key NOT LIKE 'BIZ%'`
  );

  // 5. Namespace legacy John Rois uploaded_files storage_path metadata without altering existing filenames
  await ad.run(
    `UPDATE uploaded_files
     SET storage_path = 'john-rois/' || filename
     WHERE business_id = 1 AND (storage_path IS NULL OR storage_path = '')`
  );

  // 6. Verify migration integrity: ensure both businesses & settings exist and no orphan business_id values exist
  const bizRows = await ad.all('SELECT id, slug FROM businesses ORDER BY id ASC');
  const settingsRows = await ad.all('SELECT id, business_id FROM business_settings ORDER BY id ASC');
  if (bizRows.length < 2 || settingsRows.length < 2) {
    throw new Error('Multi-business migration verification failed: expected 2 seeded businesses and settings.');
  }

  for (const tbl of BUSINESS_OWNED_TABLES) {
    const invalidRow = await ad.get(
      `SELECT COUNT(*) as cnt FROM ${tbl} WHERE business_id IS NULL OR business_id NOT IN (1, 2)`
    );
    if (Number(invalidRow?.cnt || 0) > 0) {
      throw new Error(
        `Multi-business migration verification failed: table ${tbl} has ${invalidRow.cnt} row(s) with invalid business_id.`
      );
    }
  }
}

export async function ensureDbReady() {
  if (adapter) return adapter;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const pgConfig = resolvePostgresConnection(process.env);
    const tursoUrl = (process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || '').trim();
    const tursoToken = (process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || '').trim();
    const customSqlitePath = (process.env.SQLITE_DB_PATH || '').trim();
    const isVercelRuntime = Boolean(process.env.VERCEL);

    let candidateAdapter;
    let nextStatus;

    if (pgConfig) {
      candidateAdapter = await createPostgresAdapter(pgConfig.connectionString);
      nextStatus = {
        engine: 'postgres',
        provider: pgConfig.isNeon ? 'neon' : 'postgres',
        env_source: pgConfig.envSource,
        persistent: true,
        is_serverless: isVercelRuntime,
        setup_required: false,
        migration_verified: false,
        message: pgConfig.isNeon
          ? `Connected to persistent Neon PostgreSQL database (${pgConfig.envSource}).`
          : `Connected to persistent PostgreSQL database (${pgConfig.envSource}).`,
      };
    } else if (tursoUrl) {
      candidateAdapter = await createLibsqlAdapter(tursoUrl, tursoToken);
      nextStatus = {
        engine: 'turso',
        provider: 'turso',
        env_source: process.env.TURSO_DATABASE_URL ? 'TURSO_DATABASE_URL' : 'LIBSQL_URL',
        persistent: true,
        is_serverless: isVercelRuntime,
        setup_required: false,
        migration_verified: false,
        message: 'Connected to persistent Turso / LibSQL cloud database.',
      };
    } else if (isVercelRuntime && !customSqlitePath) {
      const ephemeralPath = path.join(os.tmpdir(), 'johnrois-ephemeral.sqlite');
      candidateAdapter = await createNodeSqliteAdapter(ephemeralPath);
      nextStatus = {
        engine: 'sqlite-ephemeral',
        provider: 'ephemeral',
        env_source: null,
        persistent: false,
        is_serverless: true,
        setup_required: true,
        migration_verified: false,
        message:
          'Persistent database is not configured on Vercel yet. Connect Neon / Vercel Postgres (DATABASE_URL / POSTGRES_URL) or Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN) in Vercel Project Settings → Storage / Environment Variables and redeploy so saved records and uploads persist permanently.',
      };
    } else {
      const targetSqlitePath = customSqlitePath || DB_PATH;
      candidateAdapter = await createNodeSqliteAdapter(targetSqlitePath);
      nextStatus = {
        engine: 'sqlite',
        provider: 'sqlite',
        env_source: customSqlitePath ? 'SQLITE_DB_PATH' : 'local',
        persistent: dataDirInfo.writable || Boolean(customSqlitePath),
        is_serverless: false,
        setup_required: false,
        migration_verified: false,
        message: `Connected to persistent SQLite database (${targetSqlitePath}).`,
      };
    }

    await candidateAdapter.initSchema();
    await seedAndVerifyMultiBusinessData(candidateAdapter);
    nextStatus.migration_verified = true;

    adapter = candidateAdapter;
    storageStatus = nextStatus;
    return adapter;
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    storageStatus = {
      engine: 'error',
      persistent: false,
      is_serverless: Boolean(process.env.VERCEL),
      setup_required: false,
      migration_verified: false,
      message: `Database connection error: ${err?.message || 'Unable to connect to database'}`,
    };
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
// PERSISTENT BUSINESS-ISOLATED FILE UPLOADS
// ============================================================================

const EXT_TO_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export async function saveUploadedFile({ businessId = 1, filename, mimeType, buffer }) {
  const biz = resolveBusinessIdentity(businessId);
  if (!biz) {
    throw new Error('Valid business context is required to save uploaded files.');
  }

  const rawBase = path.basename(filename);
  const safeName = rawBase.startsWith(`${biz.slug}-`) ? rawBase : `${biz.slug}-${rawBase}`;
  const storagePath = `${biz.slug}/${safeName}`;
  const ext = path.extname(safeName).toLowerCase();
  const resolvedMime = mimeType || EXT_TO_MIME[ext] || 'application/octet-stream';
  const b64 = buffer.toString('base64');

  await dbRun(
    `INSERT INTO uploaded_files (filename, business_id, storage_path, mime_type, byte_size, data_base64, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (filename) DO UPDATE SET
       business_id = EXCLUDED.business_id,
       storage_path = EXCLUDED.storage_path,
       mime_type = EXCLUDED.mime_type,
       byte_size = EXCLUDED.byte_size,
       data_base64 = EXCLUDED.data_base64,
       created_at = EXCLUDED.created_at`,
    [safeName, biz.id, storagePath, resolvedMime, buffer.length, b64, nowISO()]
  );

  if (uploadsDirInfo.writable) {
    try {
      const bizDir = path.join(UPLOADS_DIR, biz.slug);
      if (!fs.existsSync(bizDir)) {
        fs.mkdirSync(bizDir, { recursive: true });
      }
      fs.writeFileSync(path.join(bizDir, safeName), buffer);
    } catch (_) {}
  }

  return {
    url: `/api/businesses/${biz.slug}/uploads/${safeName}`,
    filename: safeName,
    storage_path: storagePath,
    business_id: biz.id,
    mime_type: resolvedMime,
  };
}

export async function getUploadedFile(filename, businessId = 1) {
  const biz = resolveBusinessIdentity(businessId);
  if (!biz) return null;

  const safeName = path.basename(String(filename || ''));
  if (!safeName || safeName === '.gitkeep') return null;

  const row = await dbGet(
    'SELECT filename, business_id, mime_type, data_base64 FROM uploaded_files WHERE filename = ? AND business_id = ?',
    [safeName, biz.id]
  );
  if (row && row.data_base64) {
    return {
      filename: row.filename,
      business_id: Number(row.business_id),
      mime_type: row.mime_type,
      buffer: Buffer.from(row.data_base64, 'base64'),
    };
  }

  // Fallback to business-scoped disk cache (or legacy root uploads dir for Business 1 only)
  const candidateDiskPaths = [path.join(UPLOADS_DIR, biz.slug, safeName)];
  if (biz.id === 1) {
    candidateDiskPaths.push(path.join(UPLOADS_DIR, safeName));
  }

  for (const diskPath of candidateDiskPaths) {
    if (fs.existsSync(diskPath) && fs.statSync(diskPath).isFile()) {
      const buffer = fs.readFileSync(diskPath);
      const ext = path.extname(safeName).toLowerCase();
      const mime_type = EXT_TO_MIME[ext] || 'image/png';
      try {
        await dbRun(
          `INSERT INTO uploaded_files (filename, business_id, storage_path, mime_type, byte_size, data_base64, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (filename) DO NOTHING`,
          [safeName, biz.id, `${biz.slug}/${safeName}`, mime_type, buffer.length, buffer.toString('base64'), nowISO()]
        );
      } catch (_) {}
      return { filename: safeName, business_id: biz.id, mime_type, buffer };
    }
  }

  return null;
}

export async function resolveUploadBufferFromUrl(urlPath, businessId = 1) {
  const biz = resolveBusinessIdentity(businessId);
  if (!biz || !urlPath || typeof urlPath !== 'string') return null;

  let cleanPath = urlPath.trim();
  try {
    if (/^https?:\/\//i.test(cleanPath)) {
      cleanPath = new URL(cleanPath).pathname;
    }
  } catch (_) {}

  const bizScopedMatch = cleanPath.match(/^\/api\/businesses\/([^/]+)\/uploads\/([^/?#]+)$/i);
  let fname = '';
  if (bizScopedMatch) {
    const urlBiz = resolveBusinessIdentity(bizScopedMatch[1]);
    if (!urlBiz || urlBiz.id !== biz.id) {
      return null;
    }
    fname = path.basename(bizScopedMatch[2]);
  } else if (cleanPath.includes('/uploads/')) {
    // Legacy pre-multi-business upload paths belong exclusively to Business 1 (John Rois)
    if (biz.id !== 1) return null;
    fname = path.basename(cleanPath);
  } else {
    return null;
  }

  const fileObj = await getUploadedFile(fname, biz.id);
  if (!fileObj) return null;
  if (!['image/png', 'image/jpeg', 'image/jpg'].includes(fileObj.mime_type.toLowerCase())) {
    const ext = path.extname(fname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) return null;
  }
  return fileObj.buffer;
}

// ============================================================================
// BUSINESS SETTINGS, SEQUENCES & ACCOUNTING DOMAIN LOGIC (TENANT-SCOPED)
// ============================================================================

export async function getBusinessesSummary() {
  const rows = await dbAll(
    `SELECT b.id, b.slug, b.default_name, b.short_code,
            s.business_name, s.logo_url, s.address, s.contact_number
     FROM businesses b
     LEFT JOIN business_settings s ON s.id = b.id
     ORDER BY b.id ASC`
  );
  return rows.map((r) => ({
    id: Number(r.id),
    slug: r.slug,
    default_name: r.default_name,
    short_code: r.short_code,
    business_name: r.business_name || r.default_name,
    logo_url: r.logo_url || '',
    address: r.address || '',
    contact_number: r.contact_number || '',
  }));
}

export async function getSettings(businessId = 1) {
  const biz = resolveBusinessIdentity(businessId);
  if (!biz) throw new Error('Invalid business ID.');
  return dbGet('SELECT * FROM business_settings WHERE id = ?', [biz.id]);
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
    employee: settings.employee_prefix || 'EMP',
    payslip: settings.payslip_prefix || 'PSL',
    coe: settings.coe_prefix || 'COE',
    id_card: settings.id_card_prefix || 'IDC',
  };
  const prefix = (prefixMap[type] || 'DOC').trim().toUpperCase();
  const numPart = String(nextVal).padStart(pad, '0');
  if (type === 'customer' || type === 'product' || type === 'employee') {
    return `${prefix}-${numPart}`;
  }
  return includeYear ? `${prefix}-${yearStr}-${numPart}` : `${prefix}-${numPart}`;
}

function buildScopedSeqKey(businessId, type, yearStr) {
  const baseKey =
    type === 'customer' || type === 'product' || type === 'employee'
      ? type.toUpperCase()
      : `${type.toUpperCase()}-${yearStr}`;
  return `BIZ${businessId}:${baseKey}`;
}

export async function previewNextDocNumber(businessId, type, dateStr = todayYMD()) {
  const biz = resolveBusinessIdentity(businessId);
  if (!biz) throw new Error('Invalid business context.');
  const settings = await getSettings(biz.id);
  const yearStr = dateStr && dateStr.length >= 4 ? dateStr.slice(0, 4) : todayYMD().slice(0, 4);
  const seqKey = buildScopedSeqKey(biz.id, type, yearStr);
  const row = await dbGet(
    'SELECT last_val FROM document_sequences WHERE seq_key = ? AND business_id = ?',
    [seqKey, biz.id]
  );
  const nextVal = (row ? Number(row.last_val) : 0) + 1;
  return formatDocNumber(settings, type, nextVal, yearStr);
}

export async function allocateNextDocNumber(businessId, type, dateStr = todayYMD()) {
  const biz = resolveBusinessIdentity(businessId);
  if (!biz) throw new Error('Invalid business context.');
  const settings = await getSettings(biz.id);
  const yearStr = dateStr && dateStr.length >= 4 ? dateStr.slice(0, 4) : todayYMD().slice(0, 4);
  const seqKey = buildScopedSeqKey(biz.id, type, yearStr);

  const tableColumnMap = {
    quotation: ['quotations', 'quotation_number'],
    invoice: ['invoices', 'invoice_number'],
    service_report: ['service_reports', 'report_number'],
    billing_statement: ['billing_statements', 'statement_number'],
    customer: ['customers', 'customer_code'],
    product: ['products_services', 'item_code'],
    payment: ['payments', 'payment_number'],
    employee: ['employees', 'employee_code'],
    payslip: ['payslips', 'payslip_number'],
    coe: ['certificates_of_employment', 'certificate_number'],
    id_card: ['employee_id_cards', 'card_number'],
  };
  const [table, col] = tableColumnMap[type];

  let attempts = 0;
  while (attempts < 1000) {
    attempts++;
    const seqRow = await dbGet(
      `INSERT INTO document_sequences (seq_key, business_id, last_val)
       VALUES (?, ?, 1)
       ON CONFLICT (seq_key) DO UPDATE SET last_val = document_sequences.last_val + 1
       RETURNING last_val`,
      [seqKey, biz.id]
    );
    const nextVal = Number(seqRow?.last_val || 1);
    const candidate = formatDocNumber(settings, type, nextVal, yearStr);
    const collision = await dbGet(
      `SELECT id FROM ${table} WHERE business_id = ? AND ${col} = ?`,
      [biz.id, candidate]
    );
    if (!collision) return candidate;
  }
  throw new Error(`Unable to allocate unique document number for ${type}`);
}

export async function logActivity({
  business_id,
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
  const biz = resolveBusinessIdentity(business_id);
  if (!biz) throw new Error('Valid business_id is required for activity logging.');
  await dbRun(
    `INSERT INTO activity_logs (
      business_id, entity_type, entity_id, document_number, customer_id, customer_name,
      action, summary, amount, actor_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      biz.id,
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

export async function recalculateInvoicePaymentState(businessId, invoiceId) {
  const biz = resolveBusinessIdentity(businessId);
  if (!biz) return null;

  const inv = await dbGet('SELECT * FROM invoices WHERE id = ? AND business_id = ?', [
    invoiceId,
    biz.id,
  ]);
  if (!inv) return null;

  const payAgg = await dbGet(
    `SELECT COALESCE(SUM(amount), 0) as total_paid
     FROM payments
     WHERE invoice_id = ? AND business_id = ?`,
    [invoiceId, biz.id]
  );

  const latestPayment = await dbGet(
    `SELECT payment_method, payment_date
     FROM payments
     WHERE invoice_id = ? AND business_id = ?
     ORDER BY payment_date DESC, id DESC
     LIMIT 1`,
    [invoiceId, biz.id]
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
     WHERE id = ? AND business_id = ?`,
    [
      amountPaid,
      remaining,
      latestPayment ? latestPayment.payment_method : '',
      latestPayment ? latestPayment.payment_date : '',
      status,
      nowISO(),
      invoiceId,
      biz.id,
    ]
  );

  return dbGet('SELECT * FROM invoices WHERE id = ? AND business_id = ?', [invoiceId, biz.id]);
}

export async function refreshTimeSensitiveStatuses(businessId) {
  if (!storageStatus.persistent) return;
  const biz = resolveBusinessIdentity(businessId);
  const today = todayYMD();

  if (biz) {
    await dbRun(
      `UPDATE invoices
       SET status = 'Overdue'
       WHERE business_id = ?
         AND is_archived = 0
         AND remaining_balance > 0.009
         AND due_date != ''
         AND due_date < ?
         AND status != 'Overdue'`,
      [biz.id, today]
    );
    await dbRun(
      `UPDATE quotations
       SET status = 'Expired'
       WHERE business_id = ?
         AND is_archived = 0
         AND status = 'Sent'
         AND valid_until != ''
         AND valid_until < ?`,
      [biz.id, today]
    );
  } else {
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
}

export async function computeCustomerStatementLedger(
  businessId,
  customerId,
  periodFrom,
  periodTo
) {
  const biz = resolveBusinessIdentity(businessId);
  if (!biz) throw new Error('Invalid business context.');

  const prevInvRow = await dbGet(
    `SELECT COALESCE(SUM(total_amount_due), 0) as total
     FROM invoices
     WHERE business_id = ?
       AND customer_id = ?
       AND is_archived = 0
       AND invoice_date < ?`,
    [biz.id, customerId, periodFrom]
  );

  const prevPayRow = await dbGet(
    `SELECT COALESCE(SUM(p.amount), 0) as total
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id AND i.business_id = p.business_id
     WHERE p.business_id = ?
       AND i.customer_id = ?
       AND i.is_archived = 0
       AND p.payment_date < ?`,
    [biz.id, customerId, periodFrom]
  );

  const previousBalance = round2((prevInvRow?.total || 0) - (prevPayRow?.total || 0));

  const periodInvoices = await dbAll(
    `SELECT id, invoice_number, invoice_date, project_name, reference_quotation_number, total_amount_due
     FROM invoices
     WHERE business_id = ?
       AND customer_id = ?
       AND is_archived = 0
       AND invoice_date >= ?
       AND invoice_date <= ?
     ORDER BY invoice_date ASC, id ASC`,
    [biz.id, customerId, periodFrom, periodTo]
  );

  const periodPayments = await dbAll(
    `SELECT p.id, p.payment_number, p.payment_date, p.amount, p.payment_method, p.reference_number, p.notes,
            i.invoice_number, i.invoice_date
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id AND i.business_id = p.business_id
     WHERE p.business_id = ?
       AND i.customer_id = ?
       AND i.is_archived = 0
       AND p.payment_date >= ?
       AND p.payment_date <= ?
     ORDER BY p.payment_date ASC, p.id ASC`,
    [biz.id, customerId, periodFrom, periodTo]
  );

  const rawEntries = [];

  for (const inv of periodInvoices) {
    const descParts = [`Invoice ${inv.invoice_number}`];
    if (inv.project_name) descParts.push(`— ${inv.project_name}`);
    else if (inv.reference_quotation_number)
      descParts.push(`(Ref: ${inv.reference_quotation_number})`);
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
    const details = [
      `Payment ${pay.payment_number} (${pay.payment_method}) for ${pay.invoice_number}`,
    ];
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
