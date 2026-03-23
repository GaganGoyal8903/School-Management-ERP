const Timetable = require('../models/Timetable');
const Parent = require('../models/Parent');
const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const Bus = require('../models/Bus');
const Meeting = require('../models/Meeting');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { generateToken } = require('../middleware/authMiddleware');
const { getSqlClient, executeQuery } = require('../config/sqlServer');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {
  createAuthUser,
  getAuthUserByEmail,
  getAuthUsersByIds,
  updateAuthUser,
  deleteAuthUser,
} = require('../services/authSqlService');
const {
  ensureStudentSqlReady,
  getStudentList,
  getAllStudents: getAllStudentsFromSql,
  getStudentById: getStudentByIdFromSql,
  createStudentRecord,
  updateStudentRecord,
  deleteStudentRecord,
  getStudentFullProfile,
  getStudentCount: getStudentCountFromSql,
  getStudentsByClass: getStudentsByClassFromSql,
  getStudentByRollNumber,
  getStudentByUserId,
} = require('../services/studentSqlService');
const { getStudentAttendanceReport } = require('../services/attendanceSqlService');
const { getFeesForStudent } = require('../services/feeSqlService');
const { getStudentExamResults } = require('../services/examSqlService');
const { getSubjectsByGrade } = require('../services/academicSqlService');

const parseBooleanInput = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'y'].includes(normalized);
  }

  return Boolean(value);
};

const parseStudentIdParam = (value) => {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
};

const firstDefinedValue = (...values) => values.find((value) => value !== undefined);

const normalizeStudentAddressInput = (payload = {}) => {
  const rawAddress = payload.address && typeof payload.address === 'object' ? payload.address : {};

  return {
    street: firstDefinedValue(rawAddress.street, rawAddress.addressLine1, payload.addressStreet, payload.addressLine1, payload.street) || '',
    line2: firstDefinedValue(rawAddress.line2, rawAddress.addressLine2, payload.addressLine2, payload.line2) || '',
    city: firstDefinedValue(rawAddress.city, payload.city) || '',
    state: firstDefinedValue(rawAddress.state, payload.state) || '',
    pincode: firstDefinedValue(
      rawAddress.pincode,
      rawAddress.postalCode,
      rawAddress.zipCode,
      payload.addressPincode,
      payload.postalCode,
      payload.zipCode,
      payload.pincode
    ) || '',
    country: firstDefinedValue(rawAddress.country, payload.country) || '',
  };
};

const hasStudentAddressInput = (payload = {}) => {
  const rawAddress = payload.address && typeof payload.address === 'object' ? payload.address : {};

  return [
    rawAddress.street,
    rawAddress.addressLine1,
    rawAddress.line2,
    rawAddress.addressLine2,
    rawAddress.city,
    rawAddress.state,
    rawAddress.pincode,
    rawAddress.postalCode,
    rawAddress.zipCode,
    rawAddress.country,
    payload.addressStreet,
    payload.addressLine1,
    payload.addressLine2,
    payload.street,
    payload.line2,
    payload.city,
    payload.state,
    payload.addressPincode,
    payload.postalCode,
    payload.zipCode,
    payload.pincode,
    payload.country,
  ].some((value) => value !== undefined);
};

