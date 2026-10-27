import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Eye,
  Edit3,
  Trash2,
  Wrench,
  Download,
  PenTool,
  Camera,
  X,
} from 'lucide-react';
import {
  AuthUser,
  BusinessSettings,
  Customer,
  ServiceMaterialItem,
  ServicePhotoItem,
  ServiceReport,
  ServiceReportStatus,
} from '../types';
import {
  apiFetch,
  downloadAuthenticatedFile,
  formatDate,
  formatPHP,
  generateIdempotencyKey,
  resolveAssetUrl,
  round2,
  todayYMD,
  uploadImageFile,
} from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { CustomerPicker } from '../components/CustomerPicker';
import { SignaturePadModal } from '../components/SignaturePadModal';
import { PrintableDocument } from '../components/PrintableDocument';

const JOB_TYPES = ['Fabrication', 'Installation', 'Repair', 'Maintenance', 'Inspection'];
const SR_STATUSES: ServiceReportStatus[] = ['Scheduled', 'In Progress', 'Completed', 'Cancelled'];

interface ServiceReportsPageProps {
  user: AuthUser;
  settings: BusinessSettings;
  initialOpenId?: number;
  initialCreateNew?: boolean;
  prefillCustomerId?: number;
  onClearInitial: () => void;
}

export const ServiceReportsPage: React.FC<ServiceReportsPageProps> = ({
  user,
  settings,
  initialOpenId,
  initialCreateNew,
  prefillCustomerId,
  onClearInitial,
}) => {
  const [reports, setReports] = useState<ServiceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [mode, setMode] = useState<'list' | 'form' | 'preview'>('list');
  const [activeReport, setActiveReport] = useState<ServiceReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');
  const [idemKey, setIdemKey] = useState('');
  const [sigTarget, setSigTarget] = useState<'tech' | 'customer' | null>(null);

  // Form fields
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewNumber, setPreviewNumber] = useState('');
  const [serviceDate, setServiceDate] = useState(todayYMD());
  const [jobType, setJobType] = useState('Fabrication');
  const [status, setStatus] = useState<ServiceReportStatus>('Scheduled');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [saveAsCustomer, setSaveAsCustomer] = useState(true);
  const [customerName, setCustomerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactDetails, setContactDetails] = useState('');
  const [serviceLocation, setServiceLocation] = useState('');
  const [equipmentServiced, setEquipmentServiced] = useState('');
  const [reportedProblem, setReportedProblem] = useState('');
  const [inspectionFindings, setInspectionFindings] = useState('');
  const [workPerformed, setWorkPerformed] = useState('');
  const [materials, setMaterials] = useState<ServiceMaterialItem[]>([
    { material_name: '', quantity: 1, unit: 'pcs', unit_cost: 0, line_cost: 0 },
  ]);
  const [technicianName, setTechnicianName] = useState(user.full_name || '');
  const [startTime, setStartTime] = useState('08:00');
  const [completionTime, setCompletionTime] = useState('17:00');
  const [recommendations, setRecommendations] = useState('');
  const [customerAcknowledgment, setCustomerAcknowledgment] = useState(false);
  const [customerSignatoryName, setCustomerSignatoryName] = useState('');
  const [acknowledgmentDate, setAcknowledgmentDate] = useState(todayYMD());
  const [technicianSigUrl, setTechnicianSigUrl] = useState('');
  const [customerSigUrl, setCustomerSigUrl] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState<ServicePhotoItem[]>([]);

  const fetchReports = () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);

    apiFetch<{ service_reports: ServiceReport[] }>(`/api/service-reports?${params.toString()}`)
      .then((res) => setReports(res.service_reports || []))
      .catch((err: any) => {
        setError(err.message || 'Failed to load service reports.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReports();
  }, [statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (initialOpenId) {
      openPreviewById(initialOpenId);
      onClearInitial();
    } else if (initialCreateNew) {
      startCreateNew(prefillCustomerId);
      onClearInitial();
    }
  }, [initialOpenId, initialCreateNew, prefillCustomerId]);

  const applyCustomer = (c: Customer | null) => {
    if (!c) {
      setCustomerId(null);
      return;
    }
    setCustomerId(c.id);
    setCustomerName(c.customer_name);
    setCompanyName(c.company_name || '');
    setContactDetails([c.contact_number, c.email].filter(Boolean).join(' / '));
    const firstLoc = (c.project_locations || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)[0];
    setServiceLocation(firstLoc || c.billing_address || '');
    if (!customerSignatoryName) setCustomerSignatoryName(c.customer_name);
  };

  const startCreateNew = (preCustomerId?: number) => {
    setEditingId(null);
    setError('');
    setIdemKey(generateIdempotencyKey());
    const today = todayYMD();
    setServiceDate(today);
    setJobType('Fabrication');
    setStatus('Scheduled');
    setCustomerId(null);
    setSaveAsCustomer(true);
    setCustomerName('');
    setCompanyName('');
    setContactDetails('');
    setServiceLocation('');
    setEquipmentServiced('');
    setReportedProblem('');
    setInspectionFindings('');
    setWorkPerformed('');
    setMaterials([{ material_name: '', quantity: 1, unit: 'pcs', unit_cost: 0, line_cost: 0 }]);
    setTechnicianName(user.full_name || '');
    setStartTime('08:00');
    setCompletionTime('17:00');
    setRecommendations('');
    setCustomerAcknowledgment(false);
    setCustomerSignatoryName('');
    setAcknowledgmentDate(today);
    setTechnicianSigUrl('');
    setCustomerSigUrl('');
    setRemarks('');
    setPhotos([]);

    apiFetch<{ next_number: string }>(`/api/service-reports/next-number?date=${today}`)
      .then((r) => setPreviewNumber(r.next_number))
      .catch(() => setPreviewNumber('Auto-generated'));

    if (preCustomerId) {
      apiFetch<{ customer: Customer }>(`/api/customers/${preCustomerId}`)
        .then((r) => applyCustomer(r.customer))
        .catch(() => {});
    }

    setMode('form');
  };

  const openEditById = async (id: number) => {
    setError('');
    try {
      const res = await apiFetch<{ service_report: ServiceReport }>(`/api/service-reports/${id}`);
      const sr = res.service_report;
      setEditingId(sr.id);
      setPreviewNumber(sr.report_number);
      setServiceDate(sr.service_date);
      setJobType(sr.job_type || 'Fabrication');
      setStatus(sr.status);
      setCustomerId(sr.customer_id);
      setSaveAsCustomer(false);
      setCustomerName(sr.customer_name);
      setCompanyName(sr.company_name || '');
      setContactDetails(sr.contact_details || '');
      setServiceLocation(sr.service_location || '');
      setEquipmentServiced(sr.equipment_serviced || '');
      setReportedProblem(sr.reported_problem || '');
      setInspectionFindings(sr.inspection_findings || '');
      setWorkPerformed(sr.work_performed || '');
      setMaterials(
        sr.materials && sr.materials.length > 0
          ? sr.materials
          : [{ material_name: '', quantity: 1, unit: 'pcs', unit_cost: 0, line_cost: 0 }]
      );
      setTechnicianName(sr.technician_name || '');
      setStartTime(sr.start_time || '');
      setCompletionTime(sr.completion_time || '');
      setRecommendations(sr.recommendations || '');
      setCustomerAcknowledgment(Boolean(sr.customer_acknowledgment));
      setCustomerSignatoryName(sr.customer_signatory_name || '');
      setAcknowledgmentDate(sr.acknowledgment_date || todayYMD());
      setTechnicianSigUrl(sr.technician_signature_url || '');
      setCustomerSigUrl(sr.customer_signature_url || '');
      setRemarks(sr.remarks || '');
      setPhotos(sr.photos || []);
      setMode('form');
    } catch (err: any) {
      setError(err.message || 'Failed to load service report.');
    }
  };

  const openPreviewById = async (id: number) => {
    setError('');
    try {
      const res = await apiFetch<{ service_report: ServiceReport }>(`/api/service-reports/${id}`);
      setActiveReport(res.service_report);
      setMode('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to load service report.');
    }
  };

  const updateMaterial = (idx: number, patch: Partial<ServiceMaterialItem>) => {
    setMaterials((prev) =>
      prev.map((m, i) => {
        if (i !== idx) return m;
        const next = { ...m, ...patch };
        next.line_cost = round2((Number(next.quantity) || 0) * (Number(next.unit_cost) || 0));
        return next;
      })
    );
  };

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    photoType: 'before' | 'after'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setError('');
    try {
      const res = await uploadImageFile(file);
      setPhotos((prev) => [...prev, { photo_type: photoType, photo_url: res.url, caption: '' }]);
    } catch (err: any) {
      setError(err.message || 'Failed to upload photo.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!customerName.trim()) {
      setError('Customer name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        service_date: serviceDate,
        job_type: jobType,
        status,
        customer_id: customerId,
        save_as_customer: !customerId && saveAsCustomer,
        customer_name: customerName,
        company_name: companyName,
        contact_details: contactDetails,
        service_location: serviceLocation,
        equipment_serviced: equipmentServiced,
        reported_problem: reportedProblem,
        inspection_findings: inspectionFindings,
        work_performed: workPerformed,
        materials: materials.filter((m) => m.material_name.trim() !== ''),
        technician_name: technicianName,
        start_time: startTime,
        completion_time: completionTime,
        recommendations,
        customer_acknowledgment: customerAcknowledgment,
        customer_signatory_name: customerSignatoryName || customerName,
        acknowledgment_date: acknowledgmentDate,
        technician_signature_url: technicianSigUrl,
        customer_signature_url: customerSigUrl,
        remarks,
        photos,
      };

      const res = editingId
        ? await apiFetch<{ service_report: ServiceReport }>(`/api/service-reports/${editingId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ service_report: ServiceReport }>('/api/service-reports', {
            method: 'POST',
            idempotencyKey: idemKey,
            body: JSON.stringify(payload),
          });

      setActiveReport(res.service_report);
      fetchReports();
      setMode('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to save service report.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (sr: ServiceReport) => {
    if (!window.confirm(`Delete service report ${sr.report_number}?`)) return;
    setError('');
    try {
      await apiFetch(`/api/service-reports/${sr.id}`, { method: 'DELETE' });
      fetchReports();
      if (mode === 'preview') setMode('list');
    } catch (err: any) {
      setError(err.message || 'Failed to delete service report.');
    }
  };

  const materialsTotal = round2(
    materials.reduce((s, m) => s + (m.material_name.trim() ? round2(m.quantity * m.unit_cost) : 0), 0)
  );

  if (mode === 'preview' && activeReport) {
    return (
      <div className="space-y-3">
        {error && (
          <div className="no-print p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {error}
          </div>
        )}
        <PrintableDocument
          doc={{ type: 'service_report', data: activeReport }}
          settings={settings}
          onBack={() => setMode('list')}
          onEdit={() => openEditById(activeReport.id)}
          onDelete={() => handleArchive(activeReport)}
        />
      </div>
    );
  }

  if (mode === 'form') {
    return (
      <div className="max-w-5xl mx-auto space-y-5">
        {sigTarget && (
          <SignaturePadModal
            title={
              sigTarget === 'tech'
                ? 'Technician / Assigned Personnel Signature'
                : 'Customer Acknowledgment Signature'
            }
            onClose={() => setSigTarget(null)}
            onSaved={(url) => {
              if (sigTarget === 'tech') setTechnicianSigUrl(url);
              else setCustomerSigUrl(url);
              setSigTarget(null);
            }}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {editingId ? `Edit Service Report ${previewNumber}` : 'Create Service Report'}
            </h1>
            <p className="text-xs text-slate-600">
              Service Report No.:{' '}
              <span className="font-semibold text-slate-900 tabular-nums">{previewNumber}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMode('list')}
            className="px-3.5 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>

        {error && (
          <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-md p-5 space-y-6">
          {/* Header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Report Number
              </label>
              <input
                type="text"
                readOnly
                value={previewNumber}
                className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-300 rounded font-semibold tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Service Date <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                required
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Service Category
              </label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              >
                {JOB_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Job Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ServiceReportStatus)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              >
                {SR_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <CustomerPicker
            selectedCustomerId={customerId}
            saveAsCustomer={saveAsCustomer}
            onToggleSaveAsCustomer={setSaveAsCustomer}
            onSelectCustomer={applyCustomer}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                Contact Details
              </label>
              <input
                type="text"
                value={contactDetails}
                onChange={(e) => setContactDetails(e.target.value)}
                placeholder="Mobile number / email"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Service Location
              </label>
              <input
                type="text"
                value={serviceLocation}
                onChange={(e) => setServiceLocation(e.target.value)}
                placeholder="Job site or shop fabrication bay"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
          </div>

          {/* Personnel & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-200">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Technician / Assigned Personnel
              </label>
              <input
                type="text"
                value={technicianName}
                onChange={(e) => setTechnicianName(e.target.value)}
                placeholder="Lead fabricator / installer name(s)"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Completion Time
              </label>
              <input
                type="time"
                value={completionTime}
                onChange={(e) => setCompletionTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
          </div>

          {/* Technical Findings & Work Performed */}
          <div className="space-y-4 pt-2 border-t border-slate-200">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Equipment or Product Serviced
              </label>
              <input
                type="text"
                value={equipmentServiced}
                onChange={(e) => setEquipmentServiced(e.target.value)}
                placeholder="e.g., Commercial Stainless Exhaust Hood, Grease Trap SUS 304, Stainless Gate & Railings"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Reported Problem / Client Request
                </label>
                <textarea
                  rows={3}
                  value={reportedProblem}
                  onChange={(e) => setReportedProblem(e.target.value)}
                  placeholder="Describe reported issue or custom fabrication requirement..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Inspection Findings
                </label>
                <textarea
                  rows={3}
                  value={inspectionFindings}
                  onChange={(e) => setInspectionFindings(e.target.value)}
                  placeholder="Site measurements, weld condition, structural assessment..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Work Performed
              </label>
              <textarea
                rows={3}
                value={workPerformed}
                onChange={(e) => setWorkPerformed(e.target.value)}
                placeholder="Detailed fabrication, TIG welding, polishing, repair, or installation performed..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>
          </div>

          {/* Materials & Parts Used */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Materials & Parts Used (Optional Quantity & Cost)
              </label>
              <button
                type="button"
                onClick={() =>
                  setMaterials([
                    ...materials,
                    { material_name: '', quantity: 1, unit: 'pcs', unit_cost: 0, line_cost: 0 },
                  ])
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Material
              </button>
            </div>

            <div className="border border-slate-300 rounded overflow-x-auto">
              <table className="w-full text-sm min-w-[620px]">
                <thead className="bg-slate-100 text-xs uppercase text-slate-700 border-b border-slate-300">
                  <tr>
                    <th className="py-2 px-3 text-left">Material / Part Description</th>
                    <th className="py-2 px-3 text-right w-24">Qty</th>
                    <th className="py-2 px-3 text-left w-24">Unit</th>
                    <th className="py-2 px-3 text-right w-32">Unit Cost (₱)</th>
                    <th className="py-2 px-3 text-right w-32">Line Cost</th>
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {materials.map((m, idx) => (
                    <tr key={idx}>
                      <td className="p-2">
                        <input
                          type="text"
                          value={m.material_name}
                          onChange={(e) => updateMaterial(idx, { material_name: e.target.value })}
                          placeholder="e.g., SUS 304 Sheet 1.2mm, Argon Gas, TIG Filler Rod, Heavy Duty Hinges"
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={m.quantity}
                          onChange={(e) =>
                            updateMaterial(idx, { quantity: parseFloat(e.target.value) || 0 })
                          }
                          className="w-full px-2 py-1.5 text-sm text-right tabular-nums border border-slate-300 rounded"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={m.unit}
                          onChange={(e) => updateMaterial(idx, { unit: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={m.unit_cost}
                          onChange={(e) =>
                            updateMaterial(idx, { unit_cost: parseFloat(e.target.value) || 0 })
                          }
                          className="w-full px-2 py-1.5 text-sm text-right tabular-nums border border-slate-300 rounded"
                        />
                      </td>
                      <td className="p-2 text-right font-semibold tabular-nums">
                        {formatPHP(m.line_cost)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setMaterials(
                              materials.length <= 1
                                ? [{ material_name: '', quantity: 1, unit: 'pcs', unit_cost: 0, line_cost: 0 }]
                                : materials.filter((_, i) => i !== idx)
                            )
                          }
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {materialsTotal > 0 && (
              <div className="flex justify-end text-sm font-bold text-slate-900 tabular-nums">
                Total Materials Cost: {formatPHP(materialsTotal)}
              </div>
            )}
          </div>

          {/* Recommendations & Remarks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Recommendations
              </label>
              <textarea
                rows={2}
                value={recommendations}
                onChange={(e) => setRecommendations(e.target.value)}
                placeholder="Preventive maintenance advice or follow-up recommendations..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
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
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
              />
            </div>
          </div>

          {/* Optional Before & After Photos */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Before & After Photos (Optional)
              </label>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <Camera className="w-3.5 h-3.5 text-slate-600" />
                  {uploadingPhoto ? 'Uploading...' : '+ Upload Before Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handlePhotoUpload(e, 'before')}
                    className="hidden"
                  />
                </label>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <Camera className="w-3.5 h-3.5 text-emerald-700" />
                  {uploadingPhoto ? 'Uploading...' : '+ Upload After Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handlePhotoUpload(e, 'after')}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {photos.map((ph, idx) => (
                  <div key={idx} className="border border-slate-300 rounded p-2 space-y-2 relative bg-slate-50">
                    <button
                      type="button"
                      onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                      className="absolute top-3 right-3 p-1 rounded-full bg-slate-900/80 text-white hover:bg-rose-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <img
                      src={resolveAssetUrl(ph.photo_url)}
                      alt={ph.photo_type}
                      className="w-full h-32 object-cover rounded bg-white"
                    />
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          ph.photo_type === 'before'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {ph.photo_type}
                      </span>
                      <input
                        type="text"
                        value={ph.caption}
                        onChange={(e) =>
                          setPhotos(
                            photos.map((item, i) =>
                              i === idx ? { ...item, caption: e.target.value } : item
                            )
                          )
                        }
                        placeholder="Caption..."
                        className="flex-1 px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Customer Acknowledgment & Dual Signatures */}
          <div className="bg-slate-50 border border-slate-300 rounded-md p-4 space-y-4">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={customerAcknowledgment}
                onChange={(e) => setCustomerAcknowledgment(e.target.checked)}
                className="rounded border-slate-300 text-slate-900"
              />
              Customer Acknowledges Satisfactory Inspection / Work Completion
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Technician Signature */}
              <div className="bg-white border border-slate-200 rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-600">
                    Technician Signature
                  </span>
                  <button
                    type="button"
                    onClick={() => setSigTarget('tech')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <PenTool className="w-3 h-3" />
                    {technicianSigUrl ? 'Change Signature' : 'Sign / Upload'}
                  </button>
                </div>
                {technicianSigUrl ? (
                  <div className="flex items-center justify-between bg-slate-50 p-2 rounded">
                    <img src={resolveAssetUrl(technicianSigUrl)} alt="Technician Sig" className="h-12 object-contain" />
                    <button
                      type="button"
                      onClick={() => setTechnicianSigUrl('')}
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic py-2">
                    No digital signature attached (blank line will print for wet signature).
                  </div>
                )}
              </div>

              {/* Customer Signature */}
              <div className="bg-white border border-slate-200 rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-600">
                    Customer Signature
                  </span>
                  <button
                    type="button"
                    onClick={() => setSigTarget('customer')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <PenTool className="w-3 h-3" />
                    {customerSigUrl ? 'Change Signature' : 'Sign / Upload'}
                  </button>
                </div>
                {customerSigUrl ? (
                  <div className="flex items-center justify-between bg-slate-50 p-2 rounded">
                    <img src={resolveAssetUrl(customerSigUrl)} alt="Customer Sig" className="h-12 object-contain" />
                    <button
                      type="button"
                      onClick={() => setCustomerSigUrl('')}
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic py-2">
                    Customer can sign on-screen or on the printed A4 service report.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <input
                    type="text"
                    value={customerSignatoryName}
                    onChange={(e) => setCustomerSignatoryName(e.target.value)}
                    placeholder="Customer Printed Name"
                    className="px-2.5 py-1 text-xs border border-slate-300 rounded"
                  />
                  <input
                    type="date"
                    value={acknowledgmentDate}
                    onChange={(e) => setAcknowledgmentDate(e.target.value)}
                    className="px-2.5 py-1 text-xs border border-slate-300 rounded"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="px-4 py-2 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-5 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Saving Service Report...' : editingId ? 'Save Changes' : 'Save Service Report'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Service Reports</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Document fabrication, installation, repair, maintenance, and site inspection jobs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => startCreateNew()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Service Report
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white border border-slate-200 rounded-md p-3.5 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchReports();
          }}
          className="flex-1 min-w-[220px] flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search report #, customer, equipment, location, or technician..."
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
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded bg-white"
        >
          <option value="all">All Job Statuses</option>
          {SR_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <span>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2 py-1.5 border border-slate-300 rounded text-xs"
          />
          <span>To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2 py-1.5 border border-slate-300 rounded text-xs"
          />
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading service reports...</div>
        ) : reports.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Wrench className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No service reports recorded</p>
            <p className="text-xs text-slate-500">
              Click "+ New Service Report" to log fabrication, installation, repair, or inspection jobs.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-600">
                <tr>
                  <th className="py-3 px-4 text-left font-semibold">Report #</th>
                  <th className="py-3 px-4 text-left font-semibold">Service Date</th>
                  <th className="py-3 px-4 text-left font-semibold">Job Type</th>
                  <th className="py-3 px-4 text-left font-semibold">Customer & Site</th>
                  <th className="py-3 px-4 text-left font-semibold">Equipment / Product</th>
                  <th className="py-3 px-4 text-left font-semibold">Technician</th>
                  <th className="py-3 px-4 text-left font-semibold">Status</th>
                  <th className="py-3 px-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((sr) => (
                  <tr key={sr.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900 tabular-nums">
                      <button
                        type="button"
                        onClick={() => openPreviewById(sr.id)}
                        className="hover:text-sky-700 hover:underline"
                      >
                        {sr.report_number}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums">
                      {formatDate(sr.service_date)}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-700">{sr.job_type}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{sr.customer_name}</div>
                      {sr.service_location && (
                        <div className="text-xs text-slate-500 truncate max-w-[180px]">
                          {sr.service_location}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 max-w-[200px] truncate">
                      {sr.equipment_serviced || '—'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{sr.technician_name || '—'}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={sr.status} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openPreviewById(sr.id)}
                          title="View & Print"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditById(sr.id)}
                          title="Edit"
                          className="p-1.5 text-slate-600 hover:text-sky-700 hover:bg-slate-100 rounded"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setError('');
                            try {
                              await downloadAuthenticatedFile(
                                `/api/service-reports/${sr.id}/pdf`,
                                `${sr.report_number}.pdf`
                              );
                            } catch (err: any) {
                              setError(err.message || 'Failed to download Service Report PDF.');
                            }
                          }}
                          title="Download PDF"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchive(sr)}
                          title="Archive"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
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
