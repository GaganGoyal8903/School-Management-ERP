const { asyncHandler } = require('../middleware/errorMiddleware');
const {
  createAuthUser,
  getAuthUserByEmailRole,
  updateAuthUser,
  deleteAuthUser,
} = require('../services/authSqlService');
const {
  ensureTeacherSqlReady,
  getTeacherList,
  getTeacherById: getTeacherByIdFromSql,
  createTeacherRecord,
  updateTeacherRecord,
  deleteTeacherRecord,
  getTeacherFullProfile,
  getTeacherCount: getTeacherCountFromSql,
  getAvailableTeachers: getAvailableTeachersFromSql,
} = require('../services/teacherSqlService');
const {
  replaceTeacherAssignments,
} = require('../services/academicSqlService');
const DUPLICATE_ROLE_EMAIL_MESSAGE = 'This email already exists for the selected role';
const logTeacherAuthDebug = (event, payload = {}) => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  console.info('[teachers-auth]', { event, ...payload });
};

const parseBooleanInput = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'y'].includes(value.trim().toLowerCase());
  }

  return Boolean(value);
};

const parseTeacherIdParam = (value) => {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
};

const firstDefinedValue = (...values) => values.find((value) => value !== undefined);

const normalizeTeacherAddressInput = (payload = {}) => {
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

const hasTeacherAddressInput = (payload = {}) => {
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

const hasTeacherSubjectInput = (payload = {}) =>
  payload.subjects !== undefined ||
  payload.subjectIds !== undefined ||
  payload.subjectId !== undefined ||
  payload.subject !== undefined;

const normalizeTeacherSubjectIds = (payload = {}) => {
  const rawSubjects = firstDefinedValue(
    payload.subjects,
    payload.subjectIds,
    payload.subjectId !== undefined ? [payload.subjectId] : undefined,
    payload.subject !== undefined ? [payload.subject] : undefined
  );

  const subjectEntries = Array.isArray(rawSubjects)
    ? rawSubjects
    : rawSubjects !== undefined && rawSubjects !== null && rawSubjects !== ''
      ? [rawSubjects]
      : [];

  return [...new Set(
    subjectEntries
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          return firstDefinedValue(entry.classSubjectId, entry._id, entry.id, entry.subjectId);
        }

        return entry;
      })
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )];
};

const normalizeTeacherPayload = (payload = {}) => {
  const derivedFullName = [payload.firstName, payload.lastName]
    .filter((value) => String(value || '').trim())
    .join(' ')
    .trim();

  return {
    fullName: firstDefinedValue(payload.fullName, payload.name, derivedFullName),
    email: firstDefinedValue(payload.email, payload.emailAddress),
    phone: firstDefinedValue(payload.phone, payload.phoneNumber, payload.mobile, payload.mobileNumber, payload.contactNumber),
    gender: firstDefinedValue(payload.gender, payload.sex),
    dateOfBirth: firstDefinedValue(payload.dateOfBirth, payload.dob, payload.DOB),
    designation: firstDefinedValue(payload.designation, payload.roleLabel),
    department: firstDefinedValue(payload.department, payload.departmentName),
    qualification: firstDefinedValue(payload.qualification, payload.education),
    experience: firstDefinedValue(payload.experience, payload.experienceYears),
    joiningDate: firstDefinedValue(payload.joiningDate, payload.joinDate),
    address: hasTeacherAddressInput(payload) ? normalizeTeacherAddressInput(payload) : undefined,
    subjects: hasTeacherSubjectInput(payload) ? normalizeTeacherSubjectIds(payload) : undefined,
    bloodGroup: firstDefinedValue(payload.bloodGroup, payload.bloodGroupType),
    emergencyContact: firstDefinedValue(payload.emergencyContact, payload.emergencyPhone),
    notes: firstDefinedValue(payload.notes, payload.remark, payload.remarks),
    password: firstDefinedValue(payload.password, payload.passcode),
    isActive: parseBooleanInput(payload.isActive),
  };
};

const logTeacherSubjectMismatch = (teacher, requestedSubjectIds = []) => {
  if (process.env.NODE_ENV === 'production' || !requestedSubjectIds.length) {
    return;
  }

  const assignedSubjectIds = Array.isArray(teacher?.subjects)
    ? teacher.subjects
      .map((subject) => String(subject?.id || subject?._id || subject?.classSubjectId || '').trim())
      .filter(Boolean)
    : [];

  const requestedSet = new Set(requestedSubjectIds.map((value) => String(value).trim()));
  const assignedSet = new Set(assignedSubjectIds);
  const missingSubjectIds = [...requestedSet].filter((value) => !assignedSet.has(value));

  if (missingSubjectIds.length) {
    console.warn('[teachers] subject assignment mismatch', {
      teacherId: teacher?.teacherId || teacher?.dbId || teacher?.id || null,
      requestedSubjectIds,
      assignedSubjectIds,
      missingSubjectIds,
    });
  }
};

