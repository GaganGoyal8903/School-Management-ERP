const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { getStudentByUserId, getStudentById } = require('../services/studentSqlService');
const mongoose = require('mongoose');

const toTrimmedString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
};

const isMongoObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const normalizeNumericId = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const normalizeHomeworkStatusLabel = (homework) => (
  homework?.isActive === false ? 'Archived' : 'Active'
);

const mapHomeworkForResponse = (homework = {}, extra = {}) => {
  const record = homework?.toObject ? homework.toObject() : homework;

  return {
    ...record,
    _id: record?._id ? String(record._id) : record?._id,
    subject: record?.subject?.name || record?.subjectName || record?.subject || null,
    subjectName: record?.subject?.name || record?.subjectName || record?.subject || null,
    grade: record?.class || null,
    status: normalizeHomeworkStatusLabel(record),
    assignedBy: record?.assignedBy?.fullName
      ? record.assignedBy
      : (record?.assignedByName ? { fullName: record.assignedByName } : null),
    ...extra,
  };
};

const resolveSubjectReference = async ({ subject, className }) => {
  const normalizedSubject = toTrimmedString(subject);
  if (!normalizedSubject) {
    return { subjectId: null, subjectName: null };
  }

  if (isMongoObjectId(normalizedSubject)) {
    const subjectRecord = await Subject.findById(normalizedSubject);
    if (subjectRecord) {
      return {
        subjectId: subjectRecord._id,
        subjectName: subjectRecord.name,
      };
    }
  }

  const existingSubject = await Subject.findOne({
    name: new RegExp(`^${normalizedSubject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    ...(className ? { grade: className } : {}),
  });

  if (existingSubject) {
    return {
      subjectId: existingSubject._id,
      subjectName: existingSubject.name,
    };
  }

  const createdSubject = await Subject.create({
    name: normalizedSubject,
    grade: className || 'General',
  });

  return {
    subjectId: createdSubject._id,
    subjectName: createdSubject.name,
  };
};

const resolveAssignedByPayload = (user = {}) => {
  const normalizedUserId = toTrimmedString(user?._id ?? user?.id);
  if (normalizedUserId && isMongoObjectId(normalizedUserId)) {
    return {
      assignedBy: normalizedUserId,
      assignedByName: toTrimmedString(user?.fullName) || 'Teacher',
    };
  }

  return {
    assignedBy: undefined,
    assignedByName: toTrimmedString(user?.fullName) || 'Teacher',
  };
};

const buildSubmissionLookupQuery = ({ studentMongoId = null, studentSqlId = null } = {}) => {
  const clauses = [];

  if (studentMongoId && isMongoObjectId(studentMongoId)) {
    clauses.push({ studentId: new mongoose.Types.ObjectId(String(studentMongoId)) });
  }

  if (studentSqlId) {
    clauses.push({ studentSqlId });
  }

  if (!clauses.length) {
    return null;
  }

  return clauses.length === 1 ? clauses[0] : { $or: clauses };
};

// @desc    Get all homework
// @route   GET /api/homework
// @access  Private (Teacher/Admin)
const getHomework = asyncHandler(async (req, res) => {
  const { class: classFilter, grade, subject, status } = req.query;
  
  let query = {};
  
  const normalizedClass = toTrimmedString(classFilter || grade);
  const normalizedSubject = toTrimmedString(subject);
  const normalizedStatus = toTrimmedString(status)?.toLowerCase();

  if (normalizedClass) query.class = normalizedClass;
  if (normalizedStatus === 'active') query.isActive = true;
  if (normalizedStatus === 'archived') query.isActive = false;
  if (normalizedSubject) {
    query.$or = [
      { subjectName: new RegExp(`^${normalizedSubject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    ];

    if (isMongoObjectId(normalizedSubject)) {
      query.$or.push({ subject: normalizedSubject });
    }
  }

  const homework = await Homework.find(query)
    .populate('subject', 'name')
    .populate('assignedBy', 'fullName')
    .sort({ dueDate: -1 });

  const homeworkIds = homework.map((record) => record._id).filter(Boolean);
  const submissions = homeworkIds.length
    ? await HomeworkSubmission.find({ homeworkId: { $in: homeworkIds } }).lean()
    : [];
  const submissionCounts = submissions.reduce((acc, submission) => {
    const key = String(submission.homeworkId);
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map());

  let mappedHomework = homework.map((record) => mapHomeworkForResponse(record, {
    submittedCount: submissionCounts.get(String(record._id)) || 0,
  }));

  if (normalizedStatus === 'overdue') {
    mappedHomework = mappedHomework.filter((record) => (
      record.status === 'Active' && record.dueDate && new Date(record.dueDate) < new Date()
    ));
  }

  res.json({
    success: true,
    homework: mappedHomework,
  });
});

// @desc    Get homework for a specific class
// @route   GET /api/homework/class/:class
// @access  Private
const getHomeworkByClass = asyncHandler(async (req, res) => {
  const { class: className } = req.params;
  const { section } = req.query;
  
  let query = { class: className, isActive: true };
  if (section) query.section = section;

  const homework = await Homework.find(query)
    .populate('subject', 'name')
    .populate('assignedBy', 'fullName')
    .sort({ dueDate: 1 });

  // Get submissions for students in this class
  const students = await Student.find({ class: className, section });
  const studentIds = students.map(s => s._id);
  
  const submissions = await HomeworkSubmission.find({
    studentId: { $in: studentIds }
  });

  // Map submissions to homework
  const homeworkWithStats = homework.map(hw => {
    const classSubmissions = submissions.filter(s => s.homeworkId.toString() === hw._id.toString());
    return mapHomeworkForResponse(hw, {
      totalStudents: students.length,
      submitted: classSubmissions.length,
      pending: students.length - classSubmissions.length
    });
  });

  res.json({
    success: true,
    homework: homeworkWithStats
  });
});

// @desc    Get homework for student
// @route   GET /api/homework/student/:studentId
// @access  Private (Parent/Student)
const getHomeworkByStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  let student = null;
  let submissionQuery = null;
  const normalizedStudentSqlId = normalizeNumericId(studentId);

  if (isMongoObjectId(studentId)) {
    student = await Student.findById(studentId);
    submissionQuery = buildSubmissionLookupQuery({ studentMongoId: studentId });
  }

  if (!student && normalizedStudentSqlId) {
    const resolvedStudent = await getStudentById(normalizedStudentSqlId);
    if (resolvedStudent?.class) {
      student = resolvedStudent;
      submissionQuery = buildSubmissionLookupQuery({ studentSqlId: normalizedStudentSqlId });
    }
  }

  if (!student || !student.class) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const homework = await Homework.find({ 
    class: student.class,
    isActive: true 
  })
    .populate('subject', 'name')
    .populate('assignedBy', 'fullName')
    .sort({ dueDate: 1 });

  // Get submissions for this student
  const submissions = submissionQuery
    ? await HomeworkSubmission.find(submissionQuery)
    : [];

  // Map submissions to homework
  const homeworkWithSubmission = homework.map(hw => {
    const submission = submissions.find(s => s.homeworkId.toString() === hw._id.toString());
    return mapHomeworkForResponse(hw, {
      submission: submission || null,
      status: submission ? submission.status : 'not submitted',
      marksObtained: submission?.marksObtained || null
    });
  });

  res.json({
    success: true,
    homework: homeworkWithSubmission
  });
});

