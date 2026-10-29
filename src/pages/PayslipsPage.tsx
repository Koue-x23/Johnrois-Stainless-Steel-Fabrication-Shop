import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Eye,
  Edit3,
  Printer,
  Download,
  Trash2,
  ArrowLeft,
  Save,
  Banknote,
  PenTool,
  X,
} from 'lucide-react';
import { BusinessSettings, Employee, PayBasis, Payslip, PayslipStatus } from '../types';
import {
  apiFetch,
  downloadAuthenticatedFile,
  formatDate,
  formatPHP,
  generateIdempotencyKey,
  resolveAssetUrl,
  round2,
  todayYMD,
  uploadSignatureDataUrl,
} from '../lib/api';
import { EmployeePicker } from '../components/EmployeePicker';
import { PrintablePayslip } from '../components/HrPrintableDocuments';
import { StatusBadge } from '../components/StatusBadge';
import { SignaturePadModal } from '../components/SignaturePadModal';

interface PayslipsPageProps {
  settings: BusinessSettings;
  initialOpenId?: number;
  initialCreateNew?: boolean;
  prefillEmployeeId?: number;
  onClearInitial: () => void;
}

export const PayslipsPage: React.FC<PayslipsPageProps> = ({
  settings,
  initialOpenId,
  initialCreateNew,
  prefillEmployeeId,
  onClearInitial,
}) => {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [mode, setMode] = useState<'list' | 'edit' | 'preview'>('list');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pageNotice, setPageNotice] = useState('');
  const [idemKey, setIdemKey] = useState('');
  const [sigModalOpen, setSigModalOpen] = useState(false);

  // Form fields
  const [payslipNumber, setPayslipNumber] = useState('');
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [employeeCode, setEmployeeCode] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [positionTitle, setPositionTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [payPeriodStart, setPayPeriodStart] = useState(todayYMD());
  const [payPeriodEnd, setPayPeriodEnd] = useState(todayYMD());
  const [paymentDate, setPaymentDate] = useState(todayYMD());
  const [payBasis, setPayBasis] = useState<PayBasis>('daily');
  const [baseRate, setBaseRate] = useState('0');
  const [daysWorked, setDaysWorked] = useState('0');
  const [hoursWorked, setHoursWorked] = useState('0');
  const [overtimeHours, setOvertimeHours] = useState('0');
  const [overtimeRate, setOvertimeRate] = useState('0');
  const [manualOvertimePay, setManualOvertimePay] = useState('0');
  const [allowances, setAllowances] = useState('0');
  const [bonuses, setBonuses] = useState('0');
  const [otherEarnings, setOtherEarnings] = useState('0');
  const [otherEarningsNote, setOtherEarningsNote] = useState('');

  const [sssDeduction, setSssDeduction] = useState('0');
  const [philhealthDeduction, setPhilhealthDeduction] = useState('0');
  const [pagibigDeduction, setPagibigDeduction] = useState('0');
  const [withholdingTax, setWithholdingTax] = useState('0');
  const [cashAdvance, setCashAdvance] = useState('0');
  const [otherDeductions, setOtherDeductions] = useState('0');
  const [otherDeductionsNote, setOtherDeductionsNote] = useState('');

  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [status, setStatus] = useState<PayslipStatus>('Issued');
  const [preparedBy, setPreparedBy] = useState('');
  const [approvedBy, setApprovedBy] = useState(settings.authorized_representative || '');
  const [employeeSignatureUrl, setEmployeeSignatureUrl] = useState('');
  const [remarks, setRemarks] = useState('');

  const fetchPayslips = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());
    apiFetch<{ payslips: Payslip[] }>(`/api/payslips?${params.toString()}`)
      .then((res) => setPayslips(res.payslips || []))
      .catch((err: any) => setError(err.message || 'Failed to load payslips.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPayslips();
  }, [statusFilter]);

  useEffect(() => {
    if (initialOpenId) {
      openPayslip(initialOpenId, 'preview');
      onClearInitial();
    } else if (initialCreateNew) {
      startNewPayslip(prefillEmployeeId);
      onClearInitial();
    }
  }, [initialOpenId, initialCreateNew, prefillEmployeeId]);

  const applyEmployeeSelection = (emp: Employee) => {
    setEmployeeId(emp.id);
    setEmployeeCode(emp.employee_code);
    setEmployeeName(emp.full_name);
    setPositionTitle(emp.position_title);
    setDepartment(emp.department || '');
    if (emp.pay_basis) setPayBasis(emp.pay_basis);
    if (emp.default_rate > 0) setBaseRate(String(emp.default_rate));
  };

  const startNewPayslip = async (empIdToPrefill?: number) => {
    const today = todayYMD();
    setEditingId(null);
    setIdemKey(generateIdempotencyKey());
    setPayslipNumber('');
    setEmployeeId(null);
    setEmployeeCode('');
    setEmployeeName('');
    setPositionTitle('');
    setDepartment('');
    setPayPeriodStart(today);
    setPayPeriodEnd(today);
    setPaymentDate(today);
    setPayBasis('daily');
    setBaseRate('0');
    setDaysWorked('0');
    setHoursWorked('0');
    setOvertimeHours('0');
    setOvertimeRate('0');
    setManualOvertimePay('0');
    setAllowances('0');
    setBonuses('0');
    setOtherEarnings('0');
    setOtherEarningsNote('');
    setSssDeduction('0');
    setPhilhealthDeduction('0');
    setPagibigDeduction('0');
    setWithholdingTax('0');
    setCashAdvance('0');
    setOtherDeductions('0');
    setOtherDeductionsNote('');
    setPaymentMethod('Cash');
    setStatus('Issued');
    setPreparedBy('');
    setApprovedBy(settings.authorized_representative || '');
    setEmployeeSignatureUrl('');
    setRemarks('');
    setError('');
    setMode('edit');

    try {
      const nextRes = await apiFetch<{ next_number: string }>(
        `/api/payslips/next-number?date=${today}`
      );
      if (nextRes.next_number) setPayslipNumber(nextRes.next_number);
    } catch (_) {}

    if (empIdToPrefill) {
      try {
        const empRes = await apiFetch<{ employee: Employee }>(`/api/employees/${empIdToPrefill}`);
        if (empRes.employee) applyEmployeeSelection(empRes.employee);
      } catch (_) {}
    }
  };

  const populateFromSaved = (p: Payslip) => {
    setEditingId(p.id);
    setPayslipNumber(p.payslip_number);
    setEmployeeId(p.employee_id);
    setEmployeeCode(p.employee_code);
    setEmployeeName(p.employee_name);
    setPositionTitle(p.position_title);
    setDepartment(p.department || '');
    setPayPeriodStart(p.pay_period_start);
    setPayPeriodEnd(p.pay_period_end);
    setPaymentDate(p.payment_date);
    setPayBasis(p.pay_basis);
    setBaseRate(String(p.base_rate));
    setDaysWorked(String(p.days_worked));
    setHoursWorked(String(p.hours_worked));
    setOvertimeHours(String(p.overtime_hours));
    setOvertimeRate(String(p.overtime_rate));
    setManualOvertimePay(String(p.overtime_pay));
    setAllowances(String(p.allowances));
    setBonuses(String(p.bonuses));
    setOtherEarnings(String(p.other_earnings));
    setOtherEarningsNote(p.other_earnings_note || '');
    setSssDeduction(String(p.sss_deduction));
    setPhilhealthDeduction(String(p.philhealth_deduction));
    setPagibigDeduction(String(p.pagibig_deduction));
    setWithholdingTax(String(p.withholding_tax));
    setCashAdvance(String(p.cash_advance));
    setOtherDeductions(String(p.other_deductions));
    setOtherDeductionsNote(p.other_deductions_note || '');
    setPaymentMethod(p.payment_method || 'Cash');
    setStatus(p.status);
    setPreparedBy(p.prepared_by || '');
    setApprovedBy(p.approved_by || '');
    setEmployeeSignatureUrl(p.employee_signature_url || '');
    setRemarks(p.remarks || '');
  };

  const openPayslip = async (id: number, targetMode: 'edit' | 'preview') => {
    setError('');
    try {
      const res = await apiFetch<{ payslip: Payslip }>(`/api/payslips/${id}`);
      populateFromSaved(res.payslip);
      setMode(targetMode);
    } catch (err: any) {
      setError(err.message || 'Failed to open payslip.');
    }
  };

  // Auto-calculated payroll totals
  const computed = useMemo(() => {
    const rate = Math.max(0, round2(baseRate));
    const days = Math.max(0, Number(daysWorked) || 0);
    const hours = Math.max(0, Number(hoursWorked) || 0);

    let regularPay = 0;
    if (payBasis === 'daily') regularPay = round2(rate * days);
    else if (payBasis === 'hourly') regularPay = round2(rate * hours);
    else if (payBasis === 'semi_monthly') regularPay = round2(rate / 2);
    else if (payBasis === 'monthly') regularPay = round2(rate);

    const otHrs = Math.max(0, Number(overtimeHours) || 0);
    const otRt = Math.max(0, round2(overtimeRate));
    const overtimePay =
      otHrs > 0 && otRt > 0 ? round2(otHrs * otRt) : Math.max(0, round2(manualOvertimePay));

    const allow = Math.max(0, round2(allowances));
    const bonus = Math.max(0, round2(bonuses));
    const otherEarn = Math.max(0, round2(otherEarnings));

    const sss = Math.max(0, round2(sssDeduction));
    const philhealth = Math.max(0, round2(philhealthDeduction));
    const pagibig = Math.max(0, round2(pagibigDeduction));
    const tax = Math.max(0, round2(withholdingTax));
    const ca = Math.max(0, round2(cashAdvance));
    const otherDed = Math.max(0, round2(otherDeductions));

    const totalEarnings = round2(regularPay + overtimePay + allow + bonus + otherEarn);
    const totalDeductions = round2(sss + philhealth + pagibig + tax + ca + otherDed);
    const netPay = round2(totalEarnings - totalDeductions);

    return {
      regularPay,
      overtimePay,
      totalEarnings,
      totalDeductions,
      netPay,
    };
  }, [
    payBasis,
    baseRate,
    daysWorked,
    hoursWorked,
    overtimeHours,
    overtimeRate,
    manualOvertimePay,
    allowances,
    bonuses,
    otherEarnings,
    sssDeduction,
    philhealthDeduction,
    pagibigDeduction,
    withholdingTax,
    cashAdvance,
    otherDeductions,
  ]);

  const draftSnapshot: Partial<Payslip> = {
    id: editingId || undefined,
    payslip_number: payslipNumber,
    employee_id: employeeId,
    employee_code: employeeCode,
    employee_name: employeeName,
    position_title: positionTitle,
    department,
    pay_period_start: payPeriodStart,
    pay_period_end: payPeriodEnd,
    payment_date: paymentDate,
    pay_basis: payBasis,
    base_rate: round2(baseRate),
    days_worked: Number(daysWorked) || 0,
    hours_worked: Number(hoursWorked) || 0,
    regular_pay: computed.regularPay,
    overtime_hours: Number(overtimeHours) || 0,
    overtime_rate: round2(overtimeRate),
    overtime_pay: computed.overtimePay,
    allowances: round2(allowances),
    bonuses: round2(bonuses),
    other_earnings: round2(otherEarnings),
    other_earnings_note: otherEarningsNote,
    sss_deduction: round2(sssDeduction),
    philhealth_deduction: round2(philhealthDeduction),
    pagibig_deduction: round2(pagibigDeduction),
    withholding_tax: round2(withholdingTax),
    cash_advance: round2(cashAdvance),
    other_deductions: round2(otherDeductions),
    other_deductions_note: otherDeductionsNote,
    total_earnings: computed.totalEarnings,
    total_deductions: computed.totalDeductions,
    net_pay: computed.netPay,
    payment_method: paymentMethod,
    remarks,
    prepared_by: preparedBy,
    approved_by: approvedBy,
    employee_signature_url: employeeSignatureUrl,
    status,
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!employeeName.trim() || !employeeCode.trim()) {
      setError('Please select an employee or supply both Employee Name and Employee ID.');
      return;
    }
    if (!positionTitle.trim()) {
      setError('Position / Job Title is required.');
      return;
    }
    if (!payPeriodStart || !payPeriodEnd || !paymentDate) {
      setError('Pay period start, pay period end, and payment date are required.');
      return;
    }
    if (payPeriodStart > payPeriodEnd) {
      setError('Pay period start date must be on or before pay period end date.');
      return;
    }
    if (computed.totalEarnings <= 0) {
      setError('Total earnings must be greater than ₱0.00.');
      return;
    }
    if (computed.netPay < 0) {
      setError('Total deductions exceed total earnings, resulting in negative net pay.');
      return;
    }

    setSaving(true);
    try {
      const res = editingId
        ? await apiFetch<{ payslip: Payslip }>(`/api/payslips/${editingId}`, {
            method: 'PUT',
            body: JSON.stringify(draftSnapshot),
          })
        : await apiFetch<{ payslip: Payslip }>('/api/payslips', {
            method: 'POST',
            idempotencyKey: idemKey,
            body: JSON.stringify(draftSnapshot),
          });

      populateFromSaved(res.payslip);
      setPageNotice(`Saved payslip ${res.payslip.payslip_number}.`);
      fetchPayslips();
      setMode('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to save payslip.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (p: Payslip) => {
    if (!window.confirm(`Archive payslip ${p.payslip_number} for ${p.employee_name}?`)) return;
    try {
      await apiFetch(`/api/payslips/${p.id}`, { method: 'DELETE' });
      setPageNotice(`Archived payslip ${p.payslip_number}.`);
      setMode('list');
      fetchPayslips();
    } catch (err: any) {
      setError(err.message || 'Failed to archive payslip.');
    }
  };

  // ============================================================================
  // PREVIEW / PRINT MODE
  // ============================================================================
  if (mode === 'preview') {
    return (
      <div className="space-y-4">
        <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-md p-3.5">
          <button
            type="button"
            onClick={() => setMode('list')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Payslips
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('edit')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Payslip
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Payslip
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() =>
                  downloadAuthenticatedFile(
                    `/api/payslips/${editingId}/pdf`,
                    `${payslipNumber || 'Payslip'}.pdf`
                  ).catch((err) => setError(err.message))
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                Export PDF
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="no-print p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {error}
          </div>
        )}

        <PrintablePayslip payslip={draftSnapshot} settings={settings} />
      </div>
    );
  }

  // ============================================================================
  // CREATE / EDIT FORM MODE
  // ============================================================================
  if (mode === 'edit') {
    return (
      <div className="space-y-5 max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                {editingId ? `Edit Payslip ${payslipNumber}` : 'Create Employee Payslip'}
              </h1>
              <p className="text-xs text-slate-500">
                Configurable pay basis, earnings, and deductions with automatic net pay calculation.
              </p>
            </div>
          </div>

          {editingId && (
            <button
              type="button"
              onClick={() => setMode('preview')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Eye className="w-3.5 h-3.5" />
              Print Preview
            </button>
          )}
        </div>

        {error && (
          <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          {/* Employee & Pay Period */}
          <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
              1. Employee & Pay Period Details
            </h2>

            <EmployeePicker
              selectedEmployeeId={employeeId}
              onSelect={applyEmployeeSelection}
              includeInactive
            />

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Payslip No.
                </label>
                <input
                  type="text"
                  readOnly
                  value={payslipNumber || 'Auto-assigned'}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded text-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Employee ID <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Employee Full Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Position / Job Title <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={positionTitle}
                  onChange={(e) => setPositionTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Department (Optional)
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Period Start <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={payPeriodStart}
                  onChange={(e) => setPayPeriodStart(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Period End <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={payPeriodEnd}
                  onChange={(e) => setPayPeriodEnd(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Payment Date <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded bg-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="GCash">GCash</option>
                  <option value="Check">Check</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PayslipStatus)}
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded bg-white"
                >
                  <option value="Draft">Draft</option>
                  <option value="Issued">Issued</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
            </div>
          </div>

          {/* Earnings & Deductions Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* EARNINGS */}
            <div className="bg-white border border-slate-200 rounded-md p-5 space-y-3.5">
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
                2. Configurable Earnings
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Pay Basis
                  </label>
                  <select
                    value={payBasis}
                    onChange={(e) => setPayBasis(e.target.value as PayBasis)}
                    className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded bg-white"
                  >
                    <option value="daily">Daily Rate</option>
                    <option value="semi_monthly">Semi-Monthly (½ Monthly)</option>
                    <option value="monthly">Monthly Basic Salary</option>
                    <option value="hourly">Hourly Rate</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    {payBasis === 'daily'
                      ? 'Daily Rate (₱)'
                      : payBasis === 'hourly'
                        ? 'Hourly Rate (₱)'
                        : 'Monthly Basic Salary (₱)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={baseRate}
                    onChange={(e) => setBaseRate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono text-right border border-slate-300 rounded"
                  />
                </div>
              </div>

              {payBasis === 'daily' && (
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                      Days Worked
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={daysWorked}
                      onChange={(e) => setDaysWorked(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono text-right border border-slate-300 rounded"
                    />
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-200 text-right">
                    <div className="text-[10px] uppercase text-slate-500">Computed Basic Pay</div>
                    <div className="text-sm font-mono font-bold text-slate-900">
                      {formatPHP(computed.regularPay)}
                    </div>
                  </div>
                </div>
              )}

              {payBasis === 'hourly' && (
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                      Hours Worked
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={hoursWorked}
                      onChange={(e) => setHoursWorked(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono text-right border border-slate-300 rounded"
                    />
                  </div>
                  <div className="p-2 rounded bg-slate-50 border border-slate-200 text-right">
                    <div className="text-[10px] uppercase text-slate-500">Computed Basic Pay</div>
                    <div className="text-sm font-mono font-bold text-slate-900">
                      {formatPHP(computed.regularPay)}
                    </div>
                  </div>
                </div>
              )}

              {(payBasis === 'semi_monthly' || payBasis === 'monthly') && (
                <div className="p-2.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <span className="text-xs text-slate-600">
                    Computed Regular Pay ({payBasis === 'semi_monthly' ? '50% of Monthly' : 'Full Monthly'})
                  </span>
                  <span className="text-sm font-mono font-bold text-slate-900">
                    {formatPHP(computed.regularPay)}
                  </span>
                </div>
              )}

              {/* Overtime */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                    OT Hours
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={overtimeHours}
                    onChange={(e) => setOvertimeHours(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm font-mono text-right border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                    OT Rate / Hr (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={overtimeRate}
                    onChange={(e) => setOvertimeRate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm font-mono text-right border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                    Overtime Pay (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    readOnly={Number(overtimeHours) > 0 && Number(overtimeRate) > 0}
                    value={
                      Number(overtimeHours) > 0 && Number(overtimeRate) > 0
                        ? computed.overtimePay
                        : manualOvertimePay
                    }
                    onChange={(e) => setManualOvertimePay(e.target.value)}
                    className={`w-full px-2.5 py-1.5 text-sm font-mono text-right border border-slate-300 rounded ${
                      Number(overtimeHours) > 0 && Number(overtimeRate) > 0 ? 'bg-slate-50' : ''
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Allowances (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={allowances}
                    onChange={(e) => setAllowances(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono text-right border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Bonuses / Incentives (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={bonuses}
                    onChange={(e) => setBonuses(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono text-right border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Other Earnings (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={otherEarnings}
                    onChange={(e) => setOtherEarnings(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono text-right border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Other Earnings Label
                  </label>
                  <input
                    type="text"
                    value={otherEarningsNote}
                    onChange={(e) => setOtherEarningsNote(e.target.value)}
                    placeholder="e.g. Meal / Site Allowance"
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded"
                  />
                </div>
              </div>
            </div>

            {/* DEDUCTIONS */}
            <div className="bg-white border border-slate-200 rounded-md p-5 space-y-3.5">
              <div className="border-b border-slate-200 pb-2">
                <h2 className="text-sm font-bold text-slate-900">
                  3. Configurable Contributions & Deductions
                </h2>
                <p className="text-[11px] text-slate-500">
                  Enter exact verified deduction amounts applicable for this pay period.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    SSS Contribution (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={sssDeduction}
                    onChange={(e) => setSssDeduction(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono text-right border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    PhilHealth Contribution (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={philhealthDeduction}
                    onChange={(e) => setPhilhealthDeduction(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono text-right border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Pag-IBIG Contribution (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={pagibigDeduction}
                    onChange={(e) => setPagibigDeduction(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono text-right border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Withholding Tax (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={withholdingTax}
                    onChange={(e) => setWithholdingTax(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono text-right border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Cash Advance (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cashAdvance}
                    onChange={(e) => setCashAdvance(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono text-right border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Other Deductions (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={otherDeductions}
                    onChange={(e) => setOtherDeductions(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono text-right border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Other Deductions Label (Optional)
                </label>
                <input
                  type="text"
                  value={otherDeductionsNote}
                  onChange={(e) => setOtherDeductionsNote(e.target.value)}
                  placeholder="e.g. Loan amortization / Tool replacement"
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded"
                />
              </div>
            </div>
          </div>

          {/* Summary & Signatories */}
          <div className="bg-slate-900 text-white rounded-md p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Total Earnings
              </div>
              <div className="text-lg font-mono font-bold tabular-nums">
                {formatPHP(computed.totalEarnings)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Total Deductions
              </div>
              <div className="text-lg font-mono font-bold tabular-nums text-amber-300">
                {formatPHP(computed.totalDeductions)}
              </div>
            </div>
            <div className="sm:text-right">
              <div className="text-[11px] uppercase tracking-wider text-sky-300">
                Net Take-Home Pay
              </div>
              <div
                className={`text-2xl font-mono font-extrabold tabular-nums ${
                  computed.netPay < 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {formatPHP(computed.netPay)}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
              4. Signatories & Remarks
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Prepared By
                </label>
                <input
                  type="text"
                  value={preparedBy}
                  onChange={(e) => setPreparedBy(e.target.value)}
                  placeholder="Payroll preparer name"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Approved By
                </label>
                <input
                  type="text"
                  value={approvedBy}
                  onChange={(e) => setApprovedBy(e.target.value)}
                  placeholder="Authorized approver name"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded bg-slate-50 border border-slate-200">
              <div>
                <div className="text-xs font-semibold text-slate-800">
                  Employee Acknowledgment Signature (Optional)
                </div>
                <p className="text-[11px] text-slate-500">
                  Leave blank to sign on printed hardcopy, or capture digital acknowledgment.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {employeeSignatureUrl && (
                  <img
                    src={resolveAssetUrl(employeeSignatureUrl)}
                    alt="Employee Signature"
                    className="h-9 bg-white border border-slate-300 rounded px-2 object-contain"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setSigModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  {employeeSignatureUrl ? 'Replace Signature' : 'Capture Signature'}
                </button>
                {employeeSignatureUrl && (
                  <button
                    type="button"
                    onClick={() => setEmployeeSignatureUrl('')}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Remarks / Payroll Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="px-4 py-2.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving Payslip...' : 'Save & Preview Payslip'}
            </button>
          </div>
        </form>

        <SignaturePadModal
          isOpen={sigModalOpen}
          title="Employee Acknowledgment Signature"
          onClose={() => setSigModalOpen(false)}
          onSave={async (dataUrl) => {
            const uploaded = await uploadSignatureDataUrl(dataUrl);
            setEmployeeSignatureUrl(uploaded.url);
            setSigModalOpen(false);
          }}
        />
      </div>
    );
  }

  // ============================================================================
  // LIST VIEW
  // ============================================================================
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Payslip Maker</h1>
          <p className="text-xs text-slate-600">
            Generate, save, print, and export accurate employee payslips with duplicate pay-period protection.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              downloadAuthenticatedFile(
                '/api/backup/export-csv/payslips',
                `johnrois-payslips-${todayYMD()}.csv`
              ).catch((err) => setError(err.message))
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => startNewPayslip()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
          >
            <Plus className="w-4 h-4" />
            New Payslip
          </button>
        </div>
      </div>

      {pageNotice && (
        <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
          <span>{pageNotice}</span>
          <button type="button" onClick={() => setPageNotice('')}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {error && (
        <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-md p-3.5 flex flex-wrap items-center justify-between gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchPayslips();
          }}
          className="flex items-center gap-2 flex-1 min-w-[240px]"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by payslip #, employee name, or Employee ID..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-1.5">
          {['all', 'Draft', 'Issued', 'Paid'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded text-xs font-semibold capitalize ${
                statusFilter === st
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading payslips...</div>
        ) : payslips.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Banknote className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-sm font-semibold text-slate-800">No payslips saved yet</div>
            <p className="text-xs text-slate-500">
              Click &ldquo;New Payslip&rdquo; to select an employee and compute earnings, deductions, and net take-home pay.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 px-3">Payslip #</th>
                  <th className="py-2.5 px-3">Employee</th>
                  <th className="py-2.5 px-3">Pay Period</th>
                  <th className="py-2.5 px-3">Payment Date</th>
                  <th className="py-2.5 px-3 text-right">Earnings</th>
                  <th className="py-2.5 px-3 text-right">Deductions</th>
                  <th className="py-2.5 px-3 text-right">Net Pay</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {payslips.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-sky-800">
                      <button
                        type="button"
                        onClick={() => openPayslip(p.id, 'preview')}
                        className="hover:underline"
                      >
                        {p.payslip_number}
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{p.employee_name}</div>
                      <div className="text-[11px] text-slate-500">
                        <span className="font-mono">{p.employee_code}</span> • {p.position_title}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {formatDate(p.pay_period_start)} – {formatDate(p.pay_period_end)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{formatDate(p.payment_date)}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {formatPHP(p.total_earnings)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                      {formatPHP(p.total_deductions)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-slate-900">
                      {formatPHP(p.net_pay)}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          title="Preview & Print"
                          onClick={() => openPayslip(p.id, 'preview')}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => openPayslip(p.id, 'edit')}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Download PDF"
                          onClick={() =>
                            downloadAuthenticatedFile(
                              `/api/payslips/${p.id}/pdf`,
                              `${p.payslip_number}.pdf`
                            ).catch((err) => setError(err.message))
                          }
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Archive"
                          onClick={() => handleArchive(p)}
                          className="p-1.5 rounded hover:bg-rose-50 text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
