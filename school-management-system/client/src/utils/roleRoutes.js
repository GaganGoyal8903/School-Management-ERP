const normalizeRoleKey = (value = "") => String(value || "").trim().toLowerCase();

const getRoleKeyFromUser = (user) => normalizeRoleKey(user?.roleKey || user?.role);

const ROLE_ALLOWED_PATH_PREFIXES = {
  admin: [
    "/dashboard",
    "/branches",
    "/communications",
    "/meetings",
    "/notifications",
    "/students",
    "/teachers",
    "/subjects",
    "/materials",
    "/homework",
    "/attendance",
    "/leaves",
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
    "/communications",
    "/meetings",
    "/notifications",
    "/students",
    "/subjects",
    "/materials",
    "/homework",
    "/attendance",
    "/leaves",
    "/exams",
    "/timetable",
    "/ai-tools",
    "/unauthorized",
  ],
  student: [
    "/student/dashboard",
    "/notifications",
    "/unauthorized",
  ],
  parent: [
    "/parent/dashboard",
    "/communications",
    "/meetings",
    "/notifications",
    "/bus-tracking",
    "/timetable",
    "/unauthorized",
  ],
  accountant: [
    "/dashboard",
    "/communications",
    "/notifications",
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

  if (roleKey === "student") {
    return "/student/dashboard";
  }

  if (roleKey === "parent") {
    return "/parent/dashboard";
  }

  return "/dashboard";
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
