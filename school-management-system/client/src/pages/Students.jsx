import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';
import { 
  getStudents, 
  createStudent, 
  updateStudent, 
  deleteStudent,
  getStudentPortalProfiles,
  updateStudentPortalProfile,
  promoteStudentPortalProfile,
} from '../services/api';

const formClasses = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];

const normalizeStudent = (student = {}) => {
  const resolvedId = student.id || student._id || student.studentId || '';
  const className = student.className || student.class || '';
  const sectionName = student.sectionName || student.section || '';
  const parentName = student.parentName || student.guardianName || '';
  const phone = student.phone || student.parentPhone || student.guardianPhone || '';

  return {
    ...student,
    _id: String(resolvedId),
    id: String(resolvedId),
    studentId: String(student.studentId || resolvedId),
    class: className,
    className,
    section: sectionName,
    sectionName,
    parentName,
    guardianName: parentName,
    phone,
    guardianPhone: student.guardianPhone || student.parentPhone || '',
  };
};

const normalizePortalProfile = (profile = {}) => {
  const profileId = profile.portalProfileId || profile.id || profile._id || '';

  return {
    ...profile,
    _id: String(profileId),
    id: String(profileId),
    portalProfileId: Number(profile.portalProfileId || profileId),
    fullName: profile.fullName || '',
    email: profile.email || '',
    phone: profile.phone || '',
    admissionNumber: profile.admissionNumber || '',
    rollNumber: profile.rollNumber || '',
    class: profile.className || profile.class || '',
    className: profile.className || profile.class || '',
    section: profile.sectionName || profile.section || '',
    sectionName: profile.sectionName || profile.section || '',
    guardianName: profile.guardianName || profile.parentName || '',
    guardianPhone: profile.guardianPhone || profile.parentPhone || '',
    guardianRelation: profile.guardianRelation || 'Guardian',
    bloodGroup: profile.bloodGroup || '',
    notes: profile.profileNote || profile.notes || '',
    hasLinkedStudentRecord: profile.hasLinkedStudentRecord === true,
    linkedStudentId: profile.linkedStudentId || null,
  };
};

const formatDisplayDate = (value) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getPortalProfileMissingFields = (profile = {}) => {
  const requiredFields = [
    ['fullName', 'full name'],
    ['email', 'email'],
    ['class', 'class'],
    ['section', 'section'],
    ['rollNumber', 'roll number'],
  ];

  return requiredFields
    .filter(([key]) => !String(profile[key] || '').trim())
    .map(([, label]) => label);
};