const normalizeStudentPayload = (payload = {}) => {
  const derivedFullName = [payload.firstName, payload.lastName]
    .filter((value) => String(value || '').trim())
    .join(' ')
    .trim();

  return {
    fullName: firstDefinedValue(payload.fullName, payload.name, derivedFullName),
    email: firstDefinedValue(payload.email, payload.emailAddress),
    phone: firstDefinedValue(payload.phone, payload.mobile, payload.mobileNumber, payload.contactNumber),
    className: firstDefinedValue(payload.class, payload.className),
    sectionName: firstDefinedValue(payload.section, payload.sectionName),
    rollNumber: firstDefinedValue(payload.rollNumber, payload.rollNo),
    dateOfBirth: firstDefinedValue(payload.dateOfBirth, payload.dob, payload.DOB),
    gender: firstDefinedValue(payload.gender, payload.sex),
    address: hasStudentAddressInput(payload) ? normalizeStudentAddressInput(payload) : undefined,
    guardianName: firstDefinedValue(payload.guardianName, payload.parentName),
    guardianPhone: firstDefinedValue(payload.guardianPhone, payload.parentPhone),
    guardianRelation: firstDefinedValue(payload.guardianRelation, payload.parentRelation, payload.relation),
    bloodGroup: firstDefinedValue(payload.bloodGroup, payload.bloodGroupType),
    password: firstDefinedValue(payload.password, payload.passcode),
    academicYear: firstDefinedValue(payload.academicYear, payload.academicYearName, payload.yearName),
    admissionDate: firstDefinedValue(payload.admissionDate, payload.enrollmentDate),
    isActive: parseBooleanInput(payload.isActive),
  };
};

const isBcryptHash = (value = '') => /^\$2[aby]\$\d{2}\$/.test(String(value || ''));

const isStoredPasswordMatch = async (inputPassword, storedPassword) => {
  const normalizedInput = String(inputPassword || '');
  const normalizedStored = String(storedPassword || '');

  if (!normalizedStored) {
    return false;
  }

  if (isBcryptHash(normalizedStored)) {
    try {
      return await bcrypt.compare(normalizedInput, normalizedStored);
    } catch (error) {
      return false;
    }
  }

  return normalizedInput === normalizedStored;
};

const mapFeeRecordForDetails = (fee, fallbackAcademicYear = null, referenceDate = new Date()) => {
  const amount = Number(fee?.amount || 0);
  const paidAmount = Number(fee?.paidAmount || 0);
  const pendingAmount = Number(fee?.pendingAmount ?? Math.max(amount - paidAmount, 0));
  const dueDate = fee?.dueDate || null;
  const isOverdue = pendingAmount > 0 && dueDate && new Date(dueDate) < referenceDate;

  return {
    id: fee?.id || fee?._id || null,
    feeType: fee?.feeType || null,
    academicYear: fee?.academicYear || fallbackAcademicYear || null,
    dueDate,
    amount,
    paidAmount,
    pendingAmount,
    status: fee?.status || (pendingAmount > 0 ? 'Pending' : 'Paid'),
    description: fee?.description || null,
    paymentDate: fee?.paymentDate || null,
    paymentMode: fee?.paymentMode || null,
    receiptNumber: fee?.receiptNumber || null,
    transactionId: fee?.transactionId || null,
    remarks: fee?.remarks || null,
    payments: Array.isArray(fee?.payments) ? fee.payments : [],
    isOverdue,
  };
};

const summarizeFeeRecords = (feeRecords = []) => feeRecords.reduce(
  (acc, record) => {
    acc.totalFees += Number(record.amount || 0);
    acc.paidAmount += Number(record.paidAmount || 0);
    acc.pendingAmount += Number(record.pendingAmount || 0);
    if (record.isOverdue) {
      acc.overdueCount += 1;
    }
    return acc;
  },
  {
    totalFees: 0,
    paidAmount: 0,
    pendingAmount: 0,
    overdueCount: 0,
  }
);

const mapExamRecordForDetails = (record) => ({
  id: record?.id || record?._id || null,
  examName: record?.examName || record?.examId?.name || record?.examId?.title || 'Exam',
  examDate: record?.examDate || record?.examId?.examDate || record?.examId?.date || null,
  subject: typeof record?.subject === 'string'
    ? record.subject
    : record?.subject?.name || record?.subjectId?.name || 'Subject',
  marksObtained: Number(record?.marksObtained || record?.marks || 0),
  totalMarks: Number(record?.totalMarks || record?.examId?.totalMarks || 0),
  percentage: Number(record?.percentage || 0),
  grade: record?.grade || null,
  remarks: record?.remarks || null,
  isAbsent: record?.isAbsent === true,
});

