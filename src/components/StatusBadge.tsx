import React from 'react';

const STATUS_STYLES: Record<string, string> = {
  // Quotation statuses
  Draft: 'bg-slate-100 text-slate-700 border-slate-300',
  Sent: 'bg-sky-50 text-sky-800 border-sky-200',
  Approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  Expired: 'bg-amber-50 text-amber-800 border-amber-200',

  // Invoice statuses
  Unpaid: 'bg-amber-50 text-amber-800 border-amber-200',
  'Partially Paid': 'bg-sky-50 text-sky-800 border-sky-200',
  Paid: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Overdue: 'bg-rose-50 text-rose-800 border-rose-300 font-semibold',

  // Service Report statuses
  Scheduled: 'bg-slate-100 text-slate-700 border-slate-300',
  'In Progress': 'bg-sky-50 text-sky-800 border-sky-200',
  Completed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Cancelled: 'bg-rose-50 text-rose-700 border-rose-200',

  // General & HR statuses
  Active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Inactive: 'bg-slate-100 text-slate-600 border-slate-300',
  Archived: 'bg-slate-100 text-slate-600 border-slate-300',
  Issued: 'bg-sky-50 text-sky-800 border-sky-200',
  Regular: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Probationary: 'bg-sky-50 text-sky-800 border-sky-200',
  Contractual: 'bg-amber-50 text-amber-800 border-amber-200',
  'Project-Based': 'bg-amber-50 text-amber-800 border-amber-200',
  'On Leave': 'bg-amber-50 text-amber-800 border-amber-200',
  Resigned: 'bg-slate-100 text-slate-700 border-slate-300',
  Terminated: 'bg-rose-50 text-rose-800 border-rose-200',
  Revoked: 'bg-rose-50 text-rose-800 border-rose-200',
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cls = STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 border-slate-300';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {status}
    </span>
  );
};
