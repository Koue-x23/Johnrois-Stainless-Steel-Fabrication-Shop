export type UserRole = 'owner' | 'staff' | 'technician';

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_initial_setup?: boolean;
  is_active?: number;
  created_at?: string;
}

export interface BusinessSettings {
  id: number;
  business_name: string;
  logo_url: string;
  address: string;
  contact_number: string;
  email: string;
  facebook_url: string;
  maps_url: string;
  other_social_links: string;
  operating_hours: string;
  quotation_prefix: string;
  invoice_prefix: string;
  service_report_prefix: string;
  billing_statement_prefix: string;
  customer_prefix: string;
  product_prefix: string;
  payment_prefix: string;
  doc_number_padding: number;
  include_year_in_doc_num: number;
  default_payment_terms: string;
  default_quotation_validity_days: number;
  default_invoice_due_days: number;
  default_notes: string;
  authorized_representative: string;
  authorized_title: string;
  signature_url: string;
  tax_enabled: number;
  tax_label: string;
  tax_rate: number;
  updated_at: string;
}

export interface Customer {
  id: number;
  customer_code: string;
  customer_name: string;
  company_name: string;
  contact_number: string;
  email: string;
  billing_address: string;
  project_locations: string;
  remarks: string;
  is_archived: number;
  quotation_count?: number;
  invoice_count?: number;
  total_billed?: number;
  outstanding_balance?: number;
  created_at: string;
  updated_at: string;
}

export interface ProductService {
  id: number;
  item_code: string;
  name: string;
  description: string;
  category: string;
  material_grade: string;
  unit: string;
  unit_price: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

export interface LineItem {
  id?: number;
  product_id?: number | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
}

export type QuotationStatus = 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Expired';

export interface Quotation {
  id: number;
  quotation_number: string;
  date_issued: string;
  valid_until: string;
  customer_id: number | null;
  customer_name: string;
  company_name: string;
  customer_address: string;
  contact_number: string;
  customer_email: string;
  project_name: string;
  project_location: string;
  subtotal: number;
  discount_type: 'fixed' | 'percent';
  discount_value: number;
  discount_amount: number;
  tax_enabled: number;
  tax_label: string;
  tax_rate: number;
  tax_amount: number;
  grand_total: number;
  payment_terms: string;
  delivery_schedule: string;
  remarks: string;
  prepared_by: string;
  authorized_signatory: string;
  status: QuotationStatus;
  converted_invoice_id: number | null;
  converted_invoice_number?: string;
  items?: LineItem[];
  created_at: string;
  updated_at: string;
}

export type InvoiceStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'Overdue';

export interface PaymentRecord {
  id: number;
  payment_number: string;
  invoice_id: number;
  customer_id: number | null;
  invoice_number?: string;
  customer_name?: string;
  company_name?: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_number: string;
  notes: string;
  recorded_by: string;
  created_at: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  customer_id: number | null;
  customer_name: string;
  company_name: string;
  customer_address: string;
  contact_number: string;
  customer_email: string;
  quotation_id: number | null;
  reference_quotation_number: string;
  project_name: string;
  subtotal: number;
  discount_type: 'fixed' | 'percent';
  discount_value: number;
  discount_amount: number;
  tax_enabled: number;
  tax_label: string;
  tax_rate: number;
  tax_amount: number;
  total_amount_due: number;
  amount_paid: number;
  remaining_balance: number;
  payment_method: string;
  payment_date: string;
  payment_terms: string;
  remarks: string;
  prepared_by: string;
  authorized_signatory: string;
  status: InvoiceStatus;
  items?: LineItem[];
  payments?: PaymentRecord[];
  created_at: string;
  updated_at: string;
}

export type ServiceReportStatus = 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled';

export interface ServiceMaterialItem {
  id?: number;
  material_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  line_cost: number;
}

export interface ServicePhotoItem {
  id?: number;
  photo_type: 'before' | 'after';
  photo_url: string;
  caption: string;
}

export interface ServiceReport {
  id: number;
  report_number: string;
  service_date: string;
  job_type: string;
  customer_id: number | null;
  customer_name: string;
  company_name: string;
  contact_details: string;
  service_location: string;
  equipment_serviced: string;
  reported_problem: string;
  inspection_findings: string;
  work_performed: string;
  materials_total_cost: number;
  technician_name: string;
  start_time: string;
  completion_time: string;
  status: ServiceReportStatus;
  recommendations: string;
  customer_acknowledgment: number;
  customer_signatory_name: string;
  acknowledgment_date: string;
  technician_signature_url: string;
  customer_signature_url: string;
  remarks: string;
  materials?: ServiceMaterialItem[];
  photos?: ServicePhotoItem[];
  created_at: string;
  updated_at: string;
}

export interface BillingStatementLine {
  id?: number;
  sort_order: number;
  tx_date: string;
  tx_type: 'invoice' | 'payment';
  source_id: number;
  reference_number: string;
  invoice_number: string;
  invoice_date: string;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
}

export interface BillingStatement {
  id: number;
  statement_number: string;
  statement_date: string;
  period_from: string;
  period_to: string;
  customer_id: number;
  customer_name: string;
  company_name: string;
  customer_address: string;
  contact_number: string;
  customer_email: string;
  previous_balance: number;
  total_charges: number;
  total_payments: number;
  outstanding_balance: number;
  payment_terms: string;
  remarks: string;
  prepared_by: string;
  authorized_signatory: string;
  lines?: BillingStatementLine[];
  created_at: string;
  updated_at: string;
}

export type NavSection =
  | 'dashboard'
  | 'quotations'
  | 'invoices'
  | 'service-reports'
  | 'billing-statements'
  | 'customers'
  | 'products'
  | 'payments'
  | 'reports'
  | 'settings';

export interface NavigationTarget {
  section: NavSection;
  openId?: number;
  createNew?: boolean;
  prefillCustomerId?: number;
}