const summarizeExamRecords = (examRecords = []) => {
  const totals = examRecords.reduce(
    (acc, record) => {
      acc.totalExams += 1;
      acc.totalMarks += Number(record.totalMarks || 0);
      acc.totalObtained += Number(record.marksObtained || 0);
      acc.percentageTotal += Number(record.percentage || 0);
      return acc;
    },
    {
      totalExams: 0,
      totalMarks: 0,
      totalObtained: 0,
      percentageTotal: 0,
    }
  );

  return {
    totalExams: totals.totalExams,
    totalMarks: totals.totalMarks,
    totalObtained: totals.totalObtained,
    averagePercentage: totals.totalExams > 0
      ? Number((totals.percentageTotal / totals.totalExams).toFixed(2))
      : 0,
  };
};

const buildAttendanceSnapshotForDetails = (attendanceRecords = []) => {
  const summary = attendanceRecords.reduce(
    (acc, record) => {
      const normalizedStatus = String(record?.status || '').trim().toLowerCase();
      acc.total += 1;

      if (normalizedStatus === 'present') {
        acc.present += 1;
      } else if (normalizedStatus === 'absent') {
        acc.absent += 1;
      } else if (normalizedStatus === 'late') {
        acc.late += 1;
      } else if (normalizedStatus === 'half day' || normalizedStatus === 'excused') {
        acc.halfDay += 1;
      }

      return acc;
    },
    {
      total: 0,
      present: 0,
      absent: 0,
      late: 0,
      halfDay: 0,
    }
  );

  return {
    summary: {
      ...summary,
      percentage: summary.total > 0 ? Number(((summary.present / summary.total) * 100).toFixed(2)) : 0,
    },
    recentHistory: attendanceRecords.slice(0, 10).map((record) => ({
      id: record?.id || record?._id || null,
      date: record?.date || null,
      status: record?.status || 'Absent',
      markedBy: record?.markedBy?.fullName || null,
      remarks: record?.remarks || '',
    })),
  };
};

const buildTransportDetails = (row) => {
  if (!row) {
    return {
      assigned: false,
    };
  }

  const hasGps = row.GpsLatitude !== null && row.GpsLatitude !== undefined
    && row.GpsLongitude !== null && row.GpsLongitude !== undefined;

  return {
    assigned: true,
    assignmentId: row.AssignmentId ? String(row.AssignmentId) : null,
    busNumber: row.VehicleNumber || null,
    routeName: row.RouteName || null,
    stopName: row.PickupPoint || row.DropPoint || null,
    pickupPoint: row.PickupPoint || null,
    dropPoint: row.DropPoint || null,
    driverName: row.DriverName || null,
    driverPhone: row.DriverPhone || null,
    currentStatus: row.CurrentStatus || row.AssignmentStatus || null,
    gpsLocation: hasGps
      ? {
          latitude: Number(row.GpsLatitude),
          longitude: Number(row.GpsLongitude),
          speed: Number(row.GpsSpeed || 0),
          lastUpdated: row.LastLocationUpdated || null,
        }
      : null,
  };
};

// @desc    Student Login
// @route   POST /api/student/login
// @access  Public
const studentLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide email and password',
    });
  }

  const user = await getAuthUserByEmail(email);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  if (user.role !== 'student') {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials - not a student account',
    });
  }

  const isMatch = await isStoredPasswordMatch(password, user.password);

  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  const student = await getStudentByUserId(user._id);

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student profile not found',
    });
  }

  if (!student.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Account is inactive. Please contact school administration.',
    });
  }

  const token = generateToken(user._id);

  res.json({
    success: true,
    message: 'Login successful',
    token,
    studentId: student._id,
    name: student.fullName,
    classId: student.class,
    sectionId: student.section,
    email: student.email,
    rollNumber: student.rollNumber,
    class: student.class,
    section: student.section,
    phone: student.phone,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
  });
});

