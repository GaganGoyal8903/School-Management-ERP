const baseUrl = 'http://127.0.0.1:5000/api';

const results = [];
const failures = [];

const timestamp = Date.now();
const isoDate = new Date().toISOString().slice(0, 10);
const openStart = (() => {
  const date = new Date(Date.now() - (30 * 60 * 1000));
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
})();
const openEnd = (() => {
  const date = new Date(Date.now() + (90 * 60 * 1000));
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
})();

const authSeed = {
  email: 'gagangoyal878@gmail.com',
  password: 'Mayo@123',
};

const temp = {
  className: `AuditClass-${timestamp}`,
  sectionName: `AuditSection-${String(timestamp).slice(-5)}`,
  authEmail: `audit-auth-${timestamp}@example.com`,
  teacherEmail: `audit-teacher-${timestamp}@example.com`,
  studentEmail: `audit-student-${timestamp}@example.com`,
  parentEmail: `audit-parent-${timestamp}@example.com`,
  subjectName: `Audit Subject ${timestamp}`,
  materialTitle: `Audit Material ${timestamp}`,
  examName: `Audit Online Exam ${timestamp}`,
  feeType: `Audit Fee ${timestamp}`,
  bulkFeeType: `Audit Bulk Fee ${timestamp}`,
  busNumber: `AUD-${String(timestamp).slice(-5)}`,
  routeName: `Audit Route ${timestamp}`,
  rollNumber: `AUD${String(timestamp).slice(-6)}`,
};

const expectStatus = (status, accepted) => accepted.includes(status);

const getNested = (value, path) => {
  return path.split('.').reduce((current, key) => current?.[key], value);
};

const firstOf = (value, paths = []) => {
  for (const path of paths) {
    const candidate = getNested(value, path);
    if (candidate !== undefined && candidate !== null && candidate !== '') {
      return candidate;
    }
  }

  return null;
};

const extractToken = (payload) =>
  firstOf(payload, ['token', 'data.token', 'user.token', 'auth.token']);

const extractSessionToken = (payload) =>
  firstOf(payload, [
    'sessionToken',
    'loginSessionToken',
    'session.token',
    'data.sessionToken',
    'data.loginSessionToken',
    'session.sessionToken',
  ]);

const extractId = (payload) =>
  firstOf(payload, [
    '_id',
    'id',
    'studentId',
    'teacherId',
    'dbId',
    'userId',
    'portalProfileId',
    'profileId',
    'examId',
    'feeId',
    'vehicleId',
    'attendanceId',
    'materialId',
    'timetableId',
  ]);

const toArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  return [];
};

const preview = (payload) => {
  if (typeof payload === 'string') {
    return payload.slice(0, 220);
  }

  try {
    return JSON.stringify(payload).slice(0, 220);
  } catch (error) {
    return String(payload);
  }
};

async function request(name, {
  method = 'GET',
  path,
  token,
  body,
  expected = [200],
  headers = {},
}) {
  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  const options = {
    method,
    headers: requestHeaders,
  };

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  let text = '';
  let data = null;

  try {
    response = await fetch(`${baseUrl}${path}`, options);
    text = await response.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      data = text;
    }
  } catch (error) {
    const failure = {
      name,
      method,
      path,
      status: 'FETCH_ERROR',
      pass: false,
      preview: error.message,
    };
    results.push(failure);
    failures.push(failure);
    console.log(`FAIL ${method.padEnd(6)} ${path} -> FETCH_ERROR ${error.message}`);
    return { ok: false, status: 'FETCH_ERROR', data: null, text: '', headers: new Headers() };
  }

  const pass = expectStatus(response.status, expected);
  const result = {
    name,
    method,
    path,
    status: response.status,
    pass,
    preview: preview(data),
  };
  results.push(result);

  if (!pass) {
    failures.push(result);
    console.log(`FAIL ${method.padEnd(6)} ${path} -> ${response.status} ${result.preview}`);
  } else {
    console.log(`PASS ${method.padEnd(6)} ${path} -> ${response.status}`);
  }

  return {
    ok: pass,
    status: response.status,
    data,
    text,
    headers: response.headers,
  };
}

async function legacyLogin(role, email = authSeed.email, password = authSeed.password, label = `auth.legacy.${role}`) {
  const response = await request(label, {
    method: 'POST',
    path: '/auth/login/legacy',
    body: { email, password, role },
    expected: [200],
  });

  return {
    response,
    token: extractToken(response.data),
  };
}

