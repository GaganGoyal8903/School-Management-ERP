import { useState, useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import { BookOpen, Calendar, Plus, Clock, CheckCircle, AlertCircle, X } from "lucide-react";
import CrestLogo from "./CrestLogo";
import { getHomework, createHomework, deleteHomework, getStudents } from "../services/api";
import { getStoredAuthUser } from "../utils/authStorage";

const subjects = ["Mathematics", "Science", "English", "History", "Geography"];
const grades = ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"];
const sections = ["A", "B", "C", "D"];
const academicYears = ["2024-2025", "2025-2026"];

export default function Homework() {
  const [sms_homeworkList, setSms_homeworkList] = useState([]);
  const [sms_loading, setSms_loading] = useState(true);
  const [sms_searchQuery, setSms_searchQuery] = useState("");
  const [sms_subjectFilter, setSms_subjectFilter] = useState("All");
  const [sms_statusFilter, setSms_statusFilter] = useState("All");
  const [sms_showCreateModal, setSms_showCreateModal] = useState(false);
  const [sms_selectedHomework, setSms_selectedHomework] = useState(null);
  
  // Create form state
  const [sms_title, setSms_title] = useState("");
  const [sms_description, setSms_description] = useState("");
  const [sms_subject, setSms_subject] = useState("Mathematics");
  const [sms_grade, setSms_grade] = useState("Class 10");
  const [sms_section, setSms_section] = useState("A");
  const [sms_dueDate, setSms_dueDate] = useState("");
  const [sms_academicYear, setSms_academicYear] = useState("2024-2025");
  const [sms_creating, setSms_creating] = useState(false);

  const userRole = getStoredAuthUser()?.role || "";

  useEffect(() => {
    fetchHomework();
  }, [sms_subjectFilter, sms_statusFilter]);

  const fetchHomework = async () => {
    try {
      setSms_loading(true);
      const params = {};
      if (sms_subjectFilter !== "All") params.subject = sms_subjectFilter;
      if (sms_statusFilter !== "All") params.status = sms_statusFilter;
      
      const response = await getHomework(params);
      setSms_homeworkList(response.data.homework || []);
    } catch (error) {
      console.error("Error fetching homework:", error);
      toast.error("Failed to load homework");
    } finally {
      setSms_loading(false);
    }
  };

  const filteredHomework = useMemo(() => {
    return sms_homeworkList.filter((hw) => {
      const matchesSearch = hw.title?.toLowerCase().includes(sms_searchQuery.toLowerCase()) ||
                           hw.subject?.toLowerCase().includes(sms_searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [sms_homeworkList, sms_searchQuery]);

  const stats = useMemo(() => {
    const now = new Date();
    return {
      total: filteredHomework.length,
      pending: filteredHomework.filter(hw => {
        const due = new Date(hw.dueDate);
        return hw.status === "Active" && due >= now;
      }).length,
      submitted: 0, // Would need separate tracking
      overdue: filteredHomework.filter(hw => {
        const due = new Date(hw.dueDate);
        return hw.status === "Active" && due < now;
      }).length,
    };
  }, [filteredHomework]);

  const getStatusInfo = (homework) => {
    const now = new Date();
    const due = new Date(homework.dueDate);
    
    if (homework.status === "Archived") {
      return { label: "Archived", color: "bg-slate-100 text-slate-700", icon: CheckCircle };
    }
    if (due < now) {
      return { label: "Overdue", color: "bg-red-100 text-red-700", icon: AlertCircle };
    }
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    if (diffDays <= 2) {
      return { label: "Due Soon", color: "bg-amber-100 text-amber-700", icon: Clock };
    }
    return { label: "Pending", color: "bg-blue-100 text-blue-700", icon: Clock };
  };

  const handleCreateHomework = async (e) => {
    e.preventDefault();
    setSms_creating(true);

    try {
      await createHomework({
        title: sms_title,
        description: sms_description,
        subject: sms_subject,
        grade: sms_grade,
        section: sms_section,
        dueDate: sms_dueDate,
        academicYear: sms_academicYear,
      });
      
      toast.success("Homework posted successfully!");
      setSms_showCreateModal(false);
      resetForm();
      fetchHomework();
    } catch (error) {
      console.error("Error creating homework:", error);
      toast.error("Failed to post homework");
    } finally {
      setSms_creating(false);
    }
  };

  const handleDeleteHomework = async (id) => {
    if (!confirm("Are you sure you want to delete this homework?")) return;
    
    try {
      await deleteHomework(id);
      toast.success("Homework deleted");
      fetchHomework();
    } catch (error) {
      toast.error("Failed to delete homework");
    }
  };

  const resetForm = () => {
    setSms_title("");
    setSms_description("");
    setSms_subject("Mathematics");
    setSms_grade("Class 10");
    setSms_section("A");
    setSms_dueDate("");
    setSms_academicYear("2024-2025");
  };

  return (
    <section className="min-h-screen bg-transparent px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="page-card p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CrestLogo sizeClass="h-12 w-12" className="border-2 border-[#c5a059] bg-[#fffbf2]" imgClassName="h-full w-full rounded-full object-contain p-0.5" />
              <div>
                <h1 className="text-2xl font-bold text-[#002366]">Homework</h1>
                <p className="mt-1 text-sm text-slate-600">View and manage homework assignments.</p>
              </div>
            </div>
            {(userRole === "admin" || userRole === "teacher") && (
              <button
                onClick={() => setSms_showCreateModal(true)}
                className="flex items-center gap-2 rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003399]"
              >
                <Plus size={16} />
                Post Homework
              </button>
            )}
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="page-card p-4 cursor-pointer hover:bg-slate-50" onClick={() => setSms_statusFilter("All")}>
            <p className="text-sm text-slate-600">Total</p>
            <p className="text-2xl font-bold text-[#002366]">{stats.total}</p>
          </div>
          <div className="page-card p-4 cursor-pointer hover:bg-slate-50" onClick={() => setSms_statusFilter("Active")}>
            <p className="text-sm text-slate-600">Pending</p>
            <p className="text-2xl font-bold text-blue-600">{stats.pending}</p>
          </div>
          <div className="page-card p-4 cursor-pointer hover:bg-slate-50">
            <p className="text-sm text-slate-600">Submitted</p>
            <p className="text-2xl font-bold text-green-600">{stats.submitted}</p>
          </div>
          <div className="page-card p-4 cursor-pointer hover:bg-slate-50" onClick={() => setSms_statusFilter("Overdue")}>
            <p className="text-sm text-slate-600">Overdue</p>
            <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
          </div>
        </div>

        <div className="page-card p-5 md:p-6">
          <div className="mb-4 flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search homework..."
              value={sms_searchQuery}
              onChange={(e) => setSms_searchQuery(e.target.value)}
              className="flex-1 min-w-48 rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
            />
            <select
              value={sms_subjectFilter}
              onChange={(e) => setSms_subjectFilter(e.target.value)}
              className="rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
            >
              <option value="All">All Subjects</option>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={sms_statusFilter}
              onChange={(e) => setSms_statusFilter(e.target.value)}
              className="rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
            >
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Archived">Archived</option>
            </select>
          </div>

          <div className="space-y-3">
            {sms_loading ? (
              <p className="py-8 text-center text-slate-500">Loading...</p>
            ) : filteredHomework.length === 0 ? (
              <p className="py-8 text-center text-slate-500">No homework found</p>
            ) : (
              filteredHomework.map((hw) => {
                const statusInfo = getStatusInfo(hw);
                const StatusIcon = statusInfo.icon;
                return (
                  <div 
                    key={hw._id} 
                    className="group rounded-xl border border-[#d8c08a] bg-[#fffff0] p-4 transition hover:border-[#c5a059] hover:shadow-md cursor-pointer"
                    onClick={() => setSms_selectedHomework(hw)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[#002366] bg-blue-100 px-2 py-0.5 rounded">{hw.subject}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded flex items-center gap-1 ${statusInfo.color}`}>
                            <StatusIcon size={12} />
                            {statusInfo.label}
                          </span>
                        </div>
                        <h3 className="mt-2 text-base font-semibold text-slate-900">{hw.title}</h3>
                        <p className="mt-1 text-sm text-slate-600 line-clamp-2">{hw.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Due Date</p>
                        <p className={`text-sm font-semibold ${statusInfo.label === "Due Soon" ? "text-amber-600" : statusInfo.label === "Overdue" ? "text-red-600" : "text-slate-700"}`}>
                          {new Date(hw.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-[#e6d3aa] pt-3">
                      <p className="text-xs text-slate-500">Posted by: {hw.assignedBy?.fullName || "Teacher"}</p>
                      <p className="text-xs text-slate-500">
                        {hw.grade} - Section {hw.section}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Create Homework Modal */}
        {sms_showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[#002366]">Post New Homework</h3>
                <button onClick={() => setSms_showCreateModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleCreateHomework} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Title *</label>
                  <input
                    type="text"
                    value={sms_title}
                    onChange={(e) => setSms_title(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    placeholder="Homework title"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Description *</label>
                  <textarea
                    value={sms_description}
                    onChange={(e) => setSms_description(e.target.value)}
                    required
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    placeholder="Homework description"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Subject *</label>
                    <select
                      value={sms_subject}
                      onChange={(e) => setSms_subject(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    >
                      {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Due Date *</label>
                    <input
                      type="date"
                      value={sms_dueDate}
                      onChange={(e) => setSms_dueDate(e.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Grade *</label>
                    <select
                      value={sms_grade}
                      onChange={(e) => setSms_grade(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    >
                      {grades.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Section *</label>
                    <select
                      value={sms_section}
                      onChange={(e) => setSms_section(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    >
                      {sections.map(s => <option key={s} value={s}>Section {s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Academic Year</label>
                    <select
                      value={sms_academicYear}
                      onChange={(e) => setSms_academicYear(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    >
                      {academicYears.map(ay => <option key={ay} value={ay}>{ay}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSms_showCreateModal(false)}
                    className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sms_creating}
                    className="flex-1 rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003399] disabled:opacity-50"
                  >
                    {sms_creating ? "Posting..." : "Post Homework"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {sms_selectedHomework && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-[#002366] bg-blue-100 px-2 py-0.5 rounded">
                    {sms_selectedHomework.subject}
                  </span>
                </div>
                <button onClick={() => setSms_selectedHomework(null)} className="text-slate-400 hover:text-slate-600 text-xl">
                  <X size={20} />
                </button>
              </div>
              
              <h2 className="mt-3 text-xl font-bold text-[#002366]">{sms_selectedHomework.title}</h2>
              
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">Description</p>
                  <p className="mt-1 text-sm text-slate-600">{sms_selectedHomework.description}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Due Date</p>
                    <p className="text-sm text-slate-600">
                      {new Date(sms_selectedHomework.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Class</p>
                    <p className="text-sm text-slate-600">{sms_selectedHomework.grade} - Section {sms_selectedHomework.section}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700">Posted by</p>
                  <p className="text-sm text-slate-600">{sms_selectedHomework.assignedBy?.fullName || "Teacher"}</p>
                </div>
              </div>

              {(userRole === "admin" || userRole === "teacher") && (
                <div className="mt-6 flex gap-3">
                  <button 
                    onClick={() => handleDeleteHomework(sms_selectedHomework._id)}
                    className="flex-1 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