// @desc    Get student timetable
// @route   GET /api/student/timetable/:studentId
// @access  Private (Student)
const getStudentTimetable = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { day } = req.query;

  const student = await getStudentByIdFromSql(studentId);

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found',
    });
  }

  const query = {
    class: student.class,
    section: student.section,
    academicYear: '2024-2025',
    isActive: true,
  };

  if (day) {
    query.day = day;
  }

  const timetable = await Timetable.find(query)
    .populate('periods.subject', 'name code')
    .populate('periods.teacher', 'fullName')
    .sort({ day: 1, 'periods.periodNumber': 1 });

  if (!timetable || timetable.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'No timetable found for your class',
      class: student.class,
      section: student.section,
    });
  }

  const formattedTimetable = timetable.map((dayEntry) => ({
    _id: dayEntry._id,
    class: dayEntry.class,
    section: dayEntry.section,
    day: dayEntry.day,
    academicYear: dayEntry.academicYear,
    periods: dayEntry.periods.map((period) => ({
      periodNumber: period.periodNumber,
      subject: period.subject ? period.subject.name : 'N/A',
      subjectCode: period.subject ? period.subject.code : 'N/A',
      teacher: period.teacher ? period.teacher.fullName : 'TBA',
      startTime: period.startTime,
      endTime: period.endTime,
      roomNumber: period.roomNumber || 'TBA',
    })),
  }));

  res.json({
    success: true,
    message: 'Timetable fetched successfully',
    studentName: student.fullName,
    class: student.class,
    section: student.section,
    timetable: formattedTimetable,
  });
});

