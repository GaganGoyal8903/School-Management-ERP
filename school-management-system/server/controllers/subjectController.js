const { asyncHandler } = require('../middleware/errorMiddleware');
const {
  getAuthUserById,
  getAuthUsersByIds,
} = require('../services/authSqlService');
const {
  ensureAcademicSqlReady,
  getSubjectList,
  getSubjectById: getSubjectByIdFromSql,
  createSubjectRecord,
  updateSubjectRecord,
  deleteSubjectRecord,
  getSubjectsByGrade: getSubjectsByGradeFromSql,
  getSubjectCount: getSubjectCountFromSql,
  assignTeacherToSubjectRecord,
} = require('../services/academicSqlService');
const {
  extractSubjectId,
  getTeacherAssignmentScope,
  paginateItems,
} = require('../services/teacherAssignmentService');

const toNormalizedString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
};

const normalizeTeacherUser = (teacher) => {
  if (!teacher) {
    return null;
  }

  const teacherId = toNormalizedString(
    teacher._id ??
    teacher.id ??
    teacher.UserId ??
    teacher.userId ??
    teacher.MongoUserId ??
    teacher.mongoUserId
  );

  if (!teacherId) {
    return null;
  }

  return {
    _id: teacherId,
    fullName: toNormalizedString(teacher.fullName ?? teacher.FullName ?? teacher.name ?? teacher.Name),
    email: toNormalizedString(teacher.email ?? teacher.Email),
    phone: toNormalizedString(teacher.phone ?? teacher.Phone),
    role: String(teacher.role ?? teacher.RoleName ?? teacher.roleName ?? '').trim().toLowerCase() || null,
  };
};

const buildTeacherResponse = (teacher, { includePhone = false } = {}) => {
  if (!teacher?._id) {
    return null;
  }

  return {
    _id: teacher._id,
    fullName: teacher.fullName,
    email: teacher.email,
    ...(includePhone ? { phone: teacher.phone || null } : {}),
  };
};

const getRequestRole = (req) => String(req.user?.role || '').trim().toLowerCase();

const attachTeacherInfo = async (subject, { includePhone = false } = {}) => {
  if (!subject) {
    return null;
  }

  if (!subject.teacher) {
    return {
      ...subject,
      teacher: null,
    };
  }

  const teacher = normalizeTeacherUser(await getAuthUserById(subject.teacher));
  if (!teacher) {
    return {
      ...subject,
      teacher: null,
    };
  }

  return {
    ...subject,
    teacher: buildTeacherResponse(teacher, { includePhone }),
  };
};

const attachTeacherInfoToList = async (subjects, { includePhone = false } = {}) => {
  if (!subjects.length) {
    return [];
  }

  const teacherIds = [...new Set(subjects.map((subject) => subject.teacher).filter(Boolean))];
  const teachers = (await getAuthUsersByIds(teacherIds)).map(normalizeTeacherUser).filter(Boolean);
  const teacherMap = new Map(teachers.map((teacher) => [teacher._id, teacher]));
  const missingTeacherIds = teacherIds.filter((teacherId) => !teacherMap.has(String(teacherId)));

  for (const teacherId of missingTeacherIds) {
    const teacher = normalizeTeacherUser(await getAuthUserById(teacherId));
    if (teacher) {
      teacherMap.set(teacher._id, teacher);
    }
  }

  return subjects.map((subject) => {
    const teacher = subject.teacher ? teacherMap.get(String(subject.teacher)) : null;
    return {
      ...subject,
      teacher: buildTeacherResponse(teacher, { includePhone }),
    };
  });
};

const validateTeacherAssignment = async (teacherId) => {
  if (!teacherId) {
    return null;
  }

  const teacher = normalizeTeacherUser(await getAuthUserById(teacherId));
  return teacher?.role === 'teacher' ? teacher : null;
};

// @desc    Get all subjects
// @route   GET /api/subjects
// @access  Private
const getSubjects = asyncHandler(async (req, res) => {
  await ensureAcademicSqlReady();
  const { grade, search, page = 1, limit = 10 } = req.query;
  const requestRole = getRequestRole(req);

  let subjects = [];
  let total = 0;

  if (requestRole === 'teacher') {
    const scope = await getTeacherAssignmentScope({
      teacherUserId: req.user?._id,
      grade,
      search,
    });
    const paginated = paginateItems(scope.subjects, page, limit);
    subjects = paginated.items;
    total = paginated.total;
  } else {
    const result = await getSubjectList({
      page,
      limit,
      grade,
      search,
    });
    subjects = result.subjects;
    total = result.total;
  }

  const hydratedSubjects = await attachTeacherInfoToList(subjects);

  res.json({
    success: true,
    subjects: hydratedSubjects,
    pagination: {
      total,
      page: Number(page) || 1,
      pages: Math.ceil(total / (Number(limit) || 10)),
    },
  });
});

