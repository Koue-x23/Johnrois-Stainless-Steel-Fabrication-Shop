import React, { useEffect, useRef, useState } from 'react';
import { Search, UserCheck, Users, ChevronDown } from 'lucide-react';
import { Employee } from '../types';
import { apiFetch, resolveAssetUrl } from '../lib/api';

interface Props {
  selectedEmployeeId: number | null;
  onSelect: (employee: Employee) => void;
  includeInactive?: boolean;
  label?: string;
}

export const EmployeePicker: React.FC<Props> = ({
  selectedEmployeeId,
  onSelect,
  includeInactive = false,
  label = 'Select Employee from Directory',
}) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    const statusParam = includeInactive ? 'all' : 'active';
    apiFetch<{ employees: Employee[] }>(`/api/employees?status=${statusParam}`)
      .then((res) => setEmployees(res.employees || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [includeInactive]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = employees.find((e) => e.id === selectedEmployeeId) || null;

  const filtered = employees.filter((e) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      e.full_name.toLowerCase().includes(q) ||
      e.employee_code.toLowerCase().includes(q) ||
      e.position_title.toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q)
    );
  });

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left bg-white border border-slate-300 rounded hover:border-slate-400 text-sm"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {selected ? (
            <>
              {selected.photo_url ? (
                <img
                  src={resolveAssetUrl(selected.photo_url)}
                  alt={selected.full_name}
                  className="w-6 h-6 rounded-full object-contain bg-slate-100 border border-slate-300 shrink-0"
                />
              ) : (
                <UserCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              )}
              <div className="truncate">
                <span className="font-semibold text-slate-900">{selected.full_name}</span>
                <span className="text-xs text-slate-500 ml-2 font-mono">
                  {selected.employee_code}
                </span>
                <span className="text-xs text-slate-500 ml-1.5">• {selected.position_title}</span>
              </div>
            </>
          ) : (
            <>
              <Users className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-slate-500">
                {loading
                  ? 'Loading employee directory...'
                  : 'Choose employee to auto-populate verified details...'}
              </span>
            </>
          )}
        </div>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-300 rounded-md shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-200 bg-slate-50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, Employee ID, position, or department..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-sky-600"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="p-3 text-xs text-slate-500 text-center">
                {employees.length === 0
                  ? 'No employee records yet. Add employees in Employee Directory first.'
                  : 'No matching employees found.'}
              </div>
            ) : (
              filtered.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => {
                    onSelect(emp);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`w-full px-3 py-2 text-left hover:bg-sky-50 flex items-center justify-between gap-3 ${
                    emp.id === selectedEmployeeId ? 'bg-sky-50/70' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                      {emp.photo_url ? (
                        <img
                          src={resolveAssetUrl(emp.photo_url)}
                          alt={emp.full_name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-[11px] font-bold text-slate-500">
                          {emp.full_name
                            .split(' ')
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((p) => p[0]?.toUpperCase())
                            .join('')}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {emp.full_name}
                        {!emp.is_active && (
                          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {emp.position_title}
                        {emp.department ? ` • ${emp.department}` : ''}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-700 shrink-0">
                    {emp.employee_code}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
