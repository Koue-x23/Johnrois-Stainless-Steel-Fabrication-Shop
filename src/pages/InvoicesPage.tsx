import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Eye,
  Edit3,
  Trash2,
  CreditCard,
  Receipt,
  Download,
  X,
} from 'lucide-react';
import {
  AuthUser,
  BusinessSettings,
  Customer,
  Invoice,
  LineItem,
} from '../types';
import {
  addDaysYMD,
  apiFetch,
  downloadAuthenticatedFile,
  formatDate,
  formatPHP,
  generateIdempotencyKey,
  round2,
  todayYMD,
} from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { CustomerPicker } from '../components/CustomerPicker';
import { LineItemsEditor } from '../components/LineItemsEditor';
import { PrintableDocument } from '../components/PrintableDocument';

const PAYMENT_METHODS = [
  'Cash',
  'GCash',
  'Maya',
  'Bank Transfer - BDO',
  'Bank Transfer - BPI',
  'Bank Transfer - Metrobank',
  'Bank Transfer - Landbank',
  'Check',
  'Other',
];

interface InvoicesPageProps {
  user: AuthUser;
  settings: BusinessSettings;
  initialOpenId?: number;
  initialCreateNew?: boolean;
  prefillCustomerId?: number;
  onClearInitial: () => void;
}

