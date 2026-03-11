const User = require('../models/User');
const Student = require('../models/Student');
const Timetable = require('../models/Timetable');
const Attendance = require('../models/Attendance');
const Fee = require('../models/Fee');
const Grade = require('../models/Grade');
const Parent = require('../models/Parent');
const Subject = require('../models/Subject');
const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const Bus = require('../models/Bus');
const Meeting = require('../models/Meeting');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { generateToken } = require('../middleware/authMiddleware');
const mongoose = require('mongoose');
const { syncUserAuthRecord } = require('../services/authSqlService');
const {
  ensureStudentSqlReady,
  getStudentList,
  getAllStudents: getAllStudentsFromSql,
  getStudentById: getStudentByIdFromSql,
  createStudentMirror,
  updateStudentMirror,
  deleteStudentMirror,
  getStudentFullProfile,
  getStudentCount: getStudentCountFromSql,
  getStudentsByClass: getStudentsByClassFromSql,
} = require('../services/studentSqlService');

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

  const user = await User.findOne({ email });

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

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  const student = await Student.findOne({ userId: user._id });

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

  const student = await Student.findById(studentId);

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
    section,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const result = await getStudentList({
    page,
    limit,
    search,
    className: classFilter,
    sectionName: section,
    sortBy,
    sortOrder,
  });

  res.json({
    success: true,
    students: result.students,
    pagination: {
      total: result.total,
      page: Number(page) || 1,
      pages: Math.ceil(result.total / (Number(limit) || 10)),
      limit: Number(limit) || 10,
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
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid student ID' });
  }

  await ensureStudentSqlReady();
  const student = await getStudentByIdFromSql(req.params.id);

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

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid student ID',
    });
  }

  await ensureStudentSqlReady();
  const sqlSnapshot = await getStudentFullProfile(id);
  const student = sqlSnapshot.student;

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found',
    });
  }

  const studentObjectId = new mongoose.Types.ObjectId(id);
  const now = new Date();

  const [
    parents,
    attendanceSummaryAgg,
    recentAttendance,
    fees,
    grades,
    subjects,
    homeworkItems,
    submissions,
    bus,
    meetings,
  ] = await Promise.all([
    Parent.find({ childId: id, isActive: true }).populate('userId', 'email').lean(),
    Attendance.aggregate([
      { $match: { studentId: studentObjectId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'Absent'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'Late'] }, 1, 0] } },
          halfDay: { $sum: { $cond: [{ $eq: ['$status', 'Half Day'] }, 1, 0] } },
        },
      },
    ]),
    Attendance.find({ studentId: id })
      .populate('markedBy', 'fullName')
      .sort({ date: -1 })
      .limit(20)
      .lean(),
    Fee.find({ studentId: id })
      .populate('createdBy', 'fullName')
      .sort({ dueDate: -1, createdAt: -1 })
      .lean(),
    Grade.find({ studentId: id })
      .populate('examId', 'name examDate totalMarks passingMarks')
      .populate('subjectId', 'name')
      .sort({ createdAt: -1 })
      .lean(),
    Subject.find({ grade: student.class })
      .populate('teacher', 'fullName email phone')
      .sort({ name: 1 })
      .lean(),
    Homework.find({
      class: student.class,
      isActive: true,
      $or: [
        { section: student.section },
        { section: { $exists: false } },
        { section: null },
        { section: '' },
      ],
    })
      .populate('subject', 'name')
      .populate('assignedBy', 'fullName')
      .sort({ dueDate: 1 })
      .limit(100)
      .lean(),
    HomeworkSubmission.find({ studentId: id })
      .populate('gradedBy', 'fullName')
      .lean(),
    Bus.findOne({ 'assignedStudents.studentId': id })
      .select('busNumber routeName driverName driverPhone currentStatus assignedStudents')
      .lean(),
    Meeting.find({ studentId: id })
      .populate('teacherId', 'fullName email')
      .populate('parentId', 'fullName')
      .populate('subject', 'name')
      .sort({ requestedDate: -1 })
      .limit(10)
      .lean(),
  ]);

  const attendanceSummaryRaw = attendanceSummaryAgg[0] || {
    total: 0,
    present: 0,
    absent: 0,
    late: 0,
    halfDay: 0,
  };
  const effectivePresence =
    attendanceSummaryRaw.present + (attendanceSummaryRaw.late * 0.5) + (attendanceSummaryRaw.halfDay * 0.5);
  const attendancePercentage =
    attendanceSummaryRaw.total > 0
      ? Number(((effectivePresence / attendanceSummaryRaw.total) * 100).toFixed(2))
      : 0;

  const feeSummary = fees.reduce(
    (acc, fee) => {
      const grossAmount = (fee.amount || 0) + (fee.lateFee || 0) - (fee.discount || 0);
      const paidAmount = fee.paidAmount || 0;
      const pendingAmount = Math.max(grossAmount - paidAmount, 0);
      const isOverdue = pendingAmount > 0 && fee.dueDate && new Date(fee.dueDate) < now;

      acc.totalFees += grossAmount;
      acc.totalPaid += paidAmount;
      acc.totalPending += pendingAmount;
      if (isOverdue) {
        acc.overdueCount += 1;
      }

      return acc;
    },
    {
      totalFees: 0,
      totalPaid: 0,
      totalPending: 0,
      overdueCount: 0,
    }
  );

  const paymentHistory = fees
    .flatMap((fee) =>
      (fee.payments || []).map((payment) => ({
        feeId: fee._id,
        feeType: fee.feeType,
        amount: payment.amount || 0,
        date: payment.date || null,
        mode: payment.mode || null,
        transactionId: payment.transactionId || null,
        receiptNumber: payment.receiptNumber || null,
        notes: payment.notes || null,
      }))
    )
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  let totalExamMarks = 0;
  let totalMarksObtained = 0;
  const examRecords = grades.map((grade) => {
    totalExamMarks += grade.totalMarks || 0;
    totalMarksObtained += grade.marksObtained || 0;
    const percentage =
      grade.totalMarks > 0 ? Number(((grade.marksObtained / grade.totalMarks) * 100).toFixed(2)) : 0;

    return {
      id: grade._id,
      examId: grade.examId?._id || null,
      examName: grade.examId?.name || 'N/A',
      examDate: grade.examId?.examDate || null,
      subject: grade.subjectId?.name || 'N/A',
      marksObtained: grade.marksObtained || 0,
      totalMarks: grade.totalMarks || 0,
      percentage,
      grade: grade.grade || null,
      remarks: grade.remarks || null,
    };
  });
  const examAverage =
    totalExamMarks > 0 ? Number(((totalMarksObtained / totalExamMarks) * 100).toFixed(2)) : 0;

  const submissionMap = new Map(
    submissions.map((submission) => [submission.homeworkId.toString(), submission])
  );

  const homeworkRecords = homeworkItems.map((homework) => {
    const submission = submissionMap.get(homework._id.toString());
    const isOverdue = !submission && homework.dueDate && new Date(homework.dueDate) < now;
    const status = submission?.status || (isOverdue ? 'overdue' : 'pending');

    return {
      id: homework._id,
      title: homework.title,
      description: homework.description,
      subject: homework.subject?.name || 'N/A',
      dueDate: homework.dueDate || null,
      assignedBy: homework.assignedBy?.fullName || null,
      totalMarks: homework.totalMarks || null,
      status,
      submission: submission
        ? {
            submittedAt: submission.submittedAt || null,
            status: submission.status || null,
            marksObtained: submission.marksObtained ?? null,
            feedback: submission.feedback || null,
            gradedBy: submission.gradedBy?.fullName || null,
            gradedAt: submission.gradedAt || null,
          }
        : null,
    };
  });

  const homeworkSummary = homeworkRecords.reduce(
    (acc, hw) => {
      acc.total += 1;
      if (hw.status === 'submitted' || hw.status === 'graded' || hw.status === 'late') {
        acc.submitted += 1;
      }
      if (hw.status === 'pending') {
        acc.pending += 1;
      }
      if (hw.status === 'overdue') {
        acc.overdue += 1;
      }
      if (hw.status === 'graded') {
        acc.graded += 1;
      }
      return acc;
    },
    {
      total: 0,
      submitted: 0,
      pending: 0,
      overdue: 0,
      graded: 0,
    }
  );

  const transportAssignment = bus?.assignedStudents?.find(
    (entry) => String(entry.studentId) === String(id)
  );

  const parentDetails =
    parents.length > 0
      ? parents.map((parent) => ({
          id: parent._id,
          fullName: parent.fullName,
          relation: parent.relation || null,
          phone: parent.phone || null,
          email: parent.email || parent.userId?.email || null,
          occupation: parent.occupation || null,
          address: parent.address || {},
          isActive: parent.isActive,
        }))
      : sqlSnapshot.parentSnapshot && (sqlSnapshot.parentSnapshot.GuardianName || sqlSnapshot.parentSnapshot.GuardianPhone)
      ? [
          {
            id: `${id}-guardian`,
            fullName: sqlSnapshot.parentSnapshot.GuardianName || null,
            relation: sqlSnapshot.parentSnapshot.GuardianRelation || null,
            phone: sqlSnapshot.parentSnapshot.GuardianPhone || null,
            email: null,
            occupation: null,
            address: {
              street: sqlSnapshot.parentSnapshot.AddressStreet || '',
              city: sqlSnapshot.parentSnapshot.AddressCity || '',
              state: sqlSnapshot.parentSnapshot.AddressState || '',
              pincode: sqlSnapshot.parentSnapshot.AddressPincode || '',
            },
            isActive: true,
          },
        ]
      : [];

  res.json({
    success: true,
    studentProfile: {
      id: student._id,
      fullName: student.fullName,
      admissionNumber: student.rollNumber || null,
      rollNumber: student.rollNumber || null,
      class: student.class,
      section: student.section,
      email: student.email || null,
      phone: student.phone || null,
      dateOfBirth: student.dateOfBirth || null,
      gender: student.gender || null,
      bloodGroup: student.bloodGroup || null,
      admissionDate: student.admissionDate || null,
      isActive: student.isActive,
      address: student.address || {},
      profilePhoto: null,
    },
    parentDetails,
    academicInfo: {
      class: student.class,
      section: student.section,
      subjects: subjects.map((subject) => ({
        id: subject._id,
        name: subject.name,
        description: subject.description || null,
        teacher: subject.teacher
          ? {
              id: subject.teacher._id,
              fullName: subject.teacher.fullName,
              email: subject.teacher.email || null,
              phone: subject.teacher.phone || null,
            }
          : null,
      })),
    },
    attendance: {
      summary: {
        total: attendanceSummaryRaw.total,
        present: attendanceSummaryRaw.present,
        absent: attendanceSummaryRaw.absent,
        late: attendanceSummaryRaw.late,
        halfDay: attendanceSummaryRaw.halfDay,
        percentage: attendancePercentage,
      },
      recentHistory: recentAttendance.map((record) => ({
        id: record._id,
        date: record.date,
        status: record.status,
        remarks: record.remarks || null,
        markedBy: record.markedBy?.fullName || null,
      })),
    },
    fees: {
      summary: {
        totalFees: Number(feeSummary.totalFees.toFixed(2)),
        paidAmount: Number(feeSummary.totalPaid.toFixed(2)),
        pendingAmount: Number(feeSummary.totalPending.toFixed(2)),
        overdueCount: feeSummary.overdueCount,
      },
      records: fees.map((fee) => {
        const grossAmount = (fee.amount || 0) + (fee.lateFee || 0) - (fee.discount || 0);
        const paidAmount = fee.paidAmount || 0;
        return {
          id: fee._id,
          feeType: fee.feeType,
          academicYear: fee.academicYear,
          dueDate: fee.dueDate,
          amount: fee.amount || 0,
          paidAmount,
          pendingAmount: Number(Math.max(grossAmount - paidAmount, 0).toFixed(2)),
          status: fee.status,
          paymentDate: fee.paymentDate || null,
          paymentMode: fee.paymentMode || null,
          receiptNumber: fee.receiptNumber || null,
          transactionId: fee.transactionId || null,
          remarks: fee.remarks || null,
        };
      }),
      paymentHistory,
    },
    examResults: {
      summary: {
        totalExams: examRecords.length,
        totalMarks: totalExamMarks,
        totalObtained: totalMarksObtained,
        averagePercentage: examAverage,
      },
      records: examRecords,
    },
    homework: {
      summary: homeworkSummary,
      records: homeworkRecords,
    },
    additionalInfo: {
      transport: bus
        ? {
            assigned: true,
            busNumber: bus.busNumber,
            routeName: bus.routeName,
            stopName: transportAssignment?.stopName || null,
            driverName: bus.driverName,
            driverPhone: bus.driverPhone,
            currentStatus: bus.currentStatus,
          }
        : {
            assigned: false,
          },
      meetings: meetings.map((meeting) => ({
        id: meeting._id,
        title: meeting.title,
        status: meeting.status,
        requestedDate: meeting.requestedDate || null,
        requestedTime: meeting.requestedTime || null,
        meetingDate: meeting.meetingDate || null,
        meetingTime: meeting.meetingTime || null,
        isOnline: meeting.isOnline,
        teacher: meeting.teacherId?.fullName || null,
        parent: meeting.parentId?.fullName || null,
        subject: meeting.subject?.name || null,
      })),
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
    class: studentClass,
    section,
    rollNumber,
    dateOfBirth,
    gender,
    address,
    guardianName,
    guardianPhone,
    bloodGroup,
    guardianRelation,
    password,
  } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ message: 'Email already registered' });
  }

  const existingRoll = await Student.findOne({ rollNumber });
  if (existingRoll) {
    return res.status(400).json({ message: 'Roll number already exists' });
  }

  let user = null;
  let student = null;

  try {
    user = await User.create({
      fullName,
      email,
      password: password || 'student123',
      role: 'student',
      phone,
    });

    student = await Student.create({
      userId: user._id,
      fullName,
      email,
      phone,
      class: studentClass,
      section,
      rollNumber,
      dateOfBirth,
      gender,
      address,
      guardianName,
      guardianPhone,
      guardianRelation,
      bloodGroup,
    });

    await syncUserAuthRecord(user);
    const studentResponse = await createStudentMirror(student, user);

    res.status(201).json({
      success: true,
      student: studentResponse,
    });
  } catch (error) {
    if (student?._id) {
      await Student.findByIdAndDelete(student._id);
    }
    if (user?._id) {
      await User.findByIdAndDelete(user._id);
    }
    throw error;
  }
});