// @desc    Create homework
// @route   POST /api/homework
// @access  Private (Teacher/Admin)
const createHomework = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    subject,
    class: studentClass,
    grade,
    section,
    dueDate,
    attachmentUrl,
    attachmentName,
    totalMarks,
  } = req.body;
  const className = toTrimmedString(studentClass || grade);

  if (!title || !description || !className || !dueDate) {
    return res.status(400).json({ message: 'Title, description, class, and due date are required.' });
  }

  const { subjectId, subjectName } = await resolveSubjectReference({
    subject,
    className,
  });
  const assignedByPayload = resolveAssignedByPayload(req.user);

  const homework = await Homework.create({
    title,
    description,
    subject: subjectId || undefined,
    subjectName,
    class: className,
    section,
    assignedBy: assignedByPayload.assignedBy,
    assignedByName: assignedByPayload.assignedByName,
    dueDate,
    attachmentUrl,
    attachmentName,
    totalMarks
  });

  const populatedHomework = await Homework.findById(homework._id)
    .populate('subject', 'name')
    .populate('assignedBy', 'fullName');

  res.status(201).json({
    success: true,
    homework: mapHomeworkForResponse(populatedHomework)
  });
});

// @desc    Update homework
// @route   PUT /api/homework/:id
// @access  Private (Teacher/Admin)
const updateHomework = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    subject,
    class: studentClass,
    grade,
    section,
    dueDate,
    attachmentUrl,
    attachmentName,
    totalMarks,
    isActive,
  } = req.body;

  const homework = await Homework.findById(req.params.id);

  if (!homework) {
    return res.status(404).json({ message: 'Homework not found' });
  }

  const className = toTrimmedString(studentClass || grade || homework.class);
  const { subjectId, subjectName } = subject
    ? await resolveSubjectReference({ subject, className })
    : { subjectId: homework.subject, subjectName: homework.subjectName };

  homework.title = title || homework.title;
  homework.description = description || homework.description;
  homework.subject = subjectId || homework.subject;
  homework.subjectName = subjectName || homework.subjectName;
  homework.class = className || homework.class;
  homework.section = section || homework.section;
  homework.dueDate = dueDate || homework.dueDate;
  homework.attachmentUrl = attachmentUrl || homework.attachmentUrl;
  homework.attachmentName = attachmentName || homework.attachmentName;
  homework.totalMarks = totalMarks || homework.totalMarks;
  homework.isActive = isActive !== undefined ? isActive : homework.isActive;

  await homework.save();

  const populatedHomework = await Homework.findById(homework._id)
    .populate('subject', 'name')
    .populate('assignedBy', 'fullName');

  res.json({
    success: true,
    homework: mapHomeworkForResponse(populatedHomework)
  });
});