export const InvoicesPage: React.FC<InvoicesPageProps> = ({
  user,
  settings,
  initialOpenId,
  initialCreateNew,
  prefillCustomerId,
  onClearInitial,
}) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [mode, setMode] = useState<'list' | 'form' | 'preview'>('list');
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [idemKey, setIdemKey] = useState('');

  // Payment Modal State
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payDate, setPayDate] = useState(todayYMD());
  const [payMethod, setPayMethod] = useState('Cash');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payIdemKey, setPayIdemKey] = useState('');
  const [recordingPay, setRecordingPay] = useState(false);

  // Form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewNumber, setPreviewNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayYMD());
  const [dueDate, setDueDate] = useState(
    addDaysYMD(todayYMD(), settings.default_invoice_due_days || 15)
  );
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [saveAsCustomer, setSaveAsCustomer] = useState(true);
  const [customerName, setCustomerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [referenceQuotationNumber, setReferenceQuotationNumber] = useState('');
  const [projectName, setProjectName] = useState('');
  const [items, setItems] = useState<LineItem[]>([
    { product_id: null, description: '', quantity: 1, unit: 'unit', unit_price: 0, line_total: 0 },
  ]);
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [discountValue, setDiscountValue] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(Boolean(settings.tax_enabled));
  const [taxLabel, setTaxLabel] = useState(settings.tax_label || 'VAT');
  const [taxRate, setTaxRate] = useState(settings.tax_rate || 12);
  const [initialPaymentAmount, setInitialPaymentAmount] = useState(0);
  const [initialPaymentMethod, setInitialPaymentMethod] = useState('Cash');
  const [initialPaymentDate, setInitialPaymentDate] = useState(todayYMD());
  const [initialPaymentRef, setInitialPaymentRef] = useState('');
  const [paymentTerms, setPaymentTerms] = useState(settings.default_payment_terms || '');
  const [remarks, setRemarks] = useState(settings.default_notes || '');
  const [preparedBy, setPreparedBy] = useState(user.full_name || '');
  const [authorizedSignatory, setAuthorizedSignatory] = useState(
    settings.authorized_representative || ''
  );

  const fetchInvoices = () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);

    apiFetch<{ invoices: Invoice[] }>(`/api/invoices?${params.toString()}`)
      .then((res) => setInvoices(res.invoices || []))
      .catch((err: any) => {
        setError(err.message || 'Failed to load invoices.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchInvoices();
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

  const applyCustomer = (c: Customer | null) => {
    if (!c) {
      setCustomerId(null);
      return;
    }
    setCustomerId(c.id);
    setCustomerName(c.customer_name);
    setCompanyName(c.company_name || '');
    setCustomerAddress(c.billing_address || '');
    setContactNumber(c.contact_number || '');
    setCustomerEmail(c.email || '');
  };

  const startCreateNew = (preCustomerId?: number) => {
    setEditingId(null);
    setError('');
    setNotice('');
    setIdemKey(generateIdempotencyKey());
    const today = todayYMD();
    setInvoiceDate(today);
    setDueDate(addDaysYMD(today, settings.default_invoice_due_days || 15));
    setCustomerId(null);
    setSaveAsCustomer(true);
    setCustomerName('');
    setCompanyName('');
    setCustomerAddress('');
    setContactNumber('');
    setCustomerEmail('');
    setReferenceQuotationNumber('');
    setProjectName('');
    setItems([
      { product_id: null, description: '', quantity: 1, unit: 'unit', unit_price: 0, line_total: 0 },
    ]);
    setDiscountType('fixed');
    setDiscountValue(0);
    setTaxEnabled(Boolean(settings.tax_enabled));
    setTaxLabel(settings.tax_label || 'VAT');
    setTaxRate(settings.tax_rate || 12);
    setInitialPaymentAmount(0);
    setInitialPaymentMethod('Cash');
    setInitialPaymentDate(today);
    setInitialPaymentRef('');
    setPaymentTerms(settings.default_payment_terms || '');
    setRemarks(settings.default_notes || '');
    setPreparedBy(user.full_name || '');
    setAuthorizedSignatory(settings.authorized_representative || '');

    apiFetch<{ next_number: string }>(`/api/invoices/next-number?date=${today}`)
      .then((r) => setPreviewNumber(r.next_number))
      .catch(() => setPreviewNumber('Auto-generated'));

    if (preCustomerId) {
      apiFetch<{ customer: Customer }>(`/api/customers/${preCustomerId}`)
        .then((r) => applyCustomer(r.customer))
        .catch(() => {});
    }

    setMode('form');
  };

  const openEditById = async (id: number) => {
    setError('');
    setNotice('');
    try {
      const res = await apiFetch<{ invoice: Invoice }>(`/api/invoices/${id}`);
      const inv = res.invoice;
      setEditingId(inv.id);
      setPreviewNumber(inv.invoice_number);
      setInvoiceDate(inv.invoice_date);
      setDueDate(inv.due_date || '');
      setCustomerId(inv.customer_id);
      setSaveAsCustomer(false);
      setCustomerName(inv.customer_name);
      setCompanyName(inv.company_name || '');
      setCustomerAddress(inv.customer_address || '');
      setContactNumber(inv.contact_number || '');
      setCustomerEmail(inv.customer_email || '');
      setReferenceQuotationNumber(inv.reference_quotation_number || '');
      setProjectName(inv.project_name || '');
      setItems(
        inv.items && inv.items.length > 0
          ? inv.items
          : [{ product_id: null, description: '', quantity: 1, unit: 'unit', unit_price: 0, line_total: 0 }]
      );
      setDiscountType(inv.discount_type || 'fixed');
      setDiscountValue(inv.discount_value || 0);
      setTaxEnabled(Boolean(inv.tax_enabled));
      setTaxLabel(inv.tax_label || 'VAT');
      setTaxRate(inv.tax_rate || 0);
      setPaymentTerms(inv.payment_terms || '');
      setRemarks(inv.remarks || '');
      setPreparedBy(inv.prepared_by || '');
      setAuthorizedSignatory(inv.authorized_signatory || '');
      setActiveInvoice(inv);
      setMode('form');
    } catch (err: any) {
      setError(err.message || 'Failed to load invoice.');
    }
  };

  const openPreviewById = async (id: number) => {
    setError('');
    try {
      const res = await apiFetch<{ invoice: Invoice }>(`/api/invoices/${id}`);
      setActiveInvoice(res.invoice);
      setMode('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to load invoice.');
    }
  };

  const handleSave = async () => {
    if (!customerName.trim()) {
      setError('Customer name is required.');
      return;
    }
    const validItems = items.filter((it) => it.description.trim() !== '');
    if (validItems.length === 0) {
      setError('Please add at least one line item.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        invoice_date: invoiceDate,
        due_date: dueDate,
        customer_id: customerId,
        save_as_customer: !customerId && saveAsCustomer,
        customer_name: customerName,
        company_name: companyName,
        customer_address: customerAddress,
        contact_number: contactNumber,
        customer_email: customerEmail,
        reference_quotation_number: referenceQuotationNumber,
        project_name: projectName,
        items: validItems,
        discount_type: discountType,
        discount_value: discountValue,
        tax_enabled: taxEnabled,
        tax_label: taxLabel,
        tax_rate: taxRate,
        initial_payment_amount: editingId ? 0 : initialPaymentAmount,
        payment_method: initialPaymentMethod,
        payment_date: initialPaymentDate,
        payment_reference: initialPaymentRef,
        payment_terms: paymentTerms,
        remarks,
        prepared_by: preparedBy,
        authorized_signatory: authorizedSignatory,
      };

      const res = editingId
        ? await apiFetch<{ invoice: Invoice }>(`/api/invoices/${editingId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ invoice: Invoice }>('/api/invoices', {
            method: 'POST',
            idempotencyKey: idemKey,
            body: JSON.stringify(payload),
          });

      setActiveInvoice(res.invoice);
      fetchInvoices();
      setMode('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to save invoice.');
    } finally {
      setSaving(false);
    }
  };

  const openRecordPaymentModal = (inv: Invoice) => {
    setPaymentModalInvoice(inv);
    setPayAmount(round2(inv.remaining_balance));
    setPayDate(todayYMD());
    setPayMethod('Cash');
    setPayRef('');
    setPayNotes('');
    setPayIdemKey(generateIdempotencyKey());
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInvoice) return;
    setRecordingPay(true);
    setError('');
    try {
      const res = await apiFetch<{ invoice: Invoice }>(
        `/api/invoices/${paymentModalInvoice.id}/payments`,
        {
          method: 'POST',
          idempotencyKey: payIdemKey,
          body: JSON.stringify({
            amount: payAmount,
            payment_date: payDate,
            payment_method: payMethod,
            reference_number: payRef,
            notes: payNotes,
          }),
        }
      );
      setActiveInvoice(res.invoice);
      setPaymentModalInvoice(null);
      setNotice('Payment recorded and invoice balance updated.');
      fetchInvoices();
    } catch (err: any) {
      setError(err.message || 'Failed to record payment.');
    } finally {
      setRecordingPay(false);
    }
  };

  const handleVoidPayment = async (paymentId: number) => {
    if (!window.confirm('Remove this payment record and recalculate the invoice balance?')) return;
    try {
      const res = await apiFetch<{ invoice: Invoice }>(`/api/payments/${paymentId}`, {
        method: 'DELETE',
      });
      setActiveInvoice(res.invoice);
      fetchInvoices();
    } catch (err: any) {
      setError(err.message || 'Failed to remove payment.');
    }
  };

  const handleArchive = async (inv: Invoice) => {
    if (!window.confirm(`Delete invoice ${inv.invoice_number}?`)) return;
    setError('');
    try {
      await apiFetch(`/api/invoices/${inv.id}`, { method: 'DELETE' });
      setNotice(`Deleted invoice ${inv.invoice_number}.`);
      fetchInvoices();
      if (mode === 'preview') setMode('list');
    } catch (err: any) {
      setError(err.message || 'Failed to delete invoice.');
    }
  };

  // Calculate live form total for initial payment preview
  const liveFormTotal = (() => {
    const sub = round2(
      items.reduce(
        (s, it) => s + round2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)),
        0
      )
    );
    const disc =
      discountType === 'percent'
        ? round2(sub * (Math.min(100, Math.max(0, discountValue)) / 100))
        : round2(Math.max(0, discountValue));
    const net = round2(sub - Math.min(sub, disc));
    const tax = taxEnabled && taxRate > 0 ? round2(net * (taxRate / 100)) : 0;
    return round2(net + tax);
  })();

  const renderPaymentModal = () => {
    if (!paymentModalInvoice) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 no-print">
        <div className="bg-white rounded-lg border border-slate-300 shadow-xl w-full max-w-md overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white">
            <div>
              <h3 className="text-sm font-semibold">Record Invoice Payment</h3>
              <p className="text-xs text-slate-300 tabular-nums">
                {paymentModalInvoice.invoice_number} • Balance:{' '}
                {formatPHP(paymentModalInvoice.remaining_balance)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPaymentModalInvoice(null)}
              className="text-slate-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={submitPayment} className="p-5 space-y-4">
            {error && (
              <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Amount Paid (₱) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="0.01"
                  max={round2(paymentModalInvoice.remaining_balance)}
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm tabular-nums font-semibold border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Payment Date <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Payment Method
              </label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Reference / Check / Transaction #
              </label>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="GCash ref #, bank slip #, or check #"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Payment Notes
              </label>
              <input
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="e.g., 50% downpayment / Final progress payment"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded p-3 flex items-center justify-between text-xs">
              <span className="text-slate-600">Remaining Balance After Payment:</span>
              <span className="font-bold text-slate-900 tabular-nums">
                {formatPHP(Math.max(0, round2(paymentModalInvoice.remaining_balance - payAmount)))}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPaymentModalInvoice(null)}
                className="px-3.5 py-2 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={recordingPay}
                className="px-4 py-2 rounded bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50"
              >
                {recordingPay ? 'Saving Payment...' : 'Record Payment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  if (mode === 'preview' && activeInvoice) {
    return (
      <div className="space-y-4">
        {renderPaymentModal()}
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
          doc={{ type: 'invoice', data: activeInvoice }}
          settings={settings}
          onBack={() => {
            setNotice('');
            setMode('list');
          }}
          onEdit={() => openEditById(activeInvoice.id)}
          onDelete={() => handleArchive(activeInvoice)}
          extraActions={
            activeInvoice.remaining_balance > 0.009 ? (
              <button
                type="button"
                onClick={() => openRecordPaymentModal(activeInvoice)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Record Payment ({formatPHP(activeInvoice.remaining_balance)} due)
              </button>
            ) : null
          }
        />

        {/* Payment History Management Panel (No-Print) */}
        {activeInvoice.payments && activeInvoice.payments.length > 0 && (
          <div className="no-print max-w-[210mm] mx-auto bg-white border border-slate-200 rounded-md p-4 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Payment History Ledger ({activeInvoice.payments.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2 px-3 text-left">Receipt #</th>
                    <th className="py-2 px-3 text-left">Payment Date</th>
                    <th className="py-2 px-3 text-left">Method</th>
                    <th className="py-2 px-3 text-left">Reference / Notes</th>
                    <th className="py-2 px-3 text-right">Amount</th>
                    <th className="py-2 px-2 w-16 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeInvoice.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 px-3 font-semibold tabular-nums">{p.payment_number}</td>
                      <td className="py-2 px-3 tabular-nums">{formatDate(p.payment_date)}</td>
                      <td className="py-2 px-3">{p.payment_method}</td>
                      <td className="py-2 px-3 text-slate-600">
                        {[p.reference_number, p.notes].filter(Boolean).join(' — ') || '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-700 tabular-nums">
                        {formatPHP(p.amount)}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleVoidPayment(p.id)}
                          className="text-rose-600 hover:underline font-medium"
                        >
                          Void
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (mode === 'form') {
    const alreadyPaid = editingId && activeInvoice ? activeInvoice.amount_paid : initialPaymentAmount;
    const estRemaining = Math.max(0, round2(liveFormTotal - alreadyPaid));

    return (
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {editingId ? `Edit Invoice ${previewNumber}` : 'Create New Billing Invoice'}
            </h1>
            <p className="text-xs text-slate-600">
              Invoice Number:{' '}
              <span className="font-semibold text-slate-900 tabular-nums">{previewNumber}</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Invoice Number
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
                Invoice Date <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Ref. Quotation #
              </label>
              <input
                type="text"
                value={referenceQuotationNumber}
                onChange={(e) => setReferenceQuotationNumber(e.target.value)}
                placeholder="Optional e.g. QTN-2026-0001"
                className="w-full px-3 py-2 text-sm tabular-nums border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
          </div>

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
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Billing Address
              </label>
              <input
                type="text"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
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
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Project / Job Description Title
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Optional project reference"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
          </div>

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
            totalLabel="TOTAL AMOUNT DUE"
          />

          {/* Initial Payment / Live Balance Section */}
          <div className="bg-slate-50 border border-slate-300 rounded-md p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Payment & Balance Calculation
              </h3>
              <div className="flex items-center gap-4 text-xs">
                <span>
                  Amount Paid:{' '}
                  <strong className="text-emerald-700 tabular-nums">{formatPHP(alreadyPaid)}</strong>
                </span>
                <span>
                  Remaining Balance:{' '}
                  <strong className="text-slate-950 tabular-nums">{formatPHP(estRemaining)}</strong>
                </span>
              </div>
            </div>

            {!editingId ? (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Initial Amount Paid (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={initialPaymentAmount}
                    onChange={(e) => setInitialPaymentAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 text-sm bg-white tabular-nums border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={initialPaymentMethod}
                    onChange={(e) => setInitialPaymentMethod(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm bg-white border border-slate-300 rounded"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={initialPaymentDate}
                    onChange={(e) => setInitialPaymentDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm bg-white border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Payment Ref #
                  </label>
                  <input
                    type="text"
                    value={initialPaymentRef}
                    onChange={(e) => setInitialPaymentRef(e.target.value)}
                    placeholder="Optional receipt/GCash ref"
                    className="w-full px-2.5 py-1.5 text-sm bg-white border border-slate-300 rounded"
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600">
                To record additional partial or full payments without duplicating this invoice, use the{' '}
                <strong>Record Payment</strong> button in the Invoice Preview or Invoices list.
              </p>
            )}
          </div>

          {/* Terms, Remarks, Signatories */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Payment Terms
              </label>
              <textarea
                rows={2}
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Remarks
              </label>
              <textarea
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
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
                Authorized Signatory
              </label>
              <input
                type="text"
                value={authorizedSignatory}
                onChange={(e) => setAuthorizedSignatory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="px-4 py-2 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-5 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Saving Invoice...' : editingId ? 'Save Changes' : 'Issue & Save Invoice'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {renderPaymentModal()}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Invoices</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Manage customer billing invoices, track partial and full payments, and monitor overdue balances.
          </p>
        </div>
        <button
          type="button"
          onClick={() => startCreateNew()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Invoice
        </button>
      </div>

      {error && (
        <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white border border-slate-200 rounded-md p-3.5 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchInvoices();
          }}
          className="flex-1 min-w-[220px] flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice #, quotation ref, customer, or project..."
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
          <option value="Open">All Unsettled (Unpaid / Partial / Overdue)</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Partially Paid">Partially Paid</option>
          <option value="Paid">Paid</option>
          <option value="Overdue">Overdue</option>
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

      {/* Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Receipt className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No invoices found</p>
            <p className="text-xs text-slate-500">
              Create a new invoice directly or convert an Approved quotation into an invoice.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-600">
                <tr>
                  <th className="py-3 px-4 text-left font-semibold">Invoice #</th>
                  <th className="py-3 px-4 text-left font-semibold">Date / Due</th>
                  <th className="py-3 px-4 text-left font-semibold">Customer</th>
                  <th className="py-3 px-4 text-left font-semibold">Ref. Quote</th>
                  <th className="py-3 px-4 text-right font-semibold">Total Due</th>
                  <th className="py-3 px-4 text-right font-semibold">Paid</th>
                  <th className="py-3 px-4 text-right font-semibold">Balance</th>
                  <th className="py-3 px-4 text-left font-semibold">Status</th>
                  <th className="py-3 px-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900 tabular-nums">
                      <button
                        type="button"
                        onClick={() => openPreviewById(inv.id)}
                        className="hover:text-sky-700 hover:underline"
                      >
                        {inv.invoice_number}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums">
                      <div>{formatDate(inv.invoice_date)}</div>
                      {inv.due_date && (
                        <div className="text-[11px] text-slate-400">Due: {formatDate(inv.due_date)}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{inv.customer_name}</div>
                      {inv.company_name && <div className="text-xs text-slate-500">{inv.company_name}</div>}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums">
                      {inv.reference_quotation_number || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold tabular-nums">
                      {formatPHP(inv.total_amount_due)}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-700 font-medium tabular-nums">
                      {formatPHP(inv.amount_paid)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                      {formatPHP(inv.remaining_balance)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        {inv.remaining_balance > 0.009 && (
                          <button
                            type="button"
                            onClick={() => openRecordPaymentModal(inv)}
                            title="Record Payment"
                            className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded"
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openPreviewById(inv.id)}
                          title="View & Print"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditById(inv.id)}
                          title="Edit"
                          className="p-1.5 text-slate-600 hover:text-sky-700 hover:bg-slate-100 rounded"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setError('');
                            try {
                              await downloadAuthenticatedFile(
                                `/api/invoices/${inv.id}/pdf`,
                                `${inv.invoice_number}.pdf`
                              );
                            } catch (err: any) {
                              setError(err.message || 'Failed to download Invoice PDF.');
                            }
                          }}
                          title="Download PDF"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchive(inv)}
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