// @desc    Update student
// @route   PUT /api/students/:id
// @access  Private (Admin)
const updateStudent = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid student ID' });
  }

  const student = await Student.findById(req.params.id);

  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const {
    fullName,
    phone,
    class: studentClass,
    section,
    rollNumber,
    dateOfBirth,
    gender,
    address,
    guardianName,
    guardianPhone,
    guardianRelation,
    bloodGroup,
    isActive,
  } = req.body;
  const normalizedIsActive = parseBooleanInput(isActive);

  if (rollNumber && rollNumber !== student.rollNumber) {
    const existingRoll = await Student.findOne({ rollNumber });
    if (existingRoll) {
      return res.status(400).json({ message: 'Roll number already exists' });
    }
  }

  if (fullName !== undefined) student.fullName = fullName;
  if (phone !== undefined) student.phone = phone;
  if (studentClass !== undefined) student.class = studentClass;
  if (section !== undefined) student.section = section;
  if (rollNumber !== undefined) student.rollNumber = rollNumber;
  if (dateOfBirth !== undefined) student.dateOfBirth = dateOfBirth || null;
  if (gender !== undefined) student.gender = gender || null;
  if (address !== undefined) student.address = address || {};
  if (guardianName !== undefined) student.guardianName = guardianName;
  if (guardianPhone !== undefined) student.guardianPhone = guardianPhone;
  if (guardianRelation !== undefined) student.guardianRelation = guardianRelation;
  if (bloodGroup !== undefined) student.bloodGroup = bloodGroup;
  if (normalizedIsActive !== undefined) student.isActive = normalizedIsActive;

  await student.save();

  let user = null;
  if (student.userId) {
    user = await User.findById(student.userId);
    if (user) {
      if (fullName !== undefined) user.fullName = fullName;
      if (phone !== undefined) user.phone = phone;
      if (normalizedIsActive !== undefined) user.isActive = normalizedIsActive;
      await user.save();
      await syncUserAuthRecord(user);
    }
  }

  const updatedStudent = await updateStudentMirror(student, user);

  res.json({
    success: true,
    student: updatedStudent,
  });
});

// @desc    Delete student
// @route   DELETE /api/students/:id
// @access  Private (Admin)
const deleteStudent = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid student ID' });
  }

  const student = await Student.findById(req.params.id);

  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  await User.findByIdAndDelete(student.userId);
  await Student.findByIdAndDelete(req.params.id);
  await deleteStudentMirror(req.params.id);

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