const replaceTeacherSubjects = async (teacherId, subjectIds = []) => {
  await replaceTeacherAssignments(teacherId, subjectIds);
};

// @desc    Get all teachers
// @route   GET /api/teachers
// @access  Private
const getTeachers = asyncHandler(async (req, res) => {
  await ensureTeacherSqlReady();

  const {
    page = 1,
    limit = 10,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const result = await getTeacherList({
    page,
    limit,
    search,
    sortBy,
    sortOrder,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.info('[teachers] GET /api/teachers', {
      source: result.sourceQuery || 'sql',
      returned: result.teachers.length,
      total: result.total,
      page: result.page,
      limit: result.limit,
      search: search || null,
    });
  }

  res.json({
    success: true,
    teachers: result.teachers,
    pagination: {
      total: result.total,
      page: result.page,
      pages: Math.ceil(result.total / result.limit),
      limit: result.limit,
    },
  });
});

// @desc    Get single teacher
// @route   GET /api/teachers/:id
// @access  Private
const getTeacher = asyncHandler(async (req, res) => {
  const teacherId = parseTeacherIdParam(req.params.id);
  if (!teacherId) {
    return res.status(400).json({ message: 'Invalid teacher ID' });
  }

  await ensureTeacherSqlReady();

  const teacher = await getTeacherFullProfile(teacherId);

  if (!teacher) {
    return res.status(404).json({ message: 'Teacher not found' });
  }

  res.json({
    success: true,
    teacher,
  });
});

// @desc    Create teacher
// @route   POST /api/teachers
// @access  Private (Admin)
const createTeacher = asyncHandler(async (req, res) => {
  await ensureTeacherSqlReady();

  const {
    fullName,
    email,
    phone,
    gender,
    dateOfBirth,
    designation,
    department,
    qualification,
    experience,
    joiningDate,
    address,
    subjects,
    bloodGroup,
    emergencyContact,
    notes,
    password,
    isActive,
  } = normalizeTeacherPayload(req.body);

  if (!fullName || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Full name, email, and password are required.',
    });
  }

  if (String(password).length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters long.',
    });
  }

  logTeacherAuthDebug('create.duplicate-check', {
    email,
    role: 'teacher',
    query: 'getAuthUserByEmailRole',
  });

  const existingUser = await getAuthUserByEmailRole(email, 'teacher');
  if (existingUser) {
    return res.status(400).json({ message: DUPLICATE_ROLE_EMAIL_MESSAGE });
  }

  const teacherUser = await createAuthUser({
    fullName,
    email,
    passwordHash: String(password),
    role: 'teacher',
    phone,
    isActive: isActive !== false,
  });

  const teacherRecord = await createTeacherRecord({
    userId: teacherUser._id,
    gender,
    dateOfBirth,
    address,
    qualification,
    experience,
    department,
    designation,
    joiningDate,
    bloodGroup,
    emergencyContact,
    notes,
  });

  const requestedSubjectIds = Array.isArray(subjects) ? subjects : [];
  await replaceTeacherSubjects(teacherRecord.id || teacherRecord._id, requestedSubjectIds);
  const teacherResponse = await getTeacherByIdFromSql(
    teacherRecord.userId || teacherRecord.id || teacherRecord._id || teacherRecord.dbId || teacherRecord.teacherId
  );
  logTeacherSubjectMismatch(teacherResponse || teacherRecord, requestedSubjectIds);

  res.status(201).json({
    success: true,
    teacher: teacherResponse || teacherRecord,
  });
});

