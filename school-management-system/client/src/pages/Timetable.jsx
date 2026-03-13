import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Copy, Clock, BookOpen, User, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';
import { 
  getTimetables, 
  getTimetableByClass,
  createTimetable, 
  updateTimetable, 
  deleteTimetable,
  copyTimetable,
  getSubjects,
  getTeachers
} from '../services/api';

// Subject colors for visual distinction
const subjectColors = {
  'Mathematics': 'bg-blue-100 border-l-4 border-blue-500',
  'Science': 'bg-green-100 border-l-4 border-green-500',
  'English': 'bg-purple-100 border-l-4 border-purple-500',
  'Hindi': 'bg-orange-100 border-l-4 border-orange-500',
  'History': 'bg-yellow-100 border-l-4 border-yellow-500',
  'Geography': 'bg-teal-100 border-l-4 border-teal-500',
  'Physics': 'bg-cyan-100 border-l-4 border-cyan-500',
  'Chemistry': 'bg-indigo-100 border-l-4 border-indigo-500',
  'Biology': 'bg-emerald-100 border-l-4 border-emerald-500',
  'Computer': 'bg-slate-100 border-l-4 border-slate-500',
  'Art': 'bg-pink-100 border-l-4 border-pink-500',
  'Music': 'bg-rose-100 border-l-4 border-rose-500',
  'Physical Education': 'bg-lime-100 border-l-4 border-lime-500',
};

const getSubjectColor = (subjectName) => {
  if (!subjectName) return 'bg-gray-50';
  const key = Object.keys(subjectColors).find(k => 
    subjectName.toLowerCase().includes(k.toLowerCase())
  );
  return subjectColors[key] || 'bg-gray-50';
};

