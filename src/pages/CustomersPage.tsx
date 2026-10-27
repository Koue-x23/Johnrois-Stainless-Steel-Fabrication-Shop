import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Eye,
  Edit3,
  Archive,
  RotateCcw,
  Users,
  X,
  ArrowLeft,
  FileText,
  Receipt,
  Wrench,
  FileSpreadsheet,
} from 'lucide-react';
import { Customer, NavigationTarget } from '../types';
import { apiFetch, formatDate, formatPHP, generateIdempotencyKey } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';

interface CustomersPageProps {
  initialOpenId?: number;
  initialCreateNew?: boolean;
  onClearInitial: () => void;
  onNavigate: (target: NavigationTarget) => void;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({
  initialOpenId,
  initialCreateNew,
  onClearInitial,
  onNavigate,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');

  const [detailData, setDetailData] = useState<{
    customer: Customer;
    history: {
      quotations: any[];
      invoices: any[];
      payments: any[];
      service_reports: any[];
      billing_statements: any[];
    };
  } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [idemKey, setIdemKey] = useState('');

  // Form fields
  const [customerName, setCustomerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [projectLocations, setProjectLocations] = useState('');
  const [remarks, setRemarks] = useState('');

  const fetchCustomers = () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());

    apiFetch<{ customers: Customer[] }>(`/api/customers?${params.toString()}`)
      .then((res) => setCustomers(res.customers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCustomers();
  }, [statusFilter]);

  useEffect(() => {
    if (initialOpenId) {
      openCustomerDetail(initialOpenId);
      onClearInitial();
    } else if (initialCreateNew) {
      openAddModal();
      onClearInitial();
    }
  }, [initialOpenId, initialCreateNew]);

  const openAddModal = () => {
    setEditingCustomer(null);
    setCustomerName('');
    setCompanyName('');
    setContactNumber('');
    setEmail('');
    setBillingAddress('');
    setProjectLocations('');
    setRemarks('');
    setError('');
    setIdemKey(generateIdempotencyKey());
    setModalOpen(true);
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setCustomerName(c.customer_name);
    setCompanyName(c.company_name || '');
    setContactNumber(c.contact_number || '');
    setEmail(c.email || '');
    setBillingAddress(c.billing_address || '');
    setProjectLocations(c.project_locations || '');
    setRemarks(c.remarks || '');
    setError('');
    setModalOpen(true);
  };

  const openCustomerDetail = async (id: number) => {
    try {
      const res = await apiFetch(`/api/customers/${id}`);
      setDetailData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load customer record.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setError('Customer name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        customer_name: customerName,
        company_name: companyName,
        contact_number: contactNumber,
        email,
        billing_address: billingAddress,
        project_locations: projectLocations,
        remarks,
      };
      if (editingCustomer) {
        await apiFetch(`/api/customers/${editingCustomer.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (detailData?.customer.id === editingCustomer.id) {
          openCustomerDetail(editingCustomer.id);
        }
      } else {
        await apiFetch('/api/customers', {
          method: 'POST',
          idempotencyKey: idemKey,
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      fetchCustomers();
    } catch (err: any) {
      setError(err.message || 'Failed to save customer.');
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (c: Customer) => {
    const nextArchived = c.is_archived ? 0 : 1;
    try {
      await apiFetch(`/api/customers/${c.id}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ is_archived: nextArchived }),
      });
      fetchCustomers();
      if (detailData?.customer.id === c.id) {
        openCustomerDetail(c.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update customer status.');
    }
  };

  const renderModal = () => {
    if (!modalOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
        <div className="bg-white rounded-lg border border-slate-300 shadow-xl w-full max-w-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white">
            <h3 className="text-sm font-semibold">
              {editingCustomer
                ? `Edit Customer (${editingCustomer.customer_code})`
                : 'Add New Customer Record'}
            </h3>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="text-slate-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
            {error && (
              <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                  Contact Number
                </label>
                <input
                  type="text"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="e.g., +63 917 XXX XXXX"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Billing Address
              </label>
              <input
                type="text"
                value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Project or Service Locations (One per line)
              </label>
              <textarea
                rows={2}
                value={projectLocations}
                onChange={(e) => setProjectLocations(e.target.value)}
                placeholder="Enter branch, kitchen, or site addresses (one per line for quick selection)"
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

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingCustomer ? 'Save Changes' : 'Create Customer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  if (detailData) {
    const c = detailData.customer;
    const h = detailData.history;
    const totalBilled = h.invoices.reduce((s, i) => s + Number(i.total_amount_due || 0), 0);
    const totalPaid = h.invoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0);
    const totalBalance = h.invoices.reduce((s, i) => s + Number(i.remaining_balance || 0), 0);

    return (
      <div className="space-y-5">
        {renderModal()}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDetailData(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All Customers
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900">{c.customer_name}</h1>
                <span className="text-xs font-mono px-2 py-0.5 bg-slate-200 text-slate-800 rounded">
                  {c.customer_code}
                </span>
                <StatusBadge status={c.is_archived ? 'Archived' : 'Active'} />
              </div>
              {c.company_name && <p className="text-xs text-slate-600">{c.company_name}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onNavigate({ section: 'quotations', createNew: true, prefillCustomerId: c.id })
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
            >
              <FileText className="w-3.5 h-3.5" />+ Quotation
            </button>
            <button
              type="button"
              onClick={() =>
                onNavigate({ section: 'invoices', createNew: true, prefillCustomerId: c.id })
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Receipt className="w-3.5 h-3.5 text-sky-700" />+ Invoice
            </button>
            <button
              type="button"
              onClick={() =>
                onNavigate({
                  section: 'service-reports',
                  createNew: true,
                  prefillCustomerId: c.id,
                })
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Wrench className="w-3.5 h-3.5 text-sky-700" />+ Service Report
            </button>
            <button
              type="button"
              onClick={() =>
                onNavigate({
                  section: 'billing-statements',
                  createNew: true,
                  prefillCustomerId: c.id,
                })
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-sky-700" />+ Statement
            </button>
            <button
              type="button"
              onClick={() => openEditModal(c)}
              className="px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit Profile
            </button>
          </div>
        </div>

        {/* Profile & Financial Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-md p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <div className="font-semibold uppercase text-slate-400">Contact Number</div>
              <div className="text-slate-900 font-medium mt-0.5">{c.contact_number || '—'}</div>
            </div>
            <div>
              <div className="font-semibold uppercase text-slate-400">Email Address</div>
              <div className="text-slate-900 font-medium mt-0.5">{c.email || '—'}</div>
            </div>
            <div>
              <div className="font-semibold uppercase text-slate-400">Billing Address</div>
              <div className="text-slate-900 mt-0.5">{c.billing_address || '—'}</div>
            </div>
            <div>
              <div className="font-semibold uppercase text-slate-400">Project / Service Locations</div>
              <div className="text-slate-900 whitespace-pre-wrap mt-0.5">
                {c.project_locations || '—'}
              </div>
            </div>
            {c.remarks && (
              <div className="sm:col-span-2">
                <div className="font-semibold uppercase text-slate-400">Remarks</div>
                <div className="text-slate-900 mt-0.5">{c.remarks}</div>
              </div>
            )}
          </div>

          <div className="bg-slate-900 text-white rounded-md p-4 flex flex-col justify-between space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Total Billed</span>
              <span className="font-bold tabular-nums">{formatPHP(totalBilled)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Total Paid</span>
              <span className="font-bold text-emerald-400 tabular-nums">{formatPHP(totalPaid)}</span>
            </div>
            <div className="pt-2 border-t border-slate-700 flex justify-between items-baseline">
              <span className="text-xs uppercase tracking-wider text-amber-300 font-semibold">
                Outstanding Balance
              </span>
              <span className="text-lg font-extrabold text-amber-300 tabular-nums">
                {formatPHP(totalBalance)}
              </span>
            </div>
          </div>
        </div>

        {/* Complete Customer Transaction History */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Invoices */}
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-xs uppercase tracking-wider text-slate-700">
              Invoices ({h.invoices.length})
            </div>
            {h.invoices.length === 0 ? (
              <div className="p-5 text-xs text-slate-500">No invoices recorded for this customer.</div>
            ) : (
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {h.invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => onNavigate({ section: 'invoices', openId: inv.id })}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2.5 px-4 font-semibold text-sky-800 tabular-nums">
                        {inv.invoice_number}
                      </td>
                      <td className="py-2.5 px-2 tabular-nums text-slate-600">
                        {formatDate(inv.invoice_date)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold tabular-nums">
                        {formatPHP(inv.total_amount_due)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <StatusBadge status={inv.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Quotations */}
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-xs uppercase tracking-wider text-slate-700">
              Quotations ({h.quotations.length})
            </div>
            {h.quotations.length === 0 ? (
              <div className="p-5 text-xs text-slate-500">No quotations recorded for this customer.</div>
            ) : (
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {h.quotations.map((q) => (
                    <tr
                      key={q.id}
                      onClick={() => onNavigate({ section: 'quotations', openId: q.id })}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2.5 px-4 font-semibold text-sky-800 tabular-nums">
                        {q.quotation_number}
                      </td>
                      <td className="py-2.5 px-2 tabular-nums text-slate-600">
                        {formatDate(q.date_issued)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold tabular-nums">
                        {formatPHP(q.grand_total)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <StatusBadge status={q.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Service Reports */}
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-xs uppercase tracking-wider text-slate-700">
              Service Reports ({h.service_reports.length})
            </div>
            {h.service_reports.length === 0 ? (
              <div className="p-5 text-xs text-slate-500">
                No service reports recorded for this customer.
              </div>
            ) : (
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {h.service_reports.map((sr) => (
                    <tr
                      key={sr.id}
                      onClick={() => onNavigate({ section: 'service-reports', openId: sr.id })}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2.5 px-4 font-semibold text-sky-800 tabular-nums">
                        {sr.report_number}
                      </td>
                      <td className="py-2.5 px-2 tabular-nums text-slate-600">
                        {formatDate(sr.service_date)}
                      </td>
                      <td className="py-2.5 px-2 text-slate-700">{sr.job_type}</td>
                      <td className="py-2.5 px-4 text-right">
                        <StatusBadge status={sr.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Billing Statements */}
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-xs uppercase tracking-wider text-slate-700">
              Billing Statements ({h.billing_statements.length})
            </div>
            {h.billing_statements.length === 0 ? (
              <div className="p-5 text-xs text-slate-500">
                No billing statements generated for this customer.
              </div>
            ) : (
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {h.billing_statements.map((st) => (
                    <tr
                      key={st.id}
                      onClick={() => onNavigate({ section: 'billing-statements', openId: st.id })}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2.5 px-4 font-semibold text-sky-800 tabular-nums">
                        {st.statement_number}
                      </td>
                      <td className="py-2.5 px-2 tabular-nums text-slate-600">
                        {formatDate(st.period_from)} – {formatDate(st.period_to)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold tabular-nums">
                        {formatPHP(st.outstanding_balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {renderModal()}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Customers</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Customer directory with saved contact details, project sites, and full transaction history.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Customer
        </button>
      </div>

      {/* Search & Status Filter */}
      <div className="bg-white border border-slate-200 rounded-md p-3.5 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchCustomers();
          }}
          className="flex-1 min-w-[220px] flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer ID, name, company, phone, or address..."
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
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded bg-white"
        >
          <option value="active">Active Customers</option>
          <option value="archived">Archived Customers</option>
          <option value="all">All Customers</option>
        </select>
      </div>

      {/* Customers Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Users className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No customer records found</p>
            <p className="text-xs text-slate-500">
              Add customers here or create a quotation/invoice to automatically save new customers.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-600">
                <tr>
                  <th className="py-3 px-4 text-left font-semibold">Customer ID</th>
                  <th className="py-3 px-4 text-left font-semibold">Name & Company</th>
                  <th className="py-3 px-4 text-left font-semibold">Contact</th>
                  <th className="py-3 px-4 text-left font-semibold">Billing Address</th>
                  <th className="py-3 px-4 text-right font-semibold">Total Billed</th>
                  <th className="py-3 px-4 text-right font-semibold">Balance</th>
                  <th className="py-3 px-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => openCustomerDetail(c.id)}
                        className="hover:text-sky-700 hover:underline"
                      >
                        {c.customer_code}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => openCustomerDetail(c.id)}
                        className="text-left font-medium text-slate-900 hover:text-sky-700"
                      >
                        {c.customer_name}
                      </button>
                      {c.company_name && <div className="text-xs text-slate-500">{c.company_name}</div>}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div>{c.contact_number || '—'}</div>
                      {c.email && <div className="text-slate-400">{c.email}</div>}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 max-w-[200px] truncate">
                      {c.billing_address || '—'}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-xs font-semibold">
                      {formatPHP(c.total_billed || 0)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-900">
                      {formatPHP(c.outstanding_balance || 0)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openCustomerDetail(c.id)}
                          title="View History"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(c)}
                          title="Edit"
                          className="p-1.5 text-slate-600 hover:text-sky-700 hover:bg-slate-100 rounded"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleArchive(c)}
                          title={c.is_archived ? 'Restore' : 'Archive'}
                          className="p-1.5 text-slate-400 hover:text-amber-700 hover:bg-amber-50 rounded"
                        >
                          {c.is_archived ? (
                            <RotateCcw className="w-4 h-4" />
                          ) : (
                            <Archive className="w-4 h-4" />
                          )}
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