// @desc    Get all students
// @route   GET /api/students
// @access  Private (Admin, Teacher)
const getStudents = asyncHandler(async (req, res) => {
  await ensureStudentSqlReady();

  const {
    page = 1,
    limit = 10,
    search,
    class: classFilter,
    classId,
    section,
    sectionId,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const result = await getStudentList({
    page,
    limit,
    search,
    className: classFilter,
    sectionName: section,
    classId,
    sectionId,
    sortBy,
    sortOrder,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.info('[students] GET /api/students', {
      source: result.sourceProcedure || 'sql',
      returned: result.students.length,
      total: result.total,
      page: result.page,
      limit: result.limit,
      search: search || null,
      classFilter: classFilter || null,
      classId: classId || null,
      section: section || null,
      sectionId: sectionId || null,
    });
  }

  res.json({
    success: true,
    students: result.students,
    availableClasses: result.availableClasses || [],
    pagination: {
      total: result.total,
      page: result.page,
      pages: Math.ceil(result.total / result.limit),
      limit: result.limit,
    },
  });
});

// @desc    Get all students without pagination
// @route   GET /api/students/all
// @access  Private (Admin, Teacher)
const getAllStudents = asyncHandler(async (req, res) => {
  await ensureStudentSqlReady();
  const students = await getAllStudentsFromSql();

  res.json({
    success: true,
    students,
  });
});

// @desc    Get single student
// @route   GET /api/students/:id
// @access  Private
const getStudent = asyncHandler(async (req, res) => {
  const studentId = parseStudentIdParam(req.params.id);
  if (!studentId) {
    return res.status(400).json({ message: 'Invalid student ID' });
  }

  await ensureStudentSqlReady();
  const student = await getStudentByIdFromSql(studentId);

  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  res.json({
    success: true,
    student,
  });
});

// @desc    Get complete student details
// @route   GET /api/students/:id/details
// @access  Private (Admin, Teacher)
const getStudentDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = parseStudentIdParam(id);

  if (!studentId) {
    return res.status(400).json({
      success: false,
      message: 'Invalid student ID',
    });
  }

  await ensureStudentSqlReady();
  const sqlSnapshot = await getStudentFullProfile(studentId);
  const student = sqlSnapshot.student;

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found',
    });
  }

  const now = new Date();
  const sql = getSqlClient();
  const [attendanceResult, subjectsResult, transportResult, feesResult, examsResult] = await Promise.allSettled([
    getStudentAttendanceReport({ studentId }),
    getSubjectsByGrade(student.class),
    executeQuery(`
      SELECT TOP 1
        sta.AssignmentId,
        sta.PickupPoint,
        sta.DropPoint,
        sta.Status AS AssignmentStatus,
        tv.VehicleNumber,
        tv.RouteName,
        tv.DriverName,
        tv.DriverPhone,
        tv.CurrentStatus,
        tv.GpsLatitude,
        tv.GpsLongitude,
        tv.GpsSpeed,
        tv.LastLocationUpdated
      FROM dbo.StudentTransportAssignments sta
      INNER JOIN dbo.TransportVehicles tv
        ON tv.VehicleId = sta.VehicleId
      WHERE sta.StudentId = @StudentId
        AND sta.Status = N'Active'
        AND ISNULL(tv.IsActive, 1) = 1
      ORDER BY sta.AssignmentId DESC;
    `, [
      { name: 'StudentId', type: sql.Int, value: studentId },
    ]),
    getFeesForStudent(studentId),
    getStudentExamResults({ studentId, className: student.class }),
  ]);

  const attendanceRecords = attendanceResult.status === 'fulfilled' ? attendanceResult.value : [];
  const attendance = buildAttendanceSnapshotForDetails(attendanceRecords);
  const academicSubjects = subjectsResult.status === 'fulfilled'
    ? (subjectsResult.value || [])
        .filter((subject) => !subject.sectionName || subject.sectionName === student.section)
        .map((subject) => ({
          id: subject.id || subject._id || null,
          name: subject.name || '-',
          code: subject.code || null,
          teacher: subject.teacherName
            ? {
                fullName: subject.teacherName,
                email: null,
              }
            : null,
        }))
    : [];
  const transport = buildTransportDetails(
    transportResult.status === 'fulfilled' ? transportResult.value?.recordset?.[0] || null : null
  );
  const feeSource = feesResult.status === 'fulfilled'
    ? feesResult.value
    : (sqlSnapshot.feeSnapshot || []);
  const feeRecords = feeSource.map((fee) => mapFeeRecordForDetails(fee, student.academicYear, now));
  const feeSummary = summarizeFeeRecords(feeRecords);
  const paymentHistory = feeRecords
    .flatMap((fee) => (fee.payments || []).map((payment) => ({
      id: payment.id || null,
      feeType: fee.feeType || null,
      amount: Number(payment.amount || 0),
      date: payment.date || null,
      mode: payment.mode || null,
      transactionId: payment.transactionId || null,
      receiptNumber: payment.receiptNumber || null,
      notes: payment.notes || null,
    })))
    .sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0));
  const examSource = examsResult.status === 'fulfilled'
    ? examsResult.value?.grades || []
    : (sqlSnapshot.examSnapshot || []);
  const examRecords = examSource.map(mapExamRecordForDetails);
  const examSummaryFromService = examsResult.status === 'fulfilled' ? examsResult.value?.stats || null : null;
  const examSummary = examSummaryFromService
    ? {
        totalExams: Number(examSummaryFromService.totalExams || 0),
        totalMarks: Number(examSummaryFromService.totalMarks || 0),
        totalObtained: Number(examSummaryFromService.totalObtained || 0),
        averagePercentage: Number(examSummaryFromService.average || 0),
      }
    : summarizeExamRecords(examRecords);
  const parentDetails = (sqlSnapshot.parentDetails || []).length > 0
    ? sqlSnapshot.parentDetails.map((parent) => ({
        id: parent.id,
        fullName: parent.fullName || null,
        relation: parent.relation || null,
        phone: parent.phone || null,
        alternatePhone: parent.alternatePhone || null,
        email: parent.email || null,
        occupation: parent.occupation || null,
        address: parent.address || {},
        isPrimaryGuardian: parent.isPrimaryGuardian === true,
        isActive: parent.isActive !== false,
      }))
    : (student.parentName || student.parentPhone)
      ? [
          {
            id: `guardian-${student.id}`,
            fullName: student.parentName || student.guardianName || null,
            relation: student.guardianRelation || null,
            phone: student.parentPhone || student.guardianPhone || null,
            alternatePhone: null,
            email: null,
            occupation: null,
            address: student.address || {},
            isPrimaryGuardian: true,
            isActive: true,
          },
        ]
      : [];

  res.json({
    success: true,
    studentProfile: {
      _id: student.id,
      id: student.id,
      studentId: student.studentId,
      fullName: student.fullName,
      admissionNumber: student.admissionNumber || null,
      rollNumber: student.rollNumber || null,
      class: student.class,
      section: student.section,
      academicYear: student.academicYear || null,
      email: student.email || null,
      phone: student.phone || null,
      dateOfBirth: student.dateOfBirth || null,
      gender: student.gender || null,
      bloodGroup: student.bloodGroup || null,
      admissionDate: student.admissionDate || null,
      isActive: student.isActive,
      address: student.address || {},
      profilePhoto: student.profilePhoto || null,
      parentName: student.parentName || student.guardianName || null,
      parentPhone: student.parentPhone || student.guardianPhone || null,
    },
    parentDetails,
    academicInfo: {
      class: student.class,
      section: student.section,
      academicYear: student.academicYear || null,
      subjects: academicSubjects,
    },
    attendance,
    fees: {
      summary: {
        totalFees: Number(feeSummary.totalFees.toFixed(2)),
        paidAmount: Number(feeSummary.paidAmount.toFixed(2)),
        pendingAmount: Number(feeSummary.pendingAmount.toFixed(2)),
        overdueCount: feeSummary.overdueCount,
      },
      records: feeRecords.map(({ isOverdue, ...fee }) => fee),
      paymentHistory,
    },
    examResults: {
      summary: examSummary,
      records: examRecords,
    },
    homework: {
      summary: {
        total: 0,
        submitted: 0,
        pending: 0,
        overdue: 0,
        graded: 0,
      },
      records: [],
    },
    additionalInfo: {
      transport,
      meetings: [],
      hostel: {
        available: false,
        message: 'Hostel module data is not available in current schema.',
      },
      library: {
        available: false,
        message: 'Library module data is not available in current schema.',
      },
      notes: [],
      disciplinaryRecords: [],
    },
  });
});

