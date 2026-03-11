import { useState, useEffect } from 'react';
import { Calendar, Check, X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { 
  getStudents, 
  getAttendance, 
  markAttendance,
  getSubjects 
} from '../services/api';

const Attendance = () => {
  const { isAdmin, isTeacher, user } = useAuth();
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedGrade, setSelectedGrade] = useState('Class 10');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [attendance, setAttendance] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedGrade, selectedDate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [studentsRes, subjectsRes, attendanceRes] = await Promise.all([
        getStudents(1, 100, '', selectedGrade),
        getSubjects(),
        getAttendance({ grade: selectedGrade, date: selectedDate })
      ]);
      
      // Safely handle students array
      const studentsData = studentsRes?.data?.students || studentsRes?.data || [];
      setStudents(Array.isArray(studentsData) ? studentsData : []);
      
      // Safely handle subjects array
      const subjectsData = subjectsRes?.data?.subjects || subjectsRes?.data || [];
      setSubjects(Array.isArray(subjectsData) ? subjectsData : []);
      
      // Initialize attendance with existing records
      const attendanceMap = {};
      const attendanceRecords = attendanceRes?.data || [];
      if (Array.isArray(attendanceRecords)) {
        attendanceRecords.forEach(record => {
          attendanceMap[record.studentId] = record.status;
        });
      }
      setAttendance(attendanceMap);
    } catch (error) {
      console.error('Failed to fetch data');
      // Ensure empty arrays on error
      setStudents([]);
      setSubjects([]);
      setAttendance({});
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAll = (status) => {
    const newAttendance = {};
    students.forEach(student => {
      newAttendance[student._id] = status;
    });
    setAttendance(newAttendance);
  };

  const handleMark = (studentId, status) => {
    setAttendance(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const attendanceRecords = students.map(student => ({
        studentId: student._id,
        date: selectedDate,
        status: attendance[student._id] || 'Absent',
        grade: selectedGrade,
        markedBy: user.id
      }));

      await Promise.all(
        attendanceRecords.map(record => 
          markAttendance(record)
        )
      );
      
      toast.success('Attendance saved successfully');
    } catch (error) {
      toast.error('Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const getStatusCount = (status) => {
    return students.filter(s => attendance[s._id] === status).length;
  };

  const grades = [
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
    'Class 11', 'Class 12'
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              {grades.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject (Optional)</label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              <option value="">General</option>
              {subjects.filter(s => s.grade === selectedGrade).map(s => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1"></div>
          <div className="flex gap-2">
            <button
              onClick={() => handleMarkAll('Present')}
              className="px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
            >
              Mark All Present
            </button>
            <button
              onClick={() => handleMarkAll('Absent')}
              className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
            >
              Mark All Absent
            </button>
            {(isAdmin || isTeacher) && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d] disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="text-sm text-gray-500">Total Students</div>
          <div className="text-2xl font-bold text-gray-900">{students.length}</div>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-100 p-4">
          <div className="text-sm text-green-600">Present</div>
          <div className="text-2xl font-bold text-green-700">{getStatusCount('Present')}</div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-4">
          <div className="text-sm text-red-600">Absent</div>
          <div className="text-2xl font-bold text-red-700">{getStatusCount('Absent')}</div>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-100 p-4">
          <div className="text-sm text-yellow-600">Late</div>
          <div className="text-2xl font-bold text-yellow-700">{getStatusCount('Late')}</div>
        </div>
      </div>

      {/* Attendance List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Roll No</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  No students found in this class
                </td>
              </tr>
            ) : (
              students.map(student => (
                <tr key={student._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-700">{student.rollNo}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">{student.fullName}</td>
                  <td className="px-6 py-4">
                    <span className={`
                      inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${attendance[student._id] === 'Present' ? 'bg-green-100 text-green-800' : ''}
                      ${attendance[student._id] === 'Absent' ? 'bg-red-100 text-red-800' : ''}
                      ${attendance[student._id] === 'Late' ? 'bg-yellow-100 text-yellow-800' : ''}
                      ${!attendance[student._id] ? 'bg-gray-100 text-gray-800' : ''}
                    `}>
                      {attendance[student._id] || 'Not Marked'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleMark(student._id, 'Present')}
                        className={`p-1.5 rounded-lg ${attendance[student._id] === 'Present' ? 'bg-green-100 text-green-600' : 'hover:bg-gray-100 text-gray-400'}`}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMark(student._id, 'Late')}
                        className={`p-1.5 rounded-lg ${attendance[student._id] === 'Late' ? 'bg-yellow-100 text-yellow-600' : 'hover:bg-gray-100 text-gray-400'}`}
                      >
                        <Calendar className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMark(student._id, 'Absent')}
                        className={`p-1.5 rounded-lg ${attendance[student._id] === 'Absent' ? 'bg-red-100 text-red-600' : 'hover:bg-gray-100 text-gray-400'}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Attendance;

