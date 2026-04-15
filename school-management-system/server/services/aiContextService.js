const {
  getDashboardReport,
  getSummaryReportData,
  getAttendanceReportData,
  getExamReportData,
  getFeeReportData,
} = require('./reportSqlService');
const { getStudentList } = require('./studentSqlService');
const { getTeacherList } = require('./teacherSqlService');
const { getSubjectList } = require('./academicSqlService');
const { getMaterialList } = require('./materialSqlService');
const { getBusList } = require('./busSqlService');
const { getTimetableList, getTeacherTimetableFromSql } = require('./timetableSqlService');

const ROLE_TOPIC_ALLOWLIST = Object.freeze({
  admin: ['overview', 'students', 'teachers', 'subjects', 'materials', 'attendance', 'exams', 'fees', 'buses', 'timetable'],
  teacher: ['overview', 'students', 'subjects', 'materials', 'attendance', 'exams', 'buses', 'timetable'],
});

const TOPIC_KEYWORDS = Object.freeze({
  overview: ['overview', 'summary', 'dashboard', 'analytics', 'report', 'reports'],
  students: ['student', 'students', 'class', 'classes', 'admission', 'roll number'],
  teachers: ['teacher', 'teachers', 'faculty', 'staff'],
  subjects: ['subject', 'subjects', 'curriculum', 'syllabus'],
  materials: ['material', 'materials', 'resource', 'resources', 'notes', 'study material'],
  attendance: ['attendance', 'present', 'absent', 'late', 'leave'],
  exams: ['exam', 'exams', 'result', 'results', 'marks', 'grade', 'grades', 'test'],
  fees: ['fee', 'fees', 'payment', 'payments', 'dues', 'finance', 'financial', 'collection'],
  buses: ['bus', 'buses', 'transport', 'route'],
  timetable: ['timetable', 'schedule', 'period', 'periods', 'routine'],
});

const normalizeRole = (value = '') => String(value || '').trim().toLowerCase();
const normalizeText = (value = '') => String(value || '').trim().toLowerCase();

const getIsoDateDaysAgo = (days = 0) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - Number(days || 0));
  return date.toISOString().split('T')[0];
};

const extractClassName = (value = '') => {
  const match = String(value || '').match(/\b(?:class|grade)\s*(\d{1,2})\b/i);
  return match ? `Class ${match[1]}` : null;
};

const extractSectionName = (value = '') => {
  const match = String(value || '').match(/\bsection\s*([A-Z])\b/i);
  return match ? match[1].toUpperCase() : null;
};

const pickTopics = (query = '', explicitTopics = []) => {
  const normalizedQuery = normalizeText(query);
  const topics = new Set((explicitTopics || []).map((topic) => normalizeText(topic)).filter(Boolean));

  Object.entries(TOPIC_KEYWORDS).forEach(([topic, keywords]) => {
    if (keywords.some((keyword) => normalizedQuery.includes(keyword))) {
      topics.add(topic);
    }
  });

  if (!topics.size) {
    topics.add('overview');
  }

  return [...topics];
};

const mapStudentSample = (student = {}) => ({
  fullName: student.fullName || student.name || null,
  className: student.className || student.class || null,
  section: student.sectionName || student.section || null,
  rollNumber: student.rollNumber || null,
  admissionNumber: student.admissionNumber || null,
});

const mapTeacherSample = (teacher = {}) => ({
  fullName: teacher.fullName || null,
  email: teacher.email || null,
  phone: teacher.phone || null,
  subjectSpecialization: teacher.subjectSpecialization || teacher.subject || null,
});

const mapSubjectSample = (subject = {}) => ({
  name: subject.name || null,
  grade: subject.grade || subject.className || null,
  section: subject.sectionName || subject.section || null,
  teacher: subject.teacher?.fullName || subject.teacherName || null,
});

const mapMaterialSample = (material = {}) => ({
  title: material.title || null,
  subject: material.subject?.name || material.subjectName || null,
  grade: material.grade || material.className || null,
  uploadedBy: material.uploadedBy?.fullName || material.teacherName || null,
});

const mapBusSample = (bus = {}) => ({
  busNumber: bus.busNumber || bus.vehicleNumber || null,
  routeName: bus.routeName || null,
  currentStatus: bus.currentStatus || null,
  driverName: bus.driverName || null,
  assignedStudents: Array.isArray(bus.assignedStudents) ? bus.assignedStudents.length : 0,
});

const mapTimetableSample = (entry = {}) => ({
  day: entry.day || null,
  className: entry.className || entry.class || null,
  section: entry.sectionName || entry.section || null,
  periods: (entry.periods || []).slice(0, 5).map((period) => ({
    periodNumber: period.periodNumber || null,
    subject: period.subject?.name || period.subject || null,
    teacher: period.teacher?.fullName || period.teacher || null,
    startTime: period.startTime || null,
    endTime: period.endTime || null,
  })),
});

