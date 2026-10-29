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
  IdCard,
  Upload,
  RefreshCw,
  PenTool,
  X,
} from 'lucide-react';
import { BusinessSettings, Employee, EmployeeIdCard, IdCardStatus } from '../types';
import {
  apiFetch,
  downloadAuthenticatedFile,
  formatDate,
  generateIdempotencyKey,
  resolveAssetUrl,
  todayYMD,
  uploadImageFile,
  uploadSignatureDataUrl,
} from '../lib/api';
import { EmployeePicker } from '../components/EmployeePicker';
import {
  EmployeeIdCardFaces,
  PrintableEmployeeIdSheet,
} from '../components/HrPrintableDocuments';
import { StatusBadge } from '../components/StatusBadge';
import { SignaturePadModal } from '../components/SignaturePadModal';

interface EmployeeIdsPageProps {
  settings: BusinessSettings;
  initialOpenId?: number;
  initialCreateNew?: boolean;
  prefillEmployeeId?: number;
  onClearInitial: () => void;
}

export const EmployeeIdsPage: React.FC<EmployeeIdsPageProps> = ({
  settings,
  initialOpenId,
  initialCreateNew,
  prefillEmployeeId,
  onClearInitial,
}) => {
  const [cards, setCards] = useState<EmployeeIdCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [mode, setMode] = useState<'list' | 'edit' | 'preview'>('list');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');
  const [pageNotice, setPageNotice] = useState('');
  const [idemKey, setIdemKey] = useState('');
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);

  // Form fields
  const [cardNumber, setCardNumber] = useState('');
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [employeeCode, setEmployeeCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [positionTitle, setPositionTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactNumber, setEmergencyContactNumber] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [dateIssued, setDateIssued] = useState(todayYMD());
  const [expirationDate, setExpirationDate] = useState('');
  const [authorizedSignatory, setAuthorizedSignatory] = useState(
    settings.authorized_representative || ''
  );
  const [authorizedTitle, setAuthorizedTitle] = useState(
    settings.authorized_title || 'Authorized Representative'
  );
  const [signatureUrl, setSignatureUrl] = useState(settings.signature_url || '');
  const [backNotes, setBackNotes] = useState('');
  const [status, setStatus] = useState<IdCardStatus>('Active');

  const fetchCards = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());
    apiFetch<{ id_cards: EmployeeIdCard[] }>(`/api/employee-id-cards?${params.toString()}`)
      .then((res) => setCards(res.id_cards || []))
      .catch((err: any) => setError(err.message || 'Failed to load Employee ID cards.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCards();
  }, [statusFilter]);

  useEffect(() => {
    if (initialOpenId) {
      openCard(initialOpenId, 'preview');
      onClearInitial();
    } else if (initialCreateNew) {
      startNewCard(prefillEmployeeId);
      onClearInitial();
    }
  }, [initialOpenId, initialCreateNew, prefillEmployeeId]);

  const applyEmployeeSelection = (emp: Employee) => {
    setEmployeeId(emp.id);
    setEmployeeCode(emp.employee_code);
    setFullName(emp.full_name);
    setPositionTitle(emp.position_title);
    setDepartment(emp.department || '');
    setPhotoUrl(emp.photo_url || '');
    setContactNumber(emp.contact_number || '');
    setAddress(emp.address || '');
    setEmergencyContactName(emp.emergency_contact_name || '');
    setEmergencyContactNumber(emp.emergency_contact_number || '');
  };

  const startNewCard = async (empIdToPrefill?: number) => {
    const today = todayYMD();
    setEditingId(null);
    setIdemKey(generateIdempotencyKey());
    setReplaceExisting(false);
    setCardNumber('');
    setEmployeeId(null);
    setEmployeeCode('');
    setFullName('');
    setPositionTitle('');
    setDepartment('');
    setPhotoUrl('');
    setContactNumber('');
    setAddress('');
    setEmergencyContactName('');
    setEmergencyContactNumber('');
    setBloodType('');
    setDateIssued(today);
    setExpirationDate('');
    setAuthorizedSignatory(settings.authorized_representative || '');
    setAuthorizedTitle(settings.authorized_title || 'Authorized Representative');
    setSignatureUrl(settings.signature_url || '');
    setBackNotes('');
    setStatus('Active');
    setError('');
    setMode('edit');

    try {
      const nextRes = await apiFetch<{ next_number: string }>(
        `/api/employee-id-cards/next-number?date=${today}`
      );
      if (nextRes.next_number) setCardNumber(nextRes.next_number);
    } catch (_) {}

    if (empIdToPrefill) {
      try {
        const empRes = await apiFetch<{ employee: Employee }>(`/api/employees/${empIdToPrefill}`);
        if (empRes.employee) applyEmployeeSelection(empRes.employee);
      } catch (_) {}
    }
  };

  const populateFromSaved = (c: EmployeeIdCard) => {
    setEditingId(c.id);
    setCardNumber(c.card_number);
    setEmployeeId(c.employee_id);
    setEmployeeCode(c.employee_code);
    setFullName(c.full_name);
    setPositionTitle(c.position_title);
    setDepartment(c.department || '');
    setPhotoUrl(c.photo_url || '');
    setContactNumber(c.contact_number || '');
    setAddress(c.address || '');
    setEmergencyContactName(c.emergency_contact_name || '');
    setEmergencyContactNumber(c.emergency_contact_number || '');
    setBloodType(c.blood_type || '');
    setDateIssued(c.date_issued);
    setExpirationDate(c.expiration_date || '');
    setAuthorizedSignatory(c.authorized_signatory || '');
    setAuthorizedTitle(c.authorized_title || '');
    setSignatureUrl(c.signature_url || '');
    setBackNotes(c.back_notes || '');
    setStatus(c.status);
  };

  const openCard = async (id: number, targetMode: 'edit' | 'preview') => {
    setError('');
    try {
      const res = await apiFetch<{ id_card: EmployeeIdCard }>(`/api/employee-id-cards/${id}`);
      populateFromSaved(res.id_card);
      setMode(targetMode);
    } catch (err: any) {
      setError(err.message || 'Failed to open Employee ID card.');
    }
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
      setError(err.message || 'Failed to upload employee ID photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const draftSnapshot: Partial<EmployeeIdCard> = {
    id: editingId || undefined,
    card_number: cardNumber,
    employee_id: employeeId,
    employee_code: employeeCode,
    full_name: fullName,
    position_title: positionTitle,
    department,
    photo_url: photoUrl,
    contact_number: contactNumber,
    address,
    emergency_contact_name: emergencyContactName,
    emergency_contact_number: emergencyContactNumber,
    blood_type: bloodType,
    date_issued: dateIssued,
    expiration_date: expirationDate,
    authorized_signatory: authorizedSignatory,
    authorized_title: authorizedTitle,
    signature_url: signatureUrl,
    back_notes: backNotes,
    status,
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!employeeCode.trim()) {
      setError('Employee ID number is required.');
      return;
    }
    if (!fullName.trim()) {
      setError('Employee full name is required.');
      return;
    }
    if (!positionTitle.trim()) {
      setError('Position or job title is required.');
      return;
    }
    if (!dateIssued) {
      setError('Date issued is required.');
      return;
    }
    if (expirationDate && dateIssued > expirationDate) {
      setError('Expiration date cannot be earlier than date issued.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...draftSnapshot,
        replace_existing: replaceExisting,
      };
      const res = editingId
        ? await apiFetch<{ id_card: EmployeeIdCard }>(`/api/employee-id-cards/${editingId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ id_card: EmployeeIdCard }>('/api/employee-id-cards', {
            method: 'POST',
            idempotencyKey: idemKey,
            body: JSON.stringify(payload),
          });

      populateFromSaved(res.id_card);
      setPageNotice(`Saved Employee ID Card ${res.id_card.card_number} (${res.id_card.employee_code}).`);
      fetchCards();
      setMode('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to save Employee ID card.');
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async (card: EmployeeIdCard) => {
    if (
      !window.confirm(
        `Regenerate a fresh Employee ID card for ${card.full_name} (${card.employee_code}) using latest directory info? Previous card ${card.card_number} will be marked Revoked.`
      )
    ) {
      return;
    }
    setError('');
    try {
      const res = await apiFetch<{ id_card: EmployeeIdCard }>(
        `/api/employee-id-cards/${card.id}/regenerate`,
        {
          method: 'POST',
          body: JSON.stringify({ date_issued: todayYMD() }),
        }
      );
      populateFromSaved(res.id_card);
      setPageNotice(`Regenerated new ID card ${res.id_card.card_number}.`);
      fetchCards();
      setMode('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate ID card.');
    }
  };

  const handleArchive = async (card: EmployeeIdCard) => {
    if (!window.confirm(`Archive Employee ID card ${card.card_number} (${card.full_name})?`)) {
      return;
    }
    try {
      await apiFetch(`/api/employee-id-cards/${card.id}`, { method: 'DELETE' });
      setPageNotice(`Archived Employee ID card ${card.card_number}.`);
      setMode('list');
      fetchCards();
    } catch (err: any) {
      setError(err.message || 'Failed to archive ID card.');
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
            Back to Employee IDs
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('edit')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit ID Card
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => handleRegenerate(draftSnapshot as EmployeeIdCard)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Regenerate ID
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Printer className="w-3.5 h-3.5" />
              Print CR80 Sheet
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() =>
                  downloadAuthenticatedFile(
                    `/api/employee-id-cards/${editingId}/pdf`,
                    `Employee-ID-${employeeCode || cardNumber}.pdf`
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

        <PrintableEmployeeIdSheet card={draftSnapshot} settings={settings} />
      </div>
    );
  }

  // ============================================================================
  // CREATE / EDIT FORM + LIVE CR80 FRONT & BACK PREVIEW
  // ============================================================================
  if (mode === 'edit') {
    return (
      <div className="space-y-5">
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
                {editingId ? `Edit Employee ID (${cardNumber})` : 'Employee ID Maker (CR80)'}
              </h1>
              <p className="text-xs text-slate-500">
                Standard ISO CR80 (54.0 mm × 85.6 mm) front and back layout with persistent employee photo storage.
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
              Print Sheet Preview
            </button>
          )}
        </div>

        {error && (
          <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 space-y-2">
            <div>{error}</div>
            {!editingId && error.toLowerCase().includes('duplicate employee id') && (
              <label className="inline-flex items-center gap-2 font-semibold text-rose-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="rounded border-rose-400"
                />
                Replace / revoke the previous active card for this Employee ID and issue a new card
              </label>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Form Column */}
          <form onSubmit={handleSave} className="xl:col-span-7 space-y-5">
            <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
                1. Employee Identity & Photo
              </h2>

              <EmployeePicker
                selectedEmployeeId={employeeId}
                onSelect={applyEmployeeSelection}
                includeInactive
              />

              {/* Photo Upload / Preview / Replace / Remove */}
              <div className="flex flex-wrap items-center gap-4 p-3.5 rounded bg-slate-50 border border-slate-200">
                <div className="w-20 h-24 rounded border border-slate-300 bg-white flex items-center justify-center overflow-hidden shrink-0">
                  {photoUrl ? (
                    <img
                      src={resolveAssetUrl(photoUrl)}
                      alt={fullName || 'ID Photo'}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-slate-400 text-center px-1">
                      No ID Photo
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-800">
                    Employee ID Photo (Proportional Fit)
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingPhoto
                        ? 'Uploading...'
                        : photoUrl
                          ? 'Replace Photo'
                          : 'Upload Photo (PNG/JPG)'}
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
                    Saved in persistent database storage and rendered proportionally on both web preview and PDF export.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Employee ID No. <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    placeholder="EMP-0001"
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
            </div>

            <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
                2. Back-of-Card Details, Validity & Signatory
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Date Issued <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={dateIssued}
                    onChange={(e) => setDateIssued(e.target.value)}
                    className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Expiration Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Card Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as IdCardStatus)}
                    className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded bg-white"
                  >
                    <option value="Active">Active</option>
                    <option value="Expired">Expired</option>
                    <option value="Revoked">Revoked</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Emergency Contact Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
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
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Employee Contact No. (Optional)
                  </label>
                  <input
                    type="text"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Blood Type (Optional)
                  </label>
                  <input
                    type="text"
                    value={bloodType}
                    onChange={(e) => setBloodType(e.target.value)}
                    placeholder="e.g. O+ / A+ (only if verified)"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Address (Optional)
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Authorized Signatory Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={authorizedSignatory}
                    onChange={(e) => setAuthorizedSignatory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Signatory Title
                  </label>
                  <input
                    type="text"
                    value={authorizedTitle}
                    onChange={(e) => setAuthorizedTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded bg-slate-50 border border-slate-200">
                <div className="text-xs font-semibold text-slate-800">
                  Authorized Signature on Back of ID (Optional)
                </div>
                <div className="flex items-center gap-2">
                  {signatureUrl && (
                    <img
                      src={resolveAssetUrl(signatureUrl)}
                      alt="Signatory"
                      className="h-8 bg-white border border-slate-300 rounded px-2 object-contain"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setSigModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    {signatureUrl ? 'Change' : 'Add Signature'}
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

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Optional Card Note (Back)
                </label>
                <input
                  type="text"
                  value={backNotes}
                  onChange={(e) => setBackNotes(e.target.value)}
                  placeholder="Optional return instruction"
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
                disabled={saving || uploadingPhoto}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving ID Card...' : 'Save & Open Print Sheet'}
              </button>
            </div>
          </form>

          {/* Live Front & Back CR80 Preview Column */}
          <div className="xl:col-span-5 bg-white border border-slate-200 rounded-md p-5 sticky top-4">
            <div className="border-b border-slate-200 pb-2 mb-4 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Live CR80 Front & Back Preview
              </h2>
              <span className="text-[11px] font-mono text-slate-500">54.0 mm × 85.6 mm</span>
            </div>
            <EmployeeIdCardFaces card={draftSnapshot} settings={settings} />
          </div>
        </div>

        <SignaturePadModal
          isOpen={sigModalOpen}
          title="Authorized ID Signatory Signature"
          onClose={() => setSigModalOpen(false)}
          onSave={async (dataUrl) => {
            const uploaded = await uploadSignatureDataUrl(dataUrl);
            setSignatureUrl(uploaded.url);
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
          <h1 className="text-lg font-bold text-slate-900">Employee ID Maker</h1>
          <p className="text-xs text-slate-600">
            Create, print, export, and regenerate CR80 front-and-back employee identification cards.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              downloadAuthenticatedFile(
                '/api/backup/export-csv/employee-id-cards',
                `johnrois-employee-ids-${todayYMD()}.csv`
              ).catch((err) => setError(err.message))
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => startNewCard()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
          >
            <Plus className="w-4 h-4" />
            Create Employee ID
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
            fetchCards();
          }}
          className="flex items-center gap-2 flex-1 min-w-[240px]"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Employee ID, full name, card reference #, or position..."
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
          {['all', 'Active', 'Expired', 'Revoked'].map((st) => (
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
          <div className="p-8 text-center text-xs text-slate-500">Loading Employee ID cards...</div>
        ) : cards.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <IdCard className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-sm font-semibold text-slate-800">No Employee ID cards saved yet</div>
            <p className="text-xs text-slate-500">
              Click &ldquo;Create Employee ID&rdquo; to design and export a standard CR80 front-and-back ID card.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 px-3">Employee</th>
                  <th className="py-2.5 px-3">Employee ID</th>
                  <th className="py-2.5 px-3">Card Ref #</th>
                  <th className="py-2.5 px-3">Position / Dept</th>
                  <th className="py-2.5 px-3">Issued / Valid Until</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {cards.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-9 rounded border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                          {c.photo_url ? (
                            <img
                              src={resolveAssetUrl(c.photo_url)}
                              alt={c.full_name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400">ID</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => openCard(c.id, 'preview')}
                          className="font-semibold text-slate-900 hover:text-sky-700 text-left"
                        >
                          {c.full_name}
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                      {c.employee_code}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-sky-800">{c.card_number}</td>
                    <td className="py-2.5 px-3">
                      <div className="text-slate-900">{c.position_title}</div>
                      {c.department && (
                        <div className="text-[11px] text-slate-500">{c.department}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {formatDate(c.date_issued)}
                      {c.expiration_date ? ` → ${formatDate(c.expiration_date)}` : ''}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          title="Preview & Print"
                          onClick={() => openCard(c.id, 'preview')}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => openCard(c.id, 'edit')}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Regenerate ID Card"
                          onClick={() => handleRegenerate(c)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Download PDF"
                          onClick={() =>
                            downloadAuthenticatedFile(
                              `/api/employee-id-cards/${c.id}/pdf`,
                              `Employee-ID-${c.employee_code}.pdf`
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
