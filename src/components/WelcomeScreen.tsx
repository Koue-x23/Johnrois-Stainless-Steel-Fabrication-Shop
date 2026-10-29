import React, { useEffect, useState } from 'react';
import { ArrowRight, Building2, ShieldCheck } from 'lucide-react';
import { BusinessSlug, BusinessSummary } from '../types';
import { apiPublicFetch, getBusinessMonogram, resolveAssetUrl } from '../lib/api';

interface WelcomeScreenProps {
  onSelectBusiness: (slug: BusinessSlug) => void;
}

const FALLBACK_BUSINESSES: BusinessSummary[] = [
  {
    id: 1,
    slug: 'john-rois',
    default_name: 'John Rois Stainless Steel Fabrication Shop',
    short_code: 'JR',
    business_name: 'John Rois Stainless Steel Fabrication Shop',
    logo_url: '',
    address: '',
    contact_number: '',
  },
  {
    id: 2,
    slug: 'jrec',
    default_name: 'JREC Stainless Steel Fabrication',
    short_code: 'JREC',
    business_name: 'JREC Stainless Steel Fabrication',
    logo_url: '',
    address: '',
    contact_number: '',
  },
];

function getDisplayBusinessName(biz: BusinessSummary): string {
  const raw = (biz.business_name || '').trim();
  if (!raw) return biz.default_name;
  if (
    biz.slug === 'john-rois' &&
    raw.toLowerCase() === 'johnrois stainless steel fabrication shop'
  ) {
    return 'John Rois Stainless Steel Fabrication Shop';
  }
  return raw;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onSelectBusiness }) => {
  const [businesses, setBusinesses] = useState<BusinessSummary[]>(FALLBACK_BUSINESSES);
  const [loading, setLoading] = useState<boolean>(true);
  const [brokenLogos, setBrokenLogos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiPublicFetch<{ businesses: BusinessSummary[] }>('/api/businesses')
      .then((res) => {
        if (!active) return;
        if (Array.isArray(res?.businesses) && res.businesses.length >= 2) {
          setBusinesses(res.businesses);
          setBrokenLogos({});
        }
      })
      .catch(() => {
        // Keep clean fallback cards so navigation remains available even if offline
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col justify-between">
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-12 sm:py-16">
        <div className="w-full max-w-5xl mx-auto">
          {/* Top Center Heading */}
          <div className="text-center mb-10 sm:mb-14">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900">
              Welcome
            </h1>
            <p className="mt-3 text-sm sm:text-base text-slate-500 max-w-xl mx-auto">
              Select a business workspace below to manage quotations, invoices, service reports,
              payments, and employee documents.
            </p>
          </div>

          {/* Two Large Side-by-Side Business Cards on Desktop, Stacked on Mobile */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            {businesses.map((biz) => {
              const displayName = getDisplayBusinessName(biz);
              const hasLogo = Boolean(biz.logo_url && !brokenLogos[biz.slug]);
              const monogram = getBusinessMonogram(displayName, biz.short_code);

              return (
                <button
                  key={biz.slug}
                  type="button"
                  data-testid={`welcome-card-${biz.slug}`}
                  onClick={() => onSelectBusiness(biz.slug)}
                  className="group relative w-full text-left bg-white rounded-2xl border-2 border-slate-200 hover:border-sky-600 shadow-sm hover:shadow-xl transition-all duration-200 p-7 sm:p-9 flex flex-col items-center justify-between min-h-[320px] sm:min-h-[350px] focus:outline-none focus:ring-4 focus:ring-sky-100"
                >
                  {/* Logo / Clean Light Placeholder Frame */}
                  <div className="w-full flex flex-col items-center">
                    <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-2xl border border-slate-200 bg-slate-50/70 group-hover:bg-white group-hover:border-sky-200 transition-colors flex items-center justify-center p-4 overflow-hidden">
                      {loading ? (
                        <div className="w-16 h-16 rounded-xl bg-slate-100 animate-pulse" />
                      ) : hasLogo ? (
                        <img
                          src={resolveAssetUrl(biz.logo_url)}
                          alt={`${displayName} Logo`}
                          onError={() =>
                            setBrokenLogos((prev) => ({ ...prev, [biz.slug]: true }))
                          }
                          className="max-w-full max-h-full w-auto h-auto object-contain"
                        />
                      ) : (
                        <div
                          data-testid={`welcome-logo-placeholder-${biz.slug}`}
                          className="flex flex-col items-center justify-center text-center select-none"
                        >
                          <div className="w-16 h-16 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex flex-col items-center justify-center shadow-xs">
                            <Building2 className="w-6 h-6 text-sky-600 mb-0.5" />
                            <span className="text-[11px] font-extrabold tracking-wider">
                              {monogram}
                            </span>
                          </div>
                          <span className="mt-2 text-[11px] font-medium text-slate-400">
                            Logo Placeholder
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Business Name */}
                    <h2 className="mt-6 text-xl sm:text-2xl font-bold text-slate-900 text-center leading-snug group-hover:text-sky-700 transition-colors">
                      {displayName}
                    </h2>

                    {biz.address ? (
                      <p className="mt-2 text-xs text-slate-500 text-center line-clamp-1 max-w-sm">
                        {biz.address}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400 text-center">
                        Dedicated Business Workspace
                      </p>
                    )}
                  </div>

                  {/* Enter Workspace Action Pill */}
                  <div className="mt-7 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 text-slate-800 group-hover:bg-sky-600 group-hover:text-white text-xs sm:text-sm font-semibold transition-colors">
                    <span>Open Workspace</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </main>

      <footer className="py-5 px-4 border-t border-slate-100 text-center">
        <div className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          <span>Independent Multi-Business Workspace • Separate Records, Numbering &amp; Settings</span>
        </div>
      </footer>
    </div>
  );
};
