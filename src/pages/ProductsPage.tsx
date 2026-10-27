import React, { useEffect, useState } from 'react';
import { Plus, Search, Edit3, Archive, Package, X } from 'lucide-react';
import { ProductService } from '../types';
import { apiFetch, formatPHP, generateIdempotencyKey } from '../lib/api';

const CATEGORIES = [
  'Fabrication',
  'Installation',
  'Repair & Maintenance',
  'Inspection',
  'Materials & Parts',
  'Custom',
];

export const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<ProductService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductService | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [idemKey, setIdemKey] = useState('');

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Fabrication');
  const [materialGrade, setMaterialGrade] = useState('');
  const [unit, setUnit] = useState('unit');
  const [unitPrice, setUnitPrice] = useState(0);
  const [description, setDescription] = useState('');

  const fetchProducts = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (categoryFilter !== 'all') params.set('category', categoryFilter);

    apiFetch<{ products: ProductService[] }>(`/api/products?${params.toString()}`)
      .then((res) => setProducts(res.products || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProducts();
  }, [categoryFilter]);

  const openAdd = () => {
    setEditingItem(null);
    setName('');
    setCategory('Fabrication');
    setMaterialGrade('');
    setUnit('unit');
    setUnitPrice(0);
    setDescription('');
    setError('');
    setIdemKey(generateIdempotencyKey());
    setModalOpen(true);
  };

  const openEdit = (p: ProductService) => {
    setEditingItem(p);
    setName(p.name);
    setCategory(p.category || 'Fabrication');
    setMaterialGrade(p.material_grade || '');
    setUnit(p.unit || 'unit');
    setUnitPrice(p.unit_price || 0);
    setDescription(p.description || '');
    setError('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Product or service name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name,
        category,
        material_grade: materialGrade,
        unit,
        unit_price: unitPrice,
        description,
      };
      if (editingItem) {
        await apiFetch(`/api/products/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/products', {
          method: 'POST',
          idempotencyKey: idemKey,
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      setError(err.message || 'Failed to save catalog item.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (p: ProductService) => {
    if (!window.confirm(`Archive catalog item "${p.name}"?`)) return;
    await apiFetch(`/api/products/${p.id}`, { method: 'DELETE' });
    fetchProducts();
  };

  return (
    <div className="space-y-5">
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-lg border border-slate-300 shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white">
              <h3 className="text-sm font-semibold">
                {editingItem ? `Edit Item (${editingItem.item_code})` : 'Add Product or Fabrication Service'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              {error && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Product / Service Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Stainless Steel Commercial Work Table / TIG Welding Repair"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Stainless Grade (Optional)
                  </label>
                  <input
                    type="text"
                    value={materialGrade}
                    onChange={(e) => setMaterialGrade(e.target.value)}
                    placeholder="e.g., SUS 304 / SUS 202 / SUS 316"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Default Unit
                  </label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="unit, pcs, set, linear m, lot"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Standard Unit Price (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm text-right tabular-nums border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Specifications / Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Dimensions, sheet gauge/thickness, finish (hairline / mirror), or scope notes"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Products and Services</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Reusable catalog of stainless steel fabrication items, installations, repairs, and shop rates for fast quotation and invoice entry.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Product / Service
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-md p-3.5 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchProducts();
          }}
          className="flex-1 min-w-[220px] flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item code, name, stainless grade, or description..."
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
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded bg-white"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading catalog...</div>
        ) : products.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Package className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No catalog items saved yet</p>
            <p className="text-xs text-slate-500">
              Add your shop's standard stainless steel products and fabrication services so staff can insert them into quotations and invoices in one click.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-600">
                <tr>
                  <th className="py-3 px-4 text-left font-semibold">Code</th>
                  <th className="py-3 px-4 text-left font-semibold">Product / Service</th>
                  <th className="py-3 px-4 text-left font-semibold">Category</th>
                  <th className="py-3 px-4 text-left font-semibold">Grade</th>
                  <th className="py-3 px-4 text-left font-semibold">Unit</th>
                  <th className="py-3 px-4 text-right font-semibold">Standard Price</th>
                  <th className="py-3 px-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">{p.item_code}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{p.name}</div>
                      {p.description && <div className="text-xs text-slate-500">{p.description}</div>}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">{p.category}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{p.material_grade || '—'}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{p.unit}</td>
                    <td className="py-3 px-4 text-right font-semibold tabular-nums">
                      {formatPHP(p.unit_price)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="p-1.5 text-slate-600 hover:text-sky-700 hover:bg-slate-100 rounded"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchive(p)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                        >
                          <Archive className="w-4 h-4" />
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