async function main() {
  const resources = {};

  await request('health', { path: '/health', expected: [200] });
  await request('dashboard.public', { path: '/dashboard', expected: [200] });

  await request('auth.login.validation', {
    method: 'POST',
    path: '/auth/login',
    body: {},
    expected: [400],
  });

  const adminLegacy = await legacyLogin('admin');
  const teacherLegacy = await legacyLogin('teacher');
  const studentLegacy = await legacyLogin('student');

  const adminToken = adminLegacy.token;
  const seedTeacherToken = teacherLegacy.token;
  const seedStudentToken = studentLegacy.token;

  if (!adminToken || !seedTeacherToken || !seedStudentToken) {
    throw new Error('Unable to acquire baseline admin/teacher/student tokens for the audit.');
  }

  const stagedLogin = await request('auth.login.stage', {
    method: 'POST',
    path: '/auth/login',
    body: {
      email: authSeed.email,
      password: authSeed.password,
      role: 'admin',
    },
    expected: [200],
  });

  const stageToken = extractSessionToken(stagedLogin.data);

  await request('auth.captcha.generate', {
    method: 'POST',
    path: '/auth/login/captcha/generate',
    body: stageToken ? { sessionToken: stageToken } : {},
    expected: stageToken ? [200] : [400],
  });

  await request('auth.captcha.refresh', {
    method: 'POST',
    path: '/auth/login/captcha/refresh',
    body: stageToken ? { sessionToken: stageToken } : {},
    expected: stageToken ? [200] : [400],
  });

  await request('auth.captcha.verify.invalid', {
    method: 'POST',
    path: '/auth/login/captcha/verify',
    body: {
      sessionToken: stageToken || 'invalid-session-token',
      captcha: 'WRONG1',
    },
    expected: [400, 401, 404],
  });

  await request('auth.otp.resend.preverify', {
    method: 'POST',
    path: '/auth/login/otp/resend',
    body: { sessionToken: stageToken || 'invalid-session-token' },
    expected: [400, 404, 429],
  });

  await request('auth.otp.verify.invalid', {
    method: 'POST',
    path: '/auth/login/otp/verify',
    body: {
      sessionToken: stageToken || 'invalid-session-token',
      otp: '000000',
    },
    expected: [400, 401, 404],
  });

  await request('auth.register.unauthorized', {
    method: 'POST',
    path: '/auth/register',
    body: {
      fullName: 'Unauthorized Audit',
      email: `unauthorized-${timestamp}@example.com`,
      password: 'Audit@123',
      role: 'admin',
    },
    expected: [401],
  });

  await request('auth.register.authorized', {
    method: 'POST',
    path: '/auth/register',
    token: adminToken,
    body: {
      fullName: 'Audit Auth User',
      email: temp.authEmail,
      password: 'Audit@123',
      role: 'admin',
      phone: '9000000101',
    },
    expected: [201],
  });

  const registeredLogin = await legacyLogin('admin', temp.authEmail, 'Audit@123', 'auth.legacy.registered');
  const registeredToken = registeredLogin.token;

  if (!registeredToken) {
    throw new Error('Unable to log in with the registered audit auth user.');
  }

  await request('auth.me', {
    path: '/auth/me',
    token: registeredToken,
    expected: [200],
  });

  await request('auth.profile.update', {
    method: 'PUT',
    path: '/auth/profile',
    token: registeredToken,
    body: {
      fullName: 'Audit Auth User Updated',
      phone: '9000000102',
    },
    expected: [200],
  });

  await request('auth.password.change', {
    method: 'POST',
    path: '/auth/change-password',
    token: registeredToken,
    body: {
      currentPassword: 'Audit@123',
      newPassword: 'Audit@1234',
    },
    expected: [200],
  });

  await request('auth.logout', {
    method: 'POST',
    path: '/auth/logout',
    token: registeredToken,
    expected: [200],
  });

  const studentList = await request('students.list.initial', {
    path: '/students?page=1&limit=10',
    token: adminToken,
    expected: [200],
  });

  const existingStudent = firstOf(studentList.data, ['students.0', 'data.0']);
  if (!existingStudent) {
    throw new Error('No existing student record was available to seed the audit.');
  }

  const className = existingStudent.class || 'Class 10';
  const sectionName = existingStudent.section || 'A';
  const academicYear = existingStudent.academicYear || '2024-2025';

  const createdClass = await request('classes.create', {
    method: 'POST',
    path: '/classes',
    token: adminToken,
    body: {
      name: temp.className,
      displayName: temp.className,
      sortOrder: 999,
      isActive: true,
    },
    expected: [201],
  });
  resources.classId = extractId(createdClass.data?.class || createdClass.data);

  await request('classes.list', {
    path: '/classes',
    token: adminToken,
    expected: [200],
  });

  await request('classes.get', {
    path: `/classes/${resources.classId}`,
    token: adminToken,
    expected: [200],
  });

  await request('classes.update', {
    method: 'PUT',
    path: `/classes/${resources.classId}`,
    token: adminToken,
    body: {
      displayName: `${temp.className} Updated`,
      sortOrder: 998,
    },
    expected: [200],
  });

  const createdSection = await request('sections.create', {
    method: 'POST',
    path: '/sections',
    token: adminToken,
    body: {
      name: temp.sectionName,
      displayName: temp.sectionName,
      sortOrder: 999,
      isActive: true,
    },
    expected: [201],
  });
  resources.sectionId = extractId(createdSection.data?.section || createdSection.data);

  await request('sections.list', {
    path: '/sections',
    token: adminToken,
    expected: [200],
  });

  await request('sections.get', {
    path: `/sections/${resources.sectionId}`,
    token: adminToken,
    expected: [200],
  });

  await request('sections.update', {
    method: 'PUT',
    path: `/sections/${resources.sectionId}`,
    token: adminToken,
    body: {
      displayName: `${temp.sectionName} Updated`,
      sortOrder: 998,
    },
    expected: [200],
  });

  await request('teachers.list', {
    path: '/teachers',
    token: adminToken,
    expected: [200],
  });

  await request('teachers.count', {
    path: '/teachers/count',
    token: adminToken,
    expected: [200],
  });

  await request('teachers.available', {
    path: '/teachers/available',
    token: adminToken,
    expected: [200],
  });

  const createdTeacher = await request('teachers.create', {
    method: 'POST',
    path: '/teachers',
    token: adminToken,
    body: {
      fullName: 'Audit Teacher',
      email: temp.teacherEmail,
      phone: '9000000201',
      password: 'Audit@123',
      department: 'Audit',
      designation: 'Teacher',
      qualification: 'M.Ed',
      experience: 3,
      joiningDate: isoDate,
      isActive: true,
    },
    expected: [201],
  });
  const teacherPayload = createdTeacher.data?.teacher || createdTeacher.data;
  resources.teacherId = extractId(teacherPayload);
  resources.teacherUserId = firstOf(teacherPayload, ['userId', '_id', 'id']);

  await request('teachers.get', {
    path: `/teachers/${resources.teacherId}`,
    token: adminToken,
    expected: [200],
  });

  await request('teachers.update', {
    method: 'PUT',
    path: `/teachers/${resources.teacherId}`,
    token: adminToken,
    body: {
      phone: '9000000202',
      designation: 'Senior Teacher',
    },
    expected: [200],
  });

  await request('students.invalid-context', {
    method: 'POST',
    path: '/students',
    token: adminToken,
    body: {
      fullName: 'Invalid Context Student',
      email: `invalid-student-${timestamp}@example.com`,
      phone: '9000000300',
      password: 'Audit@123',
      className: `SmokeClass-${timestamp}`,
      sectionName: sectionName,
      rollNumber: `INV${String(timestamp).slice(-6)}`,
      academicYear,
    },
    expected: [400],
  });

  const createdStudent = await request('students.create', {
    method: 'POST',
    path: '/students',
    token: adminToken,
    body: {
      fullName: 'Audit Student',
      email: temp.studentEmail,
      phone: '9000000301',
      password: 'Audit@123',
      className,
      sectionName,
      rollNumber: temp.rollNumber,
      academicYear,
      guardianName: 'Audit Guardian',
      guardianPhone: '9000000302',
      guardianRelation: 'Father',
      gender: 'Male',
      dateOfBirth: '2008-01-15',
      admissionDate: isoDate,
      address: 'Audit Address',
      bloodGroup: 'B+',
      isActive: true,
    },
    expected: [201],
  });
  const studentPayload = createdStudent.data?.student || createdStudent.data;
  resources.studentId = extractId(studentPayload);

  await request('students.login.legacy-route', {
    method: 'POST',
    path: '/students/login',
    body: {
      email: temp.studentEmail,
      password: 'Audit@123',
    },
    expected: [200],
  });

  const studentTokenLogin = await legacyLogin('student', temp.studentEmail, 'Audit@123', 'auth.legacy.student.created');
  const createdStudentToken = studentTokenLogin.token;

  if (!createdStudentToken) {
    throw new Error('Unable to acquire token for the created audit student.');
  }

  await request('students.list.all', {
    path: '/students/all',
    token: adminToken,
    expected: [200],
  });

  await request('students.count', {
    path: '/students/count',
    token: adminToken,
    expected: [200],
  });

  await request('students.by-class', {
    path: `/students/class/${encodeURIComponent(className)}`,
    token: adminToken,
    expected: [200],
  });

  await request('students.get', {
    path: `/students/${resources.studentId}`,
    token: adminToken,
    expected: [200],
  });

  await request('students.details', {
    path: `/students/${resources.studentId}/details`,
    token: adminToken,
    expected: [200],
  });

  await request('students.portal-profiles.list', {
    path: '/students/portal-profiles',
    token: adminToken,
    expected: [200],
  });

  await request('students.portal-profiles.get', {
    path: '/students/portal-profiles/999999',
    token: adminToken,
    expected: [404],
  });

  await request('students.portal-profiles.update', {
    method: 'PUT',
    path: '/students/portal-profiles/999999',
    token: adminToken,
    body: {
      notes: 'Missing portal profile audit update',
    },
    expected: [404],
  });

  await request('students.portal-profiles.promote', {
    method: 'POST',
    path: '/students/portal-profiles/999999/promote',
    token: adminToken,
    expected: [404],
  });

  await request('students.me.details', {
    path: '/students/me/details',
    token: createdStudentToken,
    expected: [200],
  });

  await request('students.update', {
    method: 'PUT',
    path: `/students/${resources.studentId}`,
    token: adminToken,
    body: {
      phone: '9000000303',
      guardianPhone: '9000000304',
    },
    expected: [200],
  });

  await request('subjects.list', {
    path: '/subjects',
    token: adminToken,
    expected: [200],
  });

  await request('subjects.count', {
    path: '/subjects/count',
    token: adminToken,
    expected: [200],
  });

  await request('subjects.by-grade', {
    path: `/subjects/grade/${encodeURIComponent(className)}`,
    token: adminToken,
    expected: [200],
  });

  const createdSubject = await request('subjects.create', {
    method: 'POST',
    path: '/subjects',
    token: adminToken,
    body: {
      name: temp.subjectName,
      grade: className,
      description: 'Audit subject',
    },
    expected: [201],
  });
  const subjectPayload = createdSubject.data?.subject || createdSubject.data;
  resources.subjectId = extractId(subjectPayload);

  await request('subjects.assign-teacher', {
    method: 'PUT',
    path: `/subjects/${resources.subjectId}/assign-teacher`,
    token: adminToken,
    body: {
      teacherId: resources.teacherUserId,
    },
    expected: [200],
  });

  await request('subjects.get', {
    path: `/subjects/${resources.subjectId}`,
    token: adminToken,
    expected: [200],
  });

  await request('subjects.update', {
    method: 'PUT',
    path: `/subjects/${resources.subjectId}`,
    token: adminToken,
    body: {
      description: 'Audit subject updated',
      teacher: resources.teacherUserId,
    },
    expected: [200],
  });

  const createdTeacherTokenLogin = await legacyLogin('teacher', temp.teacherEmail, 'Audit@123', 'auth.legacy.teacher.created');
  const createdTeacherToken = createdTeacherTokenLogin.token;

  if (!createdTeacherToken) {
    throw new Error('Unable to acquire token for the created audit teacher.');
  }

  await request('materials.list', {
    path: '/materials',
    token: createdTeacherToken,
    expected: [200],
  });

  const createdMaterial = await request('materials.create', {
    method: 'POST',
    path: '/materials',
    token: createdTeacherToken,
    body: {
      title: temp.materialTitle,
      subject: resources.subjectId,
      grade: className,
      description: 'Audit material upload',
      fileUrl: 'https://example.com/audit-material.pdf',
      fileName: 'audit-material.pdf',
    },
    expected: [201],
  });
  const materialPayload = createdMaterial.data?.material || createdMaterial.data;
  resources.materialId = extractId(materialPayload);

  await request('materials.by-subject', {
    path: `/materials/subject/${resources.subjectId}`,
    token: createdTeacherToken,
    expected: [200],
  });

  await request('materials.get', {
    path: `/materials/${resources.materialId}`,
    token: createdTeacherToken,
    expected: [200],
  });

  await request('materials.update', {
    method: 'PUT',
    path: `/materials/${resources.materialId}`,
    token: createdTeacherToken,
    body: {
      description: 'Audit material upload updated',
    },
    expected: [200],
  });

  const singleAttendance = await request('attendance.create.single', {
    method: 'POST',
    path: '/attendance',
    token: adminToken,
    body: {
      studentId: resources.studentId,
      date: isoDate,
      status: 'Present',
      class: className,
      section: sectionName,
      remarks: 'Attendance audit single',
    },
    expected: [200, 201],
  });
  resources.attendanceId = extractId(singleAttendance.data?.attendance || singleAttendance.data);

  const sessionAttendancePayload = {
    attendanceDate: isoDate,
    class: className,
    section: sectionName,
    subject: resources.subjectId,
    students: [
      {
        studentId: resources.studentId,
        rollNumber: temp.rollNumber,
        status: 'Present',
        remarks: 'Attendance session audit',
      },
    ],
  };

  await request('attendance.save', {
    method: 'POST',
    path: '/attendance/save',
    token: adminToken,
    body: sessionAttendancePayload,
    expected: [200, 201],
  });

  await request('attendance.bulk', {
    method: 'POST',
    path: '/attendance/bulk',
    token: adminToken,
    body: sessionAttendancePayload,
    expected: [200, 201],
  });

  await request('attendance.session', {
    path: `/attendance/session?class=${encodeURIComponent(className)}&section=${encodeURIComponent(sectionName)}&date=${isoDate}`,
    token: adminToken,
    expected: [200],
  });

  await request('attendance.list', {
    path: `/attendance?class=${encodeURIComponent(className)}&section=${encodeURIComponent(sectionName)}&date=${isoDate}`,
    token: adminToken,
    expected: [200],
  });

  await request('attendance.report', {
    path: `/attendance/report?class=${encodeURIComponent(className)}&section=${encodeURIComponent(sectionName)}&startDate=${isoDate}&endDate=${isoDate}`,
    token: adminToken,
    expected: [200],
  });

  await request('attendance.student', {
    path: `/attendance/student/${resources.studentId}?startDate=${isoDate}&endDate=${isoDate}`,
    token: createdStudentToken,
    expected: [200],
  });

  await request('attendance.update', {
    method: 'PUT',
    path: `/attendance/${resources.attendanceId}`,
    token: adminToken,
    body: {
      status: 'Late',
      remarks: 'Attendance audit updated',
    },
    expected: [200],
  });

  const createdExam = await request('exams.create', {
    method: 'POST',
    path: '/exams',
    token: createdTeacherToken,
    body: {
      name: temp.examName,
      class: className,
      section: sectionName,
      academicYear,
      subject: resources.subjectId,
      examDate: isoDate,
      startTime: openStart,
      endTime: openEnd,
      totalMarks: 5,
      passingMarks: 2,
      instructions: 'Audit exam instructions',
    },
    expected: [201],
  });
  const examPayload = createdExam.data?.exam || createdExam.data;
  resources.examId = extractId(examPayload);

  await request('exams.list', {
    path: '/exams',
    token: createdTeacherToken,
    expected: [200],
  });

  await request('exams.get', {
    path: `/exams/${resources.examId}`,
    token: createdTeacherToken,
    expected: [200],
  });

  await request('exams.update', {
    method: 'PUT',
    path: `/exams/${resources.examId}`,
    token: createdTeacherToken,
    body: {
      instructions: 'Audit exam instructions updated',
      totalMarks: 5,
      passingMarks: 2,
    },
    expected: [200],
  });

  await request('exams.paper.update', {
    method: 'PUT',
    path: `/exams/${resources.examId}/paper`,
    token: createdTeacherToken,
    body: {
      title: 'Audit Online Paper',
      instructions: 'Choose the correct answer',
      durationMinutes: 30,
      allowInstantResult: true,
      questions: [
        {
          questionText: '2 + 2 = ?',
          questionType: 'mcq',
          optionA: '3',
          optionB: '4',
          optionC: '5',
          optionD: '6',
          correctAnswer: 'B',
          marks: 2,
          sortOrder: 1,
        },
        {
          questionText: 'Capital of France',
          questionType: 'short_answer',
          correctAnswer: 'Paris',
          marks: 3,
          sortOrder: 2,
        },
      ],
    },
    expected: [200],
  });

  await request('exams.paper.get', {
    path: `/exams/${resources.examId}/paper`,
    token: createdTeacherToken,
    expected: [200],
  });

  const startedExam = await request('exams.online.start', {
    method: 'POST',
    path: `/exams/${resources.examId}/online-session/start`,
    token: createdStudentToken,
    body: {},
    expected: [200],
  });

  const paperQuestions = toArray(startedExam.data?.questions);
  const secondQuestion = paperQuestions.find((question) => question.questionType === 'short_answer');
  const firstQuestion = paperQuestions.find((question) => question.questionType === 'mcq');

  await request('exams.online.submit', {
    method: 'POST',
    path: `/exams/${resources.examId}/online-session/submit`,
    token: createdStudentToken,
    body: {
      answers: [
        firstQuestion
          ? { questionId: firstQuestion.questionId, answer: 'B' }
          : null,
        secondQuestion
          ? { questionId: secondQuestion.questionId, answer: 'Paris' }
          : null,
      ].filter(Boolean),
    },
    expected: [200],
  });

  await request('exams.marks', {
    method: 'POST',
    path: `/exams/${resources.examId}/marks`,
    token: createdTeacherToken,
    body: {
      marks: [
        {
          studentId: resources.studentId,
          marksObtained: 5,
        },
      ],
    },
    expected: [201],
  });

  await request('exams.results.student', {
    path: `/exams/results/${resources.studentId}`,
    token: createdStudentToken,
    expected: [200],
  });

  await request('exams.report', {
    path: `/exams/report/${resources.examId}`,
    token: createdTeacherToken,
    expected: [200],
  });

  const createdFee = await request('fees.create', {
    method: 'POST',
    path: '/fees',
    token: adminToken,
    body: {
      studentId: resources.studentId,
      feeType: temp.feeType,
      amount: 1200,
      dueDate: isoDate,
      academicYear,
    },
    expected: [201],
  });
  const feePayload = createdFee.data?.fee || createdFee.data;
  resources.feeId = extractId(feePayload);

  await request('fees.list', {
    path: '/fees',
    token: adminToken,
    expected: [200],
  });

  await request('fees.get', {
    path: `/fees/${resources.feeId}`,
    token: adminToken,
    expected: [200],
  });

  await request('fees.by-student', {
    path: `/fees/student/${resources.studentId}`,
    token: adminToken,
    expected: [200],
  });

  await request('fees.stats', {
    path: '/fees/stats',
    token: adminToken,
    expected: [200],
  });

  await request('fees.update', {
    method: 'PUT',
    path: `/fees/${resources.feeId}`,
    token: adminToken,
    body: {
      amount: 1300,
      fineAmount: 50,
    },
    expected: [200],
  });

  await request('fees.bulk', {
    method: 'POST',
    path: '/fees/bulk',
    token: adminToken,
    body: {
      className,
      academicYear,
      feeType: temp.bulkFeeType,
      amount: 250,
      dueDate: isoDate,
    },
    expected: [200, 201],
  });

  await request('fees.pay.student', {
    method: 'POST',
    path: `/fees/${resources.feeId}/pay`,
    token: createdStudentToken,
    body: {
      amount: 100,
      mode: 'Online',
    },
    expected: [200, 503],
  });

  const createdBus = await request('buses.create', {
    method: 'POST',
    path: '/buses',
    token: adminToken,
    body: {
      busNumber: temp.busNumber,
      routeName: temp.routeName,
      driverName: 'Audit Driver',
      driverPhone: '9000000401',
      capacity: 30,
      currentStatus: 'Active',
      routeStops: [{ name: 'Audit Stop' }],
    },
    expected: [201],
  });
  const busPayload = createdBus.data?.bus || createdBus.data;
  resources.busId = extractId(busPayload);

  await request('buses.list', {
    path: '/buses',
    token: adminToken,
    expected: [200],
  });

  await request('buses.stats', {
    path: '/buses/stats',
    token: adminToken,
    expected: [200],
  });

  await request('buses.get', {
    path: `/buses/${resources.busId}`,
    token: adminToken,
    expected: [200],
  });

  await request('buses.update', {
    method: 'PUT',
    path: `/buses/${resources.busId}`,
    token: adminToken,
    body: {
      driverPhone: '9000000402',
      routeName: `${temp.routeName} Updated`,
    },
    expected: [200],
  });

  await request('buses.update-location', {
    method: 'PUT',
    path: `/buses/${resources.busId}/location`,
    token: adminToken,
    body: {
      latitude: 28.6139,
      longitude: 77.209,
      speed: 20,
    },
    expected: [200],
  });

  await request('buses.get-location', {
    path: `/buses/${resources.busId}/location`,
    token: adminToken,
    expected: [200],
  });

  await request('buses.assign-student', {
    method: 'POST',
    path: `/buses/${resources.busId}/students`,
    token: adminToken,
    body: {
      studentId: resources.studentId,
      stopName: 'Audit Stop',
    },
    expected: [200],
  });

  await request('timetables.create', {
    method: 'POST',
    path: '/timetables',
    token: adminToken,
    body: {
      className,
      sectionName,
      academicYear,
      day: 'Sunday',
      periods: [
        {
          periodNumber: 1,
          subjectId: resources.subjectId,
          teacherId: resources.teacherUserId,
          startTime: '09:00',
          endTime: '10:00',
          roomNumber: 'A-101',
        },
      ],
    },
    expected: [201, 400],
  });

  const timetableList = await request('timetables.list', {
    path: `/timetables?class=${encodeURIComponent(className)}&section=${encodeURIComponent(sectionName)}&academicYear=${encodeURIComponent(academicYear)}`,
    token: adminToken,
    expected: [200],
  });
  const timetableEntry = firstOf(timetableList.data, ['timetables.0', 'data.0']);
  resources.timetableId = extractId(timetableEntry);

  await request('timetables.by-class', {
    path: `/timetables/class/${encodeURIComponent(className)}?section=${encodeURIComponent(sectionName)}&academicYear=${encodeURIComponent(academicYear)}`,
    token: adminToken,
    expected: [200],
  });

  await request('timetables.by-teacher', {
    path: `/timetables/teacher/${resources.teacherUserId}`,
    token: adminToken,
    expected: [200],
  });

  await request('timetables.get', {
    path: `/timetables/${resources.timetableId}`,
    token: adminToken,
    expected: [200],
  });

  await request('timetables.copy', {
    method: 'POST',
    path: '/timetables/copy',
    token: adminToken,
    body: {
      sourceClass: className,
      sourceSection: sectionName,
      targetClass: temp.className,
      targetSection: temp.sectionName,
      academicYear,
    },
    expected: [201, 400, 404],
  });

  await request('timetables.update', {
    method: 'PUT',
    path: `/timetables/${resources.timetableId}`,
    token: adminToken,
    body: {
      className,
      sectionName,
      academicYear,
      day: 'Sunday',
      periods: [
        {
          periodNumber: 1,
          subjectId: resources.subjectId,
          teacherId: resources.teacherUserId,
          startTime: '09:30',
          endTime: '10:30',
          roomNumber: 'A-102',
        },
      ],
    },
    expected: [200, 400],
  });

  await request('students.timetable.by-id', {
    path: `/students/timetable/${resources.studentId}`,
    token: createdStudentToken,
    expected: [200],
  });

  await request('parent.create', {
    method: 'POST',
    path: '/parent',
    token: adminToken,
    body: {
      fullName: 'Audit Parent',
      email: temp.parentEmail,
      phone: '9000000501',
      password: 'Audit@123',
      childId: resources.studentId,
      relation: 'Father',
      occupation: 'Auditor',
    },
    expected: [201],
  });

  const parentLogin = await request('parent.login', {
    method: 'POST',
    path: '/parent/login',
    body: {
      email: temp.parentEmail,
      password: 'Audit@123',
    },
    expected: [200],
  });
  const parentToken = extractToken(parentLogin.data);

  if (!parentToken) {
    throw new Error('Unable to acquire token for the created audit parent.');
  }

  await request('parent.students', {
    path: '/parent/students',
    token: parentToken,
    expected: [200],
  });

  await request('parent.profile', {
    path: '/parent/profile',
    token: parentToken,
    expected: [200],
  });

  await request('parent.child', {
    path: '/parent/child',
    token: parentToken,
    expected: [200],
  });

  await request('parent.attendance', {
    path: `/parent/attendance?month=${Number(isoDate.slice(5, 7))}&year=${Number(isoDate.slice(0, 4))}`,
    token: parentToken,
    expected: [200],
  });

  await request('parent.grades', {
    path: '/parent/grades',
    token: parentToken,
    expected: [200],
  });

  await request('parent.homework', {
    path: '/parent/homework',
    token: parentToken,
    expected: [200],
  });

  await request('parent.exams', {
    path: '/parent/exams',
    token: parentToken,
    expected: [200],
  });

  await request('parent.announcements', {
    path: '/parent/announcements',
    token: parentToken,
    expected: [200],
  });

  await request('parent.dashboard', {
    path: '/parent/dashboard',
    token: parentToken,
    expected: [200],
  });

  await request('parent.profile.update', {
    method: 'PUT',
    path: '/parent/profile',
    token: parentToken,
    body: {
      phone: '9000000502',
      occupation: 'Lead Auditor',
    },
    expected: [200],
  });

  await request('reports.dashboard', {
    path: '/reports/dashboard',
    token: adminToken,
    expected: [200],
  });

  await request('reports.analytics', {
    path: '/reports/analytics',
    token: adminToken,
    expected: [200],
  });

  await request('reports.summary', {
    path: '/reports/summary',
    token: adminToken,
    expected: [200],
  });

  await request('reports.attendance', {
    path: `/reports/attendance?class=${encodeURIComponent(className)}&section=${encodeURIComponent(sectionName)}&startDate=${isoDate}&endDate=${isoDate}`,
    token: adminToken,
    expected: [200],
  });

  await request('reports.attendance.export', {
    path: `/reports/attendance/export?class=${encodeURIComponent(className)}&section=${encodeURIComponent(sectionName)}&startDate=${isoDate}&endDate=${isoDate}`,
    token: adminToken,
    expected: [200],
  });

  await request('reports.fees', {
    path: '/reports/fees',
    token: adminToken,
    expected: [200],
  });

  await request('reports.exams', {
    path: '/reports/exams',
    token: adminToken,
    expected: [200],
  });

  await request('reports.exams.export', {
    path: '/reports/exams/export',
    token: adminToken,
    expected: [200],
  });

  await request('buses.remove-student', {
    method: 'DELETE',
    path: `/buses/${resources.busId}/students/${resources.studentId}`,
    token: adminToken,
    expected: [200],
  });

  await request('materials.delete', {
    method: 'DELETE',
    path: `/materials/${resources.materialId}`,
    token: createdTeacherToken,
    expected: [200],
  });

  await request('attendance.delete', {
    method: 'DELETE',
    path: `/attendance/${resources.attendanceId}`,
    token: adminToken,
    expected: [200],
  });

  await request('timetables.delete', {
    method: 'DELETE',
    path: `/timetables/${resources.timetableId}`,
    token: adminToken,
    expected: [200],
  });

  await request('fees.delete', {
    method: 'DELETE',
    path: `/fees/${resources.feeId}`,
    token: adminToken,
    expected: [200, 400],
  });

  await request('exams.delete', {
    method: 'DELETE',
    path: `/exams/${resources.examId}`,
    token: adminToken,
    expected: [200],
  });

  await request('buses.delete', {
    method: 'DELETE',
    path: `/buses/${resources.busId}`,
    token: adminToken,
    expected: [200],
  });

  await request('subjects.delete', {
    method: 'DELETE',
    path: `/subjects/${resources.subjectId}`,
    token: adminToken,
    expected: [200],
  });

  await request('teachers.delete', {
    method: 'DELETE',
    path: `/teachers/${resources.teacherId}`,
    token: adminToken,
    expected: [200],
  });

  await request('students.delete', {
    method: 'DELETE',
    path: `/students/${resources.studentId}`,
    token: adminToken,
    expected: [200],
  });

  await request('classes.delete', {
    method: 'DELETE',
    path: `/classes/${resources.classId}`,
    token: adminToken,
    expected: [200],
  });

  await request('sections.delete', {
    method: 'DELETE',
    path: `/sections/${resources.sectionId}`,
    token: adminToken,
    expected: [200],
  });

  console.log(`\nTOTAL ${results.length}`);
  console.log(`FAILURES ${failures.length}`);

  if (failures.length > 0) {
    console.log('\nFAILED ENDPOINTS');
    for (const failure of failures) {
      console.log(`${failure.method} ${failure.path} -> ${failure.status} :: ${failure.preview}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('\nAll audited endpoints returned expected responses.');
}

main().catch((error) => {
  console.error('AUDIT SCRIPT ERROR', error);
  process.exitCode = 1;
});
