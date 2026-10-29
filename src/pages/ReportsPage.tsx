import React, { useEffect, useState } from 'react';
import { BarChart3, Download, Printer } from 'lucide-react';
import { NavigationTarget } from '../types';
import {
  apiFetch,
  downloadAuthenticatedFile,
  formatDate,
  formatPHP,
  getActiveBusinessSlug,
  todayYMD,
} from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';

interface ReportsPageProps {
  onNavigate: (target: NavigationTarget) => void;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ onNavigate }) => {
  const today = todayYMD();
  const [dateFrom, setDateFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [dateTo, setDateTo] = useState(today);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [exportError, setExportError] = useState('');

  const fetchReport = () => {
    setLoading(true);
    setLoadError('');
    apiFetch(`/api/reports?date_from=${dateFrom}&date_to=${dateTo}`)
      .then((res) => setData(res))
      .catch((err: any) => {
        setLoadError(err.message || 'Failed to compute report summary.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReport();
  }, [dateFrom, dateTo]);

  const applyPreset = (preset: 'month' | 'year' | 'all') => {
    const t = todayYMD();
    if (preset === 'month') {
      setDateFrom(`${t.slice(0, 8)}01`);
      setDateTo(t);
    } else if (preset === 'year') {
      setDateFrom(`${t.slice(0, 4)}-01-01`);
      setDateTo(t);
    } else {
      setDateFrom('2000-01-01');
      setDateTo('2099-12-31');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-200 no-print">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Business & Financial Reports
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Revenue, collections, accounts receivable aging, quotation conversion, and CSV record exports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => applyPreset('month')}
            className="px-2.5 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium hover:bg-slate-50"
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => applyPreset('year')}
            className="px-2.5 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium hover:bg-slate-50"
          >
            This Year
          </button>
          <button
            type="button"
            onClick={() => applyPreset('all')}
            className="px-2.5 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium hover:bg-slate-50"
          >
            All Time
          </button>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
          />
          <span className="text-xs text-slate-500">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Summary
          </button>
        </div>
      </div>

      {exportError && (
        <div className="no-print p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {exportError}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-md p-8 text-center text-sm text-slate-500">
          Computing financial and operational metrics...
        </div>
      ) : loadError || !data ? (
        <div className="bg-rose-50 border border-rose-200 rounded-md p-6 text-center space-y-3">
          <div className="text-sm font-semibold text-rose-800">
            {loadError || 'Unable to load report data.'}
          </div>
          <button
            type="button"
            onClick={fetchReport}
            className="px-4 py-1.5 rounded bg-rose-700 text-white text-xs font-semibold hover:bg-rose-800"
          >
            Retry Report
          </button>
        </div>
      ) : (
        <>
          {/* Top KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-md p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Invoiced (Selected Period)
              </div>
              <div className="text-2xl font-bold text-slate-950 tabular-nums mt-1.5">
                {formatPHP(data.invoicing.total_invoiced)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {data.invoicing.invoice_count} invoice(s) issued
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-md p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Payments Collected (Selected Period)
              </div>
              <div className="text-2xl font-bold text-emerald-700 tabular-nums mt-1.5">
                {formatPHP(data.collections.total_collected)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {data.collections.payment_count} payment receipt(s)
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-md p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Current Total Receivables
              </div>
              <div className="text-2xl font-bold text-amber-700 tabular-nums mt-1.5">
                {formatPHP(data.aging.total_outstanding)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {data.open_invoices.length} open invoice(s)
              </div>
            </div>
          </div>

          {/* Receivables Aging */}
          <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">
              Accounts Receivable Aging Summary
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <div className="text-xs text-slate-600">Current (Not Yet Due)</div>
                <div className="text-base font-bold text-slate-900 tabular-nums mt-1">
                  {formatPHP(data.aging.current)}
                </div>
              </div>
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded">
                <div className="text-xs text-amber-800">1–30 Days Overdue</div>
                <div className="text-base font-bold text-amber-900 tabular-nums mt-1">
                  {formatPHP(data.aging.days_1_30)}
                </div>
              </div>
              <div className="p-3 bg-orange-50/70 border border-orange-200 rounded">
                <div className="text-xs text-orange-800">31–60 Days Overdue</div>
                <div className="text-base font-bold text-orange-900 tabular-nums mt-1">
                  {formatPHP(data.aging.days_31_60)}
                </div>
              </div>
              <div className="p-3 bg-rose-50 border border-rose-200 rounded">
                <div className="text-xs text-rose-800">61+ Days Overdue</div>
                <div className="text-base font-bold text-rose-900 tabular-nums mt-1">
                  {formatPHP(data.aging.days_61_plus)}
                </div>
              </div>
            </div>

            {data.open_invoices.length > 0 && (
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                    <tr>
                      <th className="py-2 px-3 text-left">Invoice #</th>
                      <th className="py-2 px-3 text-left">Customer</th>
                      <th className="py-2 px-3 text-left">Due Date</th>
                      <th className="py-2 px-3 text-left">Status</th>
                      <th className="py-2 px-3 text-right">Remaining Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.open_invoices.map((inv: any) => (
                      <tr
                        key={inv.id}
                        onClick={() => onNavigate({ section: 'invoices', openId: inv.id })}
                        className="hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="py-2 px-3 font-semibold text-sky-800 tabular-nums">
                          {inv.invoice_number}
                        </td>
                        <td className="py-2 px-3">{inv.customer_name}</td>
                        <td className="py-2 px-3 tabular-nums">{formatDate(inv.due_date)}</td>
                        <td className="py-2 px-3">
                          <StatusBadge status={inv.status} />
                        </td>
                        <td className="py-2 px-3 text-right font-bold tabular-nums">
                          {formatPHP(inv.remaining_balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quotations, Payment Methods & Top Customers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-md p-5 space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Quotation Status Breakdown</h2>
              {data.quotation_breakdown.length === 0 ? (
                <p className="text-xs text-slate-500">No quotations issued in this period.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="border-b border-slate-200 text-slate-500 uppercase">
                    <tr>
                      <th className="py-2 text-left">Status</th>
                      <th className="py-2 text-right">Count</th>
                      <th className="py-2 text-right">Quoted Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.quotation_breakdown.map((q: any) => (
                      <tr key={q.status}>
                        <td className="py-2">
                          <StatusBadge status={q.status} />
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums">{q.count}</td>
                        <td className="py-2 text-right font-bold tabular-nums">
                          {formatPHP(q.total_value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-md p-5 space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Collections by Payment Method</h2>
              {data.collections.by_method.length === 0 ? (
                <p className="text-xs text-slate-500">No payments collected in this period.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="border-b border-slate-200 text-slate-500 uppercase">
                    <tr>
                      <th className="py-2 text-left">Payment Method</th>
                      <th className="py-2 text-right">Receipts</th>
                      <th className="py-2 text-right">Total Collected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.collections.by_method.map((m: any) => (
                      <tr key={m.payment_method}>
                        <td className="py-2 font-medium text-slate-800">{m.payment_method}</td>
                        <td className="py-2 text-right tabular-nums">{m.count}</td>
                        <td className="py-2 text-right font-bold text-emerald-700 tabular-nums">
                          {formatPHP(m.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* CSV Spreadsheet Exports */}
          <div className="bg-white border border-slate-200 rounded-md p-5 space-y-3 no-print">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-slate-700" />
              <h2 className="text-sm font-bold text-slate-900">Spreadsheet Data Exports (CSV)</h2>
            </div>
            <p className="text-xs text-slate-500">
              Download clean UTF-8 CSV spreadsheets compatible with Microsoft Excel and Google Sheets.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                ['quotations', 'Export Quotations CSV'],
                ['invoices', 'Export Invoices CSV'],
                ['payments', 'Export Payments CSV'],
                ['service-reports', 'Export Service Reports CSV'],
                ['billing-statements', 'Export Billing Statements CSV'],
                ['customers', 'Export Customers CSV'],
                ['products', 'Export Products & Services CSV'],
              ].map(([slug, label]) => (
                <button
                  key={slug}
                  type="button"
                  onClick={async () => {
                    setExportError('');
                    try {
                      await downloadAuthenticatedFile(
                        `/api/backup/export-csv/${slug}`,
                        `${getActiveBusinessSlug() || 'workspace'}-${slug}-${today}.csv`
                      );
                    } catch (err: any) {
                      setExportError(err.message || 'CSV export failed.');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-800"
                >
                  <Download className="w-3.5 h-3.5 text-sky-700" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