// @desc    Update teacher
// @route   PUT /api/teachers/:id
// @access  Private (Admin)
const updateTeacher = asyncHandler(async (req, res) => {
  await ensureTeacherSqlReady();

  const teacherId = parseTeacherIdParam(req.params.id);
  if (!teacherId) {
    return res.status(400).json({ message: 'Invalid teacher ID' });
  }

  const {
    fullName,
    email,
    phone,
    gender,
    dateOfBirth,
    designation,
    department,
    qualification,
    experience,
    joiningDate,
    address,
    subjects,
    bloodGroup,
    emergencyContact,
    notes,
    isActive,
  } = normalizeTeacherPayload(req.body);

  const teacher = await getTeacherByIdFromSql(teacherId);

  if (!teacher) {
    return res.status(404).json({ message: 'Teacher not found' });
  }

  const normalizedIsActive = parseBooleanInput(isActive);
  const nextFullName = fullName && String(fullName).trim() ? fullName : teacher.fullName;
  const nextEmail = email && String(email).trim() ? email : teacher.email;

  if (nextEmail && nextEmail !== teacher.email) {
    logTeacherAuthDebug('update.duplicate-check', {
      email: nextEmail,
      role: 'teacher',
      query: 'getAuthUserByEmailRole',
      teacherId,
    });

    const existingUser = await getAuthUserByEmailRole(nextEmail, 'teacher');
    if (existingUser && String(existingUser._id) !== String(teacher.userId || teacher.id)) {
      return res.status(400).json({ message: DUPLICATE_ROLE_EMAIL_MESSAGE });
    }
  }

  await updateAuthUser(teacher.userId || teacher.id, {
    fullName: nextFullName,
    email: nextEmail,
    phone: phone ?? teacher.phone,
    isActive: normalizedIsActive ?? teacher.isActive,
  });

  const updatedTeacher = await updateTeacherRecord(teacherId, {
    fullName: nextFullName,
    email: nextEmail,
    phone: phone ?? teacher.phone,
    gender: gender !== undefined ? gender : teacher.gender,
    dateOfBirth: dateOfBirth !== undefined ? dateOfBirth || null : teacher.dateOfBirth,
    address,
    department: department !== undefined ? department : teacher.department,
    designation: designation !== undefined ? designation : teacher.designation,
    qualification: qualification !== undefined ? qualification : teacher.qualification,
    experience: experience !== undefined ? experience : teacher.experience,
    joiningDate: joiningDate !== undefined ? joiningDate || null : teacher.joiningDate,
    bloodGroup: bloodGroup !== undefined ? bloodGroup : teacher.bloodGroup,
    emergencyContact: emergencyContact !== undefined ? emergencyContact : teacher.emergencyContact,
    notes: notes !== undefined ? notes : teacher.notes,
  });

  if (subjects !== undefined) {
    await replaceTeacherSubjects(teacher.userId || teacher.id, subjects);
  }

  const teacherResponse = await getTeacherByIdFromSql(
    teacher.userId || teacher.id || updatedTeacher?.userId || updatedTeacher?.id || updatedTeacher?.dbId || teacherId
  );
  logTeacherSubjectMismatch(teacherResponse || updatedTeacher, Array.isArray(subjects) ? subjects : []);

  res.json({
    success: true,
    teacher: teacherResponse || updatedTeacher,
  });
});

// @desc    Delete teacher
// @route   DELETE /api/teachers/:id
// @access  Private (Admin)
const deleteTeacher = asyncHandler(async (req, res) => {
  await ensureTeacherSqlReady();

  const teacherId = parseTeacherIdParam(req.params.id);
  if (!teacherId) {
    return res.status(400).json({ message: 'Invalid teacher ID' });
  }

  const teacher = await getTeacherByIdFromSql(teacherId);

  if (!teacher) {
    return res.status(404).json({ message: 'Teacher not found' });
  }

  await replaceTeacherSubjects(teacher.userId || teacher.id, []);
  await deleteTeacherRecord(teacherId);
  await deleteAuthUser(teacher.userId || teacher.id);

  res.json({
    success: true,
    message: 'Teacher deleted successfully',
  });
});

// @desc    Get teacher count
// @route   GET /api/teachers/count
// @access  Private
const getTeacherCount = asyncHandler(async (req, res) => {
  await ensureTeacherSqlReady();
  const count = await getTeacherCountFromSql({ onlyActive: true });

  res.json({
    success: true,
    count,
  });
});

// @desc    Get available teachers
// @route   GET /api/teachers/available
// @access  Private
const getAvailableTeachers = asyncHandler(async (req, res) => {
  await ensureTeacherSqlReady();
  const teachers = await getAvailableTeachersFromSql();

  res.json({
    success: true,
    teachers: teachers.map((teacher) => ({
      _id: teacher._id,
      fullName: teacher.fullName,
      email: teacher.email,
      phone: teacher.phone,
      qualification: teacher.qualification,
      experience: teacher.experience,
      isActive: teacher.isActive,
    })),
  });
});

module.exports = {
  getTeachers,
  getTeacher,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  getTeacherCount,
  getAvailableTeachers,
};
