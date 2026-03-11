import { useState, useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import { FileText, Upload, Download, Trash2, X, File, Video, Image, Link as LinkIcon } from "lucide-react";
import CrestLogo from "./CrestLogo";
import { getMaterials, createMaterial, deleteMaterial } from "../services/api";

const subjects = ["Mathematics", "Science", "English", "History", "Geography"];
const materialTypes = ["PDF", "Video", "Image", "Document", "Link"];
const grades = ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"];
const sections = ["A", "B", "C", "D"];
const academicYears = ["2024-2025", "2025-2026"];

export default function SubjectMaterials() {
  const [sms_materials, setSms_materials] = useState([]);
  const [sms_loading, setSms_loading] = useState(true);
  const [sms_searchQuery, setSms_searchQuery] = useState("");
  const [sms_subjectFilter, setSms_subjectFilter] = useState("All");
  const [sms_typeFilter, setSms_typeFilter] = useState("All");
  const [sms_gradeFilter, setSms_gradeFilter] = useState("All");
  const [sms_showUploadModal, setSms_showUploadModal] = useState(false);
  
  // Upload form state
  const [sms_title, setSms_title] = useState("");
  const [sms_description, setSms_description] = useState("");
  const [sms_subject, setSms_subject] = useState("Mathematics");
  const [sms_type, setSms_type] = useState("PDF");
  const [sms_fileUrl, setSms_fileUrl] = useState("");
  const [sms_grade, setSms_grade] = useState("Class 10");
  const [sms_section, setSms_section] = useState("A");
  const [sms_academicYear, setSms_academicYear] = useState("2024-2025");
  const [sms_uploading, setSms_uploading] = useState(false);

  const userRole = JSON.parse(localStorage.getItem("sms_user") || "{}").role;
  const isTeacher = userRole === "admin" || userRole === "teacher";

  useEffect(() => {
    fetchMaterials();
  }, [sms_subjectFilter, sms_typeFilter, sms_gradeFilter]);

  const fetchMaterials = async () => {
    try {
      setSms_loading(true);
      const params = {};
      if (sms_subjectFilter !== "All") params.subject = sms_subjectFilter;
      if (sms_typeFilter !== "All") params.type = sms_typeFilter;
      if (sms_gradeFilter !== "All") params.grade = sms_gradeFilter;
      
      const response = await getMaterials(params);
      setSms_materials(response.data.materials || []);
    } catch (error) {
      console.error("Error fetching materials:", error);
      toast.error("Failed to load materials");
    } finally {
      setSms_loading(false);
    }
  };

  const filteredMaterials = useMemo(() => {
    return sms_materials.filter((material) => {
      const matchesSearch = material.title?.toLowerCase().includes(sms_searchQuery.toLowerCase()) ||
                           material.description?.toLowerCase().includes(sms_searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [sms_materials, sms_searchQuery]);

  const stats = useMemo(() => {
    return {
      total: sms_materials.length,
      pdfs: sms_materials.filter(m => m.type === "PDF").length,
      videos: sms_materials.filter(m => m.type === "Video").length,
      images: sms_materials.filter(m => m.type === "Image").length,
    };
  }, [sms_materials]);

  const getTypeIcon = (type) => {
    switch (type) {
      case "PDF": return <File size={16} />;
      case "Video": return <Video size={16} />;
      case "Image": return <Image size={16} />;
      case "Link": return <LinkIcon size={16} />;
      default: return <FileText size={16} />;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case "PDF": return "bg-red-100 text-red-700";
      case "Video": return "bg-purple-100 text-purple-700";
      case "Image": return "bg-green-100 text-green-700";
      case "Link": return "bg-blue-100 text-blue-700";
      default: return "bg-slate-100 text-slate-700";
    }
  };

  const handleUploadMaterial = async (e) => {
    e.preventDefault();
    setSms_uploading(true);

    try {
      await createMaterial({
        title: sms_title,
        description: sms_description,
        subject: sms_subject,
        type: sms_type,
        fileUrl: sms_fileUrl,
        fileSize: "",
        grade: sms_grade,
        section: sms_section,
        academicYear: sms_academicYear,
      });
      
      toast.success("Material uploaded successfully!");
      setSms_showUploadModal(false);
      resetForm();
      fetchMaterials();
    } catch (error) {
      console.error("Error uploading material:", error);
      toast.error("Failed to upload material");
    } finally {
      setSms_uploading(false);
    }
  };

  const handleDeleteMaterial = async (id) => {
    if (!confirm("Are you sure you want to delete this material?")) return;
    
    try {
      await deleteMaterial(id);
      toast.success("Material deleted");
      fetchMaterials();
    } catch (error) {
      toast.error("Failed to delete material");
    }
  };

  const resetForm = () => {
    setSms_title("");
    setSms_description("");
    setSms_subject("Mathematics");
    setSms_type("PDF");
    setSms_fileUrl("");
    setSms_grade("Class 10");
    setSms_section("A");
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
                <h1 className="text-2xl font-bold text-[#002366]">Study Materials</h1>
                <p className="mt-1 text-sm text-slate-600">Access and upload study materials for your classes.</p>
              </div>
            </div>
            {isTeacher && (
              <button
                onClick={() => setSms_showUploadModal(true)}
                className="flex items-center gap-2 rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003399]"
              >
                <Upload size={16} />
                Upload Material
              </button>
            )}
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="page-card p-4">
            <p className="text-sm text-slate-600">Total Materials</p>
            <p className="text-2xl font-bold text-[#002366]">{stats.total}</p>
          </div>
          <div className="page-card p-4">
            <p className="text-sm text-slate-600">PDF Documents</p>
            <p className="text-2xl font-bold text-red-600">{stats.pdfs}</p>
          </div>
          <div className="page-card p-4">
            <p className="text-sm text-slate-600">Videos</p>
            <p className="text-2xl font-bold text-purple-600">{stats.videos}</p>
          </div>
          <div className="page-card p-4">
            <p className="text-sm text-slate-600">Images</p>
            <p className="text-2xl font-bold text-green-600">{stats.images}</p>
          </div>
        </div>

        <div className="page-card p-5 md:p-6">
          <div className="mb-4 flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search materials..."
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
              value={sms_typeFilter}
              onChange={(e) => setSms_typeFilter(e.target.value)}
              className="rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
            >
              <option value="All">All Types</option>
              {materialTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={sms_gradeFilter}
              onChange={(e) => setSms_gradeFilter(e.target.value)}
              className="rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
            >
              <option value="All">All Grades</option>
              {grades.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {sms_loading ? (
            <div className="py-8 text-center text-slate-500">Loading...</div>
          ) : filteredMaterials.length === 0 ? (
            <div className="py-8 text-center text-slate-500">No materials found</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#c5a059]">
              <table className="min-w-full divide-y divide-[#d8c08a]">
                <thead className="bg-[#002366] text-[#fffbf2]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Subject</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Class</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Uploaded</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e6d3aa] bg-[#fffff0]">
                  {filteredMaterials.map((material) => (
                    <tr key={material._id} className="hover:bg-[#fff7e6]">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${getTypeColor(material.type)}`}>
                          {getTypeIcon(material.type)} {material.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-900">{material.title}</p>
                        <p className="text-xs text-slate-500 line-clamp-1">{material.description}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{material.subject}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{material.grade} - {material.section}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {new Date(material.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {material.fileUrl && (
                            <a
                              href={material.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-md bg-[#002366] px-3 py-1 text-xs font-semibold text-white hover:bg-[#003399]"
                            >
                              <Download size={14} className="inline" />
                            </a>
                          )}
                          {isTeacher && (
                            <button
                              onClick={() => handleDeleteMaterial(material._id)}
                              className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Upload Modal */}
        {sms_showUploadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[#002366]">Upload Study Material</h3>
                <button onClick={() => setSms_showUploadModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleUploadMaterial} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Title *</label>
                  <input
                    type="text"
                    value={sms_title}
                    onChange={(e) => setSms_title(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    placeholder="Material title"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Description</label>
                  <textarea
                    value={sms_description}
                    onChange={(e) => setSms_description(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    placeholder="Brief description"
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
                    <label className="block text-sm font-medium text-slate-700">Type *</label>
                    <select
                      value={sms_type}
                      onChange={(e) => setSms_type(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    >
                      {materialTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">File/Link URL</label>
                  <input
                    type="url"
                    value={sms_fileUrl}
                    onChange={(e) => setSms_fileUrl(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    placeholder="https://..."
                  />
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
                    onClick={() => setSms_showUploadModal(false)}
                    className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sms_uploading}
                    className="flex-1 rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003399] disabled:opacity-50"
                  >
                    {sms_uploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

