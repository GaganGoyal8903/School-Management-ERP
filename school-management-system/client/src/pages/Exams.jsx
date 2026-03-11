import { useState, useEffect } from "react";
import { Plus, Edit, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";

import {
  getExams,
  createExam,
  updateExam,
  deleteExam,
  getSubjects
} from "../services/api";

const Exams = () => {
  const { isAdmin, isTeacher } = useAuth();

  const [exams, setExams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingExam, setEditingExam] = useState(null);

  const [formData, setFormData] = useState({
    title: "",
    subject: "",
    grade: "Class 10",
    date: "",
    duration: 60,
    totalMarks: 100,
    instructions: ""
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [examsRes, subjectsRes] = await Promise.all([
        getExams(),
        getSubjects()
      ]);

      // Safely handle exams array
      const examsData = examsRes?.data?.exams || examsRes?.data || [];
      setExams(Array.isArray(examsData) ? examsData : []);
      
      // Safely handle subjects array
      const subjectsData = subjectsRes?.data?.subjects || subjectsRes?.data || [];
      setSubjects(Array.isArray(subjectsData) ? subjectsData : []);
    } catch (error) {
      toast.error("Failed to fetch data");
      // Ensure empty arrays on error
      setExams([]);
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const payload = {
        ...formData,
        duration: Number(formData.duration),
        totalMarks: Number(formData.totalMarks)
      };

      if (editingExam) {
        await updateExam(editingExam._id, payload);
        toast.success("Exam updated successfully");
      } else {
        await createExam(payload);
        toast.success("Exam created successfully");
      }

      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Operation failed");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this exam?")) return;

    try {
      await deleteExam(id);
      toast.success("Exam deleted successfully");
      fetchData();
    } catch {
      toast.error("Failed to delete exam");
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      subject: "",
      grade: "Class 10",
      date: "",
      duration: 60,
      totalMarks: 100,
      instructions: ""
    });

    setEditingExam(null);
  };

  const openEditModal = (exam) => {
    setEditingExam(exam);

    setFormData({
      title: exam.title || "",
      subject: exam.subject?._id || exam.subject || "",
      grade: exam.grade || "Class 10",
      date: exam.date ? exam.date.split("T")[0] : "",
      duration: exam.duration || 60,
      totalMarks: exam.totalMarks || 100,
      instructions: exam.instructions || ""
    });

    setShowModal(true);
  };

  const columns = [
    { key: "title", header: "Exam Title" },

    {
      key: "subject",
      header: "Subject",
      render: (row) => row?.subject?.name || row?.subject || "-"
    },

    { key: "grade", header: "Class" },

    {
      key: "date",
      header: "Date",
      render: (row) =>
        row?.date ? new Date(row.date).toLocaleDateString() : "-"
    },

    {
      key: "duration",
      header: "Duration",
      render: (row) => `${row?.duration || 0} min`
    },

    { key: "totalMarks", header: "Total Marks" },

    {
      key: "actions",
      header: "Actions",
      width: "120px",
      render: (row) => (
        <div className="flex items-center gap-2">
          {(isAdmin || isTeacher) && (
            <>
              <button
                onClick={() => openEditModal(row)}
                className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"
              >
                <Edit className="w-4 h-4" />
              </button>

              {isAdmin && (
                <button
                  onClick={() => handleDelete(row._id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      )
    }
  ];

  const grades = [
    "Class 1","Class 2","Class 3","Class 4","Class 5","Class 6",
    "Class 7","Class 8","Class 9","Class 10","Class 11","Class 12"
  ];

  return (
    <div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Examinations</h1>

        {(isAdmin || isTeacher) && (
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d]"
          >
            <Plus className="w-4 h-4" />
            Create Exam
          </button>
        )}
      </div>

      <DataTable columns={columns} data={exams} loading={loading} />

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingExam ? "Edit Exam" : "Create New Exam"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Exam Title *
            </label>

            <input
              type="text"
              required
              value={formData.title}
              onChange={(e)=>setFormData({...formData,title:e.target.value})}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          {/* Grid Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium mb-1">Subject *</label>

              <select
                required
                value={formData.subject}
                onChange={(e)=>setFormData({...formData,subject:e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Select Subject</option>
                {subjects.map((s)=>(
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Class */}
            <div>
              <label className="block text-sm font-medium mb-1">Class *</label>

              <select
                value={formData.grade}
                onChange={(e)=>setFormData({...formData,grade:e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              >
                {grades.map((g)=>(
                  <option key={g}>{g}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium mb-1">Date *</label>

              <input
                type="date"
                required
                value={formData.date}
                onChange={(e)=>setFormData({...formData,date:e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium mb-1">Duration *</label>

              <input
                type="number"
                min="1"
                value={formData.duration}
                onChange={(e)=>setFormData({...formData,duration:e.target.value})}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

          </div>

          {/* Total Marks */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Total Marks *
            </label>

            <input
              type="number"
              min="1"
              value={formData.totalMarks}
              onChange={(e)=>setFormData({...formData,totalMarks:e.target.value})}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Instructions
            </label>

            <textarea
              rows={3}
              value={formData.instructions}
              onChange={(e)=>setFormData({...formData,instructions:e.target.value})}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4">

            <button
              type="button"
              onClick={()=>{setShowModal(false);resetForm();}}
              className="px-4 py-2 border rounded-lg"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="px-4 py-2 bg-[#002366] text-white rounded-lg"
            >
              {editingExam ? "Update" : "Create"}
            </button>

          </div>

        </form>
      </Modal>
    </div>
  );
};

export default Exams;