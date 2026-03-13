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

const normalizeSubjectOption = (subject = {}) => ({
  id: String(subject._id || subject.id || subject.classSubjectId || subject.subjectId || ''),
  classSubjectId: String(subject.classSubjectId || subject._id || subject.id || ''),
  subjectId: String(subject.subjectId || subject.id || subject._id || ''),
  name: subject.name || subject.subjectName || '',
  className: subject.className || subject.grade || '',
  sectionName: subject.sectionName || '',
});

const normalizeTeacherSubject = (subject = {}) => ({
  _id: String(subject._id || subject.id || subject.classSubjectId || subject.subjectId || ''),
  id: String(subject.id || subject._id || subject.classSubjectId || subject.subjectId || ''),
  classSubjectId: String(subject.classSubjectId || subject._id || subject.id || ''),
  subjectId: String(subject.subjectId || subject.id || subject._id || ''),
  name: subject.name || subject.subjectName || '',
  subjectName: subject.subjectName || subject.name || '',
  className: subject.className || '',
  sectionName: subject.sectionName || '',
});

const createEmptyFormData = () => ({
  fullName: '',
  email: '',
  phone: '',
  gender: '',
  dateOfBirth: '',
  designation: '',
  department: '',
  qualification: '',
  experience: '',
  joiningDate: '',
  address: {
    street: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
    country: '',
  },
  subjects: [],
});

const normalizeTeacher = (teacher = {}) => {
  const normalizedSubjects = Array.isArray(teacher.subjects)
    ? teacher.subjects.map(normalizeTeacherSubject).filter((subject) => subject.id)
    : [];
  const fallbackSubjects = teacher.subjectName
    ? [normalizeTeacherSubject({
        id: teacher.subjectId,
        subjectId: teacher.subjectId,
        name: teacher.subjectName,
      })]
    : [];
  const address = teacher.address && typeof teacher.address === 'object' ? teacher.address : {};

  return {
    ...teacher,
    _id: String(teacher._id || teacher.id || teacher.userId || ''),
    id: String(teacher.id || teacher._id || teacher.userId || ''),
    teacherId: String(teacher.teacherId || teacher.dbId || ''),
    fullName: teacher.fullName || '',
    email: teacher.email || '',
    phone: teacher.phone || '',
    gender: teacher.gender || '',
    dateOfBirth: teacher.dateOfBirth ? new Date(teacher.dateOfBirth).toISOString().split('T')[0] : '',
    designation: teacher.designation || '',
    department: teacher.department || '',
    qualification: teacher.qualification || '',
    experience:
      teacher.experience === null || teacher.experience === undefined || teacher.experience === ''
        ? ''
        : Number(teacher.experience),
    experienceYears:
      teacher.experienceYears === null || teacher.experienceYears === undefined || teacher.experienceYears === ''
        ? ''
        : Number(teacher.experienceYears),
    joiningDate: teacher.joiningDate ? new Date(teacher.joiningDate).toISOString().split('T')[0] : '',
    address: {
      street: address.street || address.addressLine1 || '',
      line2: address.line2 || address.addressLine2 || '',
      city: address.city || '',
      state: address.state || '',
      pincode: address.pincode || address.postalCode || '',
      country: address.country || '',
    },
    subjectId: teacher.subjectId || '',
    subjectName: teacher.subjectName || '',
    subjects: normalizedSubjects.length ? normalizedSubjects : fallbackSubjects,
  };
};

