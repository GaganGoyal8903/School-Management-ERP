import { useState, useEffect } from 'react';
import { Plus, Trash2, FileText, Download, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { 
  getMaterials, 
  createMaterial, 
  deleteMaterial,
  getSubjects
} from '../services/api';

const Materials = () => {
  const { isAdmin, isTeacher, user } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterGrade, setFilterGrade] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    subject: '',
    grade: 'Class 10',
    description: '',
    fileUrl: '',
    fileName: ''
  });

  useEffect(() => {
    fetchData();
  }, [filterSubject, filterGrade, searchTerm]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [materialsRes, subjectsRes] = await Promise.all([
        getMaterials({ subject: filterSubject, grade: filterGrade, search: searchTerm }),
        getSubjects(filterGrade ? { grade: filterGrade } : undefined)
      ]);
      const materialsData = materialsRes?.data?.materials;
      const subjectsData = subjectsRes?.data?.subjects;

      if (!Array.isArray(materialsData) || !Array.isArray(subjectsData)) {
        throw new Error('Invalid materials response');
      }

      setMaterials(materialsData);
      setSubjects(subjectsData);
      setLoadError('');
    } catch (error) {
      toast.error('Failed to fetch data');
      setLoadError('Unable to load live study materials from the backend API.');
      setMaterials([]);
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await createMaterial({
        ...formData,
        uploadedBy: user.id
      });
      toast.success('Material uploaded successfully');
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Upload failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this material?')) return;
    try {
      await deleteMaterial(id);
      toast.success('Material deleted successfully');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete material');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      subject: '',
      grade: 'Class 10',
      description: '',
      fileUrl: '',
      fileName: ''
    });
  };

  const subjectOptions = Array.from(
    new Map(subjects.map((subject) => [subject.subjectId || subject._id, subject])).values()
  );

  const columns = [
    { key: 'title', header: 'Title' },
    { 
      key: 'subject', 
      header: 'Subject',
      render: (row) => row.subject?.name || row.subject
    },
    { key: 'grade', header: 'Class' },
    { 
      key: 'fileName', 
      header: 'File',
      render: (row) => (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" />
          <span className="text-sm truncate max-w-[150px]">{row.fileName || 'No file'}</span>
        </div>
      )
    },
    { 
      key: 'uploadedBy', 
      header: 'Uploaded By',
      render: (row) => row.uploadedBy?.fullName || 'Unknown'
    },
    { 
      key: 'createdAt', 
      header: 'Date',
      render: (row) => new Date(row.createdAt).toLocaleDateString()
    },
    { 
      key: 'actions', 
      header: 'Actions', 
      width: '120px',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.fileUrl && (
            <a
              href={row.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"
            >
              <Eye className="w-4 h-4" />
            </a>
          )}
          {(isAdmin || isTeacher) && (
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isTeacher ? 'My Study Materials' : 'Study Materials'}</h1>
          {isTeacher ? (
            <p className="mt-1 text-sm text-gray-500">
              Material lists and uploads are now limited to your assigned subjects.
            </p>
          ) : null}
        </div>
        {(isAdmin || isTeacher) && (
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d]"
          >
            <Plus className="w-4 h-4" />
            Upload Material
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              <option value="">All Subjects</option>
              {subjectOptions.map(s => (
                <option key={s.classSubjectId || s._id} value={s.subjectId || s._id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
            <select
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              <option value="">All Classes</option>
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
        </div>
      </div>

      <DataTable
        columns={columns}
        data={materials}
        loading={loading}
        onSearch={setSearchTerm}
        searchPlaceholder="Search materials..."
      />
      {loadError ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title="Upload Study Material"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              placeholder="e.g., Chapter 1 Notes"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Subject *
              </label>
              <select
                required
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                <option value="">Select Subject</option>
                {subjectOptions.map(s => (
                  <option key={s.classSubjectId || s._id} value={s.subjectId || s._id}>{s.name}</option>
                ))}
              </select>
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
              placeholder="Brief description of the material"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                File URL
              </label>
              <input
                type="url"
                value={formData.fileUrl}
                onChange={(e) => setFormData({ ...formData, fileUrl: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                File Name
              </label>
              <input
                type="text"
                value={formData.fileName}
                onChange={(e) => setFormData({ ...formData, fileName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                placeholder="e.g., notes.pdf"
              />
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
              Upload
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Materials;

