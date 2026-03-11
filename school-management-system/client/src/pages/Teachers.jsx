import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { 
  getTeachers, 
  createTeacher, 
  updateTeacher, 
  deleteTeacher,
  getSubjects
} from '../services/api';

const Teachers = () => {
  const { isAdmin } = useAuth();
  const [teachers, setTeachers] = useState([]);
      const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    qualification: '',
    experience: '',
    subjects: []
  });

  useEffect(() => {
    fetchTeachers();
    fetchSubjects();
  }, []);

  const fetchTeachers = async () => {
    try {
      setLoading(true);
      const response = await getTeachers();
      // Handle API response correctly - response.data contains { success, teachers, pagination }
      const teachersData = response?.data?.teachers || response?.data || [];
      setTeachers(Array.isArray(teachersData) ? teachersData : []);
    } catch (error) {
      console.error('Failed to fetch teachers:', error);
      toast.error('Failed to fetch teachers');
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubjects = async () => {
    try {
      const response = await getSubjects();
      // Safely handle API response - ensure it's always an array
      const subjectsData = response?.data?.subjects || response?.data || [];
      setSubjects(Array.isArray(subjectsData) ? subjectsData : []);
    } catch (error) {
      console.error('Failed to fetch subjects');
      setSubjects([]); // Ensure empty array on error
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTeacher) {
        await updateTeacher(editingTeacher._id, formData);
        toast.success('Teacher updated successfully');
      } else {
        await createTeacher(formData);
        toast.success('Teacher created successfully');
      }
      setShowModal(false);
      resetForm();
      fetchTeachers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this teacher?')) return;
    try {
      await deleteTeacher(id);
      toast.success('Teacher deleted successfully');
      fetchTeachers();
    } catch (error) {
      toast.error('Failed to delete teacher');
    }
  };

  const resetForm = () => {
    setFormData({
      fullName: '',
      email: '',
      phone: '',
      qualification: '',
      experience: '',
      subjects: []
    });
    setEditingTeacher(null);
  };

  const openEditModal = (teacher) => {
    setEditingTeacher(teacher);
    setFormData({
      fullName: teacher.fullName || '',
      email: teacher.email || '',
      phone: teacher.phone || '',
      qualification: teacher.qualification || '',
      experience: teacher.experience || '',
      subjects: teacher.subjects?.map(s => s._id || s) || []
    });
    setShowModal(true);
  };

  const handleSubjectChange = (subjectId) => {
    setFormData(prev => ({
      ...prev,
      subjects: prev.subjects.includes(subjectId)
        ? prev.subjects.filter(id => id !== subjectId)
        : [...prev.subjects, subjectId]
    }));
  };

  const columns = [
    { key: 'fullName', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'qualification', header: 'Qualification' },
    { key: 'experience', header: 'Experience (Years)' },
    { 
      key: 'subjects', 
      header: 'Subjects',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.subjects?.slice(0, 2).map((sub, idx) => (
            <span key={idx} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
              {sub.name}
            </span>
          ))}
          {row.subjects?.length > 2 && (
            <span className="text-xs text-gray-500">+{row.subjects.length - 2}</span>
          )}
        </div>
      )
    },
    { 
      key: 'actions', 
      header: 'Actions', 
      width: '100px',
      render: (row) => (
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <button
                onClick={() => openEditModal(row)}
                className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(row._id)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Teachers</h1>
        {isAdmin && (
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d]"
          >
            <Plus className="w-4 h-4" />
            Add Teacher
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={teachers}
        loading={loading}
        onSearch={setSearchTerm}
        searchPlaceholder="Search teachers..."
      />

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingTeacher ? 'Edit Teacher' : 'Add New Teacher'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Qualification *
              </label>
              <input
                type="text"
                required
                value={formData.qualification}
                onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                placeholder="e.g., M.Sc., B.Ed."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Experience (Years) *
              </label>
              <input
                type="number"
                required
                min="0"
                value={formData.experience}
                onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assign Subjects
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {(Array.isArray(subjects) ? subjects : []).map(subject => (
                  <label
                    key={subject._id}
                    className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={formData.subjects.includes(subject._id)}
                      onChange={() => handleSubjectChange(subject._id)}
                      className="w-4 h-4 text-[#002366] rounded focus:ring-[#002366]"
                    />
                    <span className="text-sm">{subject.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => { setShowModal(false); resetForm(); }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d]"
            >
              {editingTeacher ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Teachers;

