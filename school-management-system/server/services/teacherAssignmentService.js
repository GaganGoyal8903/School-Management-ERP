const { getSubjectList } = require('./academicSqlService');

const LARGE_SCOPE_LIMIT = 5000;

const normalizeId = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
};

const normalizeText = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim().toLowerCase();
};

const extractSubjectId = (value) => {
  if (!value) {
    return '';
  }

  if (typeof value === 'object') {
    return normalizeId(
      value.subjectId ??
      value.classSubjectId ??
      value._id ??
      value.id
    );
  }

  return normalizeId(value);
};

const extractSubjectIdentifiers = (value) => {
  if (!value) {
    return [];
  }

  if (typeof value === 'object') {
    return [...new Set([
      normalizeId(value.subjectId),
      normalizeId(value.classSubjectId),
      normalizeId(value._id),
      normalizeId(value.id),
    ].filter(Boolean))];
  }

  const normalizedValue = normalizeId(value);
  return normalizedValue ? [normalizedValue] : [];
};

const normalizeAssignedSubject = (subject = {}) => {
  const grade = subject.grade || subject.className || subject.class || '';
  const section = subject.sectionName || subject.section || '';
  const teacherUserId = normalizeId(
    subject.teacher ??
    subject.teacherId ??
    subject.teacherUserId ??
    subject.teacherMongoUserId
  );

  return {
    ...subject,
    subjectId: extractSubjectId(subject),
    grade: normalizeText(grade),
    section: normalizeText(section),
    teacherUserId,
  };
};

const getTeacherAssignmentScope = async ({ teacherUserId, grade = null, search = null } = {}) => {
  const normalizedTeacherUserId = normalizeId(teacherUserId);
  if (!normalizedTeacherUserId) {
    return {
      subjects: [],
      subjectIds: new Set(),
      grades: new Set(),
      sectionsByGrade: new Map(),
    };
  }

  const result = await getSubjectList({
    page: 1,
    limit: LARGE_SCOPE_LIMIT,
    grade,
    search,
  });

  const subjects = Array.isArray(result?.subjects)
    ? result.subjects
      .map(normalizeAssignedSubject)
      .filter((subject) => subject.teacherUserId === normalizedTeacherUserId && subject.subjectId)
    : [];

  const subjectIds = new Set();
  subjects.forEach((subject) => {
    extractSubjectIdentifiers(subject).forEach((subjectIdentifier) => {
      subjectIds.add(subjectIdentifier);
    });
  });
  const grades = new Set(subjects.map((subject) => subject.grade).filter(Boolean));
  const sectionsByGrade = new Map();

  subjects.forEach((subject) => {
    if (!subject.grade || !subject.section) {
      return;
    }

    const currentSections = sectionsByGrade.get(subject.grade) || new Set();
    currentSections.add(subject.section);
    sectionsByGrade.set(subject.grade, currentSections);
  });

  return {
    subjects,
    subjectIds,
    grades,
    sectionsByGrade,
  };
};

const paginateItems = (items = [], page = 1, limit = 10) => {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.max(Number(limit) || 10, 1);
  const startIndex = (safePage - 1) * safeLimit;

  return {
    page: safePage,
    limit: safeLimit,
    total: items.length,
    items: items.slice(startIndex, startIndex + safeLimit),
  };
};

const doesTeacherOwnSubject = ({ scope, subjectId }) => {
  if (!scope?.subjectIds) {
    return false;
  }

  return extractSubjectIdentifiers(subjectId).some((subjectIdentifier) => scope.subjectIds.has(subjectIdentifier));
};

const isTeacherAllowedForClassSection = ({ scope, className = null, sectionName = null } = {}) => {
  const normalizedClassName = normalizeText(className);
  const normalizedSectionName = normalizeText(sectionName);

  if (!normalizedClassName) {
    return false;
  }

  if (!scope?.grades?.has(normalizedClassName)) {
    return false;
  }

  const scopedSections = scope.sectionsByGrade?.get(normalizedClassName);
  if (!normalizedSectionName || !scopedSections || scopedSections.size === 0) {
    return true;
  }

  return scopedSections.has(normalizedSectionName);
};

module.exports = {
  extractSubjectId,
  getTeacherAssignmentScope,
  paginateItems,
  doesTeacherOwnSubject,
  isTeacherAllowedForClassSection,
};
