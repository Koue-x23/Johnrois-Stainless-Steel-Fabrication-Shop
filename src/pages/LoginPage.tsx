import React, { useState } from 'react';
import { ShieldCheck, Lock, User, ArrowRight, MapPin, Phone, Info } from 'lucide-react';
import { AuthUser } from '../types';
import { apiFetch, setStoredToken } from '../lib/api';

interface LoginPageProps {
  businessInfo: {
    business_name: string;
    logo_url: string;
    address: string;
    contact_number: string;
    facebook_url: string;
  };
  showInitialSetupHint: boolean;
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  businessInfo,
  showInitialSetupHint,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState(showInitialSetupHint ? 'admin' : '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setStoredToken(res.token);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const fillInitialOwner = () => {
    setUsername('admin');
    setPassword('Johnrois@2026');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex flex-col items-center text-center">
          {businessInfo.logo_url ? (
            <img
              src={businessInfo.logo_url}
              alt={businessInfo.business_name}
              className="w-16 h-16 object-contain rounded bg-white p-1.5 mb-4 border border-slate-700"
            />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
              <span className="text-lg font-extrabold tracking-wider text-slate-100">JR</span>
            </div>
          )}
          <h1 className="text-xl font-bold text-white tracking-tight">
            {businessInfo.business_name || 'Johnrois Stainless Steel Fabrication Shop'}
          </h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-slate-400 font-medium">
            Internal Business Management System
          </p>
        </div>

        <div className="mt-7 bg-white py-7 px-6 shadow-xl rounded-lg border border-slate-200 sm:px-8 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
            <ShieldCheck className="w-4 h-4 text-sky-700" />
            <h2 className="text-sm font-semibold text-slate-900">Authorized Personnel Sign In</h2>
          </div>

          {showInitialSetupHint && (
            <div className="p-3 rounded-md bg-sky-50 border border-sky-200 text-xs text-sky-950 space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">First-Time System Setup:</span> Initial Owner credentials are{' '}
                  <code className="px-1 py-0.5 bg-white border border-sky-200 rounded font-mono">admin</code> /{' '}
                  <code className="px-1 py-0.5 bg-white border border-sky-200 rounded font-mono">
                    Johnrois@2026
                  </code>
                  . Change your password anytime in Business Settings.
                </div>
              </div>
              <button
                type="button"
                onClick={fillInitialOwner}
                className="w-full py-1.5 px-2.5 rounded bg-sky-700 text-white font-medium hover:bg-sky-800 transition-colors"
              >
                Use Initial Owner Account
              </button>
            </div>
          )}

          {error && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-700"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In to Workspace'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {(businessInfo.address || businessInfo.contact_number) && (
            <div className="pt-4 border-t border-slate-200 space-y-1 text-xs text-slate-500">
              {businessInfo.address && (
                <div className="flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{businessInfo.address}</span>
                </div>
              )}
              {businessInfo.contact_number && (
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{businessInfo.contact_number}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