const buildPromptFriendlyContext = async ({ query = '', role = '', userId = null, explicitTopics = [] } = {}) => {
  const normalizedRole = normalizeRole(role);
  const allowedTopics = ROLE_TOPIC_ALLOWLIST[normalizedRole] || ['overview'];
  const detectedTopics = pickTopics(query, explicitTopics);
  const topics = detectedTopics.filter((topic) => allowedTopics.includes(topic));
  const restrictedTopics = detectedTopics.filter((topic) => !allowedTopics.includes(topic));
  const className = extractClassName(query);
  const sectionName = extractSectionName(query);
  const context = {
    userScope: {
      role: normalizedRole,
      classFilter: className,
      sectionFilter: sectionName,
    },
    schoolSnapshot: {},
    modules: {},
  };

  const dashboard = await getDashboardReport({ role: normalizedRole, userId });
  context.schoolSnapshot = {
    totalStudents: Number(dashboard?.stats?.students || 0),
    totalTeachers: Number(dashboard?.stats?.teachers || 0),
    totalSubjects: Number(dashboard?.stats?.subjects || 0),
    totalMaterials: Number(dashboard?.stats?.materials || 0),
    attendanceToday: dashboard?.attendanceSummary || null,
    recentStudents: (dashboard?.recentStudents || []).slice(0, 6).map(mapStudentSample),
    busFleetStatus: allowedTopics.includes('buses') ? dashboard?.busFleetStatus || null : null,
    feeSummary: allowedTopics.includes('fees') ? dashboard?.feeSummary || null : null,
  };

  if (topics.includes('overview')) {
    const summary = await getSummaryReportData();
    context.modules.overview = {
      summary,
    };
  }

  if (topics.includes('students')) {
    const studentList = await getStudentList({
      page: 1,
      limit: 12,
      className,
      sectionName,
      sortBy: 'fullName',
      sortOrder: 'asc',
    });
    context.modules.students = {
      total: Number(studentList?.total || 0),
      availableClasses: studentList?.availableClasses || [],
      sample: (studentList?.students || []).slice(0, 12).map(mapStudentSample),
    };
  }

  if (topics.includes('teachers')) {
    const teacherList = await getTeacherList({
      page: 1,
      limit: 10,
      sortBy: 'fullName',
      sortOrder: 'asc',
    });
    context.modules.teachers = {
      total: Number(teacherList?.total || 0),
      sample: (teacherList?.teachers || []).slice(0, 10).map(mapTeacherSample),
    };
  }

  if (topics.includes('subjects')) {
    const subjectList = await getSubjectList({
      page: 1,
      limit: 12,
      grade: className,
    });
    context.modules.subjects = {
      total: Number(subjectList?.total || 0),
      sample: (subjectList?.subjects || []).slice(0, 12).map(mapSubjectSample),
    };
  }

  if (topics.includes('materials')) {
    const materialList = await getMaterialList({
      grade: className,
      page: 1,
      limit: 10,
    });
    context.modules.materials = {
      total: Number(materialList?.total || 0),
      sample: (materialList?.materials || []).slice(0, 10).map(mapMaterialSample),
    };
  }

  if (topics.includes('attendance')) {
    const attendanceReport = await getAttendanceReportData({
      className,
      sectionName,
      startDate: getIsoDateDaysAgo(30),
      endDate: getIsoDateDaysAgo(0),
    });
    context.modules.attendance = {
      filters: attendanceReport?.filters || {},
      count: Number(attendanceReport?.count || 0),
      statusStats: attendanceReport?.summary?.statusStats || [],
      dailyStats: (attendanceReport?.summary?.dailyStats || []).slice(0, 10),
      studentStats: (attendanceReport?.summary?.studentStats || []).slice(0, 10),
    };
  }

  if (topics.includes('exams')) {
    const examReport = await getExamReportData({
      startDate: getIsoDateDaysAgo(90),
      endDate: getIsoDateDaysAgo(0),
    });
    context.modules.exams = {
      summary: examReport?.summary || {},
      exams: (examReport?.exams || []).slice(0, 10).map((exam) => ({
        name: exam?.name || exam?.title || null,
        subject: exam?.subject?.name || exam?.subject || null,
        className: exam?.grade || exam?.class || null,
        section: exam?.section || null,
        date: exam?.examDate || exam?.date || null,
        averageMarks: exam?.averageMarks || 0,
      })),
      topStudents: (examReport?.topStudents || []).slice(0, 8),
    };
  }

  if (topics.includes('fees')) {
    const feeReport = await getFeeReportData({});
    context.modules.fees = {
      summary: feeReport?.summary || {},
      recentPayments: (feeReport?.recentPayments || feeReport?.records || []).slice(0, 10),
    };
  }

  if (topics.includes('buses')) {
    const buses = await getBusList({});
    context.modules.buses = {
      total: Array.isArray(buses) ? buses.length : 0,
      sample: (buses || []).slice(0, 8).map(mapBusSample),
    };
  }

  if (topics.includes('timetable')) {
    const timetableEntries = normalizedRole === 'teacher'
      ? await getTeacherTimetableFromSql({ teacherId: userId })
      : await getTimetableList({ className, section: sectionName || null });
    context.modules.timetable = {
      total: Array.isArray(timetableEntries) ? timetableEntries.length : 0,
      sample: (timetableEntries || []).slice(0, 6).map(mapTimetableSample),
    };
  }

  return {
    topics,
    restrictedTopics,
    context,
  };
};

module.exports = {
  buildPromptFriendlyContext,
};