const Students = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [showPortalProfileModal, setShowPortalProfileModal] = useState(false);
  const [editingPortalProfile, setEditingPortalProfile] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [availableClasses, setAvailableClasses] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 10 });
  const [portalProfiles, setPortalProfiles] = useState([]);
  const [portalProfilesLoading, setPortalProfilesLoading] = useState(false);
  const [portalProfilesError, setPortalProfilesError] = useState('');
  const [promotingProfileId, setPromotingProfileId] = useState(null);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    class: 'Class 10',
    section: 'A',
    rollNumber: '',
    dateOfBirth: '',
    gender: '',
    address: {
      street: '',
      city: '',
      state: '',
      pincode: ''
    },
    guardianName: '',
    guardianPhone: '',
    guardianRelation: 'Father',
    bloodGroup: '',
    password: ''
  });

  const [portalProfileFormData, setPortalProfileFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    admissionNumber: '',
    rollNumber: '',
    class: '',
    section: '',
    dateOfBirth: '',
    gender: '',
    guardianName: '',
    guardianPhone: '',
    guardianRelation: 'Guardian',
    bloodGroup: '',
    notes: '',
    isActive: true,
  });

  useEffect(() => {
    fetchStudents();
    if (isAdmin) {
      fetchPortalProfiles();
    } else {
      setPortalProfiles([]);
      setPortalProfilesError('');
    }
  }, [pagination.page, pagination.limit, searchTerm, filterClass, isAdmin]);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await getStudents(pagination.page, pagination.limit, searchTerm, filterClass);
      if (import.meta.env.DEV) {
        console.debug('[students] list API response', response?.data);
      }

      if (!Array.isArray(response?.data?.students)) {
        throw new Error('Students API returned an invalid response');
      }

      setStudents(response.data.students.map(normalizeStudent));
      setAvailableClasses(
        Array.isArray(response?.data?.availableClasses)
          ? response.data.availableClasses.filter(Boolean)
          : []
      );

      if (response?.data?.pagination) {
        setPagination((prev) => ({
          ...prev,
          ...response.data.pagination,
          page: Number(response.data.pagination.page) || prev.page,
          pages: Number(response.data.pagination.pages) || prev.pages,
          total: Number(response.data.pagination.total) || 0,
          limit: Number(response.data.pagination.limit) || prev.limit,
        }));
      }
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || 'Failed to load students from the server';
      setError(message);
      setStudents([]);
      setAvailableClasses([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPortalProfiles = async () => {
    if (!isAdmin) {
      return;
    }

    try {
      setPortalProfilesLoading(true);
      setPortalProfilesError('');
      const response = await getStudentPortalProfiles({
        search: searchTerm || undefined,
        onlyPending: true,
      });

      const profiles = Array.isArray(response?.data?.profiles)
        ? response.data.profiles.map(normalizePortalProfile)
        : [];

      setPortalProfiles(
        filterClass
          ? profiles.filter((profile) => !profile.class || profile.class === filterClass)
          : profiles
      );
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || 'Failed to load student portal profiles';
      setPortalProfiles([]);
      setPortalProfilesError(message);
    } finally {
      setPortalProfilesLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingStudent) {
        await updateStudent(editingStudent._id, formData);
        toast.success('Student updated successfully');
      } else {
        await createStudent(formData);
        toast.success('Student created successfully');
      }
      setShowModal(false);
      resetForm();
      fetchStudents();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this student?')) return;
    try {
      await deleteStudent(id);
      toast.success('Student deleted successfully');
      fetchStudents();
    } catch (error) {
      toast.error('Failed to delete student');
    }
  };

  const handlePortalProfileSubmit = async (e) => {
    e.preventDefault();
    if (!editingPortalProfile?.portalProfileId) {
      return;
    }

    try {
      await updateStudentPortalProfile(editingPortalProfile.portalProfileId, portalProfileFormData);
      toast.success('Student portal profile updated successfully');
      setShowPortalProfileModal(false);
      resetPortalProfileForm();
      fetchPortalProfiles();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update student portal profile');
    }
  };

  const handlePromotePortalProfile = async (profile) => {
    if (!profile?.portalProfileId) {
      return;
    }

    const missingFields = getPortalProfileMissingFields(profile);
    if (missingFields.length > 0) {
      toast.error(`Complete the profile before promotion: ${missingFields.join(', ')}`);
      return;
    }

    const confirmed = window.confirm(
      `Promote ${profile.fullName || 'this student'} into a master student record?`
    );
    if (!confirmed) {
      return;
    }

    try {
      setPromotingProfileId(profile.portalProfileId);
      const response = await promoteStudentPortalProfile(profile.portalProfileId);
      toast.success(response?.data?.message || 'Student portal profile promoted successfully');
      if (editingPortalProfile?.portalProfileId === profile.portalProfileId) {
        setShowPortalProfileModal(false);
        resetPortalProfileForm();
      }
      await Promise.all([fetchStudents(), fetchPortalProfiles()]);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to promote portal profile');
    } finally {
      setPromotingProfileId(null);
    }
  };

  const resetForm = () => {
    setFormData({
      fullName: '',
      email: '',
      phone: '',
      class: 'Class 10',
      section: 'A',
      rollNumber: '',
      dateOfBirth: '',
      gender: '',
      address: {
        street: '',
        city: '',
        state: '',
        pincode: ''
      },
      guardianName: '',
      guardianPhone: '',
      guardianRelation: 'Father',
      bloodGroup: '',
      password: ''
    });
    setEditingStudent(null);
  };

  const resetPortalProfileForm = () => {
    setPortalProfileFormData({
      fullName: '',
      email: '',
      phone: '',
      admissionNumber: '',
      rollNumber: '',
      class: '',
      section: '',
      dateOfBirth: '',
      gender: '',
      guardianName: '',
      guardianPhone: '',
      guardianRelation: 'Guardian',
      bloodGroup: '',
      notes: '',
      isActive: true,
    });
    setEditingPortalProfile(null);
  };

  const openEditModal = (student) => {
    setEditingStudent(student);
    const address = typeof student.address === 'object' ? student.address : { street: student.address || '', city: '', state: '', pincode: '' };
    setFormData({
      fullName: student.fullName || '',
      email: student.email || '',
      phone: student.phone || '',
      class: student.class || 'Class 10',
      section: student.section || 'A',
      rollNumber: student.rollNumber || '',
      dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split('T')[0] : '',
      gender: student.gender || '',
      address: address,
      guardianName: student.guardianName || '',
      guardianPhone: student.guardianPhone || '',
      guardianRelation: student.guardianRelation || 'Father',
      bloodGroup: student.bloodGroup || '',
      password: ''
    });
    setShowModal(true);
  };

  const openPortalProfileModal = (profile) => {
    setEditingPortalProfile(profile);
    setPortalProfileFormData({
      fullName: profile.fullName || '',
      email: profile.email || '',
      phone: profile.phone || '',
      admissionNumber: profile.admissionNumber || '',
      rollNumber: profile.rollNumber || '',
      class: profile.class || '',
      section: profile.section || '',
      dateOfBirth: profile.dateOfBirth ? new Date(profile.dateOfBirth).toISOString().split('T')[0] : '',
      gender: profile.gender || '',
      guardianName: profile.guardianName || '',
      guardianPhone: profile.guardianPhone || '',
      guardianRelation: profile.guardianRelation || 'Guardian',
      bloodGroup: profile.bloodGroup || '',
      notes: profile.notes || '',
      isActive: profile.isActive !== false,
    });
    setShowPortalProfileModal(true);
  };

  const columns = [
    { key: 'rollNumber', header: 'Roll No', width: '100px' },
    {
      key: 'fullName',
      header: 'Name',
      render: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/students/${row.id || row._id}`)}
          className="group inline-flex items-center gap-1 font-semibold text-[#0b2a66] hover:text-[#1d56c3] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2a66] focus-visible:ring-offset-2 rounded"
          title="View student details"
        >
          <span className="border-b border-transparent group-hover:border-current transition-colors">
            {row.fullName}
          </span>
        </button>
      )
    },
    { key: 'class', header: 'Class' },
    { key: 'section', header: 'Section', width: '80px' },
    {
      key: 'parentName',
      header: 'Parent Name',
      render: (row) => row.parentName || row.guardianName || '-'
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row) => row.phone || row.parentPhone || row.guardianPhone || '-'
    },
    ...(isAdmin
      ? [{
          key: 'actions',
          header: 'Actions',
          width: '120px',
          render: (row) => (
            <div className="flex items-center gap-2">
              <button
                onClick={() => openEditModal(row)}
                className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"
                title="Edit"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(row._id)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )
        }]
      : [])
  ];

  const portalProfileColumns = [
    {
      key: 'fullName',
      header: 'Portal Account',
      render: (row) => (
        <div>
          <p className="font-semibold text-gray-900">{row.fullName || '-'}</p>
          <p className="text-xs text-gray-500">{row.email || '-'}</p>
        </div>
      ),
    },
    {
      key: 'class',
      header: 'Class / Section',
      render: (row) => (
        <span>{row.class ? `${row.class}${row.section ? ` - ${row.section}` : ''}` : '-'}</span>
      ),
    },
    {
      key: 'guardianName',
      header: 'Guardian',
      render: (row) => (
        <div>
          <p>{row.guardianName || '-'}</p>
          <p className="text-xs text-gray-500">{row.guardianPhone || '-'}</p>
        </div>
      ),
    },
    {
      key: 'notes',
      header: 'Portal Note',
      render: (row) => (
        <p className="max-w-xs text-sm text-gray-600">{row.notes || '-'}</p>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (row) => formatDisplayDate(row.updatedAt),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '220px',
      render: (row) => {
        const missingFields = getPortalProfileMissingFields(row);
        const canPromote = missingFields.length === 0;
        const isPromoting = promotingProfileId === row.portalProfileId;

        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openPortalProfileModal(row)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
            >
              <Edit className="h-4 w-4" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => handlePromotePortalProfile(row)}
              disabled={!canPromote || isPromoting}
              title={canPromote ? 'Create master student record' : `Missing: ${missingFields.join(', ')}`}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                canPromote && !isPromoting
                  ? 'bg-[#002366] text-white hover:bg-[#001a4d]'
                  : 'cursor-not-allowed bg-gray-100 text-gray-400'
              }`}
            >
              {isPromoting ? 'Promoting...' : 'Promote'}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Students</h1>
        {isAdmin && (
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Student
          </button>
        )}
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, or roll number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
          </div>
          <div className="w-48">
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              <option value="">All Classes</option>
              {availableClasses.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Data Table */}
      {loading ? (
        <LoadingSpinner text="Loading students..." />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <p className="font-semibold">Unable to load students</p>
          <p className="text-sm">{error}</p>
          <button
            type="button"
            onClick={fetchStudents}
            className="mt-3 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          title="No Students Found"
          description="There are no students in the system yet. Add your first student to get started."
          action={() => { resetForm(); setShowModal(true); }}
          actionLabel="Add Student"
        />
      ) : (
        <DataTable
          columns={columns}
          data={students}
          loading={loading}
          pagination={pagination}
          onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
          searchPlaceholder="Search students..."
        />
      )}

      {isAdmin && (
        <div className="mt-8 space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
              <div>
                <h2 className="text-lg font-semibold text-amber-900">Pending Student Portal Profiles</h2>
                <p className="mt-1 text-sm text-amber-800">
                  These student logins can access the portal, but they do not have a full student master record yet.
                  You can update their class, section, admission, and guardian details here so the portal shows meaningful data.
                </p>
              </div>
            </div>
          </div>

          {portalProfilesError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              <p className="font-semibold">Unable to load student portal profiles</p>
              <p className="text-sm">{portalProfilesError}</p>
              <button
                type="button"
                onClick={fetchPortalProfiles}
                className="mt-3 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          ) : portalProfilesLoading ? (
            <LoadingSpinner text="Loading pending student portal profiles..." />
          ) : portalProfiles.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
              No pending student portal profiles were found for the current search.
            </div>
          ) : (
            <DataTable
              columns={portalProfileColumns}
              data={portalProfiles}
              loading={portalProfilesLoading}
            />
          )}
        </div>
      )}

      {/* Add/Edit Student Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingStudent ? 'Edit Student' : 'Add New Student'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Personal Information */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3 pb-2 border-b">Personal Information</h4>
          </div>
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
                Roll Number *
              </label>
              <input
                type="text"
                required
                value={formData.rollNumber}
                onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Class *
              </label>
              <select
                required
                value={formData.class}
                onChange={(e) => setFormData({ ...formData, class: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                {formClasses.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Section *
              </label>
              <select
                required
                value={formData.section}
                onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                <option value="A">Section A</option>
                <option value="B">Section B</option>
                <option value="C">Section C</option>
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
          </div>

          {/* Guardian Information */}
          <div className="pt-4">
            <h4 className="font-medium text-gray-900 mb-3 pb-2 border-b">Guardian Information</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Guardian Name
              </label>
              <input
                type="text"
                value={formData.guardianName}
                onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Guardian Phone
              </label>
              <input
                type="tel"
                value={formData.guardianPhone}
                onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Relation
              </label>
              <select
                value={formData.guardianRelation}
                onChange={(e) => setFormData({ ...formData, guardianRelation: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                <option value="Father">Father</option>
                <option value="Mother">Mother</option>
                <option value="Guardian">Guardian</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Blood Group
              </label>
              <select
                value={formData.bloodGroup}
                onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                <option value="">Select</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
              </select>
            </div>
          </div>

          {/* Address */}
          <div className="pt-4">
            <h4 className="font-medium text-gray-900 mb-3 pb-2 border-b">Address</h4>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Street Address
            </label>
            <textarea
              value={formData.address.street}
              onChange={(e) => setFormData({ ...formData, address: { ...formData.address, street: e.target.value } })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                type="text"
                value={formData.address.city}
                onChange={(e) => setFormData({ ...formData, address: { ...formData.address, city: e.target.value } })}
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
                onChange={(e) => setFormData({ ...formData, address: { ...formData.address, state: e.target.value } })}
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
                onChange={(e) => setFormData({ ...formData, address: { ...formData.address, pincode: e.target.value } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
          </div>

          {/* Password (only for new student) */}
          {!editingStudent && (
            <div className="pt-4">
              <h4 className="font-medium text-gray-900 mb-3 pb-2 border-b">Login Credentials</h4>
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
                  placeholder="Enter password for student login"
                />
              </div>
            </div>
          )}

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
              {editingStudent ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showPortalProfileModal}
        onClose={() => { setShowPortalProfileModal(false); resetPortalProfileForm(); }}
        title="Edit Student Portal Profile"
        size="lg"
      >
        <form onSubmit={handlePortalProfileSubmit} className="space-y-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
            This updates the student portal profile used when a student login exists without a full student master record.
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={portalProfileFormData.fullName}
                onChange={(e) => setPortalProfileFormData({ ...portalProfileFormData, fullName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={portalProfileFormData.email}
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={portalProfileFormData.phone}
                onChange={(e) => setPortalProfileFormData({ ...portalProfileFormData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admission Number</label>
              <input
                type="text"
                value={portalProfileFormData.admissionNumber}
                onChange={(e) => setPortalProfileFormData({ ...portalProfileFormData, admissionNumber: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Roll Number</label>
              <input
                type="text"
                value={portalProfileFormData.rollNumber}
                onChange={(e) => setPortalProfileFormData({ ...portalProfileFormData, rollNumber: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
              <select
                value={portalProfileFormData.class}
                onChange={(e) => setPortalProfileFormData({ ...portalProfileFormData, class: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                <option value="">Select Class</option>
                {formClasses.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
              <select
                value={portalProfileFormData.section}
                onChange={(e) => setPortalProfileFormData({ ...portalProfileFormData, section: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                <option value="">Select Section</option>
                <option value="A">Section A</option>
                <option value="B">Section B</option>
                <option value="C">Section C</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
              <input
                type="date"
                value={portalProfileFormData.dateOfBirth}
                onChange={(e) => setPortalProfileFormData({ ...portalProfileFormData, dateOfBirth: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
              <select
                value={portalProfileFormData.gender}
                onChange={(e) => setPortalProfileFormData({ ...portalProfileFormData, gender: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guardian Name</label>
              <input
                type="text"
                value={portalProfileFormData.guardianName}
                onChange={(e) => setPortalProfileFormData({ ...portalProfileFormData, guardianName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guardian Phone</label>
              <input
                type="tel"
                value={portalProfileFormData.guardianPhone}
                onChange={(e) => setPortalProfileFormData({ ...portalProfileFormData, guardianPhone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guardian Relation</label>
              <select
                value={portalProfileFormData.guardianRelation}
                onChange={(e) => setPortalProfileFormData({ ...portalProfileFormData, guardianRelation: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                <option value="Father">Father</option>
                <option value="Mother">Mother</option>
                <option value="Guardian">Guardian</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Blood Group</label>
              <select
                value={portalProfileFormData.bloodGroup}
                onChange={(e) => setPortalProfileFormData({ ...portalProfileFormData, bloodGroup: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                <option value="">Select</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Portal Note</label>
            <textarea
              rows={3}
              value={portalProfileFormData.notes}
              onChange={(e) => setPortalProfileFormData({ ...portalProfileFormData, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={portalProfileFormData.isActive}
              onChange={(e) => setPortalProfileFormData({ ...portalProfileFormData, isActive: e.target.checked })}
              className="rounded border-gray-300 text-[#002366] focus:ring-[#002366]"
            />
            Profile active
          </label>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => { setShowPortalProfileModal(false); resetPortalProfileForm(); }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d]"
            >
              Save Portal Profile
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Students;

