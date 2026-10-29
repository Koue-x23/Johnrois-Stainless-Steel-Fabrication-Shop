import React, { useEffect, useState } from 'react';
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
  FileBadge,
  PenTool,
  X,
} from 'lucide-react';
import { BusinessSettings, CertificateOfEmployment, Employee } from '../types';
import {
  apiFetch,
  buildWorkspacePath,
  downloadAuthenticatedFile,
  formatDate,
  formatPHP,
  generateIdempotencyKey,
  getActiveBusinessSlug,
  resolveAssetUrl,
  round2,
  todayYMD,
} from '../lib/api';
import { EmployeePicker } from '../components/EmployeePicker';
import { PrintableCoe } from '../components/HrPrintableDocuments';
import { SignaturePadModal } from '../components/SignaturePadModal';

interface CertificatesOfEmploymentPageProps {
  settings: BusinessSettings;
  initialOpenId?: number;
  initialCreateNew?: boolean;
  prefillEmployeeId?: number;
  onClearInitial: () => void;
}

export const CertificatesOfEmploymentPage: React.FC<CertificatesOfEmploymentPageProps> = ({
  settings,
  initialOpenId,
  initialCreateNew,
  prefillEmployeeId,
  onClearInitial,
}) => {
  const [certificates, setCertificates] = useState<CertificateOfEmployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [mode, setMode] = useState<'list' | 'edit' | 'preview'>('list');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pageNotice, setPageNotice] = useState('');
  const [idemKey, setIdemKey] = useState('');
  const [sigModalOpen, setSigModalOpen] = useState(false);

  // Form fields
  const [certificateNumber, setCertificateNumber] = useState('');
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [employeeCode, setEmployeeCode] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [positionTitle, setPositionTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [employmentType, setEmploymentType] = useState('Regular');
  const [employmentStatus, setEmploymentStatus] = useState('Active');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateIssued, setDateIssued] = useState(todayYMD());
  const [purpose, setPurpose] = useState('');
  const [includeSalary, setIncludeSalary] = useState(false);
  const [salaryAmount, setSalaryAmount] = useState('');
  const [salaryPeriod, setSalaryPeriod] = useState('monthly');
  const [customBody, setCustomBody] = useState('');
  const [signatoryName, setSignatoryName] = useState(settings.authorized_representative || '');
  const [signatoryTitle, setSignatoryTitle] = useState(
    settings.authorized_title || 'Authorized Representative'
  );
  const [signatureUrl, setSignatureUrl] = useState(settings.signature_url || '');
  const [remarks, setRemarks] = useState('');

  const fetchCertificates = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    apiFetch<{ certificates: CertificateOfEmployment[] }>(
      `/api/certificates-of-employment?${params.toString()}`
    )
      .then((res) => setCertificates(res.certificates || []))
      .catch((err: any) => setError(err.message || 'Failed to load Certificates of Employment.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCertificates();
  }, []);

  useEffect(() => {
    if (initialOpenId) {
      openCertificate(initialOpenId, 'preview');
      onClearInitial();
    } else if (initialCreateNew) {
      startNewCoe(prefillEmployeeId);
      onClearInitial();
    }
  }, [initialOpenId, initialCreateNew, prefillEmployeeId]);

  const syncBrowserUrl = (id?: number | null) => {
    if (typeof window === 'undefined') return;
    const nextPath = buildWorkspacePath(
      id ? `/certificates-of-employment/${id}` : '/certificates-of-employment'
    );
    if (window.location.pathname !== nextPath) {
      window.history.replaceState({}, '', nextPath);
    }
  };

  const returnToList = () => {
    setSigModalOpen(false);
    setMode('list');
    syncBrowserUrl(null);
  };

  useEffect(() => {
    if (mode === 'edit' && !editingId) {
      if (!signatoryName && settings.authorized_representative) {
        setSignatoryName(settings.authorized_representative);
      }
      if (!signatureUrl && settings.signature_url) {
        setSignatureUrl(settings.signature_url);
      }
    }
  }, [
    mode,
    editingId,
    signatoryName,
    signatureUrl,
    settings.authorized_representative,
    settings.signature_url,
  ]);

  const applyEmployeeSelection = (emp: Employee) => {
    setEmployeeId(emp.id);
    setEmployeeCode(emp.employee_code);
    setEmployeeName(emp.full_name);
    setPositionTitle(emp.position_title);
    setDepartment(emp.department || '');
    setEmploymentType(emp.employment_type || 'Regular');
    setEmploymentStatus(emp.is_active ? emp.employment_status : 'Inactive');
    setStartDate(emp.start_date || '');
    setEndDate(emp.end_date || '');
    if (emp.default_rate > 0) {
      setSalaryAmount(String(emp.default_rate));
      setSalaryPeriod(emp.pay_basis || 'monthly');
    }
  };

  const startNewCoe = async (empIdToPrefill?: number) => {
    const today = todayYMD();
    setEditingId(null);
    setIdemKey(generateIdempotencyKey());
    setCertificateNumber('');
    setEmployeeId(null);
    setEmployeeCode('');
    setEmployeeName('');
    setPositionTitle('');
    setDepartment('');
    setEmploymentType('Regular');
    setEmploymentStatus('Active');
    setStartDate('');
    setEndDate('');
    setDateIssued(today);
    setPurpose('');
    setIncludeSalary(false);
    setSalaryAmount('');
    setSalaryPeriod('monthly');
    setCustomBody('');
    setSignatoryName(settings.authorized_representative || '');
    setSignatoryTitle(settings.authorized_title || 'Authorized Representative');
    setSignatureUrl(settings.signature_url || '');
    setRemarks('');
    setError('');
    setMode('edit');

    try {
      const nextRes = await apiFetch<{ next_number: string }>(
        `/api/certificates-of-employment/next-number?date=${today}`
      );
      if (nextRes.next_number) setCertificateNumber(nextRes.next_number);
    } catch (_) {}

    if (empIdToPrefill) {
      try {
        const empRes = await apiFetch<{ employee: Employee }>(`/api/employees/${empIdToPrefill}`);
        if (empRes.employee) applyEmployeeSelection(empRes.employee);
      } catch (_) {}
    }
  };

  const populateFromSaved = (c: CertificateOfEmployment) => {
    setEditingId(c.id);
    setCertificateNumber(c.certificate_number);
    setEmployeeId(c.employee_id);
    setEmployeeCode(c.employee_code || '');
    setEmployeeName(c.employee_name);
    setPositionTitle(c.position_title);
    setDepartment(c.department || '');
    setEmploymentType(c.employment_type || '');
    setEmploymentStatus(c.employment_status);
    setStartDate(c.start_date);
    setEndDate(c.end_date || '');
    setDateIssued(c.date_issued);
    setPurpose(c.purpose || '');
    setIncludeSalary(Boolean(c.include_salary));
    setSalaryAmount(c.salary_amount > 0 ? String(c.salary_amount) : '');
    setSalaryPeriod(c.salary_period || 'monthly');
    setCustomBody(c.custom_body || '');
    setSignatoryName(c.signatory_name || '');
    setSignatoryTitle(c.signatory_title || '');
    setSignatureUrl(c.signature_url || '');
    setRemarks(c.remarks || '');
  };

  const openCertificate = async (id: number, targetMode: 'edit' | 'preview') => {
    setError('');
    setSigModalOpen(false);
    try {
      const res = await apiFetch<{ certificate: CertificateOfEmployment }>(
        `/api/certificates-of-employment/${id}`
      );
      populateFromSaved(res.certificate);
      setMode(targetMode);
      syncBrowserUrl(res.certificate.id);
    } catch (err: any) {
      setError(err.message || 'Failed to open Certificate of Employment.');
    }
  };

  const draftSnapshot: Partial<CertificateOfEmployment> = {
    id: editingId || undefined,
    certificate_number: certificateNumber,
    employee_id: employeeId,
    employee_code: employeeCode,
    employee_name: employeeName,
    position_title: positionTitle,
    department,
    employment_type: employmentType,
    employment_status: employmentStatus,
    start_date: startDate,
    end_date: endDate,
    date_issued: dateIssued,
    purpose,
    include_salary: includeSalary ? 1 : 0,
    salary_amount: includeSalary ? round2(salaryAmount) : 0,
    salary_period: salaryPeriod,
    custom_body: customBody,
    signatory_name: signatoryName,
    signatory_title: signatoryTitle,
    signature_url: signatureUrl,
    remarks,
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!employeeName.trim()) {
      setError('Employee full name is required.');
      return;
    }
    if (!positionTitle.trim()) {
      setError('Job title or position is required.');
      return;
    }
    if (!employmentStatus.trim()) {
      setError('Employment status is required.');
      return;
    }
    if (!startDate) {
      setError('Verified employment start date is required before generating a COE.');
      return;
    }
    if (endDate && startDate > endDate) {
      setError('Employment end date cannot be earlier than start date.');
      return;
    }
    if (!dateIssued) {
      setError('Date of issuance is required.');
      return;
    }
    if (includeSalary && round2(salaryAmount) <= 0) {
      setError(
        'Please enter the verified compensation amount when "Include Salary Details" is enabled, or disable salary inclusion.'
      );
      return;
    }

    setSaving(true);
    try {
      const res = editingId
        ? await apiFetch<{ certificate: CertificateOfEmployment }>(
            `/api/certificates-of-employment/${editingId}`,
            {
              method: 'PUT',
              body: JSON.stringify(draftSnapshot),
            }
          )
        : await apiFetch<{ certificate: CertificateOfEmployment }>(
            '/api/certificates-of-employment',
            {
              method: 'POST',
              idempotencyKey: idemKey,
              body: JSON.stringify(draftSnapshot),
            }
          );

      populateFromSaved(res.certificate);
      setPageNotice(`Saved Certificate of Employment ${res.certificate.certificate_number}.`);
      fetchCertificates();
      setMode('preview');
      syncBrowserUrl(res.certificate.id);
    } catch (err: any) {
      setError(err.message || 'Failed to save Certificate of Employment.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (c: CertificateOfEmployment) => {
    if (
      !window.confirm(
        `Archive Certificate of Employment ${c.certificate_number} for ${c.employee_name}?`
      )
    ) {
      return;
    }
    try {
      await apiFetch(`/api/certificates-of-employment/${c.id}`, { method: 'DELETE' });
      setPageNotice(`Archived ${c.certificate_number}.`);
      returnToList();
      fetchCertificates();
    } catch (err: any) {
      setError(err.message || 'Failed to archive certificate.');
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
            onClick={returnToList}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Certificates
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('edit')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Certificate
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Certificate
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() =>
                  downloadAuthenticatedFile(
                    `/api/certificates-of-employment/${editingId}/pdf`,
                    `${certificateNumber || 'COE'}.pdf`
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

        <PrintableCoe certificate={draftSnapshot} settings={settings} />
      </div>
    );
  }

  // ============================================================================
  // CREATE / EDIT FORM MODE
  // ============================================================================
  if (mode === 'edit') {
    return (
      <div className="space-y-5 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={returnToList}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                {editingId
                  ? `Edit Certificate of Employment (${certificateNumber})`
                  : 'Create Certificate of Employment'}
              </h1>
              <p className="text-xs text-slate-500">
                Review verified employment dates, status, optional purpose, and optional salary disclosure before issuing.
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
              Full Print Preview
            </button>
          )}
        </div>

        {error && (
          <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
              1. Employee & Employment Tenure Details
            </h2>

            <EmployeePicker
              selectedEmployeeId={employeeId}
              onSelect={applyEmployeeSelection}
              includeInactive
            />

            {employeeId && !startDate && (
              <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
                This employee does not have a start date recorded in Employee Directory yet. Please enter their verified Employment Start Date below before saving.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Reference No.
                </label>
                <input
                  type="text"
                  readOnly
                  value={certificateNumber || 'Auto-assigned'}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded text-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Employee ID (Optional)
                </label>
                <input
                  type="text"
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Employment Status <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={employmentStatus}
                  onChange={(e) => setEmploymentStatus(e.target.value)}
                  placeholder="e.g. Active / Regular / Resigned"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Employment Start Date <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Employment End Date (Blank if Present)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Date of Issuance <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={dateIssued}
                  onChange={(e) => setDateIssued(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Purpose of Certificate (Optional)
              </label>
              <input
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. bank application, loan requirement, visa application (leave blank for general legal purpose)"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
              />
            </div>
          </div>

          {/* Salary Inclusion Toggle & Custom Body */}
          <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
              2. Optional Compensation Disclosure & Certification Text
            </h2>

            <div className="p-3.5 rounded bg-slate-50 border border-slate-200 space-y-3">
              <label className="inline-flex items-center gap-2.5 text-sm font-semibold text-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSalary}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    setIncludeSalary(checked);
                    if (checked && !salaryAmount && employeeId) {
                      try {
                        const empRes = await apiFetch<{ employee: Employee }>(
                          `/api/employees/${employeeId}`
                        );
                        if (empRes.employee && empRes.employee.default_rate > 0) {
                          setSalaryAmount(String(empRes.employee.default_rate));
                          setSalaryPeriod(empRes.employee.pay_basis || 'monthly');
                        }
                      } catch (_) {}
                    }
                  }}
                  className="rounded border-slate-300"
                />
                Include Salary / Compensation Details on this COE
              </label>
              <p className="text-xs text-slate-600">
                Salary details are omitted by default and will only appear on the printed/PDF certificate when explicitly requested and verified.
              </p>

              {includeSalary && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                      Verified Compensation Amount (₱) <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required={includeSalary}
                      value={salaryAmount}
                      onChange={(e) => setSalaryAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                      Compensation Frequency
                    </label>
                    <select
                      value={salaryPeriod}
                      onChange={(e) => setSalaryPeriod(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded"
                    >
                      <option value="monthly">Per Month</option>
                      <option value="semi_monthly">Semi-Monthly</option>
                      <option value="daily">Per Day</option>
                      <option value="hourly">Per Hour</option>
                      <option value="annual">Per Annum</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Custom Certification Paragraph Override (Optional)
              </label>
              <textarea
                rows={3}
                value={customBody}
                onChange={(e) => setCustomBody(e.target.value)}
                placeholder="Leave blank to use the standard formal tenure paragraph automatically composed from the verified fields above."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
              />
            </div>
          </div>

          {/* Authorized Signatory */}
          <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
              3. Authorized Signatory
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Authorized Signatory Name
                </label>
                <input
                  type="text"
                  value={signatoryName}
                  onChange={(e) => setSignatoryName(e.target.value)}
                  placeholder="Enter authorized signatory name (leave blank for wet signature)"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Signatory Position / Title
                </label>
                <input
                  type="text"
                  value={signatoryTitle}
                  onChange={(e) => setSignatoryTitle(e.target.value)}
                  placeholder="e.g. Proprietor / Authorized Representative"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded bg-slate-50 border border-slate-200">
              <div>
                <div className="text-xs font-semibold text-slate-800">
                  Authorized Signature Image (Optional)
                </div>
                <p className="text-[11px] text-slate-500">
                  Leave empty if printing for physical hand signature.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {signatureUrl && (
                  <img
                    src={resolveAssetUrl(signatureUrl)}
                    alt="Signatory"
                    className="h-9 bg-white border border-slate-300 rounded px-2 object-contain"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setSigModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  {signatureUrl ? 'Change Signature' : 'Draw / Upload Signature'}
                </button>
                {signatureUrl && (
                  <button
                    type="button"
                    onClick={() => setSignatureUrl('')}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={returnToList}
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
              {saving ? 'Saving Certificate...' : 'Save & Preview Certificate'}
            </button>
          </div>
        </form>

        {sigModalOpen && (
          <SignaturePadModal
            title="Authorized Signatory Signature"
            onClose={() => setSigModalOpen(false)}
            onSaved={(url) => {
              setSignatureUrl(url);
              setSigModalOpen(false);
            }}
          />
        )}
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
          <h1 className="text-lg font-bold text-slate-900">Certificate of Employment Maker</h1>
          <p className="text-xs text-slate-600">
            Generate formal Certificates of Employment from verified employee directory records, with optional salary disclosure.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              downloadAuthenticatedFile(
                '/api/backup/export-csv/certificates-of-employment',
                `${getActiveBusinessSlug() || 'workspace'}-coe-${todayYMD()}.csv`
              ).catch((err) => setError(err.message))
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => startNewCoe()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
          >
            <Plus className="w-4 h-4" />
            New Certificate
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

      <div className="bg-white border border-slate-200 rounded-md p-3.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchCertificates();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by COE reference #, employee name, Employee ID, or purpose..."
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
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading certificates...</div>
        ) : certificates.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <FileBadge className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-sm font-semibold text-slate-800">
              No Certificates of Employment issued yet
            </div>
            <p className="text-xs text-slate-500">
              Click &ldquo;New Certificate&rdquo; to select an employee and prepare a formal COE.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 px-3">Reference #</th>
                  <th className="py-2.5 px-3">Employee</th>
                  <th className="py-2.5 px-3">Position</th>
                  <th className="py-2.5 px-3">Tenure</th>
                  <th className="py-2.5 px-3">Date Issued</th>
                  <th className="py-2.5 px-3">Salary Included</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {certificates.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-sky-800">
                      <button
                        type="button"
                        onClick={() => openCertificate(c.id, 'preview')}
                        className="hover:underline"
                      >
                        {c.certificate_number}
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{c.employee_name}</div>
                      {c.employee_code && (
                        <div className="text-[11px] font-mono text-slate-500">{c.employee_code}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-800">{c.position_title}</td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {formatDate(c.start_date)} → {c.end_date ? formatDate(c.end_date) : 'Present'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{formatDate(c.date_issued)}</td>
                    <td className="py-2.5 px-3">
                      {c.include_salary ? (
                        <span className="text-emerald-700 font-semibold font-mono">
                          Yes ({formatPHP(c.salary_amount)})
                        </span>
                      ) : (
                        <span className="text-slate-500">No</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          title="Preview & Print"
                          onClick={() => openCertificate(c.id, 'preview')}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => openCertificate(c.id, 'edit')}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Download PDF"
                          onClick={() =>
                            downloadAuthenticatedFile(
                              `/api/certificates-of-employment/${c.id}/pdf`,
                              `${c.certificate_number}.pdf`
                            ).catch((err) => setError(err.message))
                          }
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Archive"
                          onClick={() => handleArchive(c)}
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
