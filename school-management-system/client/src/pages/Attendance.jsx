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

const DEFAULT_SESSION_META = {
  classId: null,
  sectionId: null,
  academicYearId: null,
  attendanceId: null,
  alreadyMarked: false,
};

const GRADES = [
  'Class 1',
  'Class 2',
  'Class 3',
  'Class 4',
  'Class 5',
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
  'Class 11',
  'Class 12',
];

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const buildTeacherGradeOptions = (subjects = []) =>
  Array.from(
    new Set(
      subjects
        .map((subject) => String(subject?.className || subject?.grade || '').trim())
        .filter(Boolean)
    )
  );

const buildTeacherSectionScope = (subjects = [], grade) =>
  Array.from(
    new Set(
      subjects
        .filter((subject) => normalizeText(subject?.className || subject?.grade) === normalizeText(grade))
        .map((subject) => String(subject?.sectionName || subject?.section || '').trim())
        .filter(Boolean)
        .map(normalizeText)
    )
  );

const getStudentKey = (student) =>
  String(student?._id || student?.id || student?.studentId || '');

const getSectionName = (student) =>
  String(student?.sectionName || student?.section || '').trim();

const getSectionId = (student) => {
  const value = student?.sectionDbId ?? student?.sectionId ?? null;
  if (value === undefined || value === null || value === '') {
    return '';
  }

  return String(value).trim();
};

