import { useState, useEffect } from "react";
import { Bell, Trash, Megaphone, X, CheckCircle } from "lucide-react";
import { getNotices, createNotice, deleteNotice } from "../services/api";
import CrestLogo from "./CrestLogo";

const MAYO_LOGO = "https://upload.wikimedia.org/wikipedia/en/b/b5/Mayo_College_logo.png";

const categories = ["Urgent", "Event", "Holiday"];

const categoryColors = {
  Urgent: { bg: "bg-red-50", border: "border-red-500", badge: "bg-red-500", text: "text-red-700" },
  Event: { bg: "bg-amber-50", border: "border-amber-500", badge: "bg-amber-500", text: "text-amber-700" },
  Holiday: { bg: "bg-blue-50", border: "border-blue-500", badge: "bg-blue-500", text: "text-blue-700" }
};

export default function NoticeBoard() {
  const [sms_notices, setSms_notices] = useState([]);
  const [sms_loading, setSms_loading] = useState(true);
  const [sms_error, setSms_error] = useState("");
  const [sms_success, setSms_success] = useState("");
  const [sms_showForm, setSms_showForm] = useState(false);
  
  const [sms_title, setSms_title] = useState("");
  const [sms_content, setSms_content] = useState("");
  const [sms_category, setSms_category] = useState("Urgent");
  const [sms_submitting, setSms_submitting] = useState(false);

  useEffect(() => {
    fetchNotices();
  }, []);

  const fetchNotices = async () => {
    setSms_loading(true);
    try {
      const response = await getNotices({ isActive: true });
      setSms_notices(response.data.notices || []);
    } catch (error) {
      console.error("Fetch notices error:", error);
      setSms_error("Failed to load notices.");
    } finally {
      setSms_loading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sms_title || !sms_content) {
      setSms_error("Title and content are required.");
      return;
    }

    setSms_submitting(true);
    setSms_error("");

    try {
      await createNotice({ title: sms_title, content: sms_content, category: sms_category });
      setSms_success("Notice posted successfully!");
      setSms_title("");
      setSms_content("");
      setSms_category("Urgent");
      setSms_showForm(false);
      fetchNotices();
      setTimeout(() => setSms_success(""), 3000);
    } catch (error) {
      setSms_error(error.response?.data?.message || "Failed to post notice.");
    } finally {
      setSms_submitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this notice?")) return;

    try {
      await deleteNotice(id);
      setSms_success("Notice deleted successfully!");
      fetchNotices();
      setTimeout(() => setSms_success(""), 3000);
    } catch (error) {
      setSms_error("Failed to delete notice.");
    }
  };

  const getCategoryStyle = (category) => categoryColors[category] || categoryColors.Urgent;

  return (
    <section className="min-h-screen bg-transparent px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="page-card p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CrestLogo sizeClass="h-12 w-12" className="border-2 border-[#c5a059] bg-[#fffbf2]" imgClassName="h-full w-full rounded-full object-contain p-0.5" />
              <div>
                <h1 className="text-2xl font-bold text-[#002366]">Notice Board Management</h1>
                <p className="mt-1 text-sm text-slate-600">Post important notices for students, teachers, and parents.</p>
              </div>
            </div>
            <button
              onClick={() => setSms_showForm(!sms_showForm)}
              className="flex items-center gap-2 rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003399]"
            >
              {sms_showForm ? <><X size={16} /> Cancel</> : <><Megaphone size={16} /> Post Notice</>}
            </button>
          </div>
        </header>

        {sms_success && (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-green-700">
            <CheckCircle size={16} />
            <p className="text-sm">{sms_success}</p>
          </div>
        )}

        {sms_showForm && (
          <div className="page-card p-5 md:p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-lg bg-[#002366] p-4 border-2 border-[#c5a059]">
                <h3 className="text-lg font-semibold text-white mb-4">Post New Notice</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-amber-200">Title</label>
                    <input
                      type="text"
                      value={sms_title}
                      onChange={(e) => setSms_title(e.target.value)}
                      placeholder="Enter notice title..."
                      className="w-full rounded-md border border-[#c5a059] bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-amber-200">Category</label>
                    <select
                      value={sms_category}
                      onChange={(e) => setSms_category(e.target.value)}
                      className="w-full rounded-md border border-[#c5a059] bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-amber-200">Content</label>
                    <textarea
                      value={sms_content}
                      onChange={(e) => setSms_content(e.target.value)}
                      placeholder="Enter notice content..."
                      rows={4}
                      className="w-full rounded-md border border-[#c5a059] bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
                    />
                  </div>

                  {sms_error && <p className="text-sm text-red-300">{sms_error}</p>}

                  <button
                    type="submit"
                    disabled={sms_submitting}
                    className="w-full rounded-md bg-[#c5a059] px-4 py-2 text-sm font-semibold text-[#002366] hover:bg-[#d4b06a] disabled:opacity-50"
                  >
                    {sms_submitting ? "Posting..." : "Post Notice"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        <div className="page-card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-[#002366] mb-4 flex items-center gap-2">
            <Bell size={20} />
            Posted Notices ({sms_notices.length})
          </h2>

          {sms_loading ? (
            <div className="text-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#c5a059] border-t-transparent mx-auto"></div>
              <p className="mt-2 text-slate-500">Loading notices...</p>
            </div>
          ) : sms_notices.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Bell size={48} className="mx-auto text-slate-300 mb-2" />
              <p>No notices posted yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sms_notices.map((notice) => {
                const style = getCategoryStyle(notice.category);
                return (
                  <div
                    key={notice._id}
                    className={`rounded-lg border-l-4 ${style.bg} ${style.border} p-4`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`${style.badge} text-white text-xs px-2 py-0.5 rounded-full`}>
                            {notice.category}
                          </span>
                          <span className="text-xs text-slate-500">
                            {new Date(notice.createdAt).toLocaleDateString('en-IN', { 
                              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
                            })}
                          </span>
                        </div>
                        <h3 className="font-semibold text-[#002366]">{notice.title}</h3>
                        <p className="mt-1 text-sm text-slate-600">{notice.content}</p>
                        <p className="mt-2 text-xs text-slate-500">Posted by: {notice.postedBy?.fullName || "Admin"}</p>
                      </div>
                      <button
                        onClick={() => handleDelete(notice._id)}
                        className="p-2 text-slate-400 hover:text-red-500 transition"
                        title="Delete notice"
                      >
                        <Trash size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

