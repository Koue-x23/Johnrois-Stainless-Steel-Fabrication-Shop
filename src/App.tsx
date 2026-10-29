import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Wrench,
  FileSpreadsheet,
  Users,
  Package,
  CreditCard,
  BarChart3,
  Settings,
  Menu,
  X,
  Search,
  Plus,
  ChevronDown,
  AlertTriangle,
  RefreshCw,
  UserSquare2,
  Banknote,
  FileBadge,
  IdCard,
  ArrowLeftRight,
  Building2,
} from 'lucide-react';
import {
  AuthUser,
  BusinessSettings,
  BusinessSlug,
  NavigationTarget,
  NavSection,
} from './types';
import {
  apiFetch,
  formatPHP,
  getBusinessMonogram,
  hasInFlightMutations,
  parseBusinessSlugFromPathname,
  resolveAssetUrl,
  setActiveBusinessSlug,
} from './lib/api';
import { WelcomeScreen } from './components/WelcomeScreen';
import { DashboardPage } from './pages/DashboardPage';
import { QuotationsPage } from './pages/QuotationsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { ServiceReportsPage } from './pages/ServiceReportsPage';
import { BillingStatementsPage } from './pages/BillingStatementsPage';
import { CustomersPage } from './pages/CustomersPage';
import { ProductsPage } from './pages/ProductsPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { ReportsPage } from './pages/ReportsPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { PayslipsPage } from './pages/PayslipsPage';
import { CertificatesOfEmploymentPage } from './pages/CertificatesOfEmploymentPage';
import { EmployeeIdsPage } from './pages/EmployeeIdsPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatusBadge } from './components/StatusBadge';

const MAIN_NAV_ITEMS: {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'quotations', label: 'Quotations', icon: FileText },
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'service-reports', label: 'Service Reports', icon: Wrench },
  { id: 'billing-statements', label: 'Billing Statements', icon: FileSpreadsheet },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'products', label: 'Products and Services', icon: Package },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

const HR_NAV_ITEMS: {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'employees', label: 'Employee Directory', icon: UserSquare2 },
  { id: 'payslips', label: 'Payslip Maker', icon: Banknote },
  { id: 'certificates-of-employment', label: 'Certificate of Employment', icon: FileBadge },
  { id: 'employee-ids', label: 'Employee ID Maker', icon: IdCard },
];

const SYSTEM_NAV_ITEMS: {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [{ id: 'settings', label: 'Business Settings', icon: Settings }];

const NAV_ITEMS = [...MAIN_NAV_ITEMS, ...HR_NAV_ITEMS, ...SYSTEM_NAV_ITEMS];

const VALID_SECTIONS = new Set<NavSection>(NAV_ITEMS.map((n) => n.id));

interface ParsedRoute {
  businessSlug: BusinessSlug | null;
  target: NavigationTarget;
}

function parseLocationRoute(pathname: string): ParsedRoute {
  const parts = pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);

  if (parts.length === 0) {
    return { businessSlug: null, target: { section: 'dashboard' } };
  }

  const businessSlug = parseBusinessSlugFromPathname(pathname);
  if (!businessSlug) {
    return { businessSlug: null, target: { section: 'dashboard' } };
  }

  const rest = parts.slice(1);
  if (rest.length === 0 || rest[0] === 'dashboard') {
    return { businessSlug, target: { section: 'dashboard' } };
  }

  const candidate = rest[0] as NavSection;
  if (!VALID_SECTIONS.has(candidate)) {
    return { businessSlug, target: { section: 'dashboard' } };
  }

  if (rest[1] === 'new') {
    return { businessSlug, target: { section: candidate, createNew: true } };
  }

  const numericId = rest[1] ? Number(rest[1]) : NaN;
  if (Number.isInteger(numericId) && numericId > 0) {
    return { businessSlug, target: { section: candidate, openId: numericId } };
  }

  return { businessSlug, target: { section: candidate } };
}

function buildPathForBusiness(businessSlug: BusinessSlug, target: NavigationTarget): string {
  if (target.section === 'dashboard') return `/${businessSlug}`;
  if (target.openId) return `/${businessSlug}/${target.section}/${target.openId}`;
  if (target.createNew) return `/${businessSlug}/${target.section}/new`;
  return `/${businessSlug}/${target.section}`;
}

