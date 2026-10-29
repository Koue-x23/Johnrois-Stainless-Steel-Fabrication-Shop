import React, { useState } from 'react';
import {
  BusinessSettings,
  CertificateOfEmployment,
  EmployeeIdCard,
  Payslip,
} from '../types';
import { formatDate, formatPHP, getBusinessMonogram, resolveAssetUrl } from '../lib/api';

const PAY_BASIS_LABELS: Record<string, string> = {
  daily: 'Daily Rate',
  semi_monthly: 'Semi-Monthly',
  monthly: 'Monthly Salary',
  hourly: 'Hourly Rate',
};

const SALARY_PERIOD_LABELS: Record<string, string> = {
  daily: 'per day',
  semi_monthly: 'semi-monthly',
  monthly: 'per month',
  hourly: 'per hour',
  annual: 'per annum',
};

function formatFormalDate(ymd?: string | null): string {
  if (!ymd) return '—';
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ============================================================================
// 1. PRINTABLE PAYSLIP (A4 SHEET)
// ============================================================================
export const PrintablePayslip: React.FC<{
  payslip: Partial<Payslip>;
  settings: BusinessSettings;
}> = ({ payslip, settings }) => {
  const earningsRows = [
    {
      label:
        payslip.pay_basis === 'daily'
          ? `Basic Pay (${payslip.days_worked || 0} day(s) @ ${formatPHP(payslip.base_rate || 0)}/day)`
          : payslip.pay_basis === 'hourly'
            ? `Basic Pay (${payslip.hours_worked || 0} hr(s) @ ${formatPHP(payslip.base_rate || 0)}/hr)`
            : payslip.pay_basis === 'semi_monthly'
              ? `Basic Pay (Semi-Monthly — ${formatPHP(payslip.base_rate || 0)}/mo)`
              : `Basic Monthly Salary`,
      amount: Number(payslip.regular_pay || 0),
    },
    {
      label:
        Number(payslip.overtime_hours) > 0
          ? `Overtime Pay (${payslip.overtime_hours} hr(s) @ ${formatPHP(payslip.overtime_rate || 0)}/hr)`
          : 'Overtime Pay',
      amount: Number(payslip.overtime_pay || 0),
    },
    { label: 'Allowances', amount: Number(payslip.allowances || 0) },
    { label: 'Bonuses / Incentives', amount: Number(payslip.bonuses || 0) },
    {
      label: payslip.other_earnings_note
        ? `Other Earnings (${payslip.other_earnings_note})`
        : 'Other Earnings',
      amount: Number(payslip.other_earnings || 0),
    },
  ];

  const deductionRows = [
    { label: 'SSS Contribution', amount: Number(payslip.sss_deduction || 0) },
    { label: 'PhilHealth Contribution', amount: Number(payslip.philhealth_deduction || 0) },
    { label: 'Pag-IBIG Contribution', amount: Number(payslip.pagibig_deduction || 0) },
    { label: 'Withholding Tax', amount: Number(payslip.withholding_tax || 0) },
    { label: 'Cash Advance', amount: Number(payslip.cash_advance || 0) },
    {
      label: payslip.other_deductions_note
        ? `Other Deductions (${payslip.other_deductions_note})`
        : 'Other Deductions',
      amount: Number(payslip.other_deductions || 0),
    },
  ];

  return (
    <div
      id="johnrois-print-container"
      className="bg-slate-200/70 p-4 sm:p-6 rounded-md border border-slate-300"
    >
      <div
        id="johnrois-print-sheet"
        className="max-w-[210mm] mx-auto bg-white text-slate-900 p-8 sm:p-10 shadow-sm border border-slate-200 text-xs leading-relaxed"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-6 pb-4 border-b-2 border-slate-900">
          <div className="flex items-start gap-3.5">
            {settings.logo_url && (
              <img
                src={resolveAssetUrl(settings.logo_url)}
                alt={settings.business_name}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
                className="w-14 h-14 object-contain shrink-0"
              />
            )}
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-slate-900 uppercase">
                {settings.business_name}
              </h1>
              {settings.address && <p className="text-[11px] text-slate-600">{settings.address}</p>}
              <p className="text-[11px] text-slate-600">
                {[settings.contact_number, settings.email].filter(Boolean).join(' • ')}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-lg font-extrabold tracking-wide text-slate-900">
              EMPLOYEE PAYSLIP
            </div>
            <div className="text-xs font-mono font-bold text-sky-800 mt-0.5">
              {payslip.payslip_number || 'DRAFT'}
            </div>
            <div className="text-[11px] text-slate-600 mt-1">
              Payment Date: <strong>{formatDate(payslip.payment_date)}</strong>
            </div>
            <div className="text-[11px] text-slate-600">
              Status: <strong>{payslip.status || 'Issued'}</strong>
            </div>
          </div>
        </div>

        {/* Employee & Pay Period Box */}
        <div className="grid grid-cols-2 gap-4 my-5 p-3.5 rounded border border-slate-300 bg-slate-50">
          <div className="space-y-1">
            <div>
              <span className="text-slate-500">Employee Name:</span>{' '}
              <strong className="text-slate-900">{payslip.employee_name || '—'}</strong>
            </div>
            <div>
              <span className="text-slate-500">Employee ID:</span>{' '}
              <span className="font-mono font-semibold text-slate-900">
                {payslip.employee_code || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Position / Job Title:</span>{' '}
              <span className="font-medium text-slate-800">{payslip.position_title || '—'}</span>
            </div>
            {payslip.department && (
              <div>
                <span className="text-slate-500">Department:</span>{' '}
                <span className="text-slate-800">{payslip.department}</span>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <div>
              <span className="text-slate-500">Pay Period:</span>{' '}
              <strong className="text-slate-900">
                {formatDate(payslip.pay_period_start)} – {formatDate(payslip.pay_period_end)}
              </strong>
            </div>
            <div>
              <span className="text-slate-500">Pay Basis:</span>{' '}
              <span className="font-medium text-slate-800">
                {PAY_BASIS_LABELS[payslip.pay_basis || 'daily'] || payslip.pay_basis}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Configured Rate:</span>{' '}
              <span className="font-mono font-semibold text-slate-800">
                {formatPHP(payslip.base_rate || 0)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Payment Method:</span>{' '}
              <span className="text-slate-800">{payslip.payment_method || 'Cash'}</span>
            </div>
          </div>
        </div>

        {/* Side-by-Side Earnings & Deductions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border border-slate-300 rounded overflow-hidden flex flex-col justify-between">
            <div>
              <div className="bg-slate-900 text-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider flex justify-between">
                <span>Earnings</span>
                <span>Amount (PHP)</span>
              </div>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-200">
                  {earningsRows.map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-700">{row.label}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                        {formatPHP(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-100 border-t border-slate-300 px-3 py-2 flex justify-between font-bold text-slate-900">
              <span>TOTAL EARNINGS</span>
              <span className="font-mono tabular-nums">
                {formatPHP(payslip.total_earnings || 0)}
              </span>
            </div>
          </div>

          <div className="border border-slate-300 rounded overflow-hidden flex flex-col justify-between">
            <div>
              <div className="bg-slate-800 text-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider flex justify-between">
                <span>Deductions</span>
                <span>Amount (PHP)</span>
              </div>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-200">
                  {deductionRows.map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-700">{row.label}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                        {formatPHP(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-100 border-t border-slate-300 px-3 py-2 flex justify-between font-bold text-slate-900">
              <span>TOTAL DEDUCTIONS</span>
              <span className="font-mono tabular-nums">
                {formatPHP(payslip.total_deductions || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Net Take-Home Pay Banner */}
        <div className="mt-4 bg-slate-900 text-white rounded px-5 py-3.5 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider">NET TAKE-HOME PAY</div>
            <div className="text-[11px] text-slate-300">
              Total Earnings ({formatPHP(payslip.total_earnings || 0)}) less Total Deductions (
              {formatPHP(payslip.total_deductions || 0)})
            </div>
          </div>
          <div className="text-xl font-extrabold font-mono tabular-nums">
            {formatPHP(payslip.net_pay || 0)}
          </div>
        </div>

        {payslip.remarks && (
          <div className="mt-4 p-3 rounded border border-slate-200 bg-slate-50">
            <div className="text-[10px] font-bold uppercase text-slate-500 mb-0.5">Remarks</div>
            <p className="text-xs text-slate-700 whitespace-pre-line">{payslip.remarks}</p>
          </div>
        )}

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-6 mt-10 pt-4">
          <div className="text-center">
            <div className="h-12 flex items-end justify-center pb-1">
              <span className="font-semibold text-slate-900">{payslip.prepared_by || ''}</span>
            </div>
            <div className="border-t border-slate-400 pt-1 text-[10px] uppercase tracking-wider text-slate-600">
              Prepared By
            </div>
          </div>

          <div className="text-center">
            <div className="h-12 flex items-end justify-center pb-1">
              {settings.signature_url && (
                <img
                  src={resolveAssetUrl(settings.signature_url)}
                  alt="Approved signature"
                  className="max-h-10 object-contain"
                />
              )}
            </div>
            <div className="border-t border-slate-400 pt-1">
              <div className="font-semibold text-slate-900 text-xs">
                {payslip.approved_by || settings.authorized_representative || '\u00A0'}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-600">
                Approved By
              </div>
            </div>
          </div>

          <div className="text-center">
            <div className="h-12 flex items-end justify-center pb-1">
              {payslip.employee_signature_url && (
                <img
                  src={resolveAssetUrl(payslip.employee_signature_url)}
                  alt="Employee signature"
                  className="max-h-10 object-contain"
                />
              )}
            </div>
            <div className="border-t border-slate-400 pt-1">
              <div className="font-semibold text-slate-900 text-xs">
                {payslip.employee_name || '\u00A0'}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-600">
                Received By (Employee Signature)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. PRINTABLE CERTIFICATE OF EMPLOYMENT (A4 FORMAL LETTERHEAD)
// ============================================================================
export const PrintableCoe: React.FC<{
  certificate: Partial<CertificateOfEmployment>;
  settings: BusinessSettings;
}> = ({ certificate, settings }) => {
  const businessName = settings.business_name || 'Stainless Steel Fabrication';
  const startFormatted = formatFormalDate(certificate.start_date);
  const endFormatted = certificate.end_date
    ? formatFormalDate(certificate.end_date)
    : ' the present';
  const deptPhrase = certificate.department ? ` in the ${certificate.department} department` : '';
  const statusLower = String(certificate.employment_status || '').toLowerCase();
  const isSeparated =
    Boolean(certificate.end_date) ||
    statusLower === 'resigned' ||
    statusLower === 'terminated' ||
    statusLower === 'inactive' ||
    statusLower === 'completed';

  const autoParagraph = isSeparated
    ? `This is to certify that ${certificate.employee_name || '[Employee Name]'}${
        certificate.employee_code ? ` (Employee ID: ${certificate.employee_code})` : ''
      } was employed with ${businessName} as ${
        certificate.position_title || '[Position]'
      }${deptPhrase} (${
        certificate.employment_status || 'Former Employee'
      }) from ${startFormatted} to ${endFormatted}.`
    : `This is to certify that ${certificate.employee_name || '[Employee Name]'}${
        certificate.employee_code ? ` (Employee ID: ${certificate.employee_code})` : ''
      } is employed with ${businessName} as ${
        certificate.position_title || '[Position]'
      }${deptPhrase} (${
        certificate.employment_status || 'Active'
      }) from ${startFormatted} up to${endFormatted}.`;

  const showSalary =
    Boolean(certificate.include_salary) && Number(certificate.salary_amount || 0) > 0;
  const salaryPeriodLabel =
    SALARY_PERIOD_LABELS[certificate.salary_period || 'monthly'] ||
    certificate.salary_period ||
    'per month';

  const purposeText = certificate.purpose?.trim()
    ? `This certification is being issued upon the request of the above-named individual for ${certificate.purpose.trim()}.`
    : 'This certification is being issued upon the request of the above-named individual for whatever legitimate purpose it may serve.';

  return (
    <div
      id="johnrois-print-container"
      className="bg-slate-200/70 p-4 sm:p-6 rounded-md border border-slate-300"
    >
      <div
        id="johnrois-print-sheet"
        className="max-w-[210mm] min-h-[265mm] mx-auto bg-white text-slate-900 px-10 sm:px-14 py-10 sm:py-12 shadow-sm border border-slate-200 flex flex-col justify-between"
      >
        <div>
          {/* Letterhead */}
          <div className="flex flex-col items-center text-center pb-5 border-b-2 border-slate-900">
            {settings.logo_url && (
              <img
                src={resolveAssetUrl(settings.logo_url)}
                alt={businessName}
                className="h-16 w-auto object-contain mb-2"
              />
            )}
            <h1 className="text-lg font-extrabold tracking-wide text-slate-900 uppercase">
              {businessName}
            </h1>
            {settings.address && <p className="text-xs text-slate-600 mt-0.5">{settings.address}</p>}
            <p className="text-xs text-slate-600">
              {[settings.contact_number, settings.email].filter(Boolean).join(' • ')}
            </p>
          </div>

          {/* Reference & Date */}
          <div className="flex items-center justify-between text-xs text-slate-700 mt-6">
            <div>
              Reference No.:{' '}
              <span className="font-mono font-bold text-slate-900">
                {certificate.certificate_number || 'DRAFT'}
              </span>
            </div>
            <div>
              Date Issued: <strong>{formatFormalDate(certificate.date_issued)}</strong>
            </div>
          </div>

          {/* Title */}
          <div className="text-center my-10">
            <h2 className="text-xl font-extrabold tracking-widest text-slate-900 underline underline-offset-8">
              CERTIFICATE OF EMPLOYMENT
            </h2>
          </div>

          {/* Body */}
          <div className="space-y-5 text-sm leading-7 text-slate-800 text-justify">
            <p className="font-bold tracking-wide text-slate-900">TO WHOM IT MAY CONCERN:</p>

            <p className="indent-8">
              {certificate.custom_body?.trim() ? certificate.custom_body.trim() : autoParagraph}
            </p>

            {showSalary && (
              <p className="indent-8">
                In this capacity, the employee&apos;s verified gross compensation is{' '}
                <strong className="font-mono text-slate-900">
                  {formatPHP(certificate.salary_amount || 0)}
                </strong>{' '}
                {salaryPeriodLabel}.
              </p>
            )}

            <p className="indent-8">{purposeText}</p>

            <p className="indent-8">
              Issued on <strong>{formatFormalDate(certificate.date_issued)}</strong>
              {settings.address ? ` at ${settings.address}` : ''}.
            </p>
          </div>

          {/* Signatory */}
          <div className="mt-16 max-w-xs">
            <div className="text-xs text-slate-600 mb-6">Certified Correct:</div>
            <div className="h-14 flex items-end pb-1">
              {certificate.signature_url && (
                <img
                  src={resolveAssetUrl(certificate.signature_url)}
                  alt="Authorized Signature"
                  className="max-h-12 object-contain"
                />
              )}
            </div>
            <div className="border-t border-slate-900 pt-1.5">
              <div className="text-sm font-bold text-slate-900 uppercase">
                {certificate.signatory_name || '\u00A0'}
              </div>
              <div className="text-xs text-slate-600">
                {certificate.signatory_title || 'Authorized Representative'}
              </div>
              <div className="text-xs text-slate-600">{businessName}</div>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400">
          <span>{businessName}</span>
          <span>Document Ref: {certificate.certificate_number || 'DRAFT'}</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. CR80 EMPLOYEE ID CARD FACES & PRINT SHEET (54.0mm x 85.6mm PORTRAIT)
// ============================================================================
export const EmployeeIdCardFaces: React.FC<{
  card: Partial<EmployeeIdCard>;
  settings: BusinessSettings;
}> = ({ card, settings }) => {
  const businessName = settings.business_name || 'Stainless Steel Fabrication';
  const [logoFailed, setLogoFailed] = useState(false);
  const monogram = getBusinessMonogram(businessName);

  return (
    <div className="flex flex-wrap items-start justify-center gap-8">
      {/* FRONT FACE — CR80 54mm x 85.6mm */}
      <div className="flex flex-col items-center">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 no-print">
          Front Layout (CR80 • 54mm × 85.6mm)
        </div>
        <div className="cr80-card bg-white border border-slate-400 rounded-[3mm] overflow-hidden flex flex-col justify-between shadow-sm">
          {/* Top Brand Header */}
          <div>
            <div className="bg-slate-900 text-white px-2.5 py-2 flex items-center gap-2 border-b-2 border-sky-600">
              {settings.logo_url && !logoFailed ? (
                <img
                  src={resolveAssetUrl(settings.logo_url)}
                  alt="Logo"
                  onError={() => setLogoFailed(true)}
                  className="w-7 h-7 rounded-sm bg-white p-0.5 object-contain shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-sm bg-slate-800 border border-slate-600 flex items-center justify-center text-[8px] font-extrabold text-sky-300 shrink-0">
                  {monogram}
                </div>
              )}
              <div className="min-w-0 leading-tight">
                <div className="text-[8.5px] font-extrabold uppercase tracking-tight text-white line-clamp-2">
                  {businessName}
                </div>
                <div className="text-[6.5px] text-sky-300 uppercase tracking-widest mt-0.5">
                  Employee Identification
                </div>
              </div>
            </div>

            {/* Proportional Employee Photo Frame */}
            <div className="flex justify-center mt-2.5 px-3">
              <div className="w-[27mm] h-[33mm] rounded border border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
                {card.photo_url ? (
                  <img
                    src={resolveAssetUrl(card.photo_url)}
                    alt={card.full_name || 'Employee Photo'}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-[8px] font-semibold text-slate-400 text-center px-2 leading-tight">
                    EMPLOYEE
                    <br />
                    PHOTO
                  </div>
                )}
              </div>
            </div>

            {/* Employee Name, Position & Department */}
            <div className="px-2.5 mt-2 text-center">
              <div className="text-[11px] font-extrabold text-slate-900 uppercase leading-tight line-clamp-2">
                {card.full_name || 'EMPLOYEE NAME'}
              </div>
              <div className="text-[8.5px] font-bold text-sky-800 mt-0.5 leading-tight line-clamp-1">
                {card.position_title || 'Position / Job Title'}
              </div>
              {card.department && (
                <div className="text-[7.5px] text-slate-500 mt-0.5 leading-tight line-clamp-1">
                  {card.department}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Employee ID Strip */}
          <div className="px-2.5 pb-2.5">
            <div className="bg-slate-900 text-white rounded px-2 py-1 text-center">
              <div className="text-[6px] uppercase tracking-widest text-slate-300">
                Employee ID No.
              </div>
              <div className="text-[10px] font-mono font-extrabold tracking-wider">
                {card.employee_code || 'EMP-0000'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BACK FACE — CR80 54mm x 85.6mm */}
      <div className="flex flex-col items-center">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 no-print">
          Back Layout (CR80 • 54mm × 85.6mm)
        </div>
        <div className="cr80-card bg-white border border-slate-400 rounded-[3mm] overflow-hidden flex flex-col justify-between shadow-sm">
          <div>
            <div className="bg-slate-900 text-white px-2.5 py-1.5 text-center">
              <div className="text-[7.5px] font-bold uppercase tracking-wider">
                Emergency & Card Information
              </div>
            </div>

            <div className="p-2.5 space-y-2 text-[7.5px] leading-snug text-slate-700">
              {/* Emergency Contact */}
              <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
                <div className="text-[6.5px] font-bold uppercase tracking-wider text-slate-500">
                  In Case of Emergency
                </div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {card.emergency_contact_name || '—'}
                </div>
                <div className="font-mono text-slate-700">
                  {card.emergency_contact_number || '—'}
                </div>
              </div>

              {/* Employee Contact / Blood Type */}
              {(card.contact_number || card.blood_type || card.address) && (
                <div className="space-y-0.5 px-0.5">
                  {card.contact_number && (
                    <div>
                      <span className="text-slate-500">Contact:</span>{' '}
                      <span className="font-mono font-semibold text-slate-900">
                        {card.contact_number}
                      </span>
                    </div>
                  )}
                  {card.blood_type && (
                    <div>
                      <span className="text-slate-500">Blood Type:</span>{' '}
                      <strong className="text-slate-900">{card.blood_type}</strong>
                    </div>
                  )}
                  {card.address && (
                    <div className="line-clamp-2">
                      <span className="text-slate-500">Address:</span>{' '}
                      <span className="text-slate-800">{card.address}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-200">
                <div>
                  <div className="text-[6px] uppercase text-slate-500">Date Issued</div>
                  <div className="font-semibold text-slate-900">
                    {formatDate(card.date_issued)}
                  </div>
                </div>
                <div>
                  <div className="text-[6px] uppercase text-slate-500">Valid Until</div>
                  <div className="font-semibold text-slate-900">
                    {card.expiration_date ? formatDate(card.expiration_date) : '—'}
                  </div>
                </div>
              </div>

              {card.back_notes && (
                <p className="text-[6.5px] text-slate-600 italic line-clamp-2">{card.back_notes}</p>
              )}
            </div>
          </div>

          {/* Authorized Signatory & Shop Return Footer */}
          <div className="px-2.5 pb-2 space-y-2">
            <div className="text-center pt-1">
              <div className="h-6 flex items-end justify-center">
                {card.signature_url && (
                  <img
                    src={resolveAssetUrl(card.signature_url)}
                    alt="Authorized Signatory"
                    className="max-h-5 object-contain"
                  />
                )}
              </div>
              <div className="border-t border-slate-400 pt-0.5">
                <div className="text-[7.5px] font-bold text-slate-900 leading-tight">
                  {card.authorized_signatory || '\u00A0'}
                </div>
                <div className="text-[6px] uppercase tracking-wider text-slate-500">
                  {card.authorized_title || 'Authorized Signatory'}
                </div>
              </div>
            </div>

            <div className="bg-slate-100 rounded p-1.5 text-center text-[6px] leading-tight text-slate-600 border border-slate-200">
              <div className="font-bold text-slate-800">{businessName}</div>
              {settings.address && <div className="line-clamp-2">{settings.address}</div>}
              {settings.contact_number && <div>Tel: {settings.contact_number}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PrintableEmployeeIdSheet: React.FC<{
  card: Partial<EmployeeIdCard>;
  settings: BusinessSettings;
}> = ({ card, settings }) => {
  return (
    <div
      id="johnrois-print-container"
      className="bg-slate-200/70 p-4 sm:p-6 rounded-md border border-slate-300"
    >
      <div
        id="johnrois-print-sheet"
        className="max-w-[210mm] mx-auto bg-white text-slate-900 p-8 sm:p-10 shadow-sm border border-slate-200"
      >
        <div className="pb-4 mb-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase">
              Employee ID Card Print Sheet (Standard CR80: 54.0 mm × 85.6 mm)
            </h2>
            <p className="text-[11px] text-slate-500">
              Print at 100% actual scale (no page scaling) and trim along card borders for standard PVC / laminated ID holders.
            </p>
          </div>
          <div className="text-right text-xs font-mono text-slate-600">
            <div>Ref: {card.card_number || 'DRAFT'}</div>
            <div>ID: {card.employee_code || '—'}</div>
          </div>
        </div>

        <div className="py-4">
          <EmployeeIdCardFaces card={card} settings={settings} />
        </div>
      </div>
    </div>
  );
};
