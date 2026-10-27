import React, { useEffect, useState } from 'react';
import {
  FileText,
  Receipt,
  Wrench,
  FileSpreadsheet,
  Plus,
  ArrowUpRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { NavigationTarget, NavSection } from '../types';
import { apiFetch, formatDate, formatDateTime, formatPHP } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';

interface DashboardPageProps {
  onNavigate: (target: NavigationTarget) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadDashboard = () => {
    setLoading(true);
    setLoadError('');
    apiFetch('/api/dashboard')
      .then((res) => setData(res))
      .catch((err: any) => {
        setLoadError(err.message || 'Failed to load dashboard metrics.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const m = data?.metrics || {
    total_quotations: 0,
    pending_quotations: 0,
    draft_quotations: 0,
    sent_quotations: 0,
    approved_quotations: 0,
    total_quoted_amount: 0,
    total_invoices: 0,
    unpaid_invoices: 0,
    strictly_unpaid_invoices: 0,
    partially_paid_invoices: 0,
    overdue_invoices: 0,
    paid_invoices: 0,
    total_billed: 0,
    total_collected: 0,
    total_receivables: 0,
    total_billing_statements: 0,
    total_service_reports: 0,
    active_service_reports: 0,
    completed_service_reports: 0,
    total_customers: 0,
  };

  const mapDocTypeToSection = (docType: string): NavSection => {
    switch (docType) {
      case 'quotation':
        return 'quotations';
      case 'invoice':
      case 'payment':
        return 'invoices';
      case 'service_report':
        return 'service-reports';
      case 'billing_statement':
        return 'billing-statements';
      case 'customer':
        return 'customers';
      default:
        return 'dashboard';
    }
  };

  const docTypeLabel = (t: string) => {
    switch (t) {
      case 'quotation':
        return 'Quotation';
      case 'invoice':
        return 'Invoice';
      case 'service_report':
        return 'Service Report';
      case 'billing_statement':
        return 'Billing Statement';
      default:
        return t;
    }
  };

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={loadDashboard}
            className="px-3 py-1 rounded bg-rose-700 text-white font-semibold hover:bg-rose-800"
          >
            Retry
          </button>
        </div>
      )}

      {/* Page Header & Direct Document Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Operations Overview</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Live shop metrics calculated strictly from saved business records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate({ section: 'quotations', createNew: true })}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
          >
            <Plus className="w-3.5 h-3.5" />
            New Quotation
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ section: 'invoices', createNew: true })}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-white border border-slate-300 text-slate-800 text-xs font-semibold hover:bg-slate-50"
          >
            <Plus className="w-3.5 h-3.5 text-sky-700" />
            New Invoice
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ section: 'service-reports', createNew: true })}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-white border border-slate-300 text-slate-800 text-xs font-semibold hover:bg-slate-50"
          >
            <Plus className="w-3.5 h-3.5 text-sky-700" />
            New Service Report
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ section: 'billing-statements', createNew: true })}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-white border border-slate-300 text-slate-800 text-xs font-semibold hover:bg-slate-50"
          >
            <Plus className="w-3.5 h-3.5 text-sky-700" />
            New Statement
          </button>
        </div>
      </div>

      {/* Required 8 Core Operational Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => onNavigate({ section: 'quotations' })}
          className="text-left bg-white border border-slate-200 rounded-md p-4 hover:border-slate-400 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Total Quotations</span>
            <FileText className="w-4 h-4 text-slate-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-950 tabular-nums">
            {loading ? '—' : m.total_quotations}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Value: {formatPHP(m.total_quoted_amount)}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate({ section: 'quotations' })}
          className="text-left bg-white border border-slate-200 rounded-md p-4 hover:border-slate-400 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Pending Quotations</span>
            <Clock className="w-4 h-4 text-sky-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-sky-800 tabular-nums">
            {loading ? '—' : m.pending_quotations}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {m.sent_quotations} Sent · {m.draft_quotations} Draft
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate({ section: 'quotations' })}
          className="text-left bg-white border border-slate-200 rounded-md p-4 hover:border-slate-400 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Approved Quotations</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-800 tabular-nums">
            {loading ? '—' : m.approved_quotations}
          </div>
          <div className="mt-1 text-xs text-slate-500">Ready for invoicing</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate({ section: 'invoices' })}
          className="text-left bg-white border border-slate-200 rounded-md p-4 hover:border-slate-400 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Total Invoices</span>
            <Receipt className="w-4 h-4 text-slate-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-950 tabular-nums">
            {loading ? '—' : m.total_invoices}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Billed: {formatPHP(m.total_billed)}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate({ section: 'invoices' })}
          className="text-left bg-white border border-slate-200 rounded-md p-4 hover:border-slate-400 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Unpaid Invoices</span>
            <Receipt className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
            {loading ? '—' : m.unpaid_invoices}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Receivables: {formatPHP(m.total_receivables)}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate({ section: 'invoices' })}
          className="text-left bg-white border border-slate-200 rounded-md p-4 hover:border-slate-400 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Overdue Invoices</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-700 tabular-nums">
            {loading ? '—' : m.overdue_invoices}
          </div>
          <div className="mt-1 text-xs text-slate-500">Past due date</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate({ section: 'billing-statements' })}
          className="text-left bg-white border border-slate-200 rounded-md p-4 hover:border-slate-400 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Billing Statements</span>
            <FileSpreadsheet className="w-4 h-4 text-slate-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-950 tabular-nums">
            {loading ? '—' : m.total_billing_statements}
          </div>
          <div className="mt-1 text-xs text-slate-500">Issued statements</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate({ section: 'service-reports' })}
          className="text-left bg-white border border-slate-200 rounded-md p-4 hover:border-slate-400 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Service Reports</span>
            <Wrench className="w-4 h-4 text-slate-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-950 tabular-nums">
            {loading ? '—' : m.total_service_reports}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {m.completed_service_reports} Completed · {m.active_service_reports} Active
          </div>
        </button>
      </div>

      {/* Financial Summary Strip */}
      <div className="bg-slate-900 text-white rounded-md p-4 grid grid-cols-1 sm:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
        <div className="sm:pr-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            Total Invoiced Revenue
          </div>
          <div className="text-lg font-bold tabular-nums mt-0.5">{formatPHP(m.total_billed)}</div>
        </div>
        <div className="pt-3 sm:pt-0 sm:px-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            Total Payments Collected
          </div>
          <div className="text-lg font-bold text-emerald-400 tabular-nums mt-0.5">
            {formatPHP(m.total_collected)}
          </div>
        </div>
        <div className="pt-3 sm:pt-0 sm:px-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            Outstanding Balance Due
          </div>
          <div className="text-lg font-bold text-amber-300 tabular-nums mt-0.5">
            {formatPHP(m.total_receivables)}
          </div>
        </div>
        <div className="pt-3 sm:pt-0 sm:pl-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
              Saved Customers
            </div>
            <div className="text-lg font-bold tabular-nums mt-0.5">{m.total_customers}</div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ section: 'customers' })}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
          >
            <Users className="w-3.5 h-3.5" />
            Directory
          </button>
        </div>
      </div>

      {/* Recent Transactions & Recent Customer Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent Transactions Table */}
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Transactions & Documents</h2>
              <p className="text-xs text-slate-500">Click any document row to open it directly.</p>
            </div>
          </div>

          {!data?.recent_transactions?.length ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm font-medium text-slate-700">No saved transactions yet</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Create a Quotation, Invoice, Service Report, or Billing Statement using the action buttons above. All counts and totals update automatically from real saved records.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 text-left font-semibold">Document #</th>
                    <th className="py-2.5 px-4 text-left font-semibold">Type</th>
                    <th className="py-2.5 px-4 text-left font-semibold">Customer</th>
                    <th className="py-2.5 px-4 text-left font-semibold">Date</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Amount</th>
                    <th className="py-2.5 px-4 text-left font-semibold">Status</th>
                    <th className="py-2.5 px-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recent_transactions.map((tx: any, idx: number) => (
                    <tr
                      key={`${tx.doc_type}-${tx.id}-${idx}`}
                      onClick={() =>
                        onNavigate({
                          section: mapDocTypeToSection(tx.doc_type),
                          openId: tx.id,
                        })
                      }
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2.5 px-4 font-semibold text-slate-900 tabular-nums">
                        {tx.doc_number}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">{docTypeLabel(tx.doc_type)}</td>
                      <td className="py-2.5 px-4 text-slate-800">{tx.customer_name}</td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 tabular-nums">
                        {formatDate(tx.doc_date)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold tabular-nums">
                        {tx.doc_type === 'service_report' && Number(tx.amount) === 0
                          ? '—'
                          : formatPHP(tx.amount)}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusBadge status={tx.status} />
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        <ArrowUpRight className="w-4 h-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Customer Activity Feed */}
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden flex flex-col">
          <div className="px-4 py-3.5 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">Recent Customer Activity</h2>
            <p className="text-xs text-slate-500">Real-time operational log across customers.</p>
          </div>

          {!data?.recent_customer_activity?.length ? (
            <div className="p-8 text-center flex-1 flex flex-col justify-center">
              <p className="text-sm font-medium text-slate-700">No customer activity logged yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Customer registrations, quotations, invoices, payments, and service dispatches will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[430px] overflow-y-auto">
              {data.recent_customer_activity.map((act: any) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => {
                    if (act.entity_id) {
                      onNavigate({
                        section: mapDocTypeToSection(act.entity_type),
                        openId: act.entity_id,
                      });
                    }
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-slate-900 leading-snug">{act.summary}</span>
                    {act.amount !== null && act.amount !== undefined && (
                      <span className="text-xs font-semibold text-slate-800 tabular-nums shrink-0">
                        {formatPHP(act.amount)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{act.actor_name}</span>
                    <span className="tabular-nums">{formatDateTime(act.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
