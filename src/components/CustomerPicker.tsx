import React, { useState, useEffect } from 'react';
import { Users, Check, UserPlus } from 'lucide-react';
import { Customer } from '../types';
import { apiFetch } from '../lib/api';

interface CustomerPickerProps {
  selectedCustomerId: number | null;
  saveAsCustomer: boolean;
  onToggleSaveAsCustomer: (val: boolean) => void;
  onSelectCustomer: (customer: Customer | null) => void;
}

export const CustomerPicker: React.FC<CustomerPickerProps> = ({
  selectedCustomerId,
  saveAsCustomer,
  onToggleSaveAsCustomer,
  onSelectCustomer,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    apiFetch<{ customers: Customer[] }>('/api/customers?status=active')
      .then((d) => setCustomers(d.customers || []))
      .catch(() => {});
  }, []);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;

  const filtered = customers.filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      c.customer_name.toLowerCase().includes(q) ||
      c.company_name.toLowerCase().includes(q) ||
      c.customer_code.toLowerCase().includes(q) ||
      c.contact_number.toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
          <Users className="w-3.5 h-3.5 text-slate-700" />
          Customer Record Auto-Fill
        </div>
        {selectedCustomer ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
              <Check className="w-3 h-3" />
              Linked: {selectedCustomer.customer_code} — {selectedCustomer.customer_name}
            </span>
            <button
              type="button"
              onClick={() => onSelectCustomer(null)}
              className="text-xs text-slate-500 hover:text-slate-800 underline"
            >
              Unlink / Enter New
            </button>
          </div>
        ) : (
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsCustomer}
              onChange={(e) => onToggleSaveAsCustomer(e.target.checked)}
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            <UserPlus className="w-3.5 h-3.5 text-slate-500" />
            Save new customer details to Customer Database automatically
          </label>
        )}
      </div>

      <div className="relative">
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder={
            customers.length === 0
              ? 'No saved customers yet — enter details below to create automatically'
              : 'Search saved customers by name, company, ID, or phone to auto-fill...'
          }
          className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
        />

        {open && customers.length > 0 && (
          <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-300 rounded-md shadow-lg divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="px-3 py-2.5 text-xs text-slate-500">
                No matching customer found. Fill in the customer fields below to create a new record.
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelectCustomer(c);
                    setQuery('');
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {c.customer_name}
                      {c.company_name ? <span className="text-slate-500 font-normal"> • {c.company_name}</span> : null}
                    </div>
                    <div className="text-xs text-slate-500">
                      {c.customer_code}
                      {c.contact_number ? ` • ${c.contact_number}` : ''}
                      {c.billing_address ? ` • ${c.billing_address}` : ''}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-sky-700 shrink-0">Select</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
