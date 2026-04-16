const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const { asyncHandler } = require('../middleware/errorMiddleware');

// @desc    Mark attendance
// @route   POST /api/attendance
// @access  Private (Admin, Teacher)
const markAttendance = asyncHandler(async (req, res) => {
  const { studentId, date, status, class: studentClass, section, remarks } = req.body;

  // Check if student exists
  const student = await Student.findById(studentId);
  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  // Check if attendance already marked for this student on this date
  const existingAttendance = await Attendance.findOne({
    studentId,
    date: new Date(date).setHours(0, 0, 0, 0)
  });

  if (existingAttendance) {
    // Update existing attendance
    existingAttendance.status = status;
    existingAttendance.remarks = remarks;
    existingAttendance.markedBy = req.user._id;
    await existingAttendance.save();

    return res.json({
      success: true,
      attendance: existingAttendance,
      message: 'Attendance updated'
    });
  }

  // Create new attendance
  const attendance = await Attendance.create({
    studentId,
    date: new Date(date),
    status,
    class: studentClass || student.class,
    section: section || student.section,
    markedBy: req.user._id,
    remarks
  });

  res.status(201).json({
    success: true,
    attendance
  });
});

// @desc    Mark bulk attendance
// @route   POST /api/attendance/bulk
// @access  Private (Admin, Teacher)
const markBulkAttendance = asyncHandler(async (req, res) => {
  const { attendances, date, class: studentClass, section } = req.body;

  if (!attendances || !Array.isArray(attendances) || attendances.length === 0) {
    return res.status(400).json({ message: 'Please provide attendance records' });
  }

  const results = [];
  const errors = [];

  for (const record of attendances) {
    try {
      const student = await Student.findById(record.studentId);
      if (!student) {
        errors.push({ studentId: record.studentId, message: 'Student not found' });
        continue;
      }

      // Check existing attendance
      const existingAttendance = await Attendance.findOne({
        studentId: record.studentId,
        date: new Date(date).setHours(0, 0, 0, 0)
      });

      if (existingAttendance) {
        existingAttendance.status = record.status;
        existingAttendance.remarks = record.remarks;
        existingAttendance.markedBy = req.user._id;
        await existingAttendance.save();
        results.push(existingAttendance);
      } else {
        const attendance = await Attendance.create({
          studentId: record.studentId,
          date: new Date(date),
          status: record.status,
          class: studentClass || student.class,
          section: section || student.section,
          markedBy: req.user._id,
          remarks: record.remarks
        });
        results.push(attendance);
      }
    } catch (error) {
      errors.push({ studentId: record.studentId, message: error.message });
    }
  }

  res.status(201).json({
    success: true,
    marked: results.length,
    errors: errors.length > 0 ? errors : undefined,
    attendances: results
  });
});

// @desc    Get attendance records
// @route   GET /api/attendance
// @access  Private
const getAttendance = asyncHandler(async (req, res) => {
  const { 
    studentId, 
    class: classFilter, 
    section, 
    date, 
    startDate, 
    endDate,
    page = 1,
    limit = 50
  } = req.query;

  let query = {};

  if (studentId) {
    query.studentId = studentId;
  }

  if (classFilter) {
    query.class = classFilter;
  }

  if (section) {
    query.section = section;
  }

  if (date) {
    const dateObj = new Date(date);
    const nextDay = new Date(dateObj);
    nextDay.setDate(nextDay.getDate() + 1);
    query.date = { $gte: dateObj, $lt: nextDay };
  }

  if (startDate && endDate) {
    query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  const total = await Attendance.countDocuments(query);
  
  const attendances = await Attendance.find(query)
    .populate('studentId', 'fullName rollNumber')
    .populate('markedBy', 'fullName')
    .sort({ date: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  res.json({
    success: true,
    attendances,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get attendance report
// @route   GET /api/attendance/report
// @access  Private
const getAttendanceReport = asyncHandler(async (req, res) => {
  const { class: classFilter, section, startDate, endDate } = req.query;

  let matchQuery = {};

  if (classFilter) {
    matchQuery.class = classFilter;
  }

  if (section) {
    matchQuery.section = section;
  }

  if (startDate && endDate) {
    matchQuery.date = { 
      $gte: new Date(startDate), 
      $lte: new Date(endDate) 
    };
  }

  // Get attendance stats by status
  const statusStats = await Attendance.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  // Get daily attendance
  const dailyStats = await Attendance.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        present: {
          $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] }
        },
        absent: {
          $sum: { $cond: [{ $eq: ['$status', 'Absent'] }, 1, 0] }
        },
        late: {
          $sum: { $cond: [{ $eq: ['$status', 'Late'] }, 1, 0] }
        },
        total: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Get student-wise attendance
  const studentStats = await Attendance.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$studentId',
        present: {
          $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] }
        },
        absent: {
          $sum: { $cond: [{ $eq: ['$status', 'Absent'] }, 1, 0] }
        },
        late: {
          $sum: { $cond: [{ $eq: ['$status', 'Late'] }, 1, 0] }
        },
        total: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'students',
        localField: '_id',
        foreignField: '_id',
        as: 'student'
      }
    },
    { $unwind: '$student' },
    {
      $project: {
        studentName: '$student.fullName',
        rollNumber: '$student.rollNumber',
        present: 1,
        absent: 1,
        late: 1,
        total: 1,
        percentage: {
          $multiply: [
            { $divide: ['$present', '$total'] },
            100
          ]
        }
      }
    }
  ]);

  res.json({
    success: true,
    statusStats,
    dailyStats,
    studentStats
  });
});

// @desc    Get attendance for a student
// @route   GET /api/attendance/student/:studentId
// @access  Private
const getStudentAttendance = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const requestedStudentId = req.params.studentId;

  // STUDENT DATA ISOLATION: Students can only view their own attendance
  if (req.user.role === 'student') {
    // Get student profile to find the logged-in student's ID
    const Student = require('../models/Student');
    const studentProfile = await Student.findOne({ userId: req.user._id });
    
    if (!studentProfile) {
      return res.status(403).json({ message: 'Student profile not found' });
    }
    
    // Only allow access to own attendance
    if (studentProfile._id.toString() !== requestedStudentId) {
      return res.status(403).json({ message: 'Not authorized to view other student attendance' });
    }
  }

  let query = { studentId: requestedStudentId };

  if (startDate && endDate) {
    query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  const attendances = await Attendance.find(query)
    .populate('markedBy', 'fullName')
    .sort({ date: -1 });

  // Calculate percentage
  const total = attendances.length;
  const present = attendances.filter(a => a.status === 'Present').length;
  const absent = attendances.filter(a => a.status === 'Absent').length;
  const late = attendances.filter(a => a.status === 'Late').length;

  const percentage = total > 0 ? ((present + late * 0.5) / total * 100).toFixed(2) : 0;

  res.json({
    success: true,
    attendances,
    stats: {
      total,
      present,
      absent,
      late,
      percentage
    }
  });
});

// @desc    Delete attendance
// @route   DELETE /api/attendance/:id
// @access  Private (Admin)
const deleteAttendance = asyncHandler(async (req, res) => {
  const attendance = await Attendance.findById(req.params.id);

  if (!attendance) {
    return res.status(404).json({ message: 'Attendance record not found' });
  }

  await attendance.deleteOne();

  res.json({
    success: true,
    message: 'Attendance deleted'
  });
});

module.exports = {
  markAttendance,
  markBulkAttendance,
  getAttendance,
  getAttendanceReport,
  getStudentAttendance,
  deleteAttendance
};

