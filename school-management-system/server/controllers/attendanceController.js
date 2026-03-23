const { asyncHandler } = require('../middleware/errorMiddleware');
const { getStudentById, getStudentByUserId } = require('../services/studentSqlService');
const {
  ensureAttendanceSqlReady,
  getAttendanceById,
  upsertAttendanceRecord,
  saveAttendanceSession,
  getAttendanceSession,
  getAttendanceList,
  getStudentAttendanceReport,
  getClassAttendanceSummary,
  deleteAttendanceRecord,
} = require('../services/attendanceSqlService');

const normalizeClassFilter = (value, fallback = null) => {
  return value || fallback || null;
};

const getRequestUserId = (req) => req.user?._id || req.user?.id || null;

const normalizeAttendanceStudents = (body = {}) => {
  const studentsInput = Array.isArray(body.students)
    ? body.students
    : Array.isArray(body.attendanceList)
      ? body.attendanceList
      : Array.isArray(body.attendances)
        ? body.attendances
        : [];

  return studentsInput
    .map((student) => ({
      studentId: student?.studentId ?? student?._id ?? student?.id,
      rollNumber: student?.rollNumber ?? student?.rollNo ?? null,
      status: student?.status,
      remarks: student?.remarks,
      checkInTime: student?.checkInTime,
      checkOutTime: student?.checkOutTime,
    }))
    .filter((student) => student.studentId);
};

const normalizeAttendanceSessionPayload = (body = {}) => ({
  attendanceDate: body.attendanceDate || body.date,
  academicYearId: body.academicYearId ?? null,
  classId: body.classId ?? null,
  sectionId: body.sectionId ?? null,
  subjectId: body.subjectId ?? body.subject ?? null,
  className: body.className || body.class || body.grade || null,
  sectionName: body.sectionName || body.section || null,
  markedByTeacherId: body.markedByTeacherId || body.markedBy || null,
  remarks: body.remarks || null,
  students: normalizeAttendanceStudents(body),
});

const saveAttendanceSessionAndRespond = async (req, res) => {
  await ensureAttendanceSqlReady();

  const payload = normalizeAttendanceSessionPayload(req.body);
  if (!payload.students.length) {
    return res.status(400).json({ message: 'Please provide attendance records' });
  }

  let result;
  try {
    result = await saveAttendanceSession({
      ...payload,
      markedByUserId: getRequestUserId(req),
    });
  } catch (error) {
    if (error?.code === 'ATTENDANCE_VALIDATION_FAILED') {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
        invalidStudents: Array.isArray(error.invalidStudents) ? error.invalidStudents : [],
      });
    }

    throw error;
  }

  return res.json({
    success: true,
    message: 'Attendance saved successfully',
    attendanceId: result.attendanceId ? String(result.attendanceId) : null,
    savedCount: result.savedCount || 0,
  });
};

const buildAttendancePayload = async ({ studentId, date, status, className, sectionName, markedByUserId, remarks }) => {
  const student = await getStudentById(studentId);
  if (!student) {
    return { student: null, payload: null };
  }

  return {
    student,
    payload: {
      studentId: String(studentId),
      date,
      status,
      className: className || student.class,
      sectionName: sectionName || student.section || '',
      markedByUserId: String(markedByUserId),
      remarks: remarks || '',
    },
  };
};

// @desc    Mark attendance
// @route   POST /api/attendance
// @access  Private (Admin, Teacher)
const markAttendance = asyncHandler(async (req, res) => {
  if (normalizeAttendanceStudents(req.body).length > 0) {
    return saveAttendanceSessionAndRespond(req, res);
  }

  await ensureAttendanceSqlReady();

  const {
    studentId,
    date,
    status,
    class: studentClass,
    grade,
    section,
    remarks,
  } = req.body;

  const { student, payload } = await buildAttendancePayload({
    studentId,
    date,
    status,
    className: normalizeClassFilter(studentClass, grade),
    sectionName: section,
    markedByUserId: req.user._id,
    remarks,
  });

  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const result = await upsertAttendanceRecord(payload);
  if (!result?.attendance) {
    return res.status(400).json({ message: 'Unable to save attendance record' });
  }

  if (result.operationType === 'updated') {
    return res.json({
      success: true,
      attendance: result.attendance,
      message: 'Attendance updated',
    });
  }

  res.status(201).json({
    success: true,
    attendance: result.attendance,
  });
});

// @desc    Update attendance by id
// @route   PUT /api/attendance/:id
// @access  Private (Admin, Teacher)
const updateAttendance = asyncHandler(async (req, res) => {
  await ensureAttendanceSqlReady();

  const existingAttendance = await getAttendanceById(req.params.id);
  if (!existingAttendance) {
    return res.status(404).json({ message: 'Attendance record not found' });
  }

  const {
    studentId,
    date,
    status,
    class: studentClass,
    grade,
    section,
    remarks,
  } = req.body;

  const effectiveStudentId =
    studentId || (typeof existingAttendance.studentId === 'object' ? existingAttendance.studentId._id : existingAttendance.studentId);

  const { student, payload } = await buildAttendancePayload({
    studentId: effectiveStudentId,
    date: date || existingAttendance.date,
    status: status || existingAttendance.status,
    className: normalizeClassFilter(studentClass, grade) || existingAttendance.class,
    sectionName: section !== undefined ? section : existingAttendance.section,
    markedByUserId: req.user._id,
    remarks: remarks !== undefined ? remarks : existingAttendance.remarks,
  });

  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const result = await upsertAttendanceRecord({
    attendanceId: req.params.id,
    ...payload,
  });
  if (!result?.attendance) {
    return res.status(400).json({ message: 'Unable to update attendance record' });
  }

  res.json({
    success: true,
    attendance: result.attendance,
    message: 'Attendance updated',
  });
});

