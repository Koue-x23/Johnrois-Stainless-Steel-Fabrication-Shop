import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Eye,
  Edit3,
  UserCheck,
  UserX,
  Trash2,
  Upload,
  Download,
  X,
  ArrowLeft,
  Banknote,
  FileBadge,
  IdCard,
  Users,
} from 'lucide-react';
import { Employee, NavigationTarget, PayBasis } from '../types';
import {
  apiFetch,
  downloadAuthenticatedFile,
  formatDate,
  formatPHP,
  generateIdempotencyKey,
  resolveAssetUrl,
  todayYMD,
  uploadImageFile,
} from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';

interface EmployeesPageProps {
  initialOpenId?: number;
  initialCreateNew?: boolean;
  onClearInitial: () => void;
  onNavigate: (target: NavigationTarget) => void;
}

const EMPLOYMENT_TYPES = ['Regular', 'Probationary', 'Contractual', 'Project-Based', 'Part-Time'];
const EMPLOYMENT_STATUSES = ['Active', 'Probationary', 'On Leave', 'Resigned', 'Terminated', 'Inactive'];

export const EmployeesPage: React.FC<EmployeesPageProps> = ({
  initialOpenId,
  initialCreateNew,
  onClearInitial,
  onNavigate,
}) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');

  const [detailData, setDetailData] = useState<{
    employee: Employee;
    history: {
      payslips: any[];
      certificates: any[];
      id_cards: any[];
    };
  } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState('');
  const [pageNotice, setPageNotice] = useState('');
  const [idemKey, setIdemKey] = useState('');

  // Form fields
  const [employeeCode, setEmployeeCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [positionTitle, setPositionTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [employmentType, setEmploymentType] = useState('Regular');
  const [employmentStatus, setEmploymentStatus] = useState('Active');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactNumber, setEmergencyContactNumber] = useState('');
  const [payBasis, setPayBasis] = useState<PayBasis>('daily');
  const [defaultRate, setDefaultRate] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [notes, setNotes] = useState('');

  const fetchEmployees = () => {
    setLoading(true);
    setPageError('');
    const params = new URLSearchParams();
    params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());

    apiFetch<{ employees: Employee[] }>(`/api/employees?${params.toString()}`)
      .then((res) => setEmployees(res.employees || []))
      .catch((err: any) => setPageError(err.message || 'Failed to load employee directory.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEmployees();
  }, [statusFilter]);

  useEffect(() => {
    if (initialOpenId) {
      openEmployeeDetail(initialOpenId);
      onClearInitial();
    } else if (initialCreateNew) {
      openCreateModal();
      onClearInitial();
    }
  }, [initialOpenId, initialCreateNew]);

  const openEmployeeDetail = async (id: number) => {
    setPageError('');
    try {
      const res = await apiFetch(`/api/employees/${id}`);
      setDetailData(res);
    } catch (err: any) {
      setPageError(err.message || 'Failed to load employee details.');
    }
  };

  const openCreateModal = async () => {
    setEditingEmployee(null);
    setIdemKey(generateIdempotencyKey());
    setEmployeeCode('');
    setFullName('');
    setPositionTitle('');
    setDepartment('');
    setEmploymentType('Regular');
    setEmploymentStatus('Active');
    setStartDate('');
    setEndDate('');
    setContactNumber('');
    setEmail('');
    setAddress('');
    setEmergencyContactName('');
    setEmergencyContactNumber('');
    setPayBasis('daily');
    setDefaultRate('');
    setPhotoUrl('');
    setNotes('');
    setError('');
    setModalOpen(true);

    try {
      const res = await apiFetch<{ next_code: string }>('/api/employees/next-code');
      if (res.next_code) setEmployeeCode(res.next_code);
    } catch (_) {
      // leave blank so backend allocates next sequence
    }
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setEmployeeCode(emp.employee_code);
    setFullName(emp.full_name);
    setPositionTitle(emp.position_title);
    setDepartment(emp.department || '');
    setEmploymentType(emp.employment_type || 'Regular');
    setEmploymentStatus(emp.employment_status || 'Active');
    setStartDate(emp.start_date || '');
    setEndDate(emp.end_date || '');
    setContactNumber(emp.contact_number || '');
    setEmail(emp.email || '');
    setAddress(emp.address || '');
    setEmergencyContactName(emp.emergency_contact_name || '');
    setEmergencyContactNumber(emp.emergency_contact_number || '');
    setPayBasis(emp.pay_basis || 'daily');
    setDefaultRate(emp.default_rate > 0 ? String(emp.default_rate) : '');
    setPhotoUrl(emp.photo_url || '');
    setNotes(emp.notes || '');
    setError('');
    setModalOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingPhoto(true);
    setError('');
    try {
      const uploaded = await uploadImageFile(file);
      setPhotoUrl(uploaded.url);
    } catch (err: any) {
      setError(err.message || 'Failed to upload employee photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) {
      setError('Employee full name is required.');
      return;
    }
    if (!positionTitle.trim()) {
      setError('Position or job title is required.');
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setError('Employment end date cannot be earlier than start date.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        employee_code: employeeCode.trim(),
        full_name: fullName.trim(),
        position_title: positionTitle.trim(),
        department: department.trim(),
        employment_type: employmentType,
        employment_status: employmentStatus,
        start_date: startDate,
        end_date: endDate,
        contact_number: contactNumber.trim(),
        email: email.trim(),
        address: address.trim(),
        emergency_contact_name: emergencyContactName.trim(),
        emergency_contact_number: emergencyContactNumber.trim(),
        pay_basis: payBasis,
        default_rate: Number(defaultRate) || 0,
        photo_url: photoUrl,
        notes: notes.trim(),
      };

      if (editingEmployee) {
        await apiFetch(`/api/employees/${editingEmployee.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setPageNotice(`Employee record ${employeeCode.trim() || editingEmployee.employee_code} updated.`);
        if (detailData && detailData.employee.id === editingEmployee.id) {
          await openEmployeeDetail(editingEmployee.id);
        }
      } else {
        const res = await apiFetch<{ employee: Employee }>('/api/employees', {
          method: 'POST',
          idempotencyKey: idemKey,
          body: JSON.stringify(payload),
        });
        setPageNotice(`Added employee ${res.employee.full_name} (${res.employee.employee_code}).`);
      }

      setModalOpen(false);
      fetchEmployees();
    } catch (err: any) {
      setError(err.message || 'Failed to save employee record.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActiveStatus = async (emp: Employee) => {
    setPageError('');
    setPageNotice('');
    const nextActive = emp.is_active ? false : true;
    try {
      await apiFetch(`/api/employees/${emp.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_active: nextActive,
          employment_status: nextActive ? 'Active' : 'Inactive',
        }),
      });
      setPageNotice(
        `${nextActive ? 'Reactivated' : 'Deactivated'} ${emp.full_name} (${emp.employee_code}).`
      );
      fetchEmployees();
      if (detailData && detailData.employee.id === emp.id) {
        openEmployeeDetail(emp.id);
      }
    } catch (err: any) {
      setPageError(err.message || 'Failed to update employee status.');
    }
  };

  const handleDeleteEmployee = async (emp: Employee) => {
    if (
      !window.confirm(
        `Delete employee record "${emp.full_name}" (${emp.employee_code})? Employees with saved HR documents cannot be deleted and should be deactivated instead.`
      )
    ) {
      return;
    }
    setPageError('');
    try {
      await apiFetch(`/api/employees/${emp.id}`, { method: 'DELETE' });
      setPageNotice(`Deleted employee record ${emp.employee_code}.`);
      if (detailData && detailData.employee.id === emp.id) {
        setDetailData(null);
      }
      fetchEmployees();
    } catch (err: any) {
      setPageError(err.message || 'Failed to delete employee record.');
    }
  };

  // ============================================================================
  // EMPLOYEE DETAIL VIEW
  // ============================================================================
  if (detailData) {
    const emp = detailData.employee;
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setDetailData(null)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Employee Directory
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onNavigate({
                  section: 'payslips',
                  createNew: true,
                  prefillEmployeeId: emp.id,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Banknote className="w-3.5 h-3.5 text-emerald-700" />
              Create Payslip
            </button>
            <button
              type="button"
              onClick={() =>
                onNavigate({
                  section: 'certificates-of-employment',
                  createNew: true,
                  prefillEmployeeId: emp.id,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <FileBadge className="w-3.5 h-3.5 text-sky-700" />
              Issue COE
            </button>
            <button
              type="button"
              onClick={() =>
                onNavigate({
                  section: 'employee-ids',
                  createNew: true,
                  prefillEmployeeId: emp.id,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <IdCard className="w-3.5 h-3.5 text-indigo-700" />
              Generate ID Card
            </button>
            <button
              type="button"
              onClick={() => openEditModal(emp)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Employee
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-5 flex flex-wrap items-start gap-5">
          <div className="w-24 h-28 rounded border border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
            {emp.photo_url ? (
              <img
                src={resolveAssetUrl(emp.photo_url)}
                alt={emp.full_name}
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-xs font-bold text-slate-400 text-center px-2">No Photo</span>
            )}
          </div>

          <div className="flex-1 min-w-[240px] space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-lg font-bold text-slate-900">{emp.full_name}</h1>
              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-xs font-mono font-bold text-slate-800">
                {emp.employee_code}
              </span>
              <StatusBadge status={emp.is_active ? emp.employment_status : 'Inactive'} />
              <StatusBadge status={emp.employment_type} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Position / Job Title</span>
                <strong className="text-slate-900">{emp.position_title}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">Department</span>
                <span className="text-slate-800">{emp.department || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Employment Period</span>
                <span className="text-slate-800">
                  {emp.start_date ? formatDate(emp.start_date) : 'Not recorded'}
                  {emp.end_date ? ` → ${formatDate(emp.end_date)}` : ' → Present'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Contact Number</span>
                <span className="text-slate-800">{emp.contact_number || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Email</span>
                <span className="text-slate-800">{emp.email || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Default Pay Configuration</span>
                <span className="text-slate-800 font-mono">
                  {emp.default_rate > 0 ? `${formatPHP(emp.default_rate)} (${emp.pay_basis})` : 'Not set'}
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-500 block">Address</span>
                <span className="text-slate-800">{emp.address || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Emergency Contact</span>
                <span className="text-slate-800">
                  {[emp.emergency_contact_name, emp.emergency_contact_number]
                    .filter(Boolean)
                    .join(' • ') || '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Linked HR Documents */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-md p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
              Saved Payslips ({detailData.history.payslips.length})
            </h2>
            {detailData.history.payslips.length === 0 ? (
              <p className="text-xs text-slate-500">No payslips issued yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {detailData.history.payslips.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onNavigate({ section: 'payslips', openId: p.id })}
                    className="w-full py-2 text-left hover:bg-slate-50 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-mono font-semibold text-sky-800">{p.payslip_number}</div>
                      <div className="text-[11px] text-slate-500">
                        {formatDate(p.pay_period_start)} – {formatDate(p.pay_period_end)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-slate-900">
                        {formatPHP(p.net_pay)}
                      </div>
                      <StatusBadge status={p.status} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-md p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
              Certificates of Employment ({detailData.history.certificates.length})
            </h2>
            {detailData.history.certificates.length === 0 ? (
              <p className="text-xs text-slate-500">No COEs issued yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {detailData.history.certificates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      onNavigate({ section: 'certificates-of-employment', openId: c.id })
                    }
                    className="w-full py-2 text-left hover:bg-slate-50 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-mono font-semibold text-sky-800">
                        {c.certificate_number}
                      </div>
                      <div className="text-[11px] text-slate-500">{c.position_title}</div>
                    </div>
                    <div className="text-right text-[11px] text-slate-600">
                      <div>{formatDate(c.date_issued)}</div>
                      <div>{c.include_salary ? 'With Salary' : 'Standard COE'}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-md p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
              Employee ID Cards ({detailData.history.id_cards.length})
            </h2>
            {detailData.history.id_cards.length === 0 ? (
              <p className="text-xs text-slate-500">No Employee ID cards generated yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {detailData.history.id_cards.map((ic) => (
                  <button
                    key={ic.id}
                    type="button"
                    onClick={() => onNavigate({ section: 'employee-ids', openId: ic.id })}
                    className="w-full py-2 text-left hover:bg-slate-50 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-mono font-semibold text-sky-800">{ic.card_number}</div>
                      <div className="text-[11px] text-slate-500">
                        Issued {formatDate(ic.date_issued)}
                      </div>
                    </div>
                    <StatusBadge status={ic.status} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {modalOpen && renderModal()}
      </div>
    );
  }

  function renderModal() {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-md border border-slate-300 shadow-xl w-full max-w-2xl my-8 overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
            <h2 className="text-sm font-bold">
              {editingEmployee ? 'Edit Employee Record' : 'Add Employee to Directory'}
            </h2>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
            {error && (
              <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {error}
              </div>
            )}

            {/* Photo Upload */}
            <div className="flex items-center gap-4 p-3 rounded bg-slate-50 border border-slate-200">
              <div className="w-16 h-20 rounded border border-slate-300 bg-white flex items-center justify-center overflow-hidden shrink-0">
                {photoUrl ? (
                  <img
                    src={resolveAssetUrl(photoUrl)}
                    alt="Employee preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 text-center px-1">
                    No Photo
                  </span>
                )}
              </div>
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-800">
                  Employee Photo (Optional — Used on ID Cards)
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingPhoto
                      ? 'Uploading...'
                      : photoUrl
                        ? 'Replace Photo'
                        : 'Upload Photo'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                  {photoUrl && (
                    <button
                      type="button"
                      onClick={() => setPhotoUrl('')}
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Remove Photo
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Stored persistently in your database and fitted proportionally without stretching.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Employee ID <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  placeholder="e.g. EMP-0001"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Full Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter verified full name"
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
                  placeholder="e.g. TIG Welder / Fabricator / Shop Staff"
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
                  placeholder="e.g. Fabrication / Installation / Admin"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Employment Type
                </label>
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded bg-white"
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Employment Status
                </label>
                <select
                  value={employmentStatus}
                  onChange={(e) => setEmploymentStatus(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded bg-white"
                >
                  {EMPLOYMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  End Date (If Applicable)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Contact Number
                </label>
                <input
                  type="text"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="Mobile / Landline"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Optional employee email"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Residential Address (Optional)
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Employee home address"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded bg-slate-50 border border-slate-200">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Emergency Contact Person (Optional)
                </label>
                <input
                  type="text"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  placeholder="Name & relationship"
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Emergency Contact Number (Optional)
                </label>
                <input
                  type="text"
                  value={emergencyContactNumber}
                  onChange={(e) => setEmergencyContactNumber(e.target.value)}
                  placeholder="Mobile number"
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Default Pay Basis (For Payslips)
                </label>
                <select
                  value={payBasis}
                  onChange={(e) => setPayBasis(e.target.value as PayBasis)}
                  className="w-full px-2.5 py-1.5 text-sm bg-white border border-slate-300 rounded"
                >
                  <option value="daily">Daily Rate</option>
                  <option value="semi_monthly">Semi-Monthly Salary</option>
                  <option value="monthly">Monthly Salary</option>
                  <option value="hourly">Hourly Rate</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Default Rate / Basic Salary (PHP, Optional)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={defaultRate}
                  onChange={(e) => setDefaultRate(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-1.5 text-sm font-mono bg-white border border-slate-300 rounded"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Internal HR Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
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
                disabled={saving || uploadingPhoto}
                className="px-4 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {saving
                  ? 'Saving...'
                  : editingEmployee
                    ? 'Save Changes'
                    : 'Add Employee'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Employee Directory</h1>
          <p className="text-xs text-slate-600">
            Central employee master records connected to Payslips, Certificates of Employment, and Employee ID Cards.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              downloadAuthenticatedFile(
                '/api/backup/export-csv/employees',
                `johnrois-employees-${todayYMD()}.csv`
              ).catch((err) => setPageError(err.message))
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
          >
            <Plus className="w-4 h-4" />
            Add Employee
          </button>
        </div>
      </div>

      {pageNotice && (
        <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
          <span>{pageNotice}</span>
          <button type="button" onClick={() => setPageNotice('')} className="text-emerald-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {pageError && (
        <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {pageError}
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white border border-slate-200 rounded-md p-3.5 flex flex-wrap items-center justify-between gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchEmployees();
          }}
          className="flex items-center gap-2 flex-1 min-w-[240px]"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Employee ID, full name, position, department, or phone..."
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
          {(['active', 'inactive', 'all'] as const).map((st) => (
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

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading employees...</div>
        ) : employees.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-sm font-semibold text-slate-800">No employee records found</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Add verified shop fabricators, welders, installers, and staff to generate Payslips, Certificates of Employment, and CR80 Employee ID cards.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 px-3">Employee</th>
                  <th className="py-2.5 px-3">Employee ID</th>
                  <th className="py-2.5 px-3">Position / Dept</th>
                  <th className="py-2.5 px-3">Type & Status</th>
                  <th className="py-2.5 px-3">Start Date</th>
                  <th className="py-2.5 px-3">Quick HR Docs</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-9 rounded border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                          {emp.photo_url ? (
                            <img
                              src={resolveAssetUrl(emp.photo_url)}
                              alt={emp.full_name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400">
                              {emp.full_name
                                .split(' ')
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((n) => n[0]?.toUpperCase())
                                .join('')}
                            </span>
                          )}
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => openEmployeeDetail(emp.id)}
                            className="font-semibold text-slate-900 hover:text-sky-700 text-left"
                          >
                            {emp.full_name}
                          </button>
                          {emp.contact_number && (
                            <div className="text-[11px] text-slate-500">{emp.contact_number}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                      {emp.employee_code}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-900">{emp.position_title}</div>
                      {emp.department && (
                        <div className="text-[11px] text-slate-500">{emp.department}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusBadge
                          status={emp.is_active ? emp.employment_status : 'Inactive'}
                        />
                        <span className="text-[11px] text-slate-500">({emp.employment_type})</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {emp.start_date ? formatDate(emp.start_date) : '—'}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          title="Create Payslip"
                          onClick={() =>
                            onNavigate({
                              section: 'payslips',
                              createNew: true,
                              prefillEmployeeId: emp.id,
                            })
                          }
                          className="px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 text-[11px] font-medium text-slate-700"
                        >
                          Payslip
                        </button>
                        <button
                          type="button"
                          title="Create Certificate of Employment"
                          onClick={() =>
                            onNavigate({
                              section: 'certificates-of-employment',
                              createNew: true,
                              prefillEmployeeId: emp.id,
                            })
                          }
                          className="px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-sky-50 hover:border-sky-300 text-[11px] font-medium text-slate-700"
                        >
                          COE
                        </button>
                        <button
                          type="button"
                          title="Generate Employee ID Card"
                          onClick={() =>
                            onNavigate({
                              section: 'employee-ids',
                              createNew: true,
                              prefillEmployeeId: emp.id,
                            })
                          }
                          className="px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 text-[11px] font-medium text-slate-700"
                        >
                          ID Card
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          title="View Details & History"
                          onClick={() => openEmployeeDetail(emp.id)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Edit Employee"
                          onClick={() => openEditModal(emp)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title={emp.is_active ? 'Deactivate Employee' : 'Reactivate Employee'}
                          onClick={() => toggleActiveStatus(emp)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                        >
                          {emp.is_active ? (
                            <UserX className="w-3.5 h-3.5 text-amber-700" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                          )}
                        </button>
                        {Number(emp.payslip_count || 0) +
                          Number(emp.coe_count || 0) +
                          Number(emp.id_card_count || 0) ===
                          0 && (
                          <button
                            type="button"
                            title="Delete Unused Record"
                            onClick={() => handleDeleteEmployee(emp)}
                            className="p-1.5 rounded hover:bg-rose-50 text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && renderModal()}
    </div>
  );
};
