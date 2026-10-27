import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Eye,
  Edit3,
  Trash2,
  ArrowRightCircle,
  CheckCircle2,
  Send,
  FileText,
  Download,
} from 'lucide-react';
import {
  AuthUser,
  BusinessSettings,
  Customer,
  LineItem,
  NavigationTarget,
  Quotation,
  QuotationStatus,
} from '../types';
import {
  addDaysYMD,
  apiFetch,
  downloadAuthenticatedFile,
  formatDate,
  formatPHP,
  generateIdempotencyKey,
  todayYMD,
} from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { CustomerPicker } from '../components/CustomerPicker';
import { LineItemsEditor } from '../components/LineItemsEditor';
import { PrintableDocument } from '../components/PrintableDocument';

interface QuotationsPageProps {
  user: AuthUser;
  settings: BusinessSettings;
  initialOpenId?: number;
  initialCreateNew?: boolean;
  prefillCustomerId?: number;
  onClearInitial: () => void;
  onNavigate: (target: NavigationTarget) => void;
}

const QUOTATION_STATUSES: QuotationStatus[] = ['Draft', 'Sent', 'Approved', 'Rejected', 'Expired'];

export const QuotationsPage: React.FC<QuotationsPageProps> = ({
  user,
  settings,
  initialOpenId,
  initialCreateNew,
  prefillCustomerId,
  onClearInitial,
  onNavigate,
}) => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [mode, setMode] = useState<'list' | 'form' | 'preview'>('list');
  const [activeQuote, setActiveQuote] = useState<Quotation | null>(null);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [idemKey, setIdemKey] = useState('');

  // Form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewNumber, setPreviewNumber] = useState('');
  const [dateIssued, setDateIssued] = useState(todayYMD());
  const [validUntil, setValidUntil] = useState(
    addDaysYMD(todayYMD(), settings.default_quotation_validity_days || 15)
  );
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [saveAsCustomer, setSaveAsCustomer] = useState(true);
  const [customerName, setCustomerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [savedLocations, setSavedLocations] = useState<string[]>([]);
  const [projectName, setProjectName] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [items, setItems] = useState<LineItem[]>([
    { product_id: null, description: '', quantity: 1, unit: 'unit', unit_price: 0, line_total: 0 },
  ]);
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [discountValue, setDiscountValue] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(Boolean(settings.tax_enabled));
  const [taxLabel, setTaxLabel] = useState(settings.tax_label || 'VAT');
  const [taxRate, setTaxRate] = useState(settings.tax_rate || 12);
  const [paymentTerms, setPaymentTerms] = useState(settings.default_payment_terms || '');
  const [deliverySchedule, setDeliverySchedule] = useState('');
  const [remarks, setRemarks] = useState(settings.default_notes || '');
  const [preparedBy, setPreparedBy] = useState(user.full_name || '');
  const [authorizedSignatory, setAuthorizedSignatory] = useState(
    settings.authorized_representative || ''
  );
  const [status, setStatus] = useState<QuotationStatus>('Draft');

  const fetchQuotations = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);

    apiFetch<{ quotations: Quotation[] }>(`/api/quotations?${params.toString()}`)
      .then((res) => setQuotations(res.quotations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchQuotations();
  }, [statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (initialOpenId) {
      openPreviewById(initialOpenId);
      onClearInitial();
    } else if (initialCreateNew) {
      startCreateNew(prefillCustomerId);
      onClearInitial();
    }
  }, [initialOpenId, initialCreateNew, prefillCustomerId]);

  const startCreateNew = async (preCustomerId?: number) => {
    setEditingId(null);
    setError('');
    setNotice('');
    setIdemKey(generateIdempotencyKey());
    const today = todayYMD();
    setDateIssued(today);
    setValidUntil(addDaysYMD(today, settings.default_quotation_validity_days || 15));
    setCustomerId(null);
    setSaveAsCustomer(true);
    setCustomerName('');
    setCompanyName('');
    setCustomerAddress('');
    setContactNumber('');
    setCustomerEmail('');
    setSavedLocations([]);
    setProjectName('');
    setProjectLocation('');
    setItems([
      { product_id: null, description: '', quantity: 1, unit: 'unit', unit_price: 0, line_total: 0 },
    ]);
    setDiscountType('fixed');
    setDiscountValue(0);
    setTaxEnabled(Boolean(settings.tax_enabled));
    setTaxLabel(settings.tax_label || 'VAT');
    setTaxRate(settings.tax_rate || 12);
    setPaymentTerms(settings.default_payment_terms || '');
    setDeliverySchedule('');
    setRemarks(settings.default_notes || '');
    setPreparedBy(user.full_name || '');
    setAuthorizedSignatory(settings.authorized_representative || '');
    setStatus('Draft');

    apiFetch<{ next_number: string }>(`/api/quotations/next-number?date=${today}`)
      .then((r) => setPreviewNumber(r.next_number))
      .catch(() => setPreviewNumber('Auto-generated'));

    if (preCustomerId) {
      apiFetch<{ customer: Customer }>(`/api/customers/${preCustomerId}`)
        .then((r) => applyCustomer(r.customer))
        .catch(() => {});
    }

    setMode('form');
  };

  const applyCustomer = (c: Customer | null) => {
    if (!c) {
      setCustomerId(null);
      setSavedLocations([]);
      return;
    }
    setCustomerId(c.id);
    setCustomerName(c.customer_name);
    setCompanyName(c.company_name || '');
    setCustomerAddress(c.billing_address || '');
    setContactNumber(c.contact_number || '');
    setCustomerEmail(c.email || '');
    const locs = (c.project_locations || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    setSavedLocations(locs);
    if (locs.length > 0 && !projectLocation) {
      setProjectLocation(locs[0]);
    }
  };

  const openEditById = async (id: number) => {
    setError('');
    setNotice('');
    try {
      const res = await apiFetch<{ quotation: Quotation }>(`/api/quotations/${id}`);
      const q = res.quotation;
      setEditingId(q.id);
      setPreviewNumber(q.quotation_number);
      setDateIssued(q.date_issued);
      setValidUntil(q.valid_until || '');
      setCustomerId(q.customer_id);
      setSaveAsCustomer(false);
      setCustomerName(q.customer_name);
      setCompanyName(q.company_name || '');
      setCustomerAddress(q.customer_address || '');
      setContactNumber(q.contact_number || '');
      setCustomerEmail(q.customer_email || '');
      setProjectName(q.project_name || '');
      setProjectLocation(q.project_location || '');
      setItems(
        q.items && q.items.length > 0
          ? q.items
          : [{ product_id: null, description: '', quantity: 1, unit: 'unit', unit_price: 0, line_total: 0 }]
      );
      setDiscountType(q.discount_type || 'fixed');
      setDiscountValue(q.discount_value || 0);
      setTaxEnabled(Boolean(q.tax_enabled));
      setTaxLabel(q.tax_label || 'VAT');
      setTaxRate(q.tax_rate || 0);
      setPaymentTerms(q.payment_terms || '');
      setDeliverySchedule(q.delivery_schedule || '');
      setRemarks(q.remarks || '');
      setPreparedBy(q.prepared_by || '');
      setAuthorizedSignatory(q.authorized_signatory || '');
      setStatus(q.status);
      setMode('form');
    } catch (err: any) {
      setError(err.message || 'Unable to load quotation.');
    }
  };

  const openPreviewById = async (id: number) => {
    setError('');
    try {
      const res = await apiFetch<{ quotation: Quotation }>(`/api/quotations/${id}`);
      setActiveQuote(res.quotation);
      setMode('preview');
    } catch (err: any) {
      setError(err.message || 'Unable to load quotation.');
    }
  };

  const handleSave = async (overrideStatus?: QuotationStatus) => {
    if (!customerName.trim()) {
      setError('Customer name is required.');
      return;
    }
    const validItems = items.filter((it) => it.description.trim() !== '');
    if (validItems.length === 0) {
      setError('Please add at least one product or service item with a description.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        date_issued: dateIssued,
        valid_until: validUntil,
        customer_id: customerId,
        save_as_customer: !customerId && saveAsCustomer,
        customer_name: customerName,
        company_name: companyName,
        customer_address: customerAddress,
        contact_number: contactNumber,
        customer_email: customerEmail,
        project_name: projectName,
        project_location: projectLocation,
        items: validItems,
        discount_type: discountType,
        discount_value: discountValue,
        tax_enabled: taxEnabled,
        tax_label: taxLabel,
        tax_rate: taxRate,
        payment_terms: paymentTerms,
        delivery_schedule: deliverySchedule,
        remarks,
        prepared_by: preparedBy,
        authorized_signatory: authorizedSignatory,
        status: overrideStatus || status,
      };

      const res = editingId
        ? await apiFetch<{ quotation: Quotation }>(`/api/quotations/${editingId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ quotation: Quotation }>('/api/quotations', {
            method: 'POST',
            idempotencyKey: idemKey,
            body: JSON.stringify(payload),
          });

      setActiveQuote(res.quotation);
      fetchQuotations();
      setMode('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to save quotation.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatusChange = async (newStatus: QuotationStatus) => {
    if (!activeQuote) return;
    try {
      const res = await apiFetch<{ quotation: Quotation }>(
        `/api/quotations/${activeQuote.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        }
      );
      setActiveQuote(res.quotation);
      setNotice(`Quotation status updated to ${newStatus}.`);
      fetchQuotations();
    } catch (err: any) {
      setError(err.message || 'Failed to update status.');
    }
  };

  const handleConvertToInvoice = async (quoteId: number) => {
    setConverting(true);
    setError('');
    try {
      const res = await apiFetch<{ invoice: { id: number; invoice_number: string } }>(
        `/api/quotations/${quoteId}/convert-to-invoice`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      onNavigate({ section: 'invoices', openId: res.invoice.id });
    } catch (err: any) {
      if (err.status === 409 && err.data?.existing_invoice_id) {
        onNavigate({ section: 'invoices', openId: err.data.existing_invoice_id });
      } else {
        setError(err.message || 'Failed to convert quotation to invoice.');
      }
    } finally {
      setConverting(false);
    }
  };

  const handleArchive = async (q: Quotation) => {
    if (!window.confirm(`Archive quotation ${q.quotation_number}?`)) return;
    try {
      await apiFetch(`/api/quotations/${q.id}`, { method: 'DELETE' });
      fetchQuotations();
      if (mode === 'preview') setMode('list');
    } catch (err: any) {
      setError(err.message || 'Failed to archive quotation.');
    }
  };

  if (mode === 'preview' && activeQuote) {
    return (
      <div className="space-y-3">
        {notice && (
          <div className="no-print p-3 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')} className="underline">
              Dismiss
            </button>
          </div>
        )}
        {error && (
          <div className="no-print p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {error}
          </div>
        )}

        <PrintableDocument
          doc={{ type: 'quotation', data: activeQuote }}
          settings={settings}
          onBack={() => {
            setNotice('');
            setMode('list');
          }}
          onEdit={() => openEditById(activeQuote.id)}
          extraActions={
            <>
              <select
                value={activeQuote.status}
                onChange={(e) => handleQuickStatusChange(e.target.value as QuotationStatus)}
                aria-label="Quotation Status"
                className="px-2.5 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800"
              >
                {QUOTATION_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    Status: {st}
                  </option>
                ))}
              </select>

              {activeQuote.status !== 'Approved' && (
                <button
                  type="button"
                  onClick={() => handleQuickStatusChange('Approved')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark Approved
                </button>
              )}

              {activeQuote.status === 'Approved' && (
                <button
                  type="button"
                  disabled={converting}
                  onClick={() => handleConvertToInvoice(activeQuote.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-sky-700 text-white text-xs font-semibold hover:bg-sky-800 disabled:opacity-50"
                >
                  <ArrowRightCircle className="w-3.5 h-3.5" />
                  {activeQuote.converted_invoice_id
                    ? `Open Invoice (${activeQuote.converted_invoice_number || 'Converted'})`
                    : converting
                      ? 'Converting...'
                      : 'Convert to Invoice'}
                </button>
              )}
            </>
          }
        />
      </div>
    );
  }

  if (mode === 'form') {
    return (
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {editingId ? `Edit Quotation ${previewNumber}` : 'Create New Quotation'}
            </h1>
            <p className="text-xs text-slate-600">
              Quotation Number: <span className="font-semibold text-slate-900 tabular-nums">{previewNumber}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMode('list')}
            className="px-3.5 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>

        {error && (
          <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-md p-5 space-y-6">
          {/* Document Meta */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Quotation No.
              </label>
              <input
                type="text"
                readOnly
                value={previewNumber}
                className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-300 rounded font-semibold tabular-nums text-slate-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Date Issued <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                required
                value={dateIssued}
                onChange={(e) => setDateIssued(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Valid Until
              </label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as QuotationStatus)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              >
                {QUOTATION_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Customer Selector & Details */}
          <CustomerPicker
            selectedCustomerId={customerId}
            saveAsCustomer={saveAsCustomer}
            onToggleSaveAsCustomer={setSaveAsCustomer}
            onSelectCustomer={applyCustomer}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Customer Name <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Full name of client / contact person"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Company Name (If Applicable)
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Restaurant, hotel, contractor, or company name"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Customer Address
              </label>
              <input
                type="text"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Street, Barangay, City"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Contact Number
              </label>
              <input
                type="text"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="e.g., 0917 XXX XXXX"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Project Name
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g., Commercial Kitchen Stainless Setup / Gate & Railings"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Project Location
              </label>
              <input
                type="text"
                list="saved-customer-locations"
                value={projectLocation}
                onChange={(e) => setProjectLocation(e.target.value)}
                placeholder="Site installation / delivery address"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
              {savedLocations.length > 0 && (
                <datalist id="saved-customer-locations">
                  {savedLocations.map((l, i) => (
                    <option key={i} value={l} />
                  ))}
                </datalist>
              )}
            </div>
          </div>

          {/* Line Items & Automatic Calculations */}
          <LineItemsEditor
            items={items}
            onChange={setItems}
            discountType={discountType}
            discountValue={discountValue}
            onDiscountChange={(t, v) => {
              setDiscountType(t);
              setDiscountValue(v);
            }}
            taxEnabled={taxEnabled}
            taxLabel={taxLabel}
            taxRate={taxRate}
            onTaxChange={(en, lbl, rt) => {
              setTaxEnabled(en);
              setTaxLabel(lbl);
              setTaxRate(rt);
            }}
            totalLabel="GRAND TOTAL"
          />

          {/* Terms, Schedule, Remarks & Signatories */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Payment Terms
              </label>
              <textarea
                rows={2}
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="e.g., 50% Downpayment upon confirmation; 50% Balance upon completion"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Delivery or Completion Schedule
              </label>
              <textarea
                rows={2}
                value={deliverySchedule}
                onChange={(e) => setDeliverySchedule(e.target.value)}
                placeholder="e.g., 10–14 working days upon receipt of downpayment"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Remarks / Scope Conditions
              </label>
              <textarea
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Additional fabrication specifications, material grade notes, warranty, or exclusions"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Prepared By
              </label>
              <input
                type="text"
                value={preparedBy}
                onChange={(e) => setPreparedBy(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Authorized Signatory Name
              </label>
              <input
                type="text"
                value={authorizedSignatory}
                onChange={(e) => setAuthorizedSignatory(e.target.value)}
                placeholder="Configure default in Business Settings or enter here"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="px-4 py-2 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            {!editingId && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave('Sent')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded border border-sky-700 bg-sky-50 text-sky-900 text-xs font-semibold hover:bg-sky-100 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                Save & Mark Sent
              </button>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave()}
              className="px-5 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Saving Quotation...' : editingId ? 'Save Changes' : 'Save Quotation'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Quotations</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Generate fabrication quotations, track client approvals, and convert approved quotes directly into invoices.
          </p>
        </div>
        <button
          type="button"
          onClick={() => startCreateNew()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Quotation
        </button>
      </div>

      {error && (
        <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white border border-slate-200 rounded-md p-3.5 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchQuotations();
          }}
          className="flex-1 min-w-[220px] flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quotation #, customer, company, or project..."
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 rounded bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          >
            Search
          </button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded bg-white"
        >
          <option value="all">All Statuses</option>
          <option value="Pending">Pending (Draft & Sent)</option>
          {QUOTATION_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <span>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2 py-1.5 border border-slate-300 rounded text-xs"
          />
          <span>To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2 py-1.5 border border-slate-300 rounded text-xs"
          />
        </div>
      </div>

      {/* Quotations Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading quotations...</div>
        ) : quotations.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <FileText className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No quotations found</p>
            <p className="text-xs text-slate-500">
              Click "+ New Quotation" to create an itemized stainless steel fabrication quotation.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-600">
                <tr>
                  <th className="py-3 px-4 text-left font-semibold">Quotation #</th>
                  <th className="py-3 px-4 text-left font-semibold">Date Issued</th>
                  <th className="py-3 px-4 text-left font-semibold">Valid Until</th>
                  <th className="py-3 px-4 text-left font-semibold">Customer</th>
                  <th className="py-3 px-4 text-left font-semibold">Project</th>
                  <th className="py-3 px-4 text-right font-semibold">Grand Total</th>
                  <th className="py-3 px-4 text-left font-semibold">Status</th>
                  <th className="py-3 px-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotations.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900 tabular-nums">
                      <button
                        type="button"
                        onClick={() => openPreviewById(q.id)}
                        className="hover:text-sky-700 hover:underline"
                      >
                        {q.quotation_number}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums">
                      {formatDate(q.date_issued)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums">
                      {formatDate(q.valid_until)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{q.customer_name}</div>
                      {q.company_name && <div className="text-xs text-slate-500">{q.company_name}</div>}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 max-w-[200px] truncate">
                      {q.project_name || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                      {formatPHP(q.grand_total)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={q.status} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openPreviewById(q.id)}
                          title="View & Print"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditById(q.id)}
                          title="Edit"
                          className="p-1.5 text-slate-600 hover:text-sky-700 hover:bg-slate-100 rounded"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadAuthenticatedFile(
                              `/api/quotations/${q.id}/pdf`,
                              `${q.quotation_number}.pdf`
                            )
                          }
                          title="Download PDF"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {q.status === 'Approved' && (
                          <button
                            type="button"
                            onClick={() => handleConvertToInvoice(q.id)}
                            title="Convert to Invoice"
                            className="p-1.5 text-sky-700 hover:bg-sky-50 rounded"
                          >
                            <ArrowRightCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleArchive(q)}
                          title="Archive"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