// @desc    Get single subject
// @route   GET /api/subjects/:id
// @access  Private
const getSubject = asyncHandler(async (req, res) => {
  await ensureAcademicSqlReady();
  const subject = await getSubjectByIdFromSql(req.params.id);
  const requestRole = getRequestRole(req);

  if (!subject) {
    return res.status(404).json({ message: 'Subject not found' });
  }

  if (requestRole === 'teacher') {
    const scope = await getTeacherAssignmentScope({ teacherUserId: req.user?._id });
    if (!scope.subjectIds.has(extractSubjectId(subject))) {
      return res.status(403).json({ message: 'Not authorized to access this subject' });
    }
  }

  res.json({
    success: true,
    subject: await attachTeacherInfo(subject, { includePhone: true }),
  });
});

// @desc    Create subject
// @route   POST /api/subjects
// @access  Private (Admin)
const createSubject = asyncHandler(async (req, res) => {
  await ensureAcademicSqlReady();
  const { name, grade, description, teacher } = req.body;

  if (teacher) {
    const assignedTeacher = await validateTeacherAssignment(teacher);
    if (!assignedTeacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
  }

  const subjectRecord = await createSubjectRecord({
    name,
    grade,
    description,
    teacher: teacher || null,
  });

  res.status(201).json({
    success: true,
    subject: await attachTeacherInfo(subjectRecord),
  });
});

// @desc    Update subject
// @route   PUT /api/subjects/:id
// @access  Private (Admin)
const updateSubject = asyncHandler(async (req, res) => {
  const { name, grade, description, teacher } = req.body;
  const existingSubject = await getSubjectByIdFromSql(req.params.id);

  if (!existingSubject) {
    return res.status(404).json({ message: 'Subject not found' });
  }

  if (teacher) {
    const assignedTeacher = await validateTeacherAssignment(teacher);
    if (!assignedTeacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
  }

  const subjectRecord = await updateSubjectRecord(req.params.id, {
    name: name ?? existingSubject.name,
    grade: grade ?? existingSubject.grade,
    description: description ?? existingSubject.description,
    teacher: teacher !== undefined ? teacher || null : existingSubject.teacher,
  });

  res.json({
    success: true,
    subject: await attachTeacherInfo(subjectRecord),
  });
});

// @desc    Delete subject
// @route   DELETE /api/subjects/:id
// @access  Private (Admin)
const deleteSubject = asyncHandler(async (req, res) => {
  const subject = await getSubjectByIdFromSql(req.params.id);

  if (!subject) {
    return res.status(404).json({ message: 'Subject not found' });
  }

  await deleteSubjectRecord(req.params.id);

  res.json({
    success: true,
    message: 'Subject deleted',
  });
});

// @desc    Get subjects by grade
// @route   GET /api/subjects/grade/:grade
// @access  Private
const getSubjectsByGrade = asyncHandler(async (req, res) => {
  await ensureAcademicSqlReady();
  const requestRole = getRequestRole(req);

  let subjects = await getSubjectsByGradeFromSql(req.params.grade);

  if (requestRole === 'teacher') {
    const scope = await getTeacherAssignmentScope({
      teacherUserId: req.user?._id,
      grade: req.params.grade,
    });
    subjects = subjects.filter((subject) => scope.subjectIds.has(extractSubjectId(subject)));
  }

  res.json({
    success: true,
    subjects: await attachTeacherInfoToList(subjects),
  });
});

// @desc    Get subject count
// @route   GET /api/subjects/count
// @access  Private
const getSubjectCount = asyncHandler(async (req, res) => {
  await ensureAcademicSqlReady();
  const requestRole = getRequestRole(req);

  let count = 0;
  if (requestRole === 'teacher') {
    const scope = await getTeacherAssignmentScope({ teacherUserId: req.user?._id });
    count = scope.subjectIds.size;
  } else {
    count = await getSubjectCountFromSql();
  }

  res.json({
    success: true,
    count,
  });
});

// @desc    Assign teacher to subject
// @route   PUT /api/subjects/:id/assign-teacher
// @access  Private (Admin)
const assignTeacherToSubject = asyncHandler(async (req, res) => {
  const { teacherId } = req.body;

  const subject = await getSubjectByIdFromSql(req.params.id);
  if (!subject) {
    return res.status(404).json({ message: 'Subject not found' });
  }

  if (teacherId) {
    const assignedTeacher = await validateTeacherAssignment(teacherId);
    if (!assignedTeacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
  }

  const subjectRecord = await assignTeacherToSubjectRecord({
    subjectId: req.params.id,
    teacherId: teacherId || null,
  });

  res.json({
    success: true,
    subject: await attachTeacherInfo(subjectRecord),
  });
});

module.exports = {
  getSubjects,
  getSubject,
  createSubject,
  updateSubject,
  deleteSubject,
  getSubjectsByGrade,
  getSubjectCount,
  assignTeacherToSubject,
};