// @desc    Delete homework
// @route   DELETE /api/homework/:id
// @access  Private (Admin)
const deleteHomework = asyncHandler(async (req, res) => {
  const homework = await Homework.findById(req.params.id);

  if (!homework) {
    return res.status(404).json({ message: 'Homework not found' });
  }

  // Delete all submissions for this homework
  await HomeworkSubmission.deleteMany({ homeworkId: req.params.id });
  await Homework.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: 'Homework deleted'
  });
});

// @desc    Submit homework
// @route   POST /api/homework/:id/submit
// @access  Private (Student)
const submitHomework = asyncHandler(async (req, res) => {
  const { submissionText, attachmentUrl, attachmentName } = req.body;
  
  const homework = await Homework.findById(req.params.id);

  if (!homework) {
    return res.status(404).json({ message: 'Homework not found' });
  }

  // Check if already submitted
  const resolvedStudent = await getStudentByUserId(req.user);
  if (!resolvedStudent) {
    return res.status(404).json({ message: 'Student profile not found for the logged-in account.' });
  }

  const studentMongoId = isMongoObjectId(resolvedStudent?._id) ? String(resolvedStudent._id) : null;
  const studentSqlId = normalizeNumericId(
    resolvedStudent?.dbId ?? resolvedStudent?._id ?? resolvedStudent?.id ?? resolvedStudent?.studentId
  );
  const submissionLookupQuery = buildSubmissionLookupQuery({
    studentMongoId,
    studentSqlId,
  });

  if (!submissionLookupQuery) {
    return res.status(400).json({ message: 'This student account is not linked to a valid homework submission profile yet.' });
  }

  const existingSubmission = await HomeworkSubmission.findOne({
    homeworkId: req.params.id,
    ...submissionLookupQuery,
  });

  if (existingSubmission) {
    return res.status(400).json({ message: 'Homework already submitted' });
  }

  // Check if late
  const isLate = new Date() > new Date(homework.dueDate);

  const submission = await HomeworkSubmission.create({
    homeworkId: req.params.id,
    studentId: studentMongoId || undefined,
    studentSqlId: studentSqlId || undefined,
    studentFullName: toTrimmedString(resolvedStudent?.fullName) || 'Student',
    submissionText,
    attachmentUrl,
    attachmentName,
    status: isLate ? 'late' : 'submitted'
  });

  res.status(201).json({
    success: true,
    submission
  });
});

// @desc    Grade homework submission
// @route   PUT /api/homework/submission/:id/grade
// @access  Private (Teacher)
const gradeSubmission = asyncHandler(async (req, res) => {
  const { marksObtained, feedback } = req.body;

  const submission = await HomeworkSubmission.findById(req.params.id);

  if (!submission) {
    return res.status(404).json({ message: 'Submission not found' });
  }

  submission.marksObtained = marksObtained;
  submission.feedback = feedback;
  submission.status = 'graded';
  submission.gradedBy = isMongoObjectId(req.user?._id) ? req.user._id : undefined;
  submission.gradedByName = toTrimmedString(req.user?.fullName) || 'Teacher';
  submission.gradedAt = new Date();

  await submission.save();

  res.json({
    success: true,
    submission
  });
});

// @desc    Get homework submissions
// @route   GET /api/homework/:id/submissions
// @access  Private (Teacher)
const getSubmissions = asyncHandler(async (req, res) => {
  const submissions = await HomeworkSubmission.find({ homeworkId: req.params.id })
    .populate('studentId', 'fullName rollNumber class section')
    .populate('gradedBy', 'fullName')
    .sort({ submittedAt: -1 });

  res.json({
    success: true,
    submissions: submissions.map((submission) => {
      const record = submission.toObject ? submission.toObject() : submission;
      return {
        ...record,
        _id: record?._id ? String(record._id) : record?._id,
        student: record?.studentId
          ? {
              _id: record.studentId._id ? String(record.studentId._id) : record.studentId._id,
              fullName: record.studentId.fullName || record.studentFullName || 'Student',
              rollNumber: record.studentId.rollNumber || null,
              class: record.studentId.class || null,
              section: record.studentId.section || null,
            }
          : {
              _id: record.studentSqlId ? String(record.studentSqlId) : null,
              fullName: record.studentFullName || 'Student',
              rollNumber: null,
              class: null,
              section: null,
            },
      };
    }),
  });
});

module.exports = {
  getHomework,
  getHomeworkByClass,
  getHomeworkByStudent,
  createHomework,
  updateHomework,
  deleteHomework,
  submitHomework,
  gradeSubmission,
  getSubmissions
};