const getClassId = (student) => {
  const value = student?.classDbId ?? student?.classId ?? null;
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

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

const normalizeRosterStudent = (student) => {
  const studentId = getStudentKey(student);
  if (!studentId) {
    return null;
  }

  const status = String(student?.status || '').trim();
  const isActive = student?.isActive !== false && status.toLowerCase() !== 'inactive';

  return {
    ...student,
    _id: studentId,
    id: studentId,
    studentId,
    fullName: student?.fullName || student?.name || 'Student',
    rollNumber: student?.rollNumber || student?.rollNo || '',
    rollNo: student?.rollNumber || student?.rollNo || '',
    classDbId: student?.classDbId ?? student?.classId ?? null,
    sectionDbId: student?.sectionDbId ?? student?.sectionId ?? null,
    academicYearId: student?.academicYearId ?? null,
    isActive,
    status: status || null,
  };
};

const isActiveRosterStudent = (student) => Boolean(student) && student.isActive !== false;

const buildAttendanceMap = (records = []) => {
  const map = {};

  records.forEach((record) => {
    const normalizedRecord = normalizeAttendanceRecord(record);
    if (!normalizedRecord) {
      return;
    }

    map[normalizedRecord.studentId] = normalizedRecord;
  });

  return map;
};

const buildSectionOptions = (students = []) => {
  const sectionMap = new Map();
  const nameCounts = new Map();

  students.forEach((student) => {
    const sectionId = getSectionId(student);
    const sectionName = getSectionName(student);

    if (!sectionId || !sectionName) {
      return;
    }

    if (!sectionMap.has(sectionId)) {
      sectionMap.set(sectionId, {
        sectionId,
        sectionName,
        classId: getClassId(student),
      });
    }

    nameCounts.set(sectionName, (nameCounts.get(sectionName) || 0) + 1);
  });

  return Array.from(sectionMap.values())
    .map((section) => ({
      ...section,
      label:
        (nameCounts.get(section.sectionName) || 0) > 1
          ? `Section ${section.sectionName} (ID ${section.sectionId})`
          : `Section ${section.sectionName}`,
    }))
    .sort((left, right) => {
      const nameComparison = left.sectionName.localeCompare(right.sectionName);
      if (nameComparison !== 0) {
        return nameComparison;
      }

      return Number(right.sectionId) - Number(left.sectionId);
    });
};

const Attendance = () => {
  const { isAdmin, isTeacher, user } = useAuth();
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [gradeOptions, setGradeOptions] = useState(GRADES);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedGrade, setSelectedGrade] = useState('Class 10');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [attendance, setAttendance] = useState({});
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionMeta, setSessionMeta] = useState(DEFAULT_SESSION_META);

  const clearVisibleAttendance = ({ keepSections = true } = {}) => {
    setStudents([]);
    setAttendance({});
    setLoadError('');
    setSessionMeta(DEFAULT_SESSION_META);
    if (!keepSections) {
      setSections([]);
    }
  };

  useEffect(() => {
    let active = true;

    const loadTeacherScope = async () => {
      if (!isTeacher) {
        setGradeOptions(GRADES);
        return;
      }

      try {
        const response = await getSubjects({ page: 1, limit: 1000 });
        const scopedSubjects = Array.isArray(response?.data?.subjects) ? response.data.subjects : [];
        const nextGradeOptions = buildTeacherGradeOptions(scopedSubjects);

        if (!active) {
          return;
        }

        setGradeOptions(nextGradeOptions);
        if (nextGradeOptions.length && !nextGradeOptions.includes(selectedGrade)) {
          clearVisibleAttendance({ keepSections: false });
          setSelectedGrade(nextGradeOptions[0]);
          setSelectedSection('');
          setSelectedSubject('');
        }
      } catch (error) {
        if (!active) {
          return;
        }

        setGradeOptions([]);
      }
    };

    loadTeacherScope();

    return () => {
      active = false;
    };
  }, [isTeacher]);

  useEffect(() => {
    let active = true;

    const fetchAttendanceData = async () => {
      setLoading(true);
      setLoadError('');
      setStudents([]);
      setAttendance({});
      setSessionMeta(DEFAULT_SESSION_META);

      try {
        if (isTeacher && !gradeOptions.length) {
          setSubjects([]);
          setSections([]);
          setLoadError('No assigned classes are available for this teacher yet.');
          return;
        }

        const [classStudentsResponse, subjectsResponse] = await Promise.all([
          getStudents({
            page: 1,
            limit: 1000,
            class: selectedGrade,
            isActive: true,
            sortBy: 'rollNumber',
            sortOrder: 'asc',
          }),
          getSubjects({ grade: selectedGrade }),
        ]);

        if (!active) {
          return;
        }

        const classStudents = Array.isArray(classStudentsResponse?.data?.students)
          ? classStudentsResponse.data.students.map(normalizeRosterStudent).filter(isActiveRosterStudent)
          : null;
        const subjectsData = Array.isArray(subjectsResponse?.data?.subjects)
          ? subjectsResponse.data.subjects
          : [];

        if (!Array.isArray(classStudents)) {
          throw new Error('Invalid class roster response');
        }

        if (isTeacher && !subjectsData.length) {
          setSubjects([]);
          setSections([]);
          setSelectedSection('');
          setLoadError('No assigned subjects are available for the selected class.');
          return;
        }

        const teacherSections = isTeacher ? buildTeacherSectionScope(subjectsData, selectedGrade) : [];
        const nextSections = buildSectionOptions(classStudents).filter((section) => {
          if (!teacherSections.length) {
            return true;
          }

          return teacherSections.includes(normalizeText(section.sectionName));
        });
        setSubjects(subjectsData);
        setSections(nextSections);

        if (!nextSections.length) {
          if (selectedSection) {
            setSelectedSection('');
          }
          setLoadError(isTeacher ? 'No assigned sections are available for the selected class.' : '');
          return;
        }

        const nextSection =
          selectedSection && nextSections.some((section) => section.sectionId === selectedSection)
            ? selectedSection
            : nextSections[0].sectionId;

        if (nextSection !== selectedSection) {
          setSelectedSection(nextSection);
          return;
        }

        const selectedSectionOption =
          nextSections.find((section) => section.sectionId === nextSection) || nextSections[0];
        const resolvedClassId = selectedSectionOption?.classId || classStudents[0]?.classDbId || null;

        if (!resolvedClassId) {
          throw new Error('Unable to resolve the selected class for attendance.');
        }

        const [rosterResult, attendanceResult] = await Promise.allSettled([
          getStudents({
            page: 1,
            limit: 1000,
            class: selectedGrade,
            classId: resolvedClassId,
            sectionId: nextSection,
            isActive: true,
            sortBy: 'rollNumber',
            sortOrder: 'asc',
          }),
          getAttendance({
            classId: resolvedClassId,
            sectionId: nextSection,
            class: selectedGrade,
            section: selectedSectionOption?.sectionName || null,
            date: selectedDate,
            limit: 1000,
          }),
        ]);

        if (!active) {
          return;
        }

        if (rosterResult.status !== 'fulfilled') {
          throw rosterResult.reason;
        }

        const rosterStudents = Array.isArray(rosterResult.value?.data?.students)
          ? rosterResult.value.data.students.map(normalizeRosterStudent).filter(isActiveRosterStudent)
          : null;

        if (!Array.isArray(rosterStudents)) {
          throw new Error('Invalid attendance roster response');
        }

        const attendanceRecords =
          attendanceResult.status === 'fulfilled' && Array.isArray(attendanceResult.value?.data?.attendances)
            ? attendanceResult.value.data.attendances
            : [];
        const attendanceMap = buildAttendanceMap(attendanceRecords);
        const firstStudent = rosterStudents[0] || null;
        const firstAttendanceRecord = Object.values(attendanceMap)[0] || null;

        setStudents(rosterStudents);
        setAttendance(attendanceMap);
        setSessionMeta({
          classId: resolvedClassId,
          sectionId: Number(nextSection) || firstStudent?.sectionDbId || null,
          academicYearId: firstStudent?.academicYearId ?? null,
          attendanceId: firstAttendanceRecord?.attendanceId || null,
          alreadyMarked: Object.keys(attendanceMap).length > 0,
        });

        if (attendanceResult.status === 'rejected') {
          setLoadError(
            attendanceResult.reason?.response?.data?.message
            || 'Failed to load existing attendance details for the selected date.'
          );
        }
      } catch (error) {
        if (!active) {
          return;
        }

        setStudents([]);
        setAttendance({});
        setSessionMeta(DEFAULT_SESSION_META);
        setLoadError(
          error.response?.status === 404
            ? 'Failed to load attendance data from the server.'
            : error.response?.data?.message || 'Failed to load attendance data.'
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchAttendanceData();

    return () => {
      active = false;
    };
  }, [gradeOptions, isTeacher, refreshKey, selectedDate, selectedGrade, selectedSection]);

  const selectedSectionOption =
    sections.find((section) => section.sectionId === selectedSection) || null;
  const selectedSectionName = selectedSectionOption?.sectionName || '';

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

          return !subject.sectionName || subject.sectionName === selectedSectionName;
        })
        .map((subject) => [subject.classSubjectId || subject.subjectId || subject._id, subject])
    ).values()
  );

  useEffect(() => {
    if (!selectedSubject) {
      return;
    }

    const subjectStillAvailable = subjectOptions.some(
      (subject) => String(subject.subjectId || subject._id || '') === String(selectedSubject)
    );

    if (!subjectStillAvailable) {
      setSelectedSubject('');
    }
  }, [selectedSubject, subjectOptions]);

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

    if (!sessionMeta.classId || !sessionMeta.sectionId) {
      toast.error('Please select a valid class and section before saving attendance.');
      return;
    }

    const markedByUserId = user?._id || user?.id || null;

    setSaving(true);
    try {
      await submitAttendance({
        attendanceDate: selectedDate,
        academicYearId: sessionMeta.academicYearId || students[0]?.academicYearId || null,
        classId: sessionMeta.classId,
        sectionId: sessionMeta.sectionId,
        className: selectedGrade,
        sectionName: selectedSectionName || null,
        subjectId: selectedSubject || null,
        markedByUserId,
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

      toast.success(
        sessionMeta.alreadyMarked ? 'Attendance updated successfully' : 'Attendance saved successfully'
      );
      setRefreshKey((value) => value + 1);
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to save attendance';
      const invalidStudents = Array.isArray(error.response?.data?.invalidStudents)
        ? error.response.data.invalidStudents
        : [];

      if (invalidStudents.length) {
        const invalidPreview = invalidStudents
          .slice(0, 2)
          .map((student) => `#${student.studentId}: ${student.reason}`)
          .join(' | ');

        toast.error(invalidPreview ? `${message} ${invalidPreview}` : message);
        setRefreshKey((value) => value + 1);
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const getStatusCount = (status) =>
    students.filter((student) => attendance[getStudentKey(student)]?.status === status).length;

  const showNoSections = !loading && !loadError && sections.length === 0;
  const showNoStudents = !loading && !loadError && sections.length > 0 && selectedSection && students.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        {isTeacher ? (
          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-[#002366]">
            Teacher workspace is now scoped to your assigned subjects and sections only.
          </div>
        ) : null}
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                clearVisibleAttendance();
                setSelectedDate(event.target.value);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
            <select
              value={selectedGrade}
              onChange={(event) => {
                clearVisibleAttendance({ keepSections: false });
                setSelectedGrade(event.target.value);
                setSelectedSection('');
                setSelectedSubject('');
              }}
              disabled={!gradeOptions.length}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              {!gradeOptions.length ? <option value="">No Classes</option> : null}
              {gradeOptions.map((grade) => (
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
              onChange={(event) => {
                clearVisibleAttendance();
                setSelectedSection(event.target.value);
              }}
              disabled={!sections.length}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366] disabled:bg-gray-100"
            >
              {!sections.length ? <option value="">No Sections</option> : null}
              {sections.map((section) => (
                <option key={section.sectionId} value={section.sectionId}>
                  {section.label}
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
              disabled={loading || !students.length}
              className="px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50"
            >
              Mark All Present
            </button>
            <button
              onClick={() => handleMarkAll('Absent')}
              disabled={loading || !students.length}
              className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50"
            >
              Mark All Absent
            </button>
            {(isAdmin || isTeacher) && (
              <button
                onClick={handleSave}
                disabled={loading || saving || !students.length || !selectedSection}
                className="flex items-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d] disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
        </div>
        {sessionMeta.alreadyMarked && !loading && students.length ? (
          <div className="mt-3 text-sm text-[#002366] bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            Attendance is already marked for this date. Saving will update the current class and section roster.
          </div>
        ) : null}
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
                  Loading attendance...
                </td>
              </tr>
            ) : loadError && students.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  Failed to load attendance data.
                </td>
              </tr>
            ) : showNoSections ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  No sections available for the selected class.
                </td>
              </tr>
            ) : !selectedSection ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  Select a section to load attendance.
                </td>
              </tr>
            ) : showNoStudents ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  No students found for the selected class and section.
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
