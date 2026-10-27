import React, { useEffect, useState } from 'react';
import { CreditCard, Plus, Search, Trash2, ExternalLink, X } from 'lucide-react';
import { Invoice, NavigationTarget, PaymentRecord } from '../types';
import {
  apiFetch,
  formatDate,
  formatPHP,
  generateIdempotencyKey,
  round2,
  todayYMD,
} from '../lib/api';

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

interface PaymentsPageProps {
  onNavigate: (target: NavigationTarget) => void;
}

export const PaymentsPage: React.FC<PaymentsPageProps> = ({ onNavigate }) => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number>(0);
  const [amount, setAmount] = useState(0);
  const [payDate, setPayDate] = useState(todayYMD());
  const [method, setMethod] = useState('Cash');
  const [refNumber, setRefNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [idemKey, setIdemKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState('');
  const [pageNotice, setPageNotice] = useState('');

  const fetchPayments = () => {
    setLoading(true);
    setPageError('');
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (methodFilter !== 'all') params.set('method', methodFilter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);

    apiFetch<{ payments: PaymentRecord[] }>(`/api/payments?${params.toString()}`)
      .then((res) => setPayments(res.payments || []))
      .catch((err: any) => {
        setPageError(err.message || 'Failed to load payment records.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPayments();
  }, [methodFilter, dateFrom, dateTo]);

  const openRecordModal = async () => {
    setError('');
    setPageError('');
    try {
      const res = await apiFetch<{ invoices: Invoice[] }>('/api/invoices?status=Open');
      const list = (res.invoices || []).filter((i) => i.remaining_balance > 0.009);
      setOpenInvoices(list);
      if (list.length > 0) {
        setSelectedInvoiceId(list[0].id);
        setAmount(round2(list[0].remaining_balance));
      } else {
        setSelectedInvoiceId(0);
        setAmount(0);
      }
      setPayDate(todayYMD());
      setMethod('Cash');
      setRefNumber('');
      setNotes('');
      setIdemKey(generateIdempotencyKey());
      setModalOpen(true);
    } catch (err: any) {
      setPageError(err.message || 'Unable to load open invoices.');
    }
  };

  const handleInvoicePick = (id: number) => {
    setSelectedInvoiceId(id);
    const inv = openInvoices.find((i) => i.id === id);
    if (inv) setAmount(round2(inv.remaining_balance));
  };

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceId) {
      setError('Please select an unsettled invoice.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/invoices/${selectedInvoiceId}/payments`, {
        method: 'POST',
        idempotencyKey: idemKey,
        body: JSON.stringify({
          amount,
          payment_date: payDate,
          payment_method: method,
          reference_number: refNumber,
          notes,
        }),
      });
      setModalOpen(false);
      setPageNotice('Payment recorded and invoice balance updated.');
      fetchPayments();
    } catch (err: any) {
      setError(err.message || 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  const handleVoid = async (p: PaymentRecord) => {
    if (!window.confirm(`Void payment ${p.payment_number} and recalculate invoice balance?`)) return;
    setPageError('');
    setPageNotice('');
    try {
      await apiFetch(`/api/payments/${p.id}`, { method: 'DELETE' });
      setPageNotice(`Voided payment ${p.payment_number} and updated invoice balance.`);
      fetchPayments();
    } catch (err: any) {
      setPageError(err.message || 'Failed to void payment.');
    }
  };

  const totalShown = round2(payments.reduce((s, p) => s + Number(p.amount || 0), 0));

  return (
    <div className="space-y-5">
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-lg border border-slate-300 shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white">
              <h3 className="text-sm font-semibold">Record Customer Payment</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecord} className="p-5 space-y-4">
              {error && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {error}
                </div>
              )}

              {openInvoices.length === 0 ? (
                <div className="text-xs text-slate-600 py-4 text-center">
                  There are currently no unpaid or partially paid invoices.
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Select Unsettled Invoice <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={selectedInvoiceId}
                      onChange={(e) => handleInvoicePick(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded bg-white"
                    >
                      {openInvoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoice_number} — {inv.customer_name} (Bal:{' '}
                          {formatPHP(inv.remaining_balance)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                        Amount (₱) <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 text-sm tabular-nums font-semibold border border-slate-300 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                        Date <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded bg-white"
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
                      Reference #
                    </label>
                    <input
                      type="text"
                      value={refNumber}
                      onChange={(e) => setRefNumber(e.target.value)}
                      placeholder="GCash / bank transfer / check #"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Notes
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                {openInvoices.length > 0 && (
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 rounded bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {saving ? 'Recording...' : 'Record Payment'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {pageError && (
        <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {pageError}
        </div>
      )}
      {pageNotice && (
        <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
          {pageNotice}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Payments</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Centralized payment receipts ledger linked directly to customer invoices.
          </p>
        </div>
        <button
          type="button"
          onClick={openRecordModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Record Payment
        </button>
      </div>

      {/* Filters + Total Collected Banner */}
      <div className="bg-white border border-slate-200 rounded-md p-3.5 flex flex-wrap items-center justify-between gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchPayments();
          }}
          className="flex-1 min-w-[220px] flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receipt #, invoice #, customer, or reference..."
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
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded bg-white"
        >
          <option value="all">All Payment Methods</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
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

        <div className="px-3 py-1.5 rounded bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 tabular-nums">
          Total Shown: {formatPHP(totalShown)}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading payments...</div>
        ) : payments.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <CreditCard className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No payments recorded yet</p>
            <p className="text-xs text-slate-500">
              Payments recorded against invoices will automatically appear in this ledger.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-600">
                <tr>
                  <th className="py-3 px-4 text-left font-semibold">Receipt #</th>
                  <th className="py-3 px-4 text-left font-semibold">Date</th>
                  <th className="py-3 px-4 text-left font-semibold">Invoice #</th>
                  <th className="py-3 px-4 text-left font-semibold">Customer</th>
                  <th className="py-3 px-4 text-left font-semibold">Method</th>
                  <th className="py-3 px-4 text-left font-semibold">Ref / Notes</th>
                  <th className="py-3 px-4 text-right font-semibold">Amount Paid</th>
                  <th className="py-3 px-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900 tabular-nums">
                      {p.payment_number}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums">
                      {formatDate(p.payment_date)}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => onNavigate({ section: 'invoices', openId: p.invoice_id })}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-sky-800 hover:underline tabular-nums"
                      >
                        {p.invoice_number}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{p.customer_name}</td>
                    <td className="py-3 px-4 text-xs text-slate-700">{p.payment_method}</td>
                    <td className="py-3 px-4 text-xs text-slate-500 max-w-[200px] truncate">
                      {[p.reference_number, p.notes].filter(Boolean).join(' — ') || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-700 tabular-nums">
                      {formatPHP(p.amount)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleVoid(p)}
                        title="Void Payment"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