// @desc    Mark bulk attendance
// @route   POST /api/attendance/bulk
// @access  Private (Admin, Teacher)
const markBulkAttendance = asyncHandler(async (req, res) => {
  return saveAttendanceSessionAndRespond(req, res);
});

// @desc    Save attendance session
// @route   POST /api/attendance/save
// @access  Private (Admin, Teacher)
const saveAttendance = asyncHandler(async (req, res) => saveAttendanceSessionAndRespond(req, res));

// @desc    Get attendance session roster for a class/section/date
// @route   GET /api/attendance/session
// @access  Private (Admin, Teacher)
const getAttendanceSessionDetails = asyncHandler(async (req, res) => {
  await ensureAttendanceSqlReady();

  const {
    class: classFilter,
    grade,
    classId,
    section,
    sectionName,
    sectionId,
    date,
    attendanceDate,
  } = req.query;

  const session = await getAttendanceSession({
    attendanceDate: attendanceDate || date,
    classId,
    sectionId,
    className: normalizeClassFilter(classFilter, grade),
    sectionName: sectionName || section || null,
  });

  res.json({
    success: true,
    session,
  });
});

// @desc    Get attendance records
// @route   GET /api/attendance
// @access  Private
const getAttendance = asyncHandler(async (req, res) => {
  await ensureAttendanceSqlReady();

  const {
    studentId,
    class: classFilter,
    grade,
    classId,
    section,
    sectionId,
    date,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  } = req.query;

  const result = await getAttendanceList({
    studentId,
    classId,
    sectionId,
    className: normalizeClassFilter(classFilter, grade),
    sectionName: section,
    date,
    startDate,
    endDate,
    page,
    limit,
  });

  res.json({
    success: true,
    attendances: result.attendances,
    pagination: {
      total: result.total,
      page: Number(page) || 1,
      pages: Math.ceil(result.total / (Number(limit) || 50)),
    },
  });
});

// @desc    Get attendance report
// @route   GET /api/attendance/report
// @access  Private
const getAttendanceReport = asyncHandler(async (req, res) => {
  await ensureAttendanceSqlReady();

  const { class: classFilter, grade, section, startDate, endDate } = req.query;

  const report = await getClassAttendanceSummary({
    className: normalizeClassFilter(classFilter, grade),
    sectionName: section,
    startDate,
    endDate,
  });

  res.json({
    success: true,
    statusStats: report.statusStats,
    dailyStats: report.dailyStats,
    studentStats: report.studentStats,
  });
});

// @desc    Get attendance for a student
// @route   GET /api/attendance/student/:studentId
// @access  Private
const getStudentAttendance = asyncHandler(async (req, res) => {
  await ensureAttendanceSqlReady();

  const { startDate, endDate } = req.query;
  const requestedStudentId = req.params.studentId;

  if (req.user.role === 'student') {
    const studentProfile = await getStudentByUserId(req.user._id);

    if (!studentProfile) {
      return res.status(403).json({ message: 'Student profile not found' });
    }

    if (studentProfile._id.toString() !== requestedStudentId) {
      return res.status(403).json({ message: 'Not authorized to view other student attendance' });
    }
  }

  const attendances = await getStudentAttendanceReport({
    studentId: requestedStudentId,
    startDate,
    endDate,
  });

  const total = attendances.length;
  const present = attendances.filter((item) => item.status === 'Present').length;
  const absent = attendances.filter((item) => item.status === 'Absent').length;
  const late = attendances.filter((item) => item.status === 'Late').length;
  const percentage =
    total > 0 ? (((present + late * 0.5) / total) * 100).toFixed(2) : 0;

  res.json({
    success: true,
    attendances,
    stats: {
      total,
      present,
      absent,
      late,
      percentage,
    },
  });
});

// @desc    Delete attendance
// @route   DELETE /api/attendance/:id
// @access  Private (Admin)
const deleteAttendance = asyncHandler(async (req, res) => {
  await ensureAttendanceSqlReady();
  const attendance = await getAttendanceById(req.params.id);

  if (!attendance) {
    return res.status(404).json({ message: 'Attendance record not found' });
  }

  await deleteAttendanceRecord(req.params.id);

  res.json({
    success: true,
    message: 'Attendance deleted',
  });
});

module.exports = {
  markAttendance,
  updateAttendance,
  markBulkAttendance,
  saveAttendance,
  getAttendanceSessionDetails,
  getAttendance,
  getAttendanceReport,
  getStudentAttendance,
  deleteAttendance,
};