const Timetable = () => {
  const { isAdmin, isTeacher } = useAuth();
  const [timetables, setTimetables] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [editingTimetable, setEditingTimetable] = useState(null);
  const [selectedClass, setSelectedClass] = useState('Class 1');
  const [selectedSection, setSelectedSection] = useState('A');

  const [formData, setFormData] = useState({
    class: 'Class 1',
    section: 'A',
    academicYear: '2024-2025',
    day: 'Monday',
    periods: []
  });

  const [copyData, setCopyData] = useState({
    sourceClass: 'Class 10',
    sourceSection: 'A',
    targetClass: 'Class 11',
    targetSection: 'A',
    academicYear: '2024-2025'
  });

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const defaultPeriods = [
    { periodNumber: 1, startTime: '08:00', endTime: '08:45', label: 'Period 1' },
    { periodNumber: 2, startTime: '08:45', endTime: '09:30', label: 'Period 2' },
    { periodNumber: 3, startTime: '09:30', endTime: '10:15', label: 'Period 3' },
    { periodNumber: 4, startTime: '10:15', endTime: '11:00', label: 'Period 4' },
    { periodNumber: 5, startTime: '11:00', endTime: '11:45', label: 'Period 5' },
    { periodNumber: 6, startTime: '11:45', endTime: '12:30', label: 'Period 6' },
    { periodNumber: 7, startTime: '12:30', endTime: '13:15', label: 'Period 7' },
    { periodNumber: 8, startTime: '13:15', endTime: '14:00', label: 'Period 8' }
  ];

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchTimetable();
  }, [selectedClass, selectedSection]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [subjectsRes, teachersRes] = await Promise.all([
        getSubjects(),
        getTeachers()
      ]);

      const subjectsData = subjectsRes?.data?.subjects;
      const teachersData = teachersRes?.data?.teachers;
      if (!Array.isArray(subjectsData) || !Array.isArray(teachersData)) {
        throw new Error('Invalid timetable dependencies response');
      }

      setSubjects(subjectsData);
      setTeachers(teachersData);
      setLoadError('');
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setLoadError('Unable to load live timetable dependencies from the backend API.');
      setSubjects([]);
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTimetable = async () => {
    try {
      setLoading(true);
      const response = await getTimetableByClass(selectedClass, { 
        section: selectedSection 
      });
      const timetableData = response?.data?.timetables;
      if (!Array.isArray(timetableData)) {
        throw new Error('Invalid timetable response');
      }
      setTimetables(timetableData);
      setLoadError('');
    } catch (error) {
      console.error('Failed to fetch timetable:', error);
      toast.error('Failed to fetch timetable');
      setLoadError('Unable to load live timetable data from the backend API.');
      setTimetables([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTimetable) {
        await updateTimetable(editingTimetable._id, formData);
        toast.success('Timetable updated successfully');
      } else {
        await createTimetable(formData);
        toast.success('Timetable created successfully');
      }
      setShowModal(false);
      resetForm();
      fetchTimetable();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    }
  };

  const handleCopy = async (e) => {
    e.preventDefault();
    try {
      await copyTimetable(copyData);
      toast.success('Timetable copied successfully');
      setShowCopyModal(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Copy failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this timetable?')) return;
    try {
      await deleteTimetable(id);
      toast.success('Timetable deleted successfully');
      fetchTimetable();
    } catch (error) {
      toast.error('Failed to delete timetable');
    }
  };

  const resetForm = () => {
    setFormData({
      class: selectedClass,
      section: selectedSection,
      academicYear: '2024-2025',
      day: 'Monday',
      periods: []
    });
    setEditingTimetable(null);
  };

  const openEditModal = (timetable) => {
    setEditingTimetable(timetable);
    setFormData({
      class: timetable.class || selectedClass,
      section: timetable.section || selectedSection,
      academicYear: timetable.academicYear || '2024-2025',
      day: timetable.day || 'Monday',
      periods: (timetable.periods || []).map((period) => ({
        periodNumber: period.periodNumber || 0,
        subject: period.subject?._id || period.subjectId || period.subject || '',
        teacher: period.teacher?._id || period.teacherId || period.teacher || '',
        startTime: period.startTime || '',
        endTime: period.endTime || '',
        roomNumber: period.roomNumber || ''
      }))
    });
    setShowModal(true);
  };

  const addPeriod = () => {
    const newPeriod = {
      periodNumber: formData.periods.length + 1,
      subject: '',
      teacher: '',
      startTime: '',
      endTime: '',
      roomNumber: ''
    };
    setFormData(prev => ({
      ...prev,
      periods: [...prev.periods, newPeriod]
    }));
  };

  const updatePeriod = (index, field, value) => {
    const updatedPeriods = [...formData.periods];
    updatedPeriods[index] = { ...updatedPeriods[index], [field]: value };
    setFormData(prev => ({ ...prev, periods: updatedPeriods }));
  };

  const removePeriod = (index) => {
    const updatedPeriods = formData.periods.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, periods: updatedPeriods }));
  };

  const subjectOptions = Array.from(
    new Map(subjects.map((subject) => [subject.subjectId || subject._id, subject])).values()
  );

  const getTimetableForDay = (day) => {
    const timetable = timetables.find(t => t.day === day);
    if (!timetable) return [];
    return timetable.periods || [];
  };

  const classes = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
  const sections = ['A', 'B', 'C'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timetable Management</h1>
          <p className="text-gray-500 text-sm mt-1">Manage class schedules and periods</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowCopyModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Copy className="w-4 h-4" />
              Copy Timetable
            </button>
            <button
              onClick={() => { resetForm(); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Timetable
            </button>
          </div>
        )}
      </div>

      {/* Class Selection */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        {loadError ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366] min-w-[140px]"
            >
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366] min-w-[140px]"
            >
              {sections.map(s => <option key={s} value={s}>Section {s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner text="Loading timetable..." />
      ) : (
        /* Weekly Timetable Grid */
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-[#002366] to-[#001a4d] text-white">
                <tr>
                  <th className="px-4 py-4 text-left text-xs font-medium uppercase tracking-wider w-32">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Time
                    </div>
                  </th>
                  {days.map(day => (
                    <th key={day} className="px-4 py-4 text-left text-xs font-medium uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {day}
                      </div>
                    </th>
                  ))}
                  {isAdmin && <th className="px-4 py-4 text-left text-xs font-medium uppercase tracking-wider w-24">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {defaultPeriods.map((period, periodIndex) => (
                  <tr key={period.periodNumber} className={periodIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-gray-900">Period {period.periodNumber}</div>
                      <div className="text-xs text-gray-500">{period.startTime} - {period.endTime}</div>
                    </td>
                    {days.map(day => {
                      const dayTimetable = getTimetableForDay(day);
                      const periodData = dayTimetable.find(p => p.periodNumber === period.periodNumber);
                      const subjectName = periodData?.subject?.name || periodData?.subject || '';
                      const teacherName = periodData?.teacher?.fullName || periodData?.teacher || '';
                      
                      return (
                        <td key={`${day}-${period.periodNumber}`} className="px-2 py-2">
                          {periodData ? (
                            <div className={`p-2 rounded-lg ${getSubjectColor(subjectName)}`}>
                              <div className="flex items-center gap-2 mb-1">
                                <BookOpen className="w-3 h-3 text-gray-600" />
                                <span className="text-sm font-medium text-gray-900">
                                  {subjectName}
                                </span>
                              </div>
                              {teacherName && (
                                <div className="flex items-center gap-1">
                                  <User className="w-3 h-3 text-gray-500" />
                                  <span className="text-xs text-gray-600">
                                    {teacherName}
                                  </span>
                                </div>
                              )}
                              {periodData.roomNumber && (
                                <div className="text-xs text-gray-500 mt-1">
                                  Room: {periodData.roomNumber}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center">
                              <span className="text-gray-300">-</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    {isAdmin && periodIndex === 0 && (
                      <td className="px-4 py-3">
                        {timetables.length > 0 ? (
                          <div className="flex gap-1">
                            {timetables.slice(0, 1).map(timetable => (
                              <button
                                key={timetable._id}
                                onClick={() => openEditModal(timetable)}
                                className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 bg-white rounded-xl shadow-sm border p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Subject Legend</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(subjectColors).slice(0, 8).map(([subject, color]) => (
            <div key={subject} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${color}`}>
              <span className="text-xs font-medium text-gray-700">{subject}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add/Edit Timetable Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingTimetable ? 'Edit Timetable' : 'Add Timetable'}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
              <select
                required
                value={formData.class}
                onChange={(e) => setFormData({ ...formData, class: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Section *</label>
              <select
                required
                value={formData.section}
                onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                {sections.map(s => <option key={s} value={s}>Section {s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Day *</label>
              <select
                required
                value={formData.day}
                onChange={(e) => setFormData({ ...formData, day: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                {days.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
              <input
                type="text"
                value={formData.academicYear}
                onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Periods</h3>
              <button
                type="button"
                onClick={addPeriod}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                + Add Period
              </button>
            </div>

            {formData.periods.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Clock className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No periods added. Click "Add Period" to start.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {formData.periods.map((period, index) => (
                  <div key={index} className="flex gap-2 items-start p-3 bg-gray-50 rounded-lg">
                    <div className="w-16">
                      <label className="block text-xs text-gray-500">Period</label>
                      <input
                        type="number"
                        min="1"
                        value={period.periodNumber}
                        onChange={(e) => updatePeriod(index, 'periodNumber', parseInt(e.target.value))}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500">Subject</label>
                      <select
                        value={period.subject || ''}
                        onChange={(e) => updatePeriod(index, 'subject', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      >
                        <option value="">Select Subject</option>
                        {subjectOptions.map(s => (
                          <option key={s.classSubjectId || s._id} value={s.subjectId || s._id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500">Teacher</label>
                      <select
                        value={period.teacher || ''}
                        onChange={(e) => updatePeriod(index, 'teacher', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      >
                        <option value="">Select Teacher</option>
                        {teachers.map(t => (
                          <option key={t._id} value={t._id}>{t.fullName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-20">
                      <label className="block text-xs text-gray-500">Start</label>
                      <input
                        type="time"
                        value={period.startTime || ''}
                        onChange={(e) => updatePeriod(index, 'startTime', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div className="w-20">
                      <label className="block text-xs text-gray-500">End</label>
                      <input
                        type="time"
                        value={period.endTime || ''}
                        onChange={(e) => updatePeriod(index, 'endTime', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div className="w-20">
                      <label className="block text-xs text-gray-500">Room</label>
                      <input
                        type="text"
                        value={period.roomNumber || ''}
                        onChange={(e) => updatePeriod(index, 'roomNumber', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="Room"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removePeriod(index)}
                      className="mt-4 p-1 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
              {editingTimetable ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Copy Timetable Modal */}
      <Modal
        isOpen={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        title="Copy Timetable"
        size="md"
      >
        <form onSubmit={handleCopy} className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg mb-4">
            <p className="text-sm text-blue-800">Copy timetable from one class to another.</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source Class *</label>
              <select
                required
                value={copyData.sourceClass}
                onChange={(e) => setCopyData({ ...copyData, sourceClass: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source Section *</label>
              <select
                required
                value={copyData.sourceSection}
                onChange={(e) => setCopyData({ ...copyData, sourceSection: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                {sections.map(s => <option key={s} value={s}>Section {s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Class *</label>
              <select
                required
                value={copyData.targetClass}
                onChange={(e) => setCopyData({ ...copyData, targetClass: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Section *</label>
              <select
                required
                value={copyData.targetSection}
                onChange={(e) => setCopyData({ ...copyData, targetSection: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                {sections.map(s => <option key={s} value={s}>Section {s}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => setShowCopyModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Copy Timetable
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Timetable;