const Teachers = () => {
  const { isAdmin } = useAuth();
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState(createEmptyFormData());

  useEffect(() => {
    fetchTeachers();
  }, [searchTerm]);

  useEffect(() => {
    fetchSubjects();
  }, []);

  const fetchTeachers = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await getTeachers({
        page: 1,
        limit: 10000,
        search: searchTerm,
        sortBy: 'fullName',
        sortOrder: 'asc',
      });
      if (import.meta.env.DEV) {
        console.debug('[teachers] list API response', response?.data);
      }

      if (!Array.isArray(response?.data?.teachers)) {
        throw new Error('Teachers API returned an invalid response');
      }

      setTeachers(response.data.teachers.map(normalizeTeacher));
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || 'Failed to load teachers from the server';
      setError(message);
      setTeachers([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubjects = async () => {
    try {
      const response = await getSubjects({ page: 1, limit: 10000 });
      // Safely handle API response - ensure it's always an array
      const subjectsData = response?.data?.subjects || response?.data || [];
      setSubjects(
        Array.isArray(subjectsData)
          ? subjectsData.map(normalizeSubjectOption).filter((subject) => subject.id)
          : []
      );
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
    setFormData(createEmptyFormData());
    setEditingTeacher(null);
  };

  const openEditModal = (teacher) => {
    const normalizedTeacher = normalizeTeacher(teacher);
    setEditingTeacher(normalizedTeacher);
    setFormData({
      fullName: normalizedTeacher.fullName || '',
      email: normalizedTeacher.email || '',
      phone: normalizedTeacher.phone || '',
      gender: normalizedTeacher.gender || '',
      dateOfBirth: normalizedTeacher.dateOfBirth || '',
      designation: normalizedTeacher.designation || '',
      department: normalizedTeacher.department || '',
      qualification: normalizedTeacher.qualification || '',
      experience: normalizedTeacher.experience ?? '',
      joiningDate: normalizedTeacher.joiningDate || '',
      address: normalizedTeacher.address || {
        street: '',
        line2: '',
        city: '',
        state: '',
        pincode: '',
        country: '',
      },
      subjects: normalizedTeacher.subjects?.map((subject) => subject.id || subject._id).filter(Boolean) || [],
    });
    setShowModal(true);
  };

  const handleSubjectChange = (subjectId) => {
    const normalizedSubjectId = String(subjectId || '');
    setFormData(prev => ({
      ...prev,
      subjects: prev.subjects.includes(normalizedSubjectId)
        ? prev.subjects.filter(id => id !== normalizedSubjectId)
        : [...prev.subjects, normalizedSubjectId]
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
          {(row.subjects?.length ? row.subjects : row.subjectName ? [{ name: row.subjectName }] : []).slice(0, 2).map((sub, idx) => (
            <span key={idx} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
              {sub.name || sub.subjectName || '-'}
            </span>
          ))}
          {(row.subjects?.length || 0) > 2 && (
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

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <p className="font-semibold">Unable to load teachers</p>
          <p className="text-sm">{error}</p>
          <button
            type="button"
            onClick={fetchTeachers}
            className="mt-3 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={teachers}
          loading={loading}
          onSearch={setSearchTerm}
          searchPlaceholder="Search teachers..."
        />
      )}

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
                Gender
              </label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date of Birth
              </label>
              <input
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Designation
              </label>
              <input
                type="text"
                value={formData.designation}
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                placeholder="e.g., Senior Teacher"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department
              </label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                placeholder="e.g., Science"
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Joining Date
              </label>
              <input
                type="date"
                value={formData.joiningDate}
                onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address Line 1
              </label>
              <input
                type="text"
                value={formData.address.street}
                onChange={(e) => setFormData({
                  ...formData,
                  address: { ...formData.address, street: e.target.value },
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address Line 2
              </label>
              <input
                type="text"
                value={formData.address.line2}
                onChange={(e) => setFormData({
                  ...formData,
                  address: { ...formData.address, line2: e.target.value },
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                type="text"
                value={formData.address.city}
                onChange={(e) => setFormData({
                  ...formData,
                  address: { ...formData.address, city: e.target.value },
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                State
              </label>
              <input
                type="text"
                value={formData.address.state}
                onChange={(e) => setFormData({
                  ...formData,
                  address: { ...formData.address, state: e.target.value },
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pincode
              </label>
              <input
                type="text"
                value={formData.address.pincode}
                onChange={(e) => setFormData({
                  ...formData,
                  address: { ...formData.address, pincode: e.target.value },
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Country
              </label>
              <input
                type="text"
                value={formData.address.country}
                onChange={(e) => setFormData({
                  ...formData,
                  address: { ...formData.address, country: e.target.value },
                })}
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
                    key={subject.id}
                    className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={formData.subjects.includes(subject.id)}
                      onChange={() => handleSubjectChange(subject.id)}
                      className="w-4 h-4 text-[#002366] rounded focus:ring-[#002366]"
                    />
                    <span className="text-sm">
                      {subject.name}
                      {subject.className ? ` (${subject.className}${subject.sectionName ? ` - ${subject.sectionName}` : ''})` : ''}
                    </span>
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

