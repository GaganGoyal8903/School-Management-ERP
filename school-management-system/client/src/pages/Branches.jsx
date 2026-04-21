import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Building2, Plus, Trash2 } from 'lucide-react';
import { createBranch, deleteBranchRecord, getBranches, updateBranch } from '../services/api';

const EMPTY_FORM = {
  branchId: null,
  name: '',
  code: '',
  addressLine1: '',
  city: '',
  state: '',
  postalCode: '',
  phone: '',
  email: '',
  principalName: '',
  capacity: '',
  isActive: true,
};

export default function Branches() {
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadBranches = async () => {
    try {
      setLoading(true);
      const response = await getBranches();
      setBranches(response.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load branches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('Branch name and code are required.');
      return;
    }

    try {
      setSaving(true);
      if (form.branchId) {
        const response = await updateBranch(form.branchId, form);
        setBranches(response.data?.data || []);
      } else {
        const response = await createBranch(form);
        setBranches(response.data?.data || []);
      }
      setForm(EMPTY_FORM);
      toast.success('Branch saved');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save branch');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (branchId) => {
    try {
      await deleteBranchRecord(branchId);
      setBranches((current) => current.filter((branch) => branch.branchId !== branchId));
      if (form.branchId === branchId) {
        setForm(EMPTY_FORM);
      }
      toast.success('Branch deleted');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete branch');
    }
  };

  return (
    <section className="space-y-6 px-4 py-6 md:px-8">
      <header className="rounded-[2rem] border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Admin Workspace</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Branch management</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Manage school branches and keep a real SQL-backed registry instead of mock campus data.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <Plus className="h-5 w-5 text-[#002366]" />
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{form.branchId ? 'Edit branch' : 'Add branch'}</h2>
                <p className="text-sm text-slate-500">Create or update branch metadata</p>
              </div>
            </div>
          </div>
          <div className="space-y-4 px-6 py-5">
            {[
              ['name', 'Branch name'],
              ['code', 'Branch code'],
              ['addressLine1', 'Address'],
              ['city', 'City'],
              ['state', 'State'],
              ['postalCode', 'Postal code'],
              ['phone', 'Phone'],
              ['email', 'Email'],
              ['principalName', 'Principal name'],
            ].map(([key, label]) => (
              <input
                key={key}
                value={form[key]}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                placeholder={label}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
              />
            ))}
            <input
              type="number"
              value={form.capacity}
              onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
              placeholder="Capacity"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
            />
            <label className="flex items-center gap-3 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              Active branch
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-2xl bg-[#002366] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save branch'}
              </button>
              <button
                type="button"
                onClick={() => setForm(EMPTY_FORM)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600"
              >
                Reset
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-[#002366]" />
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Registered branches</h2>
                <p className="text-sm text-slate-500">Live SQL-backed branch list</p>
              </div>
            </div>
          </div>
          <div className="space-y-4 px-6 py-5">
            {loading ? (
              <p className="text-sm text-slate-500">Loading branches...</p>
            ) : branches.length ? (
              branches.map((branch) => (
                <div key={branch.branchId} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{branch.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {branch.code} • {branch.city || 'City pending'} • {branch.studentCount} linked student record(s)
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({
                          branchId: branch.branchId,
                          name: branch.name,
                          code: branch.code,
                          addressLine1: branch.addressLine1,
                          city: branch.city,
                          state: branch.state,
                          postalCode: branch.postalCode,
                          phone: branch.phone,
                          email: branch.email,
                          principalName: branch.principalName,
                          capacity: branch.capacity,
                          isActive: branch.isActive,
                        })}
                        className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(branch.branchId)}
                        className="inline-flex items-center gap-1 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No branches found.
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
