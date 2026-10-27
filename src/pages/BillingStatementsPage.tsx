import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Eye,
  Edit3,
  Trash2,
  FileSpreadsheet,
  Download,
  RefreshCw,
} from 'lucide-react';
import {
  AuthUser,
  BillingStatement,
  BillingStatementLine,
  BusinessSettings,
  Customer,
} from '../types';
import {
  apiFetch,
  downloadAuthenticatedFile,
  formatDate,
  formatPHP,
  generateIdempotencyKey,
  todayYMD,
} from '../lib/api';
import { PrintableDocument } from '../components/PrintableDocument';

interface BillingStatementsPageProps {
  user: AuthUser;
  settings: BusinessSettings;
  initialOpenId?: number;
  initialCreateNew?: boolean;
  prefillCustomerId?: number;
  onClearInitial: () => void;
}

export const BillingStatementsPage: React.FC<BillingStatementsPageProps> = ({
  user,
  settings,
  initialOpenId,
  initialCreateNew,
  prefillCustomerId,
  onClearInitial,
}) => {
  const [statements, setStatements] = useState<BillingStatement[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [mode, setMode] = useState<'list' | 'form' | 'preview'>('list');
  const [activeStatement, setActiveStatement] = useState<BillingStatement | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [idemKey, setIdemKey] = useState('');

  // Form fields
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewNumber, setPreviewNumber] = useState('');
  const [statementDate, setStatementDate] = useState(todayYMD());
  const [periodFrom, setPeriodFrom] = useState(`${todayYMD().slice(0, 8)}01`);
  const [periodTo, setPeriodTo] = useState(todayYMD());
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(0);
  const [customerName, setCustomerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [paymentTerms, setPaymentTerms] = useState(settings.default_payment_terms || '');
  const [remarks, setRemarks] = useState('');
  const [preparedBy, setPreparedBy] = useState(user.full_name || '');
  const [authorizedSignatory, setAuthorizedSignatory] = useState(
    settings.authorized_representative || ''
  );

  // Live preview ledger computed from actual saved invoices & payments
  const [ledgerPreview, setLedgerPreview] = useState<{
    previous_balance: number;
    total_charges: number;
    total_payments: number;
    outstanding_balance: number;
    lines: BillingStatementLine[];
  }>({
    previous_balance: 0,
    total_charges: 0,
    total_payments: 0,
    outstanding_balance: 0,
    lines: [],
  });

  const fetchStatements = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);

    apiFetch<{ billing_statements: BillingStatement[] }>(
      `/api/billing-statements?${params.toString()}`
    )
      .then((res) => setStatements(res.billing_statements || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStatements();
    apiFetch<{ customers: Customer[] }>('/api/customers?status=active')
      .then((r) => setCustomers(r.customers || []))
      .catch(() => {});
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (initialOpenId) {
      openPreviewById(initialOpenId);
      onClearInitial();
    } else if (initialCreateNew) {
      startCreateNew(prefillCustomerId);
      onClearInitial();
    }
  }, [initialOpenId, initialCreateNew, prefillCustomerId]);

  // Dynamically compute ledger whenever customer or date range changes in form mode
  useEffect(() => {
    if (mode !== 'form' || !selectedCustomerId || !periodFrom || !periodTo) return;
    if (periodFrom > periodTo) return;

    setPreviewLoading(true);
    apiFetch<{
      customer: Customer;
      ledger: {
        previous_balance: number;
        total_charges: number;
        total_payments: number;
        outstanding_balance: number;
        lines: BillingStatementLine[];
      };
    }>(
      `/api/billing-statements/preview?customer_id=${selectedCustomerId}&period_from=${periodFrom}&period_to=${periodTo}`
    )
      .then((res) => {
        setLedgerPreview(res.ledger);
      })
      .catch(() => {})
      .finally(() => setPreviewLoading(false));
  }, [mode, selectedCustomerId, periodFrom, periodTo]);

  const handleCustomerSelect = (id: number) => {
    setSelectedCustomerId(id);
    const found = customers.find((c) => c.id === id);
    if (found) {
      setCustomerName(found.customer_name);
      setCompanyName(found.company_name || '');
      setCustomerAddress(found.billing_address || '');
      setContactNumber(found.contact_number || '');
      setCustomerEmail(found.email || '');
    } else {
      setCustomerName('');
      setCompanyName('');
      setCustomerAddress('');
      setContactNumber('');
      setCustomerEmail('');
      setLedgerPreview({
        previous_balance: 0,
        total_charges: 0,
        total_payments: 0,
        outstanding_balance: 0,
        lines: [],
      });
    }
  };

  const startCreateNew = async (preCustomerId?: number) => {
    setEditingId(null);
    setError('');
    setIdemKey(generateIdempotencyKey());
    const today = todayYMD();
    setStatementDate(today);
    setPeriodFrom(`${today.slice(0, 8)}01`);
    setPeriodTo(today);
    setSelectedCustomerId(0);
    setCustomerName('');
    setCompanyName('');
    setCustomerAddress('');
    setContactNumber('');
    setCustomerEmail('');
    setPaymentTerms(settings.default_payment_terms || '');
    setRemarks('');
    setPreparedBy(user.full_name || '');
    setAuthorizedSignatory(settings.authorized_representative || '');
    setLedgerPreview({
      previous_balance: 0,
      total_charges: 0,
      total_payments: 0,
      outstanding_balance: 0,
      lines: [],
    });

    const custRes = await apiFetch<{ customers: Customer[] }>('/api/customers?status=active').catch(
      () => ({ customers: [] })
    );
    setCustomers(custRes.customers || []);

    if (preCustomerId) {
      const found = (custRes.customers || []).find((c) => c.id === preCustomerId);
      if (found) {
        setSelectedCustomerId(found.id);
        setCustomerName(found.customer_name);
        setCompanyName(found.company_name || '');
        setCustomerAddress(found.billing_address || '');
        setContactNumber(found.contact_number || '');
        setCustomerEmail(found.email || '');
      }
    }

    apiFetch<{ next_number: string }>(`/api/billing-statements/next-number?date=${today}`)
      .then((r) => setPreviewNumber(r.next_number))
      .catch(() => setPreviewNumber('Auto-generated'));

    setMode('form');
  };

  const openEditById = async (id: number) => {
    setError('');
    try {
      const res = await apiFetch<{ billing_statement: BillingStatement }>(
        `/api/billing-statements/${id}`
      );
      const st = res.billing_statement;
      setEditingId(st.id);
      setPreviewNumber(st.statement_number);
      setStatementDate(st.statement_date);
      setPeriodFrom(st.period_from);
      setPeriodTo(st.period_to);
      setSelectedCustomerId(st.customer_id);
      setCustomerName(st.customer_name);
      setCompanyName(st.company_name || '');
      setCustomerAddress(st.customer_address || '');
      setContactNumber(st.contact_number || '');
      setCustomerEmail(st.customer_email || '');
      setPaymentTerms(st.payment_terms || '');
      setRemarks(st.remarks || '');
      setPreparedBy(st.prepared_by || '');
      setAuthorizedSignatory(st.authorized_signatory || '');
      setLedgerPreview({
        previous_balance: st.previous_balance,
        total_charges: st.total_charges,
        total_payments: st.total_payments,
        outstanding_balance: st.outstanding_balance,
        lines: st.lines || [],
      });
      setMode('form');
    } catch (err: any) {
      setError(err.message || 'Failed to load billing statement.');
    }
  };

  const openPreviewById = async (id: number) => {
    setError('');
    try {
      const res = await apiFetch<{ billing_statement: BillingStatement }>(
        `/api/billing-statements/${id}`
      );
      setActiveStatement(res.billing_statement);
      setMode('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to load billing statement.');
    }
  };

  const handleSave = async () => {
    if (!selectedCustomerId) {
      setError('Please select a customer.');
      return;
    }
    if (periodFrom > periodTo) {
      setError('Period start date must be on or before period end date.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        statement_date: statementDate,
        period_from: periodFrom,
        period_to: periodTo,
        customer_id: selectedCustomerId,
        customer_name: customerName,
        company_name: companyName,
        customer_address: customerAddress,
        contact_number: contactNumber,
        customer_email: customerEmail,
        payment_terms: paymentTerms,
        remarks,
        prepared_by: preparedBy,
        authorized_signatory: authorizedSignatory,
      };

      const res = editingId
        ? await apiFetch<{ billing_statement: BillingStatement }>(
            `/api/billing-statements/${editingId}`,
            {
              method: 'PUT',
              body: JSON.stringify(payload),
            }
          )
        : await apiFetch<{ billing_statement: BillingStatement }>('/api/billing-statements', {
            method: 'POST',
            idempotencyKey: idemKey,
            body: JSON.stringify(payload),
          });

      setActiveStatement(res.billing_statement);
      fetchStatements();
      setMode('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to save billing statement.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculateActive = async () => {
    if (!activeStatement) return;
    try {
      const res = await apiFetch<{ billing_statement: BillingStatement }>(
        `/api/billing-statements/${activeStatement.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(activeStatement),
        }
      );
      setActiveStatement(res.billing_statement);
      fetchStatements();
    } catch (err: any) {
      setError(err.message || 'Failed to refresh statement ledger.');
    }
  };

  const handleArchive = async (st: BillingStatement) => {
    if (!window.confirm(`Archive billing statement ${st.statement_number}?`)) return;
    try {
      await apiFetch(`/api/billing-statements/${st.id}`, { method: 'DELETE' });
      fetchStatements();
      if (mode === 'preview') setMode('list');
    } catch (err: any) {
      setError(err.message || 'Failed to archive statement.');
    }
  };

  if (mode === 'preview' && activeStatement) {
    return (
      <PrintableDocument
        doc={{ type: 'billing_statement', data: activeStatement }}
        settings={settings}
        onBack={() => setMode('list')}
        onEdit={() => openEditById(activeStatement.id)}
        extraActions={
          <button
            type="button"
            onClick={handleRecalculateActive}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Latest Invoices & Payments
          </button>
        }
      />
    );
  }

  if (mode === 'form') {
    return (
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {editingId
                ? `Edit Billing Statement ${previewNumber}`
                : 'Generate Customer Billing Statement'}
            </h1>
            <p className="text-xs text-slate-600">
              Statement No.:{' '}
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
          {/* Customer & Date Period Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Statement Number
              </label>
              <input
                type="text"
                readOnly
                value={previewNumber}
                className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-300 rounded font-semibold tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Statement Date <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                required
                value={statementDate}
                onChange={(e) => setStatementDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Period From <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                required
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Period To <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                required
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Select Customer Account <span className="text-rose-600">*</span>
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => handleCustomerSelect(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
            >
              <option value={0}>-- Select a saved customer to load invoices & payments --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customer_code} — {c.customer_name}
                  {c.company_name ? ` (${c.company_name})` : ''}
                </option>
              ))}
            </select>

            {selectedCustomerId > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-0.5">
                    Company
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-0.5">
                    Billing Address
                  </label>
                  <input
                    type="text"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-0.5">
                    Contact Number
                  </label>
                  <input
                    type="text"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Live Calculated Ledger Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Retrieved Invoices & Payments Ledger ({ledgerPreview.lines.length} transactions in period)
              </h3>
              {previewLoading && (
                <span className="text-xs text-sky-700 font-medium">Calculating balances...</span>
              )}
            </div>

            <div className="border border-slate-300 rounded overflow-x-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead className="bg-slate-900 text-white uppercase">
                  <tr>
                    <th className="py-2 px-3 text-left w-28">Date</th>
                    <th className="py-2 px-3 text-left w-32">Invoice / Ref #</th>
                    <th className="py-2 px-3 text-left">Transaction Description</th>
                    <th className="py-2 px-3 text-right w-28">Debit (Charge)</th>
                    <th className="py-2 px-3 text-right w-28">Credit (Paid)</th>
                    <th className="py-2 px-3 text-right w-32">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="bg-slate-50 font-medium">
                    <td className="py-2 px-3 tabular-nums">{formatDate(periodFrom)}</td>
                    <td className="py-2 px-3 text-slate-400">—</td>
                    <td className="py-2 px-3">Previous Balance (prior to {formatDate(periodFrom)})</td>
                    <td className="py-2 px-3 text-right text-slate-400">—</td>
                    <td className="py-2 px-3 text-right text-slate-400">—</td>
                    <td className="py-2 px-3 text-right font-semibold tabular-nums">
                      {formatPHP(ledgerPreview.previous_balance)}
                    </td>
                  </tr>
                  {ledgerPreview.lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        {selectedCustomerId
                          ? 'No invoices or payments recorded for this customer within the selected billing period.'
                          : 'Select a customer above to retrieve their saved invoices and payments.'}
                      </td>
                    </tr>
                  ) : (
                    ledgerPreview.lines.map((ln, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 tabular-nums">{formatDate(ln.tx_date)}</td>
                        <td className="py-2 px-3 font-medium tabular-nums">
                          {ln.invoice_number || ln.reference_number}
                        </td>
                        <td className="py-2 px-3">{ln.description}</td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {ln.debit > 0 ? formatPHP(ln.debit) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-700 tabular-nums">
                          {ln.credit > 0 ? formatPHP(ln.credit) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold tabular-nums">
                          {formatPHP(ln.running_balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary Totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900 text-white rounded-md p-4">
              <div>
                <div className="text-[11px] uppercase text-slate-400">Previous Balance</div>
                <div className="text-sm font-bold tabular-nums mt-0.5">
                  {formatPHP(ledgerPreview.previous_balance)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-slate-400">Total Charges</div>
                <div className="text-sm font-bold tabular-nums mt-0.5">
                  {formatPHP(ledgerPreview.total_charges)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-slate-400">Total Payments</div>
                <div className="text-sm font-bold text-emerald-400 tabular-nums mt-0.5">
                  -{formatPHP(ledgerPreview.total_payments)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-amber-300">Outstanding Balance</div>
                <div className="text-base font-extrabold text-amber-300 tabular-nums mt-0.5">
                  {formatPHP(ledgerPreview.outstanding_balance)}
                </div>
              </div>
            </div>
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
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
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
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
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
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
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
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
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
              disabled={saving || !selectedCustomerId}
              onClick={handleSave}
              className="px-5 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {saving
                ? 'Saving Statement...'
                : editingId
                  ? 'Save Updated Statement'
                  : 'Generate & Save Statement'}
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
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Billing Statements</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Generate periodic customer statements of account summarizing actual saved invoices, payments, and running balances.
          </p>
        </div>
        <button
          type="button"
          onClick={() => startCreateNew()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Billing Statement
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white border border-slate-200 rounded-md p-3.5 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchStatements();
          }}
          className="flex-1 min-w-[220px] flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search statement #, customer name, or company..."
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

      {/* Statements Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading billing statements...</div>
        ) : statements.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No billing statements generated yet</p>
            <p className="text-xs text-slate-500">
              Select a customer and billing period to summarize their invoices, payments, and outstanding balance.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-600">
                <tr>
                  <th className="py-3 px-4 text-left font-semibold">Statement #</th>
                  <th className="py-3 px-4 text-left font-semibold">Statement Date</th>
                  <th className="py-3 px-4 text-left font-semibold">Customer</th>
                  <th className="py-3 px-4 text-left font-semibold">Billing Period</th>
                  <th className="py-3 px-4 text-right font-semibold">Charges</th>
                  <th className="py-3 px-4 text-right font-semibold">Payments</th>
                  <th className="py-3 px-4 text-right font-semibold">Outstanding Balance</th>
                  <th className="py-3 px-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statements.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900 tabular-nums">
                      <button
                        type="button"
                        onClick={() => openPreviewById(st.id)}
                        className="hover:text-sky-700 hover:underline"
                      >
                        {st.statement_number}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums">
                      {formatDate(st.statement_date)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{st.customer_name}</div>
                      {st.company_name && <div className="text-xs text-slate-500">{st.company_name}</div>}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums">
                      {formatDate(st.period_from)} – {formatDate(st.period_to)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">{formatPHP(st.total_charges)}</td>
                    <td className="py-3 px-4 text-right text-emerald-700 tabular-nums">
                      {formatPHP(st.total_payments)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                      {formatPHP(st.outstanding_balance)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openPreviewById(st.id)}
                          title="View & Print"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditById(st.id)}
                          title="Edit / Refresh Period"
                          className="p-1.5 text-slate-600 hover:text-sky-700 hover:bg-slate-100 rounded"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadAuthenticatedFile(
                              `/api/billing-statements/${st.id}/pdf`,
                              `${st.statement_number}.pdf`
                            )
                          }
                          title="Download PDF"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchive(st)}
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
