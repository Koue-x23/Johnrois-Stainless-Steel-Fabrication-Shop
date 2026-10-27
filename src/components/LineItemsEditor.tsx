import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Package } from 'lucide-react';
import { LineItem, ProductService } from '../types';
import { apiFetch, formatPHP, round2 } from '../lib/api';

const COMMON_UNITS = [
  'pcs',
  'unit',
  'set',
  'lot',
  'linear ft',
  'linear m',
  'sq. ft',
  'sq. m',
  'sheets',
  'lengths',
  'kg',
  'job',
];

interface LineItemsEditorProps {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  discountType: 'fixed' | 'percent';
  discountValue: number;
  onDiscountChange: (type: 'fixed' | 'percent', val: number) => void;
  taxEnabled: boolean;
  taxLabel: string;
  taxRate: number;
  onTaxChange: (enabled: boolean, label: string, rate: number) => void;
  totalLabel?: string;
}

export const LineItemsEditor: React.FC<LineItemsEditorProps> = ({
  items,
  onChange,
  discountType,
  discountValue,
  onDiscountChange,
  taxEnabled,
  taxLabel,
  taxRate,
  onTaxChange,
  totalLabel = 'GRAND TOTAL',
}) => {
  const [catalog, setCatalog] = useState<ProductService[]>([]);
  const [showCatalogMenu, setShowCatalogMenu] = useState(false);

  useEffect(() => {
    apiFetch<{ products: ProductService[] }>('/api/products?status=active')
      .then((d) => setCatalog(d.products || []))
      .catch(() => {});
  }, []);

  const updateItem = (idx: number, patch: Partial<LineItem>) => {
    const next = items.map((it, i) => {
      if (i !== idx) return it;
      const merged = { ...it, ...patch };
      const qty = Math.max(0, Number(merged.quantity) || 0);
      const price = Math.max(0, Number(merged.unit_price) || 0);
      merged.line_total = round2(qty * price);
      return merged;
    });
    onChange(next);
  };

  const addBlankRow = () => {
    onChange([
      ...items,
      { product_id: null, description: '', quantity: 1, unit: 'pcs', unit_price: 0, line_total: 0 },
    ]);
  };

  const insertFromCatalog = (prod: ProductService) => {
    const descParts = [prod.name];
    if (prod.material_grade) descParts.push(`(${prod.material_grade})`);
    if (prod.description) descParts.push(`— ${prod.description}`);
    const newItem: LineItem = {
      product_id: prod.id,
      description: descParts.join(' '),
      quantity: 1,
      unit: prod.unit || 'unit',
      unit_price: prod.unit_price || 0,
      line_total: round2(prod.unit_price || 0),
    };
    if (items.length === 1 && !items[0].description.trim() && items[0].unit_price === 0) {
      onChange([newItem]);
    } else {
      onChange([...items, newItem]);
    }
    setShowCatalogMenu(false);
  };

  const removeRow = (idx: number) => {
    if (items.length <= 1) {
      onChange([{ product_id: null, description: '', quantity: 1, unit: 'pcs', unit_price: 0, line_total: 0 }]);
      return;
    }
    onChange(items.filter((_, i) => i !== idx));
  };

  const subtotal = round2(items.reduce((s, it) => s + round2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)), 0));
  const rawDisc =
    discountType === 'percent'
      ? round2(subtotal * (Math.min(100, Math.max(0, Number(discountValue) || 0)) / 100))
      : round2(Math.max(0, Number(discountValue) || 0));
  const discountAmount = Math.min(subtotal, rawDisc);
  const net = round2(subtotal - discountAmount);
  const taxAmount = taxEnabled && taxRate > 0 ? round2(net * (taxRate / 100)) : 0;
  const grandTotal = round2(net + taxAmount);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Itemized Products & Fabrication Services <span className="text-rose-600">*</span>
        </label>

        <div className="flex items-center gap-2 relative">
          {catalog.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCatalogMenu((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Package className="w-3.5 h-3.5 text-sky-700" />
                Add from Catalog ({catalog.length})
              </button>
              {showCatalogMenu && (
                <div className="absolute right-0 z-30 mt-1 w-80 max-h-60 overflow-y-auto bg-white border border-slate-300 rounded-md shadow-lg divide-y divide-slate-100">
                  {catalog.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => insertFromCatalog(p)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-900">
                          {p.name} {p.material_grade ? `(${p.material_grade})` : ''}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {p.category} • per {p.unit}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-slate-900 tabular-nums shrink-0">
                        {formatPHP(p.unit_price)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={addBlankRow}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Line Item
          </button>
        </div>
      </div>

      {/* Responsive Table */}
      <div className="border border-slate-300 rounded-md overflow-x-auto bg-white">
        <table className="w-full text-sm min-w-[680px]">
          <thead className="bg-slate-900 text-white text-xs uppercase">
            <tr>
              <th className="py-2.5 px-3 text-center w-10">#</th>
              <th className="py-2.5 px-3 text-left">Description of Products or Services</th>
              <th className="py-2.5 px-3 text-right w-24">Quantity</th>
              <th className="py-2.5 px-3 text-left w-28">Unit</th>
              <th className="py-2.5 px-3 text-right w-36">Unit Price (₱)</th>
              <th className="py-2.5 px-3 text-right w-36">Line Total</th>
              <th className="py-2.5 px-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((item, idx) => (
              <tr key={idx} className="align-top hover:bg-slate-50/60">
                <td className="py-2.5 px-3 text-center text-xs font-medium text-slate-500 tabular-nums pt-3.5">
                  {idx + 1}
                </td>
                <td className="py-2 px-2">
                  <textarea
                    rows={2}
                    value={item.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                    placeholder="e.g., Custom Stainless Steel 3-Compartment Sink (SUS 304, 1.2mm thickness, TIG welded)"
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </td>
                <td className="py-2 px-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2.5 py-1.5 text-sm text-right tabular-nums border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </td>
                <td className="py-2 px-2">
                  <input
                    type="text"
                    list="stainless-units-list"
                    value={item.unit}
                    onChange={(e) => updateItem(idx, { unit: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </td>
                <td className="py-2 px-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => updateItem(idx, { unit_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2.5 py-1.5 text-sm text-right tabular-nums border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-900 tabular-nums pt-3.5">
                  {formatPHP(item.line_total)}
                </td>
                <td className="py-2 px-2 text-center pt-3">
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    title="Remove item"
                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="stainless-units-list">
          {COMMON_UNITS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </div>

      {/* Automatic Calculations Summary */}
      <div className="flex justify-end">
        <div className="w-full sm:w-96 bg-slate-50 border border-slate-300 rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600 font-medium">Subtotal</span>
            <span className="font-semibold text-slate-900 tabular-nums">{formatPHP(subtotal)}</span>
          </div>

          {/* Discount */}
          <div className="space-y-1.5 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">Discount (Optional)</span>
              <div className="flex items-center gap-1.5">
                <select
                  value={discountType}
                  onChange={(e) => onDiscountChange(e.target.value as 'fixed' | 'percent', discountValue)}
                  className="px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                >
                  <option value="fixed">₱ Fixed</option>
                  <option value="percent">% Percent</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => onDiscountChange(discountType, parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 text-xs text-right tabular-nums bg-white border border-slate-300 rounded"
                />
              </div>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-xs text-rose-700 font-medium">
                <span>Applied Discount</span>
                <span className="tabular-nums">-{formatPHP(discountAmount)}</span>
              </div>
            )}
          </div>

          {/* Tax */}
          <div className="space-y-1.5 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={taxEnabled}
                  onChange={(e) => onTaxChange(e.target.checked, taxLabel || 'VAT', taxRate || 12)}
                  className="rounded border-slate-300 text-slate-900"
                />
                Apply Tax
              </label>
              {taxEnabled && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={taxLabel}
                    onChange={(e) => onTaxChange(taxEnabled, e.target.value, taxRate)}
                    placeholder="VAT"
                    className="w-16 px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={taxRate}
                    onChange={(e) => onTaxChange(taxEnabled, taxLabel, parseFloat(e.target.value) || 0)}
                    className="w-16 px-2 py-1 text-xs text-right tabular-nums bg-white border border-slate-300 rounded"
                  />
                  <span className="text-xs text-slate-600">%</span>
                </div>
              )}
            </div>
            {taxEnabled && taxAmount > 0 && (
              <div className="flex justify-between text-xs text-slate-700 font-medium">
                <span>
                  {taxLabel || 'Tax'} ({taxRate}%)
                </span>
                <span className="tabular-nums">{formatPHP(taxAmount)}</span>
              </div>
            )}
          </div>

          {/* Grand Total */}
          <div className="flex items-center justify-between pt-3 border-t-2 border-slate-900">
            <span className="text-sm font-bold text-slate-950">{totalLabel}</span>
            <span className="text-lg font-extrabold text-slate-950 tabular-nums">
              {formatPHP(grandTotal)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
