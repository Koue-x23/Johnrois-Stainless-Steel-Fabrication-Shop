import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { AuthUser, BusinessSettings, NavigationTarget, NavSection } from './types';
import { apiFetch, formatPHP } from './lib/api';
import { DashboardPage } from './pages/DashboardPage';
import { QuotationsPage } from './pages/QuotationsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { ServiceReportsPage } from './pages/ServiceReportsPage';
import { BillingStatementsPage } from './pages/BillingStatementsPage';
import { CustomersPage } from './pages/CustomersPage';
import { ProductsPage } from './pages/ProductsPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatusBadge } from './components/StatusBadge';

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'quotations', label: 'Quotations', icon: FileText },
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'service-reports', label: 'Service Reports', icon: Wrench },
  { id: 'billing-statements', label: 'Billing Statements', icon: FileSpreadsheet },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'products', label: 'Products and Services', icon: Package },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Business Settings', icon: Settings },
];

const DEFAULT_SETTINGS: BusinessSettings = {
  id: 1,
  business_name: 'Johnrois Stainless Steel Fabrication Shop',
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
  doc_number_padding: 4,
  include_year_in_doc_num: 1,
  default_payment_terms: '50% Downpayment upon confirmation; 50% Balance upon completion/delivery',
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

export const App: React.FC = () => {
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [navPayload, setNavPayload] = useState<{
    openId?: number;
    createNew?: boolean;
    prefillCustomerId?: number;
  }>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Global search
  const [globalQuery, setGlobalQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  useEffect(() => {
    apiFetch<{ settings: BusinessSettings }>('/api/settings')
      .then((res) => {
        if (res.settings) setSettings(res.settings);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!globalQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      apiFetch<{ results: any[] }>(`/api/search?q=${encodeURIComponent(globalQuery.trim())}`)
        .then((r) => setSearchResults(r.results || []))
        .catch(() => {});
    }, 180);
    return () => clearTimeout(timer);
  }, [globalQuery]);

  const workspaceUser: AuthUser = {
    id: 1,
    username: 'workspace',
    full_name: settings.authorized_representative || '',
    email: settings.email || '',
    role: 'owner',
  };

  const navigateTo = (target: NavigationTarget) => {
    setActiveNav(target.section);
    setNavPayload({
      openId: target.openId,
      createNew: target.createNew,
      prefillCustomerId: target.prefillCustomerId,
    });
    setSidebarOpen(false);
    setQuickCreateOpen(false);
  };

  const clearNavPayload = () => {
    setNavPayload({});
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
      default:
        return 'dashboard';
    }
  };

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
        <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt={settings.business_name}
                className="w-9 h-9 rounded bg-white p-0.5 object-contain shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                <span className="text-xs font-extrabold tracking-wider text-white">JR</span>
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-bold text-white leading-tight truncate">
                {settings.business_name}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">
                Fabrication Shop ERP
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

        <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo({ section: item.id })}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
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
        </nav>

        {settings.address && (
          <div className="p-3.5 border-t border-slate-800 bg-slate-900/50">
            <div className="text-[11px] font-medium text-slate-300 truncate">
              {settings.contact_number || 'Shop Workspace'}
            </div>
            <div className="text-[10px] text-slate-500 truncate mt-0.5">{settings.address}</div>
          </div>
        )}
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
                placeholder="Global search: document #, customer, project, equipment..."
                className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              />

              {searchFocused && globalQuery.trim() !== '' && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-300 rounded-md shadow-xl max-h-80 overflow-y-auto z-50 divide-y divide-slate-100">
                  {searchResults.length === 0 ? (
                    <div className="px-3.5 py-3 text-xs text-slate-500">
                      No matching documents or customers found.
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
                            <span className="uppercase font-semibold">{r.type.replace('_', ' ')}</span> •{' '}
                            {r.subtitle}
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
              </div>
            )}
          </div>
        </header>

        {/* Workspace View */}
        <main className="app-main-scroll flex-1 p-4 sm:p-6 lg:p-7 overflow-y-auto">
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

          {activeNav === 'settings' && (
            <SettingsPage
              settings={settings}
              onSettingsUpdated={(s) => setSettings(s)}
            />
          )}
        </main>
      </div>
    </div>
  );
};
