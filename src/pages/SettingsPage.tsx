import React, { useEffect, useState } from 'react';
import {
  Save,
  Upload,
  PenTool,
  Download,
  Database,
  Users,
  Lock,
  Info,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import { AuthUser, BusinessSettings, UserRole } from '../types';
import {
  apiFetch,
  downloadAuthenticatedFile,
  todayYMD,
  uploadImageFile,
} from '../lib/api';
import { SignaturePadModal } from '../components/SignaturePadModal';

interface SettingsPageProps {
  user: AuthUser;
  settings: BusinessSettings;
  onSettingsUpdated: (s: BusinessSettings) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  user,
  settings,
  onSettingsUpdated,
}) => {
  const isOwner = user.role === 'owner';
  const [tab, setTab] = useState<'business' | 'users' | 'security' | 'backup'>('business');

  const [form, setForm] = useState<BusinessSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Staff Accounts
  const [staffList, setStaffList] = useState<AuthUser[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('staff');

  // Password Change
  const [currPass, setCurrPass] = useState('');
  const [nextPass, setNextPass] = useState('');
  const [profileName, setProfileName] = useState(user.full_name);
  const [profileUsername, setProfileUsername] = useState(user.username);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const loadUsers = () => {
    if (!isOwner) return;
    apiFetch<{ users: AuthUser[] }>('/api/users')
      .then((r) => setStaffList(r.users || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (tab === 'users' && isOwner) loadUsers();
  }, [tab, isOwner]);

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await apiFetch<{ settings: BusinessSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      onSettingsUpdated(res.settings);
      setNotice('Business settings saved. Newly generated and printed documents now use these details.');
    } catch (err: any) {
      setError(err.message || 'Failed to save business settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setError('');
    try {
      const res = await uploadImageFile(file);
      setForm((prev) => ({ ...prev, logo_url: res.url }));
      setNotice('Logo uploaded. Click "Save Business Settings" below to apply.');
    } catch (err: any) {
      setError(err.message || 'Failed to upload logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername,
          full_name: newFullName,
          email: newEmail,
          password: newPassword,
          role: newRole,
        }),
      });
      setNewUsername('');
      setNewFullName('');
      setNewEmail('');
      setNewPassword('');
      setNotice('Authorized user account created.');
      loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to create staff account.');
    }
  };

  const handleToggleUserActive = async (u: AuthUser) => {
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to update user status.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currPass,
          new_password: nextPass,
          full_name: profileName,
          username: profileUsername,
        }),
      });
      setCurrPass('');
      setNextPass('');
      setNotice('Account credentials updated.');
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    }
  };

  const handleBackupImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      !window.confirm(
        'Restoring a backup will replace current records with the backup file data. Continue?'
      )
    ) {
      e.target.value = '';
      return;
    }
    setError('');
    setNotice('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await apiFetch('/api/backup/import', {
        method: 'POST',
        body: JSON.stringify(parsed),
      });
      const latest = await apiFetch<{ settings: BusinessSettings }>('/api/settings');
      onSettingsUpdated(latest.settings);
      setNotice('Database backup restored cleanly.');
    } catch (err: any) {
      setError(err.message || 'Invalid backup file.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {sigModalOpen && (
        <SignaturePadModal
          title="Authorized Representative Signature"
          onClose={() => setSigModalOpen(false)}
          onSaved={(url) => {
            setForm((prev) => ({ ...prev, signature_url: url }));
            setSigModalOpen(false);
          }}
        />
      )}

      <div className="pb-4 border-b border-slate-200">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Business Settings</h1>
        <p className="text-xs text-slate-600 mt-0.5">
          Manage official shop identity, document numbering, default terms, staff permissions, and full database backups.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setTab('business')}
          className={`px-3.5 py-1.5 rounded text-xs font-semibold ${
            tab === 'business'
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Business Profile & Document Defaults
        </button>
        {isOwner && (
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold ${
              tab === 'users'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Authorized Staff & Roles
          </button>
        )}
        <button
          type="button"
          onClick={() => setTab('security')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold ${
            tab === 'security'
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          Account & Password
        </button>
        {isOwner && (
          <button
            type="button"
            onClick={() => setTab('backup')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold ${
              tab === 'backup'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Backup & Restore
          </button>
        )}
      </div>

      {notice && (
        <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* TAB 1: BUSINESS PROFILE */}
      {tab === 'business' && (
        <form onSubmit={handleSaveBusiness} className="space-y-5">
          <div className="p-3.5 rounded-md bg-sky-50 border border-sky-200 text-xs text-sky-950 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
            <div>
              <strong>Verified Information Policy:</strong> Publicly indexed details linked to{' '}
              <span className="font-mono">facebook.com/johnroiscanon</span> (Business Name, Brgy. Ubalde Davao City location, Google Maps link, and listed mobile number) are pre-populated below. Unverified fields—such as official Logo image, Email address, Authorized Representative name, Signature, and Tax settings—have been intentionally left blank for the owner to supply. No legal or tax numbers have been invented.
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-md p-5 space-y-5">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
              1. Shop Identity & Contact Details
            </h2>

            {/* Logo Upload */}
            <div className="flex flex-wrap items-center gap-5">
              <div className="w-20 h-20 rounded border border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Business Logo"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-xs font-bold text-slate-400 text-center px-1">
                    No Logo
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-slate-800">Official Business Logo</div>
                <div className="flex items-center gap-2">
                  {isOwner && (
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingLogo ? 'Uploading...' : 'Upload Logo (PNG/JPG)'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                  {isOwner && form.logo_url && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, logo_url: '' })}
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Remove Logo
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Appears on Quotations, Invoices, Service Reports, and Billing Statements.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Business Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!isOwner}
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded disabled:bg-slate-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Business Address
                </label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Enter complete shop address"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Contact Number
                </label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={form.contact_number}
                  onChange={(e) => setForm({ ...form, contact_number: e.target.value })}
                  placeholder="Mobile / Landline number"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  disabled={!isOwner}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="Supply official business email when available"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Facebook Profile / Page Link
                </label>
                <input
                  type="url"
                  disabled={!isOwner}
                  value={form.facebook_url}
                  onChange={(e) => setForm({ ...form, facebook_url: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Google Maps Location Link
                </label>
                <input
                  type="url"
                  disabled={!isOwner}
                  value={form.maps_url}
                  onChange={(e) => setForm({ ...form, maps_url: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded disabled:bg-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Document Numbering & Defaults */}
          <div className="bg-white border border-slate-200 rounded-md p-5 space-y-5">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
              2. Document Numbering Format & Default Terms
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                  Quotation Prefix
                </label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={form.quotation_prefix}
                  onChange={(e) => setForm({ ...form, quotation_prefix: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                  Invoice Prefix
                </label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={form.invoice_prefix}
                  onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                  Service Report Prefix
                </label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={form.service_report_prefix}
                  onChange={(e) => setForm({ ...form, service_report_prefix: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                  Statement Prefix
                </label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={form.billing_statement_prefix}
                  onChange={(e) => setForm({ ...form, billing_statement_prefix: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
                  Digit Padding
                </label>
                <input
                  type="number"
                  min={3}
                  max={8}
                  disabled={!isOwner}
                  value={form.doc_number_padding}
                  onChange={(e) =>
                    setForm({ ...form, doc_number_padding: Number(e.target.value) || 4 })
                  }
                  className="w-full px-2.5 py-1.5 text-sm tabular-nums border border-slate-300 rounded"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                disabled={!isOwner}
                checked={Boolean(form.include_year_in_doc_num)}
                onChange={(e) =>
                  setForm({ ...form, include_year_in_doc_num: e.target.checked ? 1 : 0 })
                }
                className="rounded border-slate-300"
              />
              Include calendar year in document numbers (e.g., {form.quotation_prefix}-2026-0001)
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Default Payment Terms
                </label>
                <textarea
                  rows={2}
                  disabled={!isOwner}
                  value={form.default_payment_terms}
                  onChange={(e) => setForm({ ...form, default_payment_terms: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Default Document Notes / Remarks
                </label>
                <textarea
                  rows={2}
                  disabled={!isOwner}
                  value={form.default_notes}
                  onChange={(e) => setForm({ ...form, default_notes: e.target.value })}
                  placeholder="Optional standard warranty or fabrication notes"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
            </div>
          </div>

          {/* Authorized Representative, Signature & Tax */}
          <div className="bg-white border border-slate-200 rounded-md p-5 space-y-5">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
              3. Authorized Signatory & Tax Settings
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Authorized Representative Name
                </label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={form.authorized_representative}
                  onChange={(e) => setForm({ ...form, authorized_representative: e.target.value })}
                  placeholder="Supply owner / authorized signatory full name"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Title / Designation
                </label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={form.authorized_title}
                  onChange={(e) => setForm({ ...form, authorized_title: e.target.value })}
                  placeholder="e.g., Proprietor / Shop Manager"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 bg-slate-50 border border-slate-200 rounded">
              <div>
                <div className="text-xs font-bold uppercase text-slate-700">
                  Authorized Signature Image (Optional)
                </div>
                <p className="text-xs text-slate-500">
                  If provided, appears automatically on printed and PDF documents.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {form.signature_url && (
                  <img
                    src={form.signature_url}
                    alt="Authorized Sig"
                    className="h-10 bg-white border border-slate-300 rounded px-2 object-contain"
                  />
                )}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setSigModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    {form.signature_url ? 'Update Signature' : 'Draw / Upload Signature'}
                  </button>
                )}
                {isOwner && form.signature_url && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, signature_url: '' })}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  disabled={!isOwner}
                  checked={Boolean(form.tax_enabled)}
                  onChange={(e) => setForm({ ...form, tax_enabled: e.target.checked ? 1 : 0 })}
                  className="rounded border-slate-300"
                />
                Enable Default Tax on New Quotations & Invoices
              </label>

              {Boolean(form.tax_enabled) && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    disabled={!isOwner}
                    value={form.tax_label}
                    onChange={(e) => setForm({ ...form, tax_label: e.target.value })}
                    placeholder="Tax Label (e.g. VAT)"
                    className="w-28 px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    disabled={!isOwner}
                    value={form.tax_rate}
                    onChange={(e) =>
                      setForm({ ...form, tax_rate: parseFloat(e.target.value) || 0 })
                    }
                    className="w-24 px-2.5 py-1.5 text-xs text-right tabular-nums border border-slate-300 rounded"
                  />
                  <span className="text-xs text-slate-600">%</span>
                </div>
              )}
            </div>
          </div>

          {isOwner && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving Settings...' : 'Save Business Settings'}
              </button>
            </div>
          )}
        </form>
      )}

      {/* TAB 2: AUTHORIZED STAFF & RBAC */}
      {tab === 'users' && isOwner && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-md overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-xs uppercase tracking-wider text-slate-700">
              Authorized Accounts ({staffList.length})
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2.5 px-4 text-left">Name</th>
                  <th className="py-2.5 px-4 text-left">Username</th>
                  <th className="py-2.5 px-4 text-left">Role</th>
                  <th className="py-2.5 px-4 text-left">Status</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffList.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{u.full_name}</td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-600">{u.username}</td>
                    <td className="py-2.5 px-4 capitalize text-xs font-semibold">{u.role}</td>
                    <td className="py-2.5 px-4 text-xs">
                      {u.is_active ? (
                        <span className="text-emerald-700 font-semibold">Active</span>
                      ) : (
                        <span className="text-slate-400">Disabled</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {u.id !== user.id && (
                        <button
                          type="button"
                          onClick={() => handleToggleUserActive(u)}
                          className="text-xs font-medium text-sky-700 hover:underline"
                        >
                          {u.is_active ? 'Disable' : 'Enable'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={handleCreateStaff}
            className="bg-white border border-slate-200 rounded-md p-4 space-y-3"
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Add Authorized Staff Account
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Username *</label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded bg-white"
              >
                <option value="staff">Staff (Documents & Customers)</option>
                <option value="technician">Technician (Service Reports & Catalog)</option>
                <option value="owner">Owner / Administrator</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Initial Password (min 6 chars) *
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
            >
              Create Account
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: PASSWORD & PROFILE SECURITY */}
      {tab === 'security' && (
        <form
          onSubmit={handleChangePassword}
          className="max-w-md bg-white border border-slate-200 rounded-md p-5 space-y-4"
        >
          <h2 className="text-sm font-bold text-slate-900">Update Your Login Credentials</h2>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Display Name
            </label>
            <input
              type="text"
              required
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Username
            </label>
            <input
              type="text"
              required
              value={profileUsername}
              onChange={(e) => setProfileUsername(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Current Password *
            </label>
            <input
              type="password"
              required
              value={currPass}
              onChange={(e) => setCurrPass(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              New Password (min 6 characters) *
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={nextPass}
              onChange={(e) => setNextPass(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
          >
            Update Credentials
          </button>
        </form>
      )}

      {/* TAB 4: BACKUP & DATA EXPORT */}
      {tab === 'backup' && isOwner && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white border border-slate-200 rounded-md p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900">Export Complete System Backup</h2>
            <p className="text-xs text-slate-600">
              Downloads a complete snapshot of your SQLite database—including business settings, customers, products, quotations, invoices, payments, service reports, billing statements, and uploaded logo/signature/photo files—into a single portable JSON file.
            </p>
            <button
              type="button"
              onClick={() =>
                downloadAuthenticatedFile(
                  '/api/backup/export',
                  `johnrois-backup-${todayYMD()}.json`
                )
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
            >
              <Download className="w-4 h-4" />
              Download Full Backup (.json)
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-md p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900">Restore from Backup File</h2>
            <p className="text-xs text-slate-600">
              Restore a previously exported <code className="font-mono">.json</code> backup file. All records and uploaded images will be restored transactionally.
            </p>
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer">
              <Upload className="w-4 h-4 text-sky-700" />
              Select Backup File to Restore
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleBackupImport}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
