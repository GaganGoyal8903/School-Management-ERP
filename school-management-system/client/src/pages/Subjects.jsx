import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { 
  getSubjects, 
  createSubject, 
  updateSubject, 
  deleteSubject,
  getTeachers
} from '../services/api';

const Subjects = () => {
  const { isAdmin, isTeacher } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    grade: 'Class 10',
    description: '',
    teacher: ''
  });

  useEffect(() => {
    fetchData();
  }, [searchTerm]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [subjectsRes, teachersRes] = await Promise.all([
        getSubjects(searchTerm ? { search: searchTerm } : undefined),
        getTeachers()
      ]);
      const subjectsData = subjectsRes?.data?.subjects;
      const teachersData = teachersRes?.data?.teachers;

      if (!Array.isArray(subjectsData) || !Array.isArray(teachersData)) {
        throw new Error('Invalid subjects response');
      }

      setSubjects(subjectsData);
      setTeachers(teachersData);
      setLoadError('');
    } catch (error) {
      toast.error('Failed to fetch data');
      setLoadError('Unable to load live subject data from the backend API.');
      setSubjects([]);
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        teacher: formData.teacher || undefined
      };
      
      if (editingSubject) {
        await updateSubject(editingSubject._id, payload);
        toast.success('Subject updated successfully');
      } else {
        await createSubject(payload);
        toast.success('Subject created successfully');
      }
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this subject?')) return;
    try {
      await deleteSubject(id);
      toast.success('Subject deleted successfully');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete subject');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      grade: 'Class 10',
      description: '',
      teacher: ''
    });
    setEditingSubject(null);
  };

  const openEditModal = (subject) => {
    setEditingSubject(subject);
    setFormData({
      name: subject.name || '',
      grade: subject.grade || 'Class 10',
      description: subject.description || '',
      teacher: subject.teacher?._id || subject.teacher || ''
    });
    setShowModal(true);
  };

  const columns = [
    { key: 'name', header: 'Subject Name' },
    { key: 'grade', header: 'Class' },
    { 
      key: 'teacher', 
      header: 'Teacher',
      render: (row) => row.teacher?.fullName || <span className="text-gray-400">Not Assigned</span>
    },
    { 
      key: 'description', 
      header: 'Description',
      render: (row) => row.description || <span className="text-gray-400">-</span>
    },
    { 
      key: 'actions', 
      header: 'Actions', 
      width: '100px',
      render: (row) => (
        <div className="flex items-center gap-2">
          {(isAdmin || isTeacher) && (
            <button
              onClick={() => openEditModal(row)}
              className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"
            >
              <Edit className="w-4 h-4" />
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => handleDelete(row._id)}
              className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Subjects</h1>
        {(isAdmin || isTeacher) && (
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d]"
          >
            <Plus className="w-4 h-4" />
            Add Subject
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={subjects}
        loading={loading}
        onSearch={setSearchTerm}
        searchPlaceholder="Search subjects..."
      />
      {loadError ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingSubject ? 'Edit Subject' : 'Add New Subject'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              placeholder="e.g., Mathematics, Science"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Class *
            </label>
            <select
              required
              value={formData.grade}
              onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              <option value="Class 1">Class 1</option>
              <option value="Class 2">Class 2</option>
              <option value="Class 3">Class 3</option>
              <option value="Class 4">Class 4</option>
              <option value="Class 5">Class 5</option>
              <option value="Class 6">Class 6</option>
              <option value="Class 7">Class 7</option>
              <option value="Class 8">Class 8</option>
              <option value="Class 9">Class 9</option>
              <option value="Class 10">Class 10</option>
              <option value="Class 11">Class 11</option>
              <option value="Class 12">Class 12</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assign Teacher
            </label>
            <select
              value={formData.teacher}
              onChange={(e) => setFormData({ ...formData, teacher: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              <option value="">Select Teacher</option>
              {teachers.map(teacher => (
                <option key={teacher._id} value={teacher._id}>
                  {teacher.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              placeholder="Brief description of the subject"
            />
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
              {editingSubject ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Subjects;