// @desc    Create student
// @route   POST /api/students
// @access  Private (Admin)
const createStudent = asyncHandler(async (req, res) => {
  await ensureStudentSqlReady();

  const {
    fullName,
    email,
    phone,
    className: studentClass,
    sectionName: section,
    rollNumber,
    dateOfBirth,
    gender,
    address,
    guardianName,
    guardianPhone,
    bloodGroup,
    guardianRelation,
    password,
    academicYear,
    admissionDate,
    isActive,
  } = normalizeStudentPayload(req.body);

  if (!fullName || !email || !studentClass || !section || !rollNumber || !password) {
    return res.status(400).json({
      success: false,
      message: 'Full name, email, class, section, roll number, and password are required.',
    });
  }

  const existingUser = await getAuthUserByEmail(email);
  if (existingUser) {
    return res.status(400).json({ message: 'Email already registered' });
  }

  const existingRoll = await getStudentByRollNumber(rollNumber);
  if (existingRoll) {
    return res.status(400).json({ message: 'Roll number already exists' });
  }

  const passwordHash = String(password);
  const authUser = await createAuthUser({
    fullName,
    email,
    passwordHash,
    role: 'student',
    phone,
    isActive: isActive !== false,
  });

  const studentResponse = await createStudentRecord({
    userId: authUser._id,
    fullName,
    email,
    phone,
    className: studentClass,
    sectionName: section,
    rollNumber,
    dateOfBirth,
    gender,
    address,
    guardianName,
    guardianPhone,
    guardianRelation,
    bloodGroup,
    admissionDate,
    academicYear,
    isActive: isActive !== false,
  });

  res.status(201).json({
    success: true,
    student: studentResponse,
  });
});