function getDefaultSettingsForBusiness(slug: BusinessSlug): BusinessSettings {
  if (slug === 'jrec') {
    return {
      id: 2,
      business_id: 2,
      business_name: 'JREC Stainless Steel Fabrication',
      logo_url: '',
      address: '',
      contact_number: '',
      email: '',
      facebook_url: '',
      maps_url: '',
      other_social_links: '',
      operating_hours: '',
      quotation_prefix: 'QTN',
      invoice_prefix: 'INV',
      service_report_prefix: 'SR',
      billing_statement_prefix: 'SOA',
      customer_prefix: 'CUST',
      product_prefix: 'ITEM',
      payment_prefix: 'PAY',
      employee_prefix: 'EMP',
      payslip_prefix: 'PSL',
      coe_prefix: 'COE',
      id_card_prefix: 'IDC',
      doc_number_padding: 4,
      include_year_in_doc_num: 1,
      default_payment_terms:
        '50% Downpayment upon confirmation; 50% Balance upon completion/delivery',
      default_quotation_validity_days: 15,
      default_invoice_due_days: 15,
      default_notes: '',
      authorized_representative: '',
      authorized_title: 'Authorized Representative',
      signature_url: '',
      tax_enabled: 0,
      tax_label: 'VAT',
      tax_rate: 0,
      updated_at: '',
    };
  }

  return {
    id: 1,
    business_id: 1,
    business_name: 'John Rois Stainless Steel Fabrication Shop',
    logo_url: '',
    address: 'Brgy. Ubalde, R. Castillo, Davao City, Davao del Sur, Philippines',
    contact_number: '+63 917 421 7417',
    email: '',
    facebook_url: 'https://www.facebook.com/johnroiscanon',
    maps_url: 'https://goo.gl/maps/t4FehxJHF1j5PdfZ6',
    other_social_links: '',
    operating_hours: 'Mon–Sat 8:00 AM – 5:00 PM | Sun 9:00 AM – 12:00 PM',
    quotation_prefix: 'QTN',
    invoice_prefix: 'INV',
    service_report_prefix: 'SR',
    billing_statement_prefix: 'SOA',
    customer_prefix: 'CUST',
    product_prefix: 'ITEM',
    payment_prefix: 'PAY',
    employee_prefix: 'EMP',
    payslip_prefix: 'PSL',
    coe_prefix: 'COE',
    id_card_prefix: 'IDC',
    doc_number_padding: 4,
    include_year_in_doc_num: 1,
    default_payment_terms:
      '50% Downpayment upon confirmation; 50% Balance upon completion/delivery',
    default_quotation_validity_days: 15,
    default_invoice_due_days: 15,
    default_notes: '',
    authorized_representative: '',
    authorized_title: 'Authorized Representative',
    signature_url: '',
    tax_enabled: 0,
    tax_label: 'VAT',
    tax_rate: 0,
    updated_at: '',
  };
}

interface StorageInfo {
  engine: string;
  persistent: boolean;
  is_serverless: boolean;
  setup_required: boolean;
  message: string;
}

interface WorkspaceShellProps {
  businessSlug: BusinessSlug;
  initialTarget: NavigationTarget;
  onExitToWelcome: () => void;
}

