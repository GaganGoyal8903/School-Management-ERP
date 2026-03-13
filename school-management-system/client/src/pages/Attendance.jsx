import { useEffect, useState } from 'react';
import { Calendar, Check, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import {
  getAttendance,
  getStudents,
  getSubjects,
  submitAttendance,
} from '../services/api';

const getStudentKey = (student) => String(student?._id || student?.id || '');

const normalizeAttendanceRecord = (record) => {
  const studentId =
    typeof record?.studentId === 'object'
      ? record.studentId?._id || record.studentId?.id
      : record?.studentId;

  if (!studentId) {
    return null;
  }

  return {
    studentId: String(studentId),
    status: record.status || 'Absent',
    remarks: record.remarks || '',
    attendanceId: record.attendanceId || null,
    checkInTime: record.checkInTime || '',
    checkOutTime: record.checkOutTime || '',
  };
};

const Attendance = () => {
  const { isAdmin, isTeacher, user } = useAuth();
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedGrade, setSelectedGrade] = useState('Class 10');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [attendance, setAttendance] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      try {
        setLoading(true);

        const [studentsRes, subjectsRes] = await Promise.all([
          getStudents({ page: 1, limit: 1000, class: selectedGrade }),
          getSubjects({ grade: selectedGrade }),
        ]);

        const classStudents = studentsRes?.data?.students;
        const subjectsData = subjectsRes?.data?.subjects;
        if (!Array.isArray(classStudents) || !Array.isArray(subjectsData)) {
          throw new Error('Invalid attendance response');
        }

        const nextSections = Array.from(
          new Set(
            classStudents
              .map((student) => student.sectionName || student.section || '')
              .filter(Boolean)
          )
        ).sort((left, right) => left.localeCompare(right));

        if (!active) {
          return;
        }

        setSubjects(subjectsData);
        setSections(nextSections);

        if (!nextSections.length) {
          setSelectedSection('');
          setStudents([]);
          setAttendance({});
          setLoadError('');
          return;
        }

        const nextSection =
          selectedSection && nextSections.includes(selectedSection)
            ? selectedSection
            : nextSections[0];

        if (nextSection !== selectedSection) {
          setSelectedSection(nextSection);
          setStudents([]);
          setAttendance({});
          setLoadError('');
          return;
        }

        const filteredStudents = classStudents.filter(
          (student) => (student.sectionName || student.section || '') === nextSection
        );
        const attendanceRes = await getAttendance({
          grade: selectedGrade,
          section: nextSection,
          date: selectedDate,
          limit: 1000,
        });
        const attendanceRecords = attendanceRes?.data?.attendances;
        if (!Array.isArray(attendanceRecords)) {
          throw new Error('Invalid attendance response');
        }

        const attendanceMap = {};
        attendanceRecords.forEach((record) => {
          const normalizedRecord = normalizeAttendanceRecord(record);
          if (!normalizedRecord) {
            return;
          }

          attendanceMap[normalizedRecord.studentId] = normalizedRecord;
        });

        setStudents(filteredStudents);
        setAttendance(attendanceMap);
        setLoadError('');
      } catch (error) {
        setLoadError('Unable to load live attendance data from the backend API.');
        setStudents([]);
        setSubjects([]);
        setAttendance({});
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [selectedDate, selectedGrade, selectedSection]);

  const handleMarkAll = (status) => {
    setAttendance((prev) => {
      const nextAttendance = { ...prev };
      students.forEach((student) => {
        const studentKey = getStudentKey(student);
        nextAttendance[studentKey] = {
          ...(nextAttendance[studentKey] || {}),
          studentId: studentKey,
          status,
        };
      });
      return nextAttendance;
    });
  };

  const handleMark = (studentId, status) => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        studentId,
        status,
      },
    }));
  };

  const handleSave = async () => {
    if (!students.length) {
      toast.error('No students available for attendance.');
      return;
    }

    if (!selectedSection) {
      toast.error('Please select a section before saving attendance.');
      return;
    }

    const firstStudent = students[0];
    const markedByTeacherId = user?._id || user?.id || null;

    setSaving(true);
    try {
      await submitAttendance({
        attendanceDate: selectedDate,
        academicYearId: firstStudent?.academicYearId || null,
        classId: firstStudent?.classDbId || null,
        sectionId: firstStudent?.sectionDbId || null,
        markedByTeacherId,
        students: students.map((student) => {
          const studentKey = getStudentKey(student);
          const currentAttendance = attendance[studentKey] || {};

          return {
            studentId: studentKey,
            rollNumber: student.rollNumber || student.rollNo || null,
            status: currentAttendance.status || 'Absent',
            remarks: currentAttendance.remarks || '',
            checkInTime: currentAttendance.checkInTime || null,
            checkOutTime: currentAttendance.checkOutTime || null,
          };
        }),
      });

      toast.success('Attendance saved successfully');

      const attendanceRes = await getAttendance({
        grade: selectedGrade,
        section: selectedSection,
        date: selectedDate,
        limit: 1000,
      });
      const attendanceRecords = Array.isArray(attendanceRes?.data?.attendances)
        ? attendanceRes.data.attendances
        : [];
      const attendanceMap = {};

      attendanceRecords.forEach((record) => {
        const normalizedRecord = normalizeAttendanceRecord(record);
        if (!normalizedRecord) {
          return;
        }
        attendanceMap[normalizedRecord.studentId] = normalizedRecord;
      });

      setAttendance(attendanceMap);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const getStatusCount = (status) =>
    students.filter((student) => attendance[getStudentKey(student)]?.status === status).length;

  const subjectOptions = Array.from(
    new Map(
      subjects
        .filter((subject) => {
          if (subject.grade !== selectedGrade) {
            return false;
          }

          if (!selectedSection) {
            return true;
          }

          return !subject.sectionName || subject.sectionName === selectedSection;
        })
        .map((subject) => [subject.classSubjectId || subject.subjectId || subject._id, subject])
    ).values()
  );

  const grades = [
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
    'Class 11', 'Class 12',
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
            <select
              value={selectedGrade}
              onChange={(event) => setSelectedGrade(event.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              {grades.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
            <select
              value={selectedSection}
              onChange={(event) => setSelectedSection(event.target.value)}
              disabled={!sections.length}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366] disabled:bg-gray-100"
            >
              {!sections.length ? (
                <option value="">No Sections</option>
              ) : null}
              {sections.map((section) => (
                <option key={section} value={section}>
                  Section {section}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject (Optional)</label>
            <select
              value={selectedSubject}
              onChange={(event) => setSelectedSubject(event.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              <option value="">General</option>
              {subjectOptions.map((subject) => (
                <option key={subject.classSubjectId || subject._id} value={subject.subjectId || subject._id}>
                  {subject.name}
                </option>
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
                disabled={saving || !students.length || !selectedSection}
                className="flex items-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d] disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>

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

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loadError ? (
          <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}
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
            ) : !selectedSection ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  Select a section to view and save attendance
                </td>
              </tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  No students found in this class and section
                </td>
              </tr>
            ) : (
              students.map((student) => {
                const studentKey = getStudentKey(student);
                const status = attendance[studentKey]?.status || '';

                return (
                  <tr key={studentKey} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {student.rollNumber || student.rollNo || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">{student.fullName}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`
                          inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                          ${status === 'Present' ? 'bg-green-100 text-green-800' : ''}
                          ${status === 'Absent' ? 'bg-red-100 text-red-800' : ''}
                          ${status === 'Late' ? 'bg-yellow-100 text-yellow-800' : ''}
                          ${!status ? 'bg-gray-100 text-gray-800' : ''}
                        `}
                      >
                        {status || 'Not Marked'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleMark(studentKey, 'Present')}
                          className={`p-1.5 rounded-lg ${status === 'Present' ? 'bg-green-100 text-green-600' : 'hover:bg-gray-100 text-gray-400'}`}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMark(studentKey, 'Late')}
                          className={`p-1.5 rounded-lg ${status === 'Late' ? 'bg-yellow-100 text-yellow-600' : 'hover:bg-gray-100 text-gray-400'}`}
                        >
                          <Calendar className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleMark(studentKey, 'Absent')}
                          className={`p-1.5 rounded-lg ${status === 'Absent' ? 'bg-red-100 text-red-600' : 'hover:bg-gray-100 text-gray-400'}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Attendance;
