const normalizeRoleKey = (value = "") => String(value || "").trim().toLowerCase();

const getRoleKeyFromUser = (user) => normalizeRoleKey(user?.roleKey || user?.role);

const ROLE_ALLOWED_PATH_PREFIXES = {
  admin: [
    "/dashboard",
    "/students",
    "/teachers",
    "/subjects",
    "/materials",
    "/attendance",
    "/exams",
    "/reports",
    "/settings",
    "/fees",
    "/bus-tracking",
    "/timetable",
    "/ai-tools",
    "/unauthorized",
  ],
  teacher: [
    "/dashboard",
    "/students",
    "/subjects",
    "/materials",
    "/attendance",
    "/exams",
    "/timetable",
    "/ai-tools",
    "/unauthorized",
  ],
  student: [
    "/student/dashboard",
    "/unauthorized",
  ],
  parent: [
    "/dashboard",
    "/bus-tracking",
    "/timetable",
    "/unauthorized",
  ],
  accountant: [
    "/dashboard",
    "/fees",
    "/reports",
    "/unauthorized",
  ],
};

const isPathAllowedForRole = (roleKey, requestedPath) => {
  const allowedPrefixes = ROLE_ALLOWED_PATH_PREFIXES[roleKey] || [];
  return allowedPrefixes.some((prefix) => (
    requestedPath === prefix || requestedPath.startsWith(`${prefix}/`)
  ));
};

export const getRoleHomePath = (userOrRole) => {
  const roleKey = typeof userOrRole === "string"
    ? normalizeRoleKey(userOrRole)
    : getRoleKeyFromUser(userOrRole);

  return roleKey === "student" ? "/student/dashboard" : "/dashboard";
};

export const resolvePostLoginPath = (authenticatedUser, requestedPath) => {
  const normalizedRequestedPath = typeof requestedPath === "string" ? requestedPath.trim() : "";
  const defaultPath = getRoleHomePath(authenticatedUser);
  const roleKey = typeof authenticatedUser === "string"
    ? normalizeRoleKey(authenticatedUser)
    : getRoleKeyFromUser(authenticatedUser);

  if (!normalizedRequestedPath || normalizedRequestedPath === "/" || normalizedRequestedPath === "/login") {
    return defaultPath;
  }

  if (!isPathAllowedForRole(roleKey, normalizedRequestedPath)) {
    return defaultPath;
  }

  return normalizedRequestedPath;
};