const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  businessSlug,
  initialTarget,
  onExitToWelcome,
}) => {
  // Synchronously bind API client header to this business workspace
  setActiveBusinessSlug(businessSlug);

  const [settings, setSettings] = useState<BusinessSettings>(() =>
    getDefaultSettingsForBusiness(businessSlug)
  );
  const [logoBroken, setLogoBroken] = useState(false);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [switchWarning, setSwitchWarning] = useState('');
  const [activeNav, setActiveNav] = useState<NavSection>(initialTarget.section);
  const [navPayload, setNavPayload] = useState<{
    openId?: number;
    createNew?: boolean;
    prefillCustomerId?: number;
    prefillEmployeeId?: number;
  }>({
    openId: initialTarget.openId,
    createNew: initialTarget.createNew,
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Track unsaved form edits inside the workspace to prevent accidental business switching
  const hasUnsavedFormEditsRef = useRef(false);

  // Global search
  const [globalQuery, setGlobalQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const loadSettings = useCallback(() => {
    setSettingsError('');
    apiFetch<{ settings: BusinessSettings; storage?: StorageInfo }>('/api/settings', {
      businessSlug,
    })
      .then((res) => {
        if (res.settings) {
          setSettings(res.settings);
          setLogoBroken(false);
        }
        if (res.storage) setStorageInfo(res.storage);
      })
      .catch((err: any) => {
        setSettingsError(err.message || 'Unable to load business settings from server.');
      });
  }, [businessSlug]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = `${settings.business_name} — Workspace`;
    }
  }, [settings.business_name]);

  // Reset unsaved edit flag whenever a form submits cleanly or user navigates between sections
  useEffect(() => {
    hasUnsavedFormEditsRef.current = false;
  }, [activeNav]);

  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseLocationRoute(window.location.pathname);
      if (!parsed.businessSlug || parsed.businessSlug !== businessSlug) {
        return;
      }
      setActiveNav(parsed.target.section);
      setNavPayload({
        openId: parsed.target.openId,
        createNew: parsed.target.createNew,
      });
      setSidebarOpen(false);
      setQuickCreateOpen(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [businessSlug]);

  useEffect(() => {
    if (!globalQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      apiFetch<{ results: any[] }>(`/api/search?q=${encodeURIComponent(globalQuery.trim())}`, {
        businessSlug,
      })
        .then((r) => setSearchResults(r.results || []))
        .catch(() => {
          setSearchResults([]);
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [globalQuery, businessSlug]);

  const workspaceUser: AuthUser = {
    id: businessSlug === 'jrec' ? 2 : 1,
    username: businessSlug,
    full_name: settings.authorized_representative || '',
    email: settings.email || '',
    role: 'owner',
  };

  const navigateTo = (target: NavigationTarget) => {
    hasUnsavedFormEditsRef.current = false;
    setActiveNav(target.section);
    setNavPayload({
      openId: target.openId,
      createNew: target.createNew,
      prefillCustomerId: target.prefillCustomerId,
      prefillEmployeeId: target.prefillEmployeeId,
    });
    setSidebarOpen(false);
    setQuickCreateOpen(false);

    if (typeof window !== 'undefined') {
      const nextPath = buildPathForBusiness(businessSlug, target);
      if (window.location.pathname !== nextPath) {
        window.history.pushState({}, '', nextPath);
      }
    }
  };

  const clearNavPayload = () => {
    setNavPayload({});
    if (typeof window !== 'undefined') {
      const basePath =
        activeNav === 'dashboard' ? `/${businessSlug}` : `/${businessSlug}/${activeNav}`;
      if (window.location.pathname === `/${businessSlug}/${activeNav}/new`) {
        window.history.replaceState({}, '', basePath);
      }
    }
  };

  const handleRequestLeaveWorkspace = () => {
    if (hasInFlightMutations()) {
      setSwitchWarning(
        'A save operation is currently in progress. Please wait for saving to complete before switching businesses.'
      );
      setTimeout(() => setSwitchWarning(''), 4500);
      return;
    }

    const isCreatingNew =
      typeof window !== 'undefined' && window.location.pathname.endsWith('/new');
    if (hasUnsavedFormEditsRef.current || isCreatingNew) {
      const confirmed = window.confirm(
        `You have unsaved edits in ${settings.business_name}. Return to the Welcome screen and discard unsaved changes?`
      );
      if (!confirmed) return;
    }

    hasUnsavedFormEditsRef.current = false;
    onExitToWelcome();
  };

  const handleMainFormChangeCapture = (e: React.SyntheticEvent<HTMLElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const tag = target.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;
    // Ignore search/filter inputs outside forms or modals
    const inFormOrDialog = Boolean(
      target.closest('form') || target.closest('[role="dialog"]')
    );
    if (inFormOrDialog) {
      hasUnsavedFormEditsRef.current = true;
    }
  };

  const handleMainFormSubmitCapture = () => {
    hasUnsavedFormEditsRef.current = false;
  };

  const mapSearchTypeToSection = (t: string): NavSection => {
    switch (t) {
      case 'quotation':
        return 'quotations';
      case 'invoice':
        return 'invoices';
      case 'service_report':
        return 'service-reports';
      case 'billing_statement':
        return 'billing-statements';
      case 'customer':
        return 'customers';
      case 'employee':
        return 'employees';
      case 'payslip':
        return 'payslips';
      case 'coe':
        return 'certificates-of-employment';
      case 'employee_id':
        return 'employee-ids';
      default:
        return 'dashboard';
    }
  };

  const monogram = getBusinessMonogram(
    settings.business_name,
    businessSlug === 'jrec' ? 'JREC' : 'JR'
  );
  const showLogo = Boolean(settings.logo_url && !logoBroken);

  return (
    <div className="app-shell min-h-screen flex bg-slate-100 text-slate-900">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden no-print"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`no-print fixed lg:static inset-y-0 left-0 z-50 w-64 bg-slate-950 text-slate-200 flex flex-col border-r border-slate-800 transform transition-transform duration-150 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-4 py-4 border-b border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              {showLogo ? (
                <img
                  src={resolveAssetUrl(settings.logo_url)}
                  alt={settings.business_name}
                  onError={() => setLogoBroken(true)}
                  className="w-9 h-9 rounded bg-white p-0.5 object-contain shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded bg-sky-900/60 border border-sky-700/60 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-extrabold tracking-wider text-sky-200">
                    {monogram}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <div
                  data-testid="sidebar-business-name"
                  className="text-xs font-bold text-white leading-tight line-clamp-2"
                >
                  {settings.business_name}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-sky-400 mt-0.5">
                  Active Workspace
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <button
            type="button"
            data-testid="sidebar-switch-business-btn"
            onClick={handleRequestLeaveWorkspace}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-semibold text-slate-200 transition-colors"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>Welcome / Switch Business</span>
          </button>
        </div>

        <nav className="flex-1 px-2.5 py-4 space-y-4 overflow-y-auto">
          <div className="space-y-0.5">
            {MAIN_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo({ section: item.id })}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-sky-700 text-white font-semibold'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-800 space-y-0.5">
            <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              HR &amp; Employee Documents
            </div>
            {HR_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo({ section: item.id })}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-sky-700 text-white font-semibold'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-800 space-y-0.5">
            {SYSTEM_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo({ section: item.id })}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-sky-700 text-white font-semibold'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="p-3.5 border-t border-slate-800 bg-slate-900/50">
          <div className="text-[11px] font-medium text-slate-300 truncate">
            {settings.contact_number || settings.business_name}
          </div>
          {settings.address ? (
            <div className="text-[10px] text-slate-500 truncate mt-0.5">{settings.address}</div>
          ) : (
            <div className="text-[10px] text-slate-500 truncate mt-0.5">
              Independent Business Workspace
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="no-print sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded border border-slate-300 text-slate-700"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Global Search Bar */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={globalQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                onChange={(e) => setGlobalQuery(e.target.value)}
                placeholder="Search workspace: document #, customer, employee, payslip, COE..."
                className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              />

              {searchFocused && globalQuery.trim() !== '' && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-300 rounded-md shadow-xl max-h-80 overflow-y-auto z-50 divide-y divide-slate-100">
                  {searchResults.length === 0 ? (
                    <div className="px-3.5 py-3 text-xs text-slate-500">
                      No matching documents or customers found in {settings.business_name}.
                    </div>
                  ) : (
                    searchResults.map((r, i) => (
                      <button
                        key={`${r.type}-${r.id}-${i}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setGlobalQuery('');
                          setSearchFocused(false);
                          navigateTo({
                            section: mapSearchTypeToSection(r.type),
                            openId: r.id,
                          });
                        }}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-900">{r.title}</div>
                          <div className="text-[11px] text-slate-500">
                            <span className="uppercase font-semibold">
                              {r.type.replace('_', ' ')}
                            </span>{' '}
                            • {r.subtitle}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {r.amount !== null && r.amount !== undefined && Number(r.amount) > 0 && (
                            <span className="text-xs font-semibold tabular-nums">
                              {formatPHP(r.amount)}
                            </span>
                          )}
                          <StatusBadge status={r.status} />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Active Business Indicator + Switch Button in Header */}
            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-sky-50 border border-sky-200 text-sky-950">
              <Building2 className="w-3.5 h-3.5 text-sky-700 shrink-0" />
              <span
                data-testid="header-business-name"
                className="text-xs font-bold max-w-[230px] truncate"
              >
                {settings.business_name}
              </span>
            </div>

            <button
              type="button"
              data-testid="header-switch-business-btn"
              onClick={handleRequestLeaveWorkspace}
              title="Return to Welcome Screen / Switch Business"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-sky-700" />
              <span className="hidden sm:inline">Switch Business</span>
            </button>

            {/* Quick Create Action Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setQuickCreateOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Quick Create</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {quickCreateOpen && (
                <div
                  onMouseLeave={() => setQuickCreateOpen(false)}
                  className="absolute right-0 mt-1 w-48 bg-white border border-slate-300 rounded-md shadow-lg py-1 z-40 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => navigateTo({ section: 'quotations', createNew: true })}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 font-medium text-slate-800"
                  >
                    + New Quotation
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo({ section: 'invoices', createNew: true })}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 font-medium text-slate-800"
                  >
                    + New Invoice
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo({ section: 'service-reports', createNew: true })}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 font-medium text-slate-800"
                  >
                    + New Service Report
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo({ section: 'billing-statements', createNew: true })}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 font-medium text-slate-800"
                  >
                    + New Billing Statement
                  </button>
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    type="button"
                    onClick={() => navigateTo({ section: 'customers', createNew: true })}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 font-medium text-slate-800"
                  >
                    + New Customer
                  </button>
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    type="button"
                    onClick={() => navigateTo({ section: 'employees', createNew: true })}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 font-medium text-slate-800"
                  >
                    + Add Employee
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo({ section: 'payslips', createNew: true })}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 font-medium text-slate-800"
                  >
                    + New Payslip
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigateTo({ section: 'certificates-of-employment', createNew: true })
                    }
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 font-medium text-slate-800"
                  >
                    + New COE
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo({ section: 'employee-ids', createNew: true })}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 font-medium text-slate-800"
                  >
                    + New Employee ID
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Save-in-progress Switch Guard Notice */}
        {switchWarning && (
          <div className="no-print mx-4 sm:mx-6 lg:mx-7 mt-4 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>{switchWarning}</span>
          </div>
        )}

        {/* System / Storage Alerts */}
        {settingsError && (
          <div className="no-print mx-4 sm:mx-6 lg:mx-7 mt-4 p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{settingsError}</span>
            </div>
            <button
              type="button"
              onClick={loadSettings}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-rose-700 text-white font-semibold hover:bg-rose-800"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Connection
            </button>
          </div>
        )}

        {storageInfo?.setup_required && (
          <div className="no-print mx-4 sm:mx-6 lg:mx-7 mt-4 p-3.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <div className="font-bold">Cloud Database Setup Required for Permanent Saves</div>
              <p className="mt-0.5 text-amber-800 leading-relaxed">{storageInfo.message}</p>
            </div>
          </div>
        )}

        {/* Workspace View */}
        <main
          onChangeCapture={handleMainFormChangeCapture}
          onSubmitCapture={handleMainFormSubmitCapture}
          className="app-main-scroll flex-1 p-4 sm:p-6 lg:p-7 overflow-y-auto"
        >
          {activeNav === 'dashboard' && <DashboardPage onNavigate={navigateTo} />}

          {activeNav === 'quotations' && (
            <QuotationsPage
              user={workspaceUser}
              settings={settings}
              initialOpenId={navPayload.openId}
              initialCreateNew={navPayload.createNew}
              prefillCustomerId={navPayload.prefillCustomerId}
              onClearInitial={clearNavPayload}
              onNavigate={navigateTo}
            />
          )}

          {activeNav === 'invoices' && (
            <InvoicesPage
              user={workspaceUser}
              settings={settings}
              initialOpenId={navPayload.openId}
              initialCreateNew={navPayload.createNew}
              prefillCustomerId={navPayload.prefillCustomerId}
              onClearInitial={clearNavPayload}
            />
          )}

          {activeNav === 'service-reports' && (
            <ServiceReportsPage
              user={workspaceUser}
              settings={settings}
              initialOpenId={navPayload.openId}
              initialCreateNew={navPayload.createNew}
              prefillCustomerId={navPayload.prefillCustomerId}
              onClearInitial={clearNavPayload}
            />
          )}

          {activeNav === 'billing-statements' && (
            <BillingStatementsPage
              user={workspaceUser}
              settings={settings}
              initialOpenId={navPayload.openId}
              initialCreateNew={navPayload.createNew}
              prefillCustomerId={navPayload.prefillCustomerId}
              onClearInitial={clearNavPayload}
            />
          )}

          {activeNav === 'customers' && (
            <CustomersPage
              initialOpenId={navPayload.openId}
              initialCreateNew={navPayload.createNew}
              onClearInitial={clearNavPayload}
              onNavigate={navigateTo}
            />
          )}

          {activeNav === 'products' && <ProductsPage />}

          {activeNav === 'payments' && <PaymentsPage onNavigate={navigateTo} />}

          {activeNav === 'reports' && <ReportsPage onNavigate={navigateTo} />}

          {activeNav === 'employees' && (
            <EmployeesPage
              initialOpenId={navPayload.openId}
              initialCreateNew={navPayload.createNew}
              onClearInitial={clearNavPayload}
              onNavigate={navigateTo}
            />
          )}

          {activeNav === 'payslips' && (
            <PayslipsPage
              settings={settings}
              initialOpenId={navPayload.openId}
              initialCreateNew={navPayload.createNew}
              prefillEmployeeId={navPayload.prefillEmployeeId}
              onClearInitial={clearNavPayload}
            />
          )}

          {activeNav === 'certificates-of-employment' && (
            <CertificatesOfEmploymentPage
              settings={settings}
              initialOpenId={navPayload.openId}
              initialCreateNew={navPayload.createNew}
              prefillEmployeeId={navPayload.prefillEmployeeId}
              onClearInitial={clearNavPayload}
            />
          )}

          {activeNav === 'employee-ids' && (
            <EmployeeIdsPage
              settings={settings}
              initialOpenId={navPayload.openId}
              initialCreateNew={navPayload.createNew}
              prefillEmployeeId={navPayload.prefillEmployeeId}
              onClearInitial={clearNavPayload}
            />
          )}

          {activeNav === 'settings' && (
            <SettingsPage
              businessSlug={businessSlug}
              settings={settings}
              onSettingsUpdated={(s) => {
                hasUnsavedFormEditsRef.current = false;
                setSettings(s);
                setLogoBroken(false);
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  const initialRoute =
    typeof window !== 'undefined'
      ? parseLocationRoute(window.location.pathname)
      : { businessSlug: null, target: { section: 'dashboard' as NavSection } };

  const [route, setRoute] = useState<ParsedRoute>(initialRoute);

  useEffect(() => {
    setActiveBusinessSlug(route.businessSlug);
    if (!route.businessSlug && typeof document !== 'undefined') {
      document.title = 'Welcome — Multi-Business Management Workspace';
    }
  }, [route.businessSlug]);

  useEffect(() => {
    const handlePopState = () => {
      if (hasInFlightMutations()) return;
      const next = parseLocationRoute(window.location.pathname);
      setActiveBusinessSlug(next.businessSlug);
      setRoute(next);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSelectBusiness = (slug: BusinessSlug) => {
    setActiveBusinessSlug(slug);
    const nextRoute: ParsedRoute = {
      businessSlug: slug,
      target: { section: 'dashboard' },
    };
    setRoute(nextRoute);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `/${slug}`);
    }
  };

  const handleExitToWelcome = () => {
    setActiveBusinessSlug(null);
    setRoute({ businessSlug: null, target: { section: 'dashboard' } });
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
    }
  };

  if (!route.businessSlug) {
    return <WelcomeScreen onSelectBusiness={handleSelectBusiness} />;
  }

  return (
    <WorkspaceShell
      key={route.businessSlug}
      businessSlug={route.businessSlug}
      initialTarget={route.target}
      onExitToWelcome={handleExitToWelcome}
    />
  );
};
