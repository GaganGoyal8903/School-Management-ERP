const User = require('../models/User');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const Material = require('../models/Material');
const Attendance = require('../models/Attendance');
const Exam = require('../models/Exam');
const Grade = require('../models/Grade');
const { asyncHandler } = require('../middleware/errorMiddleware');

// @desc    Get dashboard statistics
// @route   GET /api/reports/dashboard
// @access  Private
const getDashboardStats = asyncHandler(async (req, res) => {
  // Get counts
  const studentCount = await Student.countDocuments({ isActive: true });
  const teacherCount = await User.countDocuments({ role: 'teacher', isActive: { $ne: false } });
  const subjectCount = await Subject.countDocuments();
  const materialCount = await Material.countDocuments();

  // Get today's attendance
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayAttendance = await Attendance.find({
    date: { $gte: today, $lt: tomorrow }
  });

  const presentToday = todayAttendance.filter(a => a.status === 'Present').length;
  const absentToday = todayAttendance.filter(a => a.status === 'Absent').length;
  const lateToday = todayAttendance.filter(a => a.status === 'Late').length;

  // Get upcoming exams
  const upcomingExams = await Exam.find({
    examDate: { $gte: new Date() }
  })
    .populate('subject', 'name')
    .sort({ examDate: 1 })
    .limit(5);

  // Get recent materials
  const recentMaterials = await Material.find()
    .populate('uploadedBy', 'fullName')
    .sort({ createdAt: -1 })
    .limit(5);

  // Get attendance trend (last 7 days)
  const attendanceTrend = await Attendance.aggregate([
    {
      $match: {
        date: {
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        present: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'Absent'] }, 1, 0] } },
        total: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Return directly as required by frontend
  res.json({
    success: true,
    totalStudents: studentCount,
    totalTeachers: teacherCount,
    totalSubjects: subjectCount,
    totalMaterials: materialCount,
    stats: {
      students: studentCount,
      teachers: teacherCount,
      subjects: subjectCount,
      materials: materialCount
    },
    todayAttendance: {
      present: presentToday,
      absent: absentToday,
      late: lateToday,
      total: todayAttendance.length,
      percentage: todayAttendance.length > 0 
        ? ((presentToday / todayAttendance.length) * 100).toFixed(1) 
        : 0
    },
    upcomingExams,
    recentMaterials,
    attendanceTrend
  });
});

// @desc    Get analytics data
// @route   GET /api/reports/analytics
// @access  Private (Admin)
const getAnalytics = asyncHandler(async (req, res) => {
  const { period = 'month' } = req.query;

  let startDate = new Date();
  if (period === 'week') {
    startDate.setDate(startDate.getDate() - 7);
  } else if (period === 'month') {
    startDate.setMonth(startDate.getMonth() - 1);
  } else if (period === 'year') {
    startDate.setFullYear(startDate.getFullYear() - 1);
  }

  // Student enrollment trend
  const studentTrend = await Student.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Class-wise student distribution
  const classDistribution = await Student.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$class',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Subject distribution
  const subjectDistribution = await Subject.aggregate([
    {
      $group: {
        _id: '$grade',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Attendance by class
  const attendanceByClass = await Attendance.aggregate([
    { $match: { date: { $gte: startDate } } },
    {
      $group: {
        _id: '$class',
        present: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'Absent'] }, 1, 0] } },
        total: { $sum: 1 }
      }
    },
    {
      $project: {
        class: '$_id',
        present: 1,
        absent: 1,
        total: 1,
        percentage: {
          $multiply: [{ $divide: ['$present', '$total'] }, 100]
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Grade performance (average marks by subject)
  const gradePerformance = await Grade.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: '$subjectId',
        averageMarks: { $avg: '$marksObtained' },
        totalStudents: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'subjects',
        localField: '_id',
        foreignField: '_id',
        as: 'subject'
      }
    },
    { $unwind: '$subject' },
    {
      $project: {
        subject: '$subject.name',
        averageMarks: { $round: ['$averageMarks', 2] },
        totalStudents: 1
      }
    },
    { $sort: { averageMarks: -1 } }
  ]);

  res.json({
    success: true,
    analytics: {
      studentTrend,
      classDistribution,
      subjectDistribution,
      attendanceByClass,
      gradePerformance
    }
  });
});

// @desc    Get summary report
// @route   GET /api/reports/summary
// @access  Private
const getSummaryReport = asyncHandler(async (req, res) => {
  // Total counts
  const totalStudents = await Student.countDocuments();
  const totalTeachers = await User.countDocuments({ role: 'teacher' });
  const totalSubjects = await Subject.countDocuments();
  const totalMaterials = await Material.countDocuments();

  // Active students
  const activeStudents = await Student.countDocuments({ isActive: true });

  // Average attendance (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const attendanceStats = await Attendance.aggregate([
    { $match: { date: { $gte: thirtyDaysAgo } } },
    {
      $group: {
        _id: null,
        present: { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } },
        total: { $sum: 1 }
      }
    }
  ]);

  const avgAttendance = attendanceStats.length > 0
    ? ((attendanceStats[0].present / attendanceStats[0].total) * 100).toFixed(2)
    : 0;

  // Exams conducted
  const totalExams = await Exam.countDocuments();

  // Average grade
  const gradeStats = await Grade.aggregate([
    {
      $group: {
        _id: null,
        avgMarks: { $avg: '$marksObtained' }
      }
    }
  ]);

  const avgGrade = gradeStats.length > 0
    ? gradeStats[0].avgMarks.toFixed(2)
    : 0;

  res.json({
    success: true,
    summary: {
      totalStudents,
      activeStudents,
      totalTeachers,
      totalSubjects,
      totalMaterials,
      totalExams,
      avgAttendance,
      avgGrade
    }
  });
});

// @desc    Export attendance report
// @route   GET /api/reports/attendance/export
// @access  Private (Admin)
const exportAttendanceReport = asyncHandler(async (req, res) => {
  const { class: classFilter, startDate, endDate } = req.query;

  let query = {};

  if (classFilter) {
    query.class = classFilter;
  }

  if (startDate && endDate) {
    query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  const attendances = await Attendance.find(query)
    .populate('studentId', 'fullName rollNumber class')
    .populate('markedBy', 'fullName')
    .sort({ date: -1 });

  // Transform for export
  const exportData = attendances.map(a => ({
    date: a.date.toISOString().split('T')[0],
    studentName: a.studentId?.fullName,
    rollNumber: a.studentId?.rollNumber,
    class: a.studentId?.class,
    status: a.status,
    markedBy: a.markedBy?.fullName,
    remarks: a.remarks || ''
  }));

  res.json({
    success: true,
    data: exportData,
    count: exportData.length
  });
});

module.exports = {
  getDashboardStats,
  getAnalytics,
  getSummaryReport,
  exportAttendanceReport
};

