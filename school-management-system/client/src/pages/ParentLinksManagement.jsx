import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  Link2,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import {
  createParentStudentLink,
  deleteParentStudentLink,
  getParentStudentLinks,
  getSettingsUsers,
  getStudents,
  setParentStudentLinkPrimary,
} from "../services/api";

const relationOptions = ["Father", "Mother", "Guardian", "Sibling", "Grandparent", "Other"];

const EmptyState = ({ text }) => (
  <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
    {text}
  </div>
);

export default function ParentLinksManagement() {
  const [parentOptions, setParentOptions] = useState([]);
  const [studentOptions, setStudentOptions] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    parentUserId: "",
    studentId: "",
    relation: "Father",
    isPrimary: true,
  });

  const loadData = async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [usersRes, studentsRes, linksRes] = await Promise.all([
        getSettingsUsers({ role: "parent", limit: 200 }),
        getStudents({ page: 1, limit: 500 }),
        getParentStudentLinks({ search: search || undefined }),
      ]);

      const rawUsers = usersRes?.data?.data || usersRes?.data?.users || [];
      const rawStudents = studentsRes?.data?.students || studentsRes?.data?.data || [];
      setParentOptions(
        rawUsers.filter((user) => String(user.role || "").toLowerCase() === "parent")
      );
      setStudentOptions(rawStudents);
      setLinks(linksRes?.data?.data || linksRes?.data?.links || []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load parent links.");
      setLinks([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredLinks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return links;
    }

    return links.filter((entry) => (
      String(entry.parentFullName || "").toLowerCase().includes(normalizedSearch)
      || String(entry.parentEmail || "").toLowerCase().includes(normalizedSearch)
      || String(entry.studentFullName || "").toLowerCase().includes(normalizedSearch)
      || String(entry.admissionNumber || "").toLowerCase().includes(normalizedSearch)
      || String(entry.rollNumber || "").toLowerCase().includes(normalizedSearch)
    ));
  }, [links, search]);

  const handleCreateLink = async (event) => {
    event.preventDefault();
    if (!filters.parentUserId || !filters.studentId) {
      toast.error("Please select both a parent and a student.");
      return;
    }

    try {
      setSubmitting(true);
      await createParentStudentLink({
        parentUserId: Number(filters.parentUserId),
        studentId: Number(filters.studentId),
        relation: filters.relation,
        isPrimary: filters.isPrimary,
      });
      toast.success("Parent-student link saved successfully.");
      setFilters((current) => ({
        ...current,
        studentId: "",
        relation: "Father",
        isPrimary: true,
      }));
      await loadData({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save the parent-student link.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetPrimary = async (linkId) => {
    try {
      await setParentStudentLinkPrimary(linkId);
      toast.success("Primary child updated successfully.");
      await loadData({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update the primary child.");
    }
  };

  const handleDelete = async (linkId) => {
    try {
      await deleteParentStudentLink(linkId);
      toast.success("Link removed successfully.");
      await loadData({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to remove the link.");
    }
  };

  return (
    <section className="space-y-6 px-4 py-6 md:px-8">
      <header className="rounded-[2rem] border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Parent Access Control</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Parent-child link management</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Link a parent account to one or more students, control the default child, and keep the parent portal aligned to the right child profile.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadData({ silent: true })}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-white"
          >
            <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-xl font-semibold text-slate-900">Create or update a link</h2>
            <p className="mt-1 text-sm text-slate-500">Each parent can be linked to multiple students. Setting a new link as primary will replace the current primary child for that parent.</p>
          </div>
          <form onSubmit={handleCreateLink} className="space-y-5 px-6 py-5">
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">Parent account</span>
              <select
                value={filters.parentUserId}
                onChange={(event) => setFilters((current) => ({ ...current, parentUserId: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#002366]/30 focus:ring-2 focus:ring-[#002366]/10"
              >
                <option value="">Select a parent</option>
                {parentOptions.map((user) => (
                  <option key={user._id || user.id} value={user._id || user.id}>
                    {user.fullName} {user.email ? `• ${user.email}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">Student</span>
              <select
                value={filters.studentId}
                onChange={(event) => setFilters((current) => ({ ...current, studentId: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#002366]/30 focus:ring-2 focus:ring-[#002366]/10"
              >
                <option value="">Select a student</option>
                {studentOptions.map((student) => (
                  <option key={student.studentId || student.id || student._id} value={student.studentId || student.id || student._id}>
                    {student.fullName || student.name} {student.class ? `• ${student.class}` : ""} {student.section ? `• ${student.section}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <label className="block space-y-2 text-sm">
                <span className="font-medium text-slate-700">Relation</span>
                <select
                  value={filters.relation}
                  onChange={(event) => setFilters((current) => ({ ...current, relation: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#002366]/30 focus:ring-2 focus:ring-[#002366]/10"
                >
                  {relationOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={filters.isPrimary}
                  onChange={(event) => setFilters((current) => ({ ...current, isPrimary: event.target.checked }))}
                />
                Make primary
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-full bg-[#002366] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#001a4d] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              <Link2 className="h-4 w-4" />
              {submitting ? "Saving..." : "Save link"}
            </button>
          </form>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Existing links</h2>
              <p className="mt-1 text-sm text-slate-500">Search parent-child mappings and control which linked student is the default portal view.</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search links"
                className="w-40 bg-transparent outline-none"
              />
            </div>
          </div>

          <div className="px-6 py-5">
            {loading ? (
              <div className="px-2 py-8 text-sm text-slate-500">Loading parent links...</div>
            ) : filteredLinks.length ? (
              <div className="space-y-3">
                {filteredLinks.map((entry) => (
                  <div key={entry.parentStudentLinkId} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{entry.parentFullName || "Parent"}</p>
                          {entry.isPrimary ? (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Primary</span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{entry.parentEmail || "No email"} {entry.parentPhone ? `• ${entry.parentPhone}` : ""}</p>
                        <div className="mt-3 rounded-2xl bg-white px-4 py-3">
                          <p className="text-sm font-semibold text-slate-900">{entry.studentFullName || "Student"}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {entry.className || "-"}{entry.sectionName ? ` • Section ${entry.sectionName}` : ""}{entry.rollNumber ? ` • Roll ${entry.rollNumber}` : ""}{entry.admissionNumber ? ` • Adm ${entry.admissionNumber}` : ""}
                          </p>
                          {entry.relation ? <p className="mt-1 text-xs text-slate-500">Relation: {entry.relation}</p> : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!entry.isPrimary ? (
                          <button
                            type="button"
                            onClick={() => handleSetPrimary(entry.parentStudentLinkId)}
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Make primary
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Default child
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(entry.parentStudentLinkId)}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="No parent-student links found." />
            )}
          </div>
        </section>
      </div>

      <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-[#002366]/8 p-3 text-[#002366]">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Database support</h2>
            <p className="mt-1 text-sm text-slate-500">
              This module uses `dbo.ParentStudentLinks` plus new stored procedures for list, set-primary, and deactivate flows. I’ll include the SQL section in the final handoff so you can apply it directly to SQL Server.
            </p>
          </div>
        </div>
      </section>
    </section>
  );
}
