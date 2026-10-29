import React, { useState } from 'react';
import { Printer, Download, ArrowLeft, Edit3, Trash2 } from 'lucide-react';
import {
  BusinessSettings,
  Quotation,
  Invoice,
  ServiceReport,
  BillingStatement,
} from '../types';
import { downloadAuthenticatedFile, formatDate, formatPHP, resolveAssetUrl } from '../lib/api';

type DocumentPayload =
  | { type: 'quotation'; data: Quotation }
  | { type: 'invoice'; data: Invoice }
  | { type: 'service_report'; data: ServiceReport }
  | { type: 'billing_statement'; data: BillingStatement };

interface PrintableDocumentProps {
  doc: DocumentPayload;
  settings: BusinessSettings;
  onBack: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  extraActions?: React.ReactNode;
}

export const PrintableDocument: React.FC<PrintableDocumentProps> = ({
  doc,
  settings,
  onBack,
  onEdit,
  onDelete,
  extraActions,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const getPdfInfo = () => {
    switch (doc.type) {
      case 'quotation':
        return {
          url: `/api/quotations/${doc.data.id}/pdf`,
          filename: `${doc.data.quotation_number}.pdf`,
          title: 'QUOTATION',
          number: doc.data.quotation_number,
          status: doc.data.status,
        };
      case 'invoice':
        return {
          url: `/api/invoices/${doc.data.id}/pdf`,
          filename: `${doc.data.invoice_number}.pdf`,
          title: 'BILLING INVOICE',
          number: doc.data.invoice_number,
          status: doc.data.status,
        };
      case 'service_report':
        return {
          url: `/api/service-reports/${doc.data.id}/pdf`,
          filename: `${doc.data.report_number}.pdf`,
          title: 'SERVICE REPORT',
          number: doc.data.report_number,
          status: doc.data.status,
        };
      case 'billing_statement':
        return {
          url: `/api/billing-statements/${doc.data.id}/pdf`,
          filename: `${doc.data.statement_number}.pdf`,
          title: 'BILLING STATEMENT',
          number: doc.data.statement_number,
          status: 'Statement of Account',
        };
    }
  };

  const info = getPdfInfo();

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    setError('');
    try {
      await downloadAuthenticatedFile(info.url, info.filename);
    } catch (err: any) {
      setError(err.message || 'Failed to download PDF.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div id="johnrois-print-container" className="space-y-4">
      {/* Action Toolbar — Completely Hidden in Print */}
      <div className="no-print bg-white border border-slate-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to List
          </button>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              A4 Print Preview
            </span>
            <h2 className="text-sm font-bold text-slate-900">{info.number}</h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {extraActions}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Document
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded border border-rose-300 bg-rose-50 text-xs font-medium text-rose-700 hover:bg-rose-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded border border-slate-800 bg-white text-xs font-semibold text-slate-900 hover:bg-slate-100"
          >
            <Printer className="w-3.5 h-3.5" />
            Print (A4)
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {downloading ? 'Generating PDF...' : 'Download PDF'}
          </button>
        </div>
      </div>

      {error && (
        <div className="no-print p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          {error}
        </div>
      )}

      {/* A4 Document Sheet */}
      <div
        id="johnrois-print-sheet"
        className="mx-auto bg-white text-black border border-slate-300 shadow-sm w-full max-w-[210mm] min-h-[297mm] p-8 sm:p-11"
      >
        {/* Document Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b-2 border-slate-900">
          <div className="flex items-start gap-4">
            {settings.logo_url ? (
              <img
                src={resolveAssetUrl(settings.logo_url)}
                alt={settings.business_name}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
                className="w-16 h-16 object-contain shrink-0"
              />
            ) : null}
            <div className="space-y-0.5">
              <h1 className="text-lg font-bold tracking-tight text-slate-950 uppercase">
                {settings.business_name || 'Stainless Steel Fabrication'}
              </h1>
              {settings.address && (
                <p className="text-xs text-slate-700 max-w-md leading-relaxed">{settings.address}</p>
              )}
              <div className="text-xs text-slate-700 flex flex-wrap gap-x-3 gap-y-0.5">
                {settings.contact_number && <span>Contact: {settings.contact_number}</span>}
                {settings.email && <span>Email: {settings.email}</span>}
              </div>
              {settings.facebook_url && (
                <p className="text-[11px] text-slate-600">
                  {settings.facebook_url.replace(/^https?:\/\//, '')}
                </p>
              )}
            </div>
          </div>

          <div className="sm:text-right shrink-0">
            <div className="text-xl font-extrabold tracking-tight text-slate-950">{info.title}</div>
            <div className="text-sm font-bold text-slate-800 tabular-nums mt-0.5">{info.number}</div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-600 mt-1">
              Status: {info.status}
            </div>
          </div>
        </div>

        {/* QUOTATION BODY */}
        {doc.type === 'quotation' && (
          <QuotationSheetBody quotation={doc.data} settings={settings} />
        )}

        {/* INVOICE BODY */}
        {doc.type === 'invoice' && (
          <InvoiceSheetBody invoice={doc.data} settings={settings} />
        )}

        {/* SERVICE REPORT BODY */}
        {doc.type === 'service_report' && (
          <ServiceReportSheetBody report={doc.data} settings={settings} />
        )}

        {/* BILLING STATEMENT BODY */}
        {doc.type === 'billing_statement' && (
          <BillingStatementSheetBody statement={doc.data} settings={settings} />
        )}
      </div>
    </div>
  );
};

const QuotationSheetBody: React.FC<{ quotation: Quotation; settings: BusinessSettings }> = ({
  quotation,
  settings,
}) => {
  const items = quotation.items || [];
  return (
    <div className="mt-5 space-y-5 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border border-slate-300 p-3 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Prepared For</div>
          <div className="font-bold text-sm text-slate-950">{quotation.customer_name}</div>
          {quotation.company_name && <div className="text-slate-800">{quotation.company_name}</div>}
          {quotation.customer_address && <div className="text-slate-700">{quotation.customer_address}</div>}
          {quotation.contact_number && <div className="text-slate-700">Contact: {quotation.contact_number}</div>}
        </div>

        <div className="border border-slate-300 p-3 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Quotation & Project Details
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            <span className="font-semibold text-slate-700">Date Issued:</span>
            <span className="tabular-nums">{formatDate(quotation.date_issued)}</span>
            <span className="font-semibold text-slate-700">Valid Until:</span>
            <span className="tabular-nums">{formatDate(quotation.valid_until)}</span>
            {quotation.project_name && (
              <>
                <span className="font-semibold text-slate-700">Project Name:</span>
                <span>{quotation.project_name}</span>
              </>
            )}
            {quotation.project_location && (
              <>
                <span className="font-semibold text-slate-700">Project Location:</span>
                <span>{quotation.project_location}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Itemized Table */}
      <table className="w-full border-collapse border border-slate-300 text-xs">
        <thead>
          <tr className="bg-slate-900 text-white">
            <th className="py-2 px-2.5 text-center w-9 font-semibold">#</th>
            <th className="py-2 px-2.5 text-left font-semibold">Description of Products / Services</th>
            <th className="py-2 px-2.5 text-right w-16 font-semibold">Qty</th>
            <th className="py-2 px-2.5 text-center w-16 font-semibold">Unit</th>
            <th className="py-2 px-2.5 text-right w-28 font-semibold">Unit Price</th>
            <th className="py-2 px-2.5 text-right w-28 font-semibold">Line Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {items.map((it, idx) => (
            <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/70' : ''}>
              <td className="py-2 px-2.5 text-center tabular-nums text-slate-600">{idx + 1}</td>
              <td className="py-2 px-2.5 text-slate-900 whitespace-pre-wrap">{it.description}</td>
              <td className="py-2 px-2.5 text-right tabular-nums">{it.quantity}</td>
              <td className="py-2 px-2.5 text-center">{it.unit}</td>
              <td className="py-2 px-2.5 text-right tabular-nums">{formatPHP(it.unit_price)}</td>
              <td className="py-2 px-2.5 text-right font-semibold tabular-nums">{formatPHP(it.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end print-avoid-break">
        <div className="w-full sm:w-72 border border-slate-300 divide-y divide-slate-200">
          <div className="flex justify-between px-3 py-1.5">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-semibold tabular-nums">{formatPHP(quotation.subtotal)}</span>
          </div>
          {quotation.discount_amount > 0 && (
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-slate-600">
                Discount {quotation.discount_type === 'percent' ? `(${quotation.discount_value}%)` : ''}
              </span>
              <span className="font-semibold text-rose-700 tabular-nums">
                -{formatPHP(quotation.discount_amount)}
              </span>
            </div>
          )}
          {Boolean(quotation.tax_enabled) && quotation.tax_amount > 0 && (
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-slate-600">
                {quotation.tax_label || 'Tax'} ({quotation.tax_rate}%)
              </span>
              <span className="font-semibold tabular-nums">{formatPHP(quotation.tax_amount)}</span>
            </div>
          )}
          <div className="flex justify-between px-3 py-2 bg-slate-900 text-white font-bold text-sm">
            <span>GRAND TOTAL</span>
            <span className="tabular-nums">{formatPHP(quotation.grand_total)}</span>
          </div>
        </div>
      </div>

      {/* Terms, Schedule, Remarks */}
      <div className="space-y-2.5 pt-2 print-avoid-break">
        {quotation.payment_terms && (
          <div>
            <div className="font-bold uppercase text-[10px] tracking-wider text-slate-700">Payment Terms</div>
            <p className="text-slate-800 whitespace-pre-wrap">{quotation.payment_terms}</p>
          </div>
        )}
        {quotation.delivery_schedule && (
          <div>
            <div className="font-bold uppercase text-[10px] tracking-wider text-slate-700">
              Delivery / Completion Schedule
            </div>
            <p className="text-slate-800 whitespace-pre-wrap">{quotation.delivery_schedule}</p>
          </div>
        )}
        {quotation.remarks && (
          <div>
            <div className="font-bold uppercase text-[10px] tracking-wider text-slate-700">Remarks</div>
            <p className="text-slate-800 whitespace-pre-wrap">{quotation.remarks}</p>
          </div>
        )}
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-6 pt-8 print-avoid-break">
        <div>
          <div className="text-[11px] text-slate-600 mb-8">Prepared By:</div>
          <div className="border-t border-slate-900 pt-1 font-bold text-slate-900">
            {quotation.prepared_by || '\u00A0'}
          </div>
          <div className="text-[10px] text-slate-500">{settings.business_name}</div>
        </div>

        <div>
          <div className="text-[11px] text-slate-600 h-8 flex items-end">
            {settings.signature_url ? (
              <img src={resolveAssetUrl(settings.signature_url)} alt="Signature" className="h-10 object-contain" />
            ) : (
              <span>Authorized Signature:</span>
            )}
          </div>
          <div className="border-t border-slate-900 pt-1 font-bold text-slate-900 mt-4">
            {quotation.authorized_signatory || settings.authorized_representative || '\u00A0'}
          </div>
          <div className="text-[10px] text-slate-500">
            {settings.authorized_title || 'Authorized Representative'}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-600 mb-8">Customer Conformance:</div>
          <div className="border-t border-slate-900 pt-1 font-bold text-slate-900">
            {quotation.customer_name}
          </div>
          <div className="text-[10px] text-slate-500">Signature Over Printed Name & Date</div>
        </div>
      </div>
    </div>
  );
};

const InvoiceSheetBody: React.FC<{ invoice: Invoice; settings: BusinessSettings }> = ({
  invoice,
  settings,
}) => {
  const items = invoice.items || [];
  const payments = invoice.payments || [];
  return (
    <div className="mt-5 space-y-5 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border border-slate-300 p-3 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Bill To</div>
          <div className="font-bold text-sm text-slate-950">{invoice.customer_name}</div>
          {invoice.company_name && <div className="text-slate-800">{invoice.company_name}</div>}
          {invoice.customer_address && <div className="text-slate-700">{invoice.customer_address}</div>}
          {invoice.contact_number && <div className="text-slate-700">Contact: {invoice.contact_number}</div>}
        </div>

        <div className="border border-slate-300 p-3 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Invoice Details</div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            <span className="font-semibold text-slate-700">Invoice Date:</span>
            <span className="tabular-nums">{formatDate(invoice.invoice_date)}</span>
            <span className="font-semibold text-slate-700">Due Date:</span>
            <span className="tabular-nums">{formatDate(invoice.due_date)}</span>
            {invoice.reference_quotation_number && (
              <>
                <span className="font-semibold text-slate-700">Ref. Quotation:</span>
                <span className="tabular-nums">{invoice.reference_quotation_number}</span>
              </>
            )}
            {invoice.project_name && (
              <>
                <span className="font-semibold text-slate-700">Project:</span>
                <span>{invoice.project_name}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Itemized Table */}
      <table className="w-full border-collapse border border-slate-300 text-xs">
        <thead>
          <tr className="bg-slate-900 text-white">
            <th className="py-2 px-2.5 text-center w-9 font-semibold">#</th>
            <th className="py-2 px-2.5 text-left font-semibold">Description of Products / Services</th>
            <th className="py-2 px-2.5 text-right w-16 font-semibold">Qty</th>
            <th className="py-2 px-2.5 text-center w-16 font-semibold">Unit</th>
            <th className="py-2 px-2.5 text-right w-28 font-semibold">Unit Price</th>
            <th className="py-2 px-2.5 text-right w-28 font-semibold">Line Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {items.map((it, idx) => (
            <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/70' : ''}>
              <td className="py-2 px-2.5 text-center tabular-nums text-slate-600">{idx + 1}</td>
              <td className="py-2 px-2.5 text-slate-900 whitespace-pre-wrap">{it.description}</td>
              <td className="py-2 px-2.5 text-right tabular-nums">{it.quantity}</td>
              <td className="py-2 px-2.5 text-center">{it.unit}</td>
              <td className="py-2 px-2.5 text-right tabular-nums">{formatPHP(it.unit_price)}</td>
              <td className="py-2 px-2.5 text-right font-semibold tabular-nums">{formatPHP(it.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals & Balance */}
      <div className="flex justify-end print-avoid-break">
        <div className="w-full sm:w-72 border border-slate-300 divide-y divide-slate-200">
          <div className="flex justify-between px-3 py-1.5">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-semibold tabular-nums">{formatPHP(invoice.subtotal)}</span>
          </div>
          {invoice.discount_amount > 0 && (
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-slate-600">
                Discount {invoice.discount_type === 'percent' ? `(${invoice.discount_value}%)` : ''}
              </span>
              <span className="font-semibold text-rose-700 tabular-nums">
                -{formatPHP(invoice.discount_amount)}
              </span>
            </div>
          )}
          {Boolean(invoice.tax_enabled) && invoice.tax_amount > 0 && (
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-slate-600">
                {invoice.tax_label || 'Tax'} ({invoice.tax_rate}%)
              </span>
              <span className="font-semibold tabular-nums">{formatPHP(invoice.tax_amount)}</span>
            </div>
          )}
          <div className="flex justify-between px-3 py-1.5 bg-slate-50 font-semibold">
            <span className="text-slate-800">Total Amount Due</span>
            <span className="tabular-nums">{formatPHP(invoice.total_amount_due)}</span>
          </div>
          <div className="flex justify-between px-3 py-1.5">
            <span className="text-slate-600">Amount Paid</span>
            <span className="font-semibold text-emerald-700 tabular-nums">{formatPHP(invoice.amount_paid)}</span>
          </div>
          <div className="flex justify-between px-3 py-2 bg-slate-900 text-white font-bold text-sm">
            <span>REMAINING BALANCE</span>
            <span className="tabular-nums">{formatPHP(invoice.remaining_balance)}</span>
          </div>
        </div>
      </div>

      {/* Payment History */}
      {payments.length > 0 && (
        <div className="space-y-1.5 print-avoid-break">
          <div className="font-bold uppercase text-[10px] tracking-wider text-slate-700">
            Recorded Payment History
          </div>
          <table className="w-full border-collapse border border-slate-300 text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-800 border-b border-slate-300">
                <th className="py-1.5 px-2 text-left font-semibold">Payment #</th>
                <th className="py-1.5 px-2 text-left font-semibold">Date</th>
                <th className="py-1.5 px-2 text-left font-semibold">Method</th>
                <th className="py-1.5 px-2 text-left font-semibold">Reference / Notes</th>
                <th className="py-1.5 px-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="py-1.5 px-2 tabular-nums font-medium">{p.payment_number}</td>
                  <td className="py-1.5 px-2 tabular-nums">{formatDate(p.payment_date)}</td>
                  <td className="py-1.5 px-2">{p.payment_method}</td>
                  <td className="py-1.5 px-2 text-slate-600">
                    {[p.reference_number ? `Ref: ${p.reference_number}` : '', p.notes].filter(Boolean).join(' — ') || '—'}
                  </td>
                  <td className="py-1.5 px-2 text-right font-semibold tabular-nums">{formatPHP(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Terms & Remarks */}
      <div className="space-y-2.5 pt-2 print-avoid-break">
        {invoice.payment_terms && (
          <div>
            <div className="font-bold uppercase text-[10px] tracking-wider text-slate-700">Payment Terms</div>
            <p className="text-slate-800 whitespace-pre-wrap">{invoice.payment_terms}</p>
          </div>
        )}
        {invoice.remarks && (
          <div>
            <div className="font-bold uppercase text-[10px] tracking-wider text-slate-700">Remarks</div>
            <p className="text-slate-800 whitespace-pre-wrap">{invoice.remarks}</p>
          </div>
        )}
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-6 pt-8 print-avoid-break">
        <div>
          <div className="text-[11px] text-slate-600 mb-8">Prepared By:</div>
          <div className="border-t border-slate-900 pt-1 font-bold text-slate-900">
            {invoice.prepared_by || '\u00A0'}
          </div>
          <div className="text-[10px] text-slate-500">{settings.business_name}</div>
        </div>

        <div>
          <div className="text-[11px] text-slate-600 h-8 flex items-end">
            {settings.signature_url ? (
              <img src={resolveAssetUrl(settings.signature_url)} alt="Signature" className="h-10 object-contain" />
            ) : (
              <span>Authorized Signature:</span>
            )}
          </div>
          <div className="border-t border-slate-900 pt-1 font-bold text-slate-900 mt-4">
            {invoice.authorized_signatory || settings.authorized_representative || '\u00A0'}
          </div>
          <div className="text-[10px] text-slate-500">
            {settings.authorized_title || 'Authorized Representative'}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-600 mb-8">Received By:</div>
          <div className="border-t border-slate-900 pt-1 font-bold text-slate-900">
            {invoice.customer_name}
          </div>
          <div className="text-[10px] text-slate-500">Signature Over Printed Name & Date</div>
        </div>
      </div>
    </div>
  );
};

const ServiceReportSheetBody: React.FC<{ report: ServiceReport; settings: BusinessSettings }> = ({
  report,
}) => {
  const materials = report.materials || [];
  const photos = report.photos || [];
  return (
    <div className="mt-5 space-y-4 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border border-slate-300 p-3 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Customer & Site Information
          </div>
          <div className="font-bold text-sm text-slate-950">{report.customer_name}</div>
          {report.company_name && <div className="text-slate-800">{report.company_name}</div>}
          {report.contact_details && <div className="text-slate-700">Contact: {report.contact_details}</div>}
          {report.service_location && <div className="text-slate-700">Location: {report.service_location}</div>}
        </div>

        <div className="border border-slate-300 p-3 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Service Dispatch Details
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            <span className="font-semibold text-slate-700">Service Date:</span>
            <span className="tabular-nums">{formatDate(report.service_date)}</span>
            <span className="font-semibold text-slate-700">Job Type:</span>
            <span>{report.job_type}</span>
            <span className="font-semibold text-slate-700">Technician(s):</span>
            <span>{report.technician_name || '—'}</span>
            <span className="font-semibold text-slate-700">Time Started / Completed:</span>
            <span className="tabular-nums">
              {[report.start_time, report.completion_time].filter(Boolean).join(' – ') || '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Technical Sections */}
      <div className="border border-slate-300 divide-y divide-slate-300">
        <div className="p-3">
          <div className="font-bold uppercase text-[10px] tracking-wider text-slate-600 mb-0.5">
            Equipment / Product Serviced
          </div>
          <div className="text-slate-900 font-medium whitespace-pre-wrap">
            {report.equipment_serviced || '—'}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-300">
          <div className="p-3">
            <div className="font-bold uppercase text-[10px] tracking-wider text-slate-600 mb-0.5">
              Reported Problem / Job Scope
            </div>
            <div className="text-slate-800 whitespace-pre-wrap">{report.reported_problem || '—'}</div>
          </div>
          <div className="p-3">
            <div className="font-bold uppercase text-[10px] tracking-wider text-slate-600 mb-0.5">
              Inspection Findings
            </div>
            <div className="text-slate-800 whitespace-pre-wrap">{report.inspection_findings || '—'}</div>
          </div>
        </div>
        <div className="p-3">
          <div className="font-bold uppercase text-[10px] tracking-wider text-slate-600 mb-0.5">
            Work Performed
          </div>
          <div className="text-slate-900 whitespace-pre-wrap">{report.work_performed || '—'}</div>
        </div>
      </div>

      {/* Materials Used */}
      {materials.length > 0 && (
        <div className="space-y-1.5">
          <div className="font-bold uppercase text-[10px] tracking-wider text-slate-700">
            Materials & Parts Used
          </div>
          <table className="w-full border-collapse border border-slate-300 text-xs">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="py-1.5 px-2.5 text-center w-9 font-semibold">#</th>
                <th className="py-1.5 px-2.5 text-left font-semibold">Material / Part Description</th>
                <th className="py-1.5 px-2.5 text-right w-16 font-semibold">Qty</th>
                <th className="py-1.5 px-2.5 text-center w-16 font-semibold">Unit</th>
                <th className="py-1.5 px-2.5 text-right w-28 font-semibold">Unit Cost</th>
                <th className="py-1.5 px-2.5 text-right w-28 font-semibold">Total Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {materials.map((m, i) => (
                <tr key={i}>
                  <td className="py-1.5 px-2.5 text-center tabular-nums">{i + 1}</td>
                  <td className="py-1.5 px-2.5">{m.material_name}</td>
                  <td className="py-1.5 px-2.5 text-right tabular-nums">{m.quantity}</td>
                  <td className="py-1.5 px-2.5 text-center">{m.unit}</td>
                  <td className="py-1.5 px-2.5 text-right tabular-nums">
                    {m.unit_cost > 0 ? formatPHP(m.unit_cost) : '—'}
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-semibold tabular-nums">
                    {m.line_cost > 0 ? formatPHP(m.line_cost) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.materials_total_cost > 0 && (
            <div className="flex justify-end">
              <div className="px-3 py-1.5 bg-slate-900 text-white font-bold text-xs tabular-nums">
                Total Materials Cost: {formatPHP(report.materials_total_cost)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recommendations & Remarks */}
      {(report.recommendations || report.remarks) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print-avoid-break">
          {report.recommendations && (
            <div className="border border-slate-300 p-3">
              <div className="font-bold uppercase text-[10px] tracking-wider text-slate-600 mb-0.5">
                Recommendations
              </div>
              <p className="text-slate-800 whitespace-pre-wrap">{report.recommendations}</p>
            </div>
          )}
          {report.remarks && (
            <div className="border border-slate-300 p-3">
              <div className="font-bold uppercase text-[10px] tracking-wider text-slate-600 mb-0.5">Remarks</div>
              <p className="text-slate-800 whitespace-pre-wrap">{report.remarks}</p>
            </div>
          )}
        </div>
      )}

      {/* Optional Before & After Photos */}
      {photos.length > 0 && (
        <div className="space-y-2 print-avoid-break">
          <div className="font-bold uppercase text-[10px] tracking-wider text-slate-700">
            Before & After Job Documentation Photos
          </div>
          <div className="grid grid-cols-2 gap-4">
            {photos.map((ph, idx) => (
              <div key={idx} className="border border-slate-300 p-2">
                <img
                  src={resolveAssetUrl(ph.photo_url)}
                  alt={ph.caption || ph.photo_type}
                  className="w-full h-36 object-cover bg-slate-50"
                />
                <div className="mt-1.5 text-[11px] font-semibold uppercase text-slate-800">
                  {ph.photo_type === 'before' ? 'BEFORE' : 'AFTER'}
                  {ph.caption ? <span className="font-normal normal-case"> — {ph.caption}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer Acknowledgment & Signatures */}
      <div className="border border-slate-300 p-3 bg-slate-50/50 print-avoid-break">
        <div className="text-[11px] text-slate-800">
          <span className="font-bold">Customer Acknowledgment: </span>
          {report.customer_acknowledgment
            ? 'The undersigned customer/representative confirms that the fabrication, installation, repair, or service work described above has been inspected and satisfactorily completed.'
            : 'I hereby acknowledge the service inspection and work details recorded on this report.'}
        </div>

        <div className="grid grid-cols-2 gap-8 pt-6">
          <div>
            <div className="h-12 flex items-end">
              {report.technician_signature_url ? (
                <img
                  src={resolveAssetUrl(report.technician_signature_url)}
                  alt="Technician Signature"
                  className="h-11 object-contain"
                />
              ) : (
                <span className="text-[11px] text-slate-500">Technician Signature:</span>
              )}
            </div>
            <div className="border-t border-slate-900 pt-1 font-bold text-slate-900 mt-1">
              {report.technician_name || '\u00A0'}
            </div>
            <div className="text-[10px] text-slate-500">Technician / Assigned Personnel</div>
          </div>

          <div>
            <div className="h-12 flex items-end">
              {report.customer_signature_url ? (
                <img
                  src={resolveAssetUrl(report.customer_signature_url)}
                  alt="Customer Signature"
                  className="h-11 object-contain"
                />
              ) : (
                <span className="text-[11px] text-slate-500">Customer Signature:</span>
              )}
            </div>
            <div className="border-t border-slate-900 pt-1 font-bold text-slate-900 mt-1">
              {report.customer_signatory_name || report.customer_name}
            </div>
            <div className="text-[10px] text-slate-500">
              Customer / Authorized Representative
              {report.acknowledgment_date ? ` • ${formatDate(report.acknowledgment_date)}` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const BillingStatementSheetBody: React.FC<{
  statement: BillingStatement;
  settings: BusinessSettings;
}> = ({ statement, settings }) => {
  const lines = statement.lines || [];
  return (
    <div className="mt-5 space-y-5 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border border-slate-300 p-3 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Statement For</div>
          <div className="font-bold text-sm text-slate-950">{statement.customer_name}</div>
          {statement.company_name && <div className="text-slate-800">{statement.company_name}</div>}
          {statement.customer_address && <div className="text-slate-700">{statement.customer_address}</div>}
          {statement.contact_number && <div className="text-slate-700">Contact: {statement.contact_number}</div>}
        </div>

        <div className="border border-slate-300 p-3 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Account Summary
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            <span className="font-semibold text-slate-700">Statement Date:</span>
            <span className="tabular-nums">{formatDate(statement.statement_date)}</span>
            <span className="font-semibold text-slate-700">Billing Period:</span>
            <span className="tabular-nums">
              {formatDate(statement.period_from)} – {formatDate(statement.period_to)}
            </span>
            <span className="font-semibold text-slate-700">Previous Balance:</span>
            <span className="tabular-nums font-semibold">{formatPHP(statement.previous_balance)}</span>
            <span className="font-semibold text-slate-900">Outstanding Balance:</span>
            <span className="tabular-nums font-bold text-slate-950">
              {formatPHP(statement.outstanding_balance)}
            </span>
          </div>
        </div>
      </div>

      {/* Transaction Ledger Table */}
      <table className="w-full border-collapse border border-slate-300 text-xs">
        <thead>
          <tr className="bg-slate-900 text-white">
            <th className="py-2 px-2 text-left w-24 font-semibold">Date</th>
            <th className="py-2 px-2 text-left w-28 font-semibold">Invoice / Ref #</th>
            <th className="py-2 px-2 text-left font-semibold">Transaction Description</th>
            <th className="py-2 px-2 text-right w-24 font-semibold">Debit (Charge)</th>
            <th className="py-2 px-2 text-right w-24 font-semibold">Credit (Payment)</th>
            <th className="py-2 px-2 text-right w-28 font-semibold">Running Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          <tr className="bg-slate-50 font-medium">
            <td className="py-2 px-2 tabular-nums">{formatDate(statement.period_from)}</td>
            <td className="py-2 px-2 text-slate-500">—</td>
            <td className="py-2 px-2">Balance Forwarded (Previous Balance prior to billing period)</td>
            <td className="py-2 px-2 text-right text-slate-400">—</td>
            <td className="py-2 px-2 text-right text-slate-400">—</td>
            <td className="py-2 px-2 text-right font-semibold tabular-nums">
              {formatPHP(statement.previous_balance)}
            </td>
          </tr>
          {lines.map((ln, idx) => (
            <tr key={idx}>
              <td className="py-2 px-2 tabular-nums">{formatDate(ln.tx_date)}</td>
              <td className="py-2 px-2 tabular-nums font-medium">
                {ln.invoice_number || ln.reference_number}
              </td>
              <td className="py-2 px-2 text-slate-900">{ln.description}</td>
              <td className="py-2 px-2 text-right tabular-nums">
                {ln.debit > 0 ? formatPHP(ln.debit) : '—'}
              </td>
              <td className="py-2 px-2 text-right tabular-nums text-emerald-700">
                {ln.credit > 0 ? formatPHP(ln.credit) : '—'}
              </td>
              <td className="py-2 px-2 text-right font-semibold tabular-nums">
                {formatPHP(ln.running_balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end print-avoid-break">
        <div className="w-full sm:w-80 border border-slate-300 divide-y divide-slate-200">
          <div className="flex justify-between px-3 py-1.5">
            <span className="text-slate-600">Previous Balance</span>
            <span className="font-semibold tabular-nums">{formatPHP(statement.previous_balance)}</span>
          </div>
          <div className="flex justify-between px-3 py-1.5">
            <span className="text-slate-600">Total Charges (Billing Period)</span>
            <span className="font-semibold tabular-nums">{formatPHP(statement.total_charges)}</span>
          </div>
          <div className="flex justify-between px-3 py-1.5">
            <span className="text-slate-600">Total Payments (Billing Period)</span>
            <span className="font-semibold text-emerald-700 tabular-nums">
              -{formatPHP(statement.total_payments)}
            </span>
          </div>
          <div className="flex justify-between px-3 py-2 bg-slate-900 text-white font-bold text-sm">
            <span>OUTSTANDING BALANCE</span>
            <span className="tabular-nums">{formatPHP(statement.outstanding_balance)}</span>
          </div>
        </div>
      </div>

      {/* Terms & Remarks */}
      <div className="space-y-2.5 pt-2 print-avoid-break">
        {statement.payment_terms && (
          <div>
            <div className="font-bold uppercase text-[10px] tracking-wider text-slate-700">Payment Terms</div>
            <p className="text-slate-800 whitespace-pre-wrap">{statement.payment_terms}</p>
          </div>
        )}
        {statement.remarks && (
          <div>
            <div className="font-bold uppercase text-[10px] tracking-wider text-slate-700">Remarks</div>
            <p className="text-slate-800 whitespace-pre-wrap">{statement.remarks}</p>
          </div>
        )}
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-6 pt-8 print-avoid-break">
        <div>
          <div className="text-[11px] text-slate-600 mb-8">Prepared By:</div>
          <div className="border-t border-slate-900 pt-1 font-bold text-slate-900">
            {statement.prepared_by || '\u00A0'}
          </div>
          <div className="text-[10px] text-slate-500">{settings.business_name}</div>
        </div>

        <div>
          <div className="text-[11px] text-slate-600 h-8 flex items-end">
            {settings.signature_url ? (
              <img src={resolveAssetUrl(settings.signature_url)} alt="Signature" className="h-10 object-contain" />
            ) : (
              <span>Authorized Signature:</span>
            )}
          </div>
          <div className="border-t border-slate-900 pt-1 font-bold text-slate-900 mt-4">
            {statement.authorized_signatory || settings.authorized_representative || '\u00A0'}
          </div>
          <div className="text-[10px] text-slate-500">
            {settings.authorized_title || 'Authorized Representative'}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-600 mb-8">Received By:</div>
          <div className="border-t border-slate-900 pt-1 font-bold text-slate-900">
            {statement.customer_name}
          </div>
          <div className="text-[10px] text-slate-500">Signature Over Printed Name & Date</div>
        </div>
      </div>
    </div>
  );
};