// @desc    Update student
// @route   PUT /api/students/:id
// @access  Private (Admin)
const updateStudent = asyncHandler(async (req, res) => {
  const studentId = parseStudentIdParam(req.params.id);
  if (!studentId) {
    return res.status(400).json({ message: 'Invalid student ID' });
  }

  const student = await getStudentByIdFromSql(studentId);

  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const normalizedPayload = normalizeStudentPayload(req.body);
  const {
    fullName,
    email,
    phone,
    className: studentClass,
    sectionName: section,
    rollNumber,
    dateOfBirth,
    gender,
    address,
    guardianName,
    guardianPhone,
    guardianRelation,
    bloodGroup,
    admissionDate,
    academicYear,
    isActive,
  } = normalizedPayload;
  const normalizedIsActive = isActive;

  if (rollNumber && rollNumber !== student.rollNumber) {
    const existingRoll = await getStudentByRollNumber(rollNumber);
    if (existingRoll) {
      return res.status(400).json({ message: 'Roll number already exists' });
    }
  }

  const userId = student.userId?._id || student.userId || null;
  const nextFullName = fullName && String(fullName).trim() ? fullName : student.fullName;
  const nextEmail = email && String(email).trim() ? email : student.email;
  let authUser = null;
  if (userId) {
    authUser = await updateAuthUser(userId, {
      fullName: nextFullName,
      email: nextEmail,
      phone: phone ?? student.phone,
      isActive: normalizedIsActive ?? student.isActive,
    });
  }

  const updatedStudent = await updateStudentRecord(studentId, {
    userId,
    fullName: nextFullName,
    email: authUser?.email || nextEmail,
    phone: phone ?? student.phone,
    className: studentClass ?? student.class,
    sectionName: section ?? student.section,
    rollNumber: rollNumber ?? student.rollNumber,
    dateOfBirth: dateOfBirth !== undefined ? dateOfBirth || null : student.dateOfBirth,
    gender: gender !== undefined ? gender || null : student.gender,
    address: address !== undefined ? address || {} : student.address,
    guardianName: guardianName ?? student.guardianName,
    guardianPhone: guardianPhone ?? student.guardianPhone,
    guardianRelation: guardianRelation ?? student.guardianRelation,
    bloodGroup: bloodGroup ?? student.bloodGroup,
    admissionDate: admissionDate !== undefined ? admissionDate || null : student.admissionDate,
    academicYear: academicYear ?? student.academicYear,
    isActive: normalizedIsActive !== undefined ? normalizedIsActive : student.isActive,
  });

  res.json({
    success: true,
    student: updatedStudent,
  });
});

// @desc    Delete student
// @route   DELETE /api/students/:id
// @access  Private (Admin)
const deleteStudent = asyncHandler(async (req, res) => {
  const studentId = parseStudentIdParam(req.params.id);
  if (!studentId) {
    return res.status(400).json({ message: 'Invalid student ID' });
  }

  const student = await getStudentByIdFromSql(studentId);

  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const userId = student.userId?._id || student.userId || null;
  if (userId) {
    await deleteAuthUser(userId);
  }
  await deleteStudentRecord(studentId);

  res.json({
    success: true,
    message: 'Student deleted successfully',
  });
});

// @desc    Get students by class
// @route   GET /api/students/class/:class
// @access  Private
const getStudentsByClass = asyncHandler(async (req, res) => {
  await ensureStudentSqlReady();
  const students = await getStudentsByClassFromSql(req.params.class);

  res.json({
    success: true,
    students,
  });
});

// @desc    Get student count
// @route   GET /api/students/count
// @access  Private
const getStudentCount = asyncHandler(async (req, res) => {
  await ensureStudentSqlReady();
  const count = await getStudentCountFromSql({ onlyActive: true });

  res.json({
    success: true,
    count,
  });
});

module.exports = {
  studentLogin,
  getStudentTimetable,
  getStudents,
  getAllStudents,
  getStudent,
  getStudentDetails,
  createStudent,
  updateStudent,
  deleteStudent,
  getStudentsByClass,
  getStudentCount,
};
