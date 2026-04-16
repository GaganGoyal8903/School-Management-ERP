import axios from "axios";
import { getStoredAuthToken } from "../utils/authStorage";

const resolveApiBaseUrl = () => {
  const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  return configuredBaseUrl || "/api";
};

const API = axios.create({
  baseURL: resolveApiBaseUrl(),
});

export const DASHBOARD_REFRESH_EVENT = "sms:dashboard-data-changed";

const DASHBOARD_MUTATION_PATHS = [
  "/attendance",
  "/students",
  "/fees",
  "/buses",
];

// Attach token automatically
API.interceptors.request.use((req) => {
  const token = getStoredAuthToken();
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

const notifyDashboardDataChanged = (detail = {}) => {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }

  window.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT, { detail }));
};

const shouldTriggerDashboardRefresh = (config = {}) => {
  const method = String(config?.method || "get").trim().toLowerCase();
  if (!["post", "put", "patch", "delete"].includes(method)) {
    return false;
  }

  const url = String(config?.url || "").trim().toLowerCase();
  return DASHBOARD_MUTATION_PATHS.some((path) => url.startsWith(path) || url.includes(path));
};

API.interceptors.response.use(
  (response) => {
    if (shouldTriggerDashboardRefresh(response?.config)) {
      notifyDashboardDataChanged({
        method: response?.config?.method || "get",
        url: response?.config?.url || "",
      });
    }

    return response;
  },
  (error) => Promise.reject(error)
);

// ================= AUTH =================
export const login = (data) => API.post("/auth/login/legacy", data);
export const loginWithCredentials = (data) => API.post("/auth/login", data);
export const generateLoginCaptcha = (data) => API.post("/auth/login/captcha/generate", data);
export const refreshLoginCaptcha = (data) => API.post("/auth/login/captcha/refresh", data);
export const verifyLoginCaptcha = (data) => API.post("/auth/login/captcha/verify", data);
export const resendLoginOtp = (data) => API.post("/auth/login/otp/resend", data);
export const verifyLoginOtp = (data) => API.post("/auth/login/otp/verify", data);
export const register = (data) => API.post("/auth/register", data);
export const getMe = () => API.get("/auth/me");

// ================= DASHBOARD =================
export const getDashboard = () => API.get("/reports/dashboard");

// ================= STUDENTS =================
export const getStudents = (pageOrParams = 1, limit = 10, search = '', classFilter = '', section = '') => {
  // Support existing object-style calls in some screens.
  if (typeof pageOrParams === 'object' && pageOrParams !== null) {
    const params = { ...pageOrParams };
    if (params.grade && !params.class) {
      params.class = params.grade;
      delete params.grade;
    }
    return API.get('/students', { params });
  }

  const params = {
    page: pageOrParams,
    limit,
    search
  };

  if (classFilter) {
    params.class = classFilter;
  }

  if (section) {
    params.section = section;
  }

  return API.get('/students', { params });
};
export const getAllStudents = () => API.get("/students/all");
export const getStudentById = (id) => API.get(`/students/${id}`);
export const getStudentDetailsById = (id) => API.get(`/students/${id}/details`);
export const getMyStudentDetails = () => API.get("/students/me/details");
export const getStudentPortalProfiles = (params) => API.get("/students/portal-profiles", { params });
export const getStudentPortalProfileById = (id) => API.get(`/students/portal-profiles/${id}`);
export const updateStudentPortalProfile = (id, data) => API.put(`/students/portal-profiles/${id}`, data);
export const promoteStudentPortalProfile = (id) => API.post(`/students/portal-profiles/${id}/promote`);
export const createStudent = (data) => API.post("/students", data);
export const updateStudent = (id, data) => API.put(`/students/${id}`, data);
export const deleteStudent = (id) => API.delete(`/students/${id}`);

// ================= TEACHERS =================
export const getTeachers = (params) => API.get("/teachers", { params });
export const getTeacherById = (id) => API.get(`/teachers/${id}`);
export const createTeacher = (data) => API.post("/teachers", data);
export const updateTeacher = (id, data) => API.put(`/teachers/${id}`, data);
export const deleteTeacher = (id) => API.delete(`/teachers/${id}`);

// ================= SUBJECTS =================
export const getSubjects = (params) => API.get("/subjects", { params });
export const getSubjectById = (id) => API.get(`/subjects/${id}`);
export const createSubject = (data) => API.post("/subjects", data);
export const updateSubject = (id, data) => API.put(`/subjects/${id}`, data);
export const deleteSubject = (id) => API.delete(`/subjects/${id}`);

// ================= MATERIALS =================
export const getMaterials = (params) => API.get("/materials", { params });
export const getMaterialById = (id) => API.get(`/materials/${id}`);
export const createMaterial = (data) => API.post("/materials", data);
export const updateMaterial = (id, data) => API.put(`/materials/${id}`, data);
export const deleteMaterial = (id) => API.delete(`/materials/${id}`);
export const uploadMaterial = (data) => {
  const formData = new FormData();
  Object.keys(data).forEach(key => formData.append(key, data[key]));
  return API.post("/materials/upload", formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};

// ================= ATTENDANCE =================
export const getAttendance = (params) => API.get("/attendance", { params });
export const getAttendanceSession = (params) => API.get("/attendance/session", { params });
export const getAttendanceByStudent = (studentId) => API.get(`/attendance/student/${studentId}`);
export const submitAttendance = (data) => API.post("/attendance/save", data);
export const markAttendance = (data) => API.post("/attendance", data);
export const bulkMarkAttendance = (data) => API.post("/attendance/bulk", data);
export const updateAttendance = (id, data) => API.put(`/attendance/${id}`, data);

// ================= EXAMS =================
export const getExams = (params) => API.get("/exams", { params });
export const getExamById = (id) => API.get(`/exams/${id}`);
export const createExam = (data) => API.post("/exams", data);
export const updateExam = (id, data) => API.put(`/exams/${id}`, data);
export const deleteExam = (id) => API.delete(`/exams/${id}`);
export const getExamPaperById = (id) => API.get(`/exams/${id}/paper`);
export const saveExamPaper = (id, data) => API.put(`/exams/${id}/paper`, data);
export const startOnlineExamSession = (id) => API.post(`/exams/${id}/online-session/start`);
export const submitOnlineExamSession = (id, data) => API.post(`/exams/${id}/online-session/submit`, data);

// ================= GRADES =================
export const getGrades = (params) => API.get("/grades", { params });
export const getGradesByStudent = (studentId) => API.get(`/grades/student/${studentId}`);
export const createGrade = (data) => API.post("/grades", data);
export const updateGrade = (id, data) => API.put(`/grades/${id}`, data);
export const deleteGrade = (id) => API.delete(`/grades/${id}`);

// ================= REPORTS =================
export const getDashboardStats = () => API.get("/reports/dashboard");
export const getAnalyticsReport = (params) => API.get("/reports/analytics", { params });
export const getSummaryReport = () => API.get("/reports/summary");
export const getAttendanceReport = (params) => API.get("/reports/attendance", { params });
export const getExamReport = (params) => API.get("/reports/exams", { params });
export const getFeeReport = (params) => API.get("/reports/fees", { params });
export const getStudentReport = (studentId) => API.get(`/reports/student/${studentId}`);
export const exportAttendance = (params) => API.get("/reports/attendance/export", { 
  params, 
  responseType: 'blob' 
});
export const exportExamResults = (params) => API.get("/reports/exams/export", { 
  params, 
  responseType: 'blob' 
});

// ================= SETTINGS =================
export const getSettings = () => API.get("/settings");
export const updateSettings = (data) => API.put("/settings", data);

// ================= FEES =================
export const getFees = (params) => API.get("/fees", { params });
export const getFeeById = (id) => API.get(`/fees/${id}`);
export const getFeesByStudent = (studentId) => API.get(`/fees/student/${studentId}`);
export const createFee = (data) => API.post("/fees", data);
export const updateFee = (id, data) => API.put(`/fees/${id}`, data);
export const deleteFee = (id) => API.delete(`/fees/${id}`);
export const collectPayment = (id, data) => API.post(`/fees/${id}/pay`, data);
export const payStudentFee = (id, data) => API.post(`/fees/${id}/pay`, data);
export const getFeePaymentReceipt = (paymentId) => API.get(`/fees/payments/${paymentId}/receipt`);
export const downloadFeePaymentReceipt = (paymentId) => API.get(`/fees/payments/${paymentId}/receipt/download`, {
  responseType: 'blob',
});
export const getFeeStats = (params) => API.get("/fees/stats", { params });
export const bulkCreateFees = (data) => API.post("/fees/bulk", data);

// ================= BUS =================
export const getBuses = (params) => API.get("/buses", { params });
export const getBusById = (id) => API.get(`/buses/${id}`);
export const createBus = (data) => API.post("/buses", data);
export const updateBus = (id, data) => API.put(`/buses/${id}`, data);
export const deleteBus = (id) => API.delete(`/buses/${id}`);
export const updateBusLocation = (id, data) => API.put(`/buses/${id}/location`, data);
export const getBusLocation = (id) => API.get(`/buses/${id}/location`);
export const getBusStats = () => API.get("/buses/stats");
export const assignStudentToBus = (busId, data) => API.post(`/buses/${busId}/students`, data);
export const removeStudentFromBus = (busId, studentId) => API.delete(`/buses/${busId}/students/${studentId}`);

// ================= TIMETABLE =================
export const getTimetables = (params) => API.get("/timetables", { params });
export const getTimetableById = (id) => API.get(`/timetables/${id}`);
export const getTimetableByClass = (className, params) => API.get(`/timetables/class/${className}`, { params });
export const createTimetable = (data) => API.post("/timetables", data);
export const updateTimetable = (id, data) => API.put(`/timetables/${id}`, data);
export const deleteTimetable = (id) => API.delete(`/timetables/${id}`);
export const getTeacherTimetable = (teacherId, params) => API.get(`/timetables/teacher/${teacherId}`, { params });
export const copyTimetable = (data) => API.post("/timetables/copy", data);

// ================= AI TOOLS =================
export const askSchoolAssistant = (data) => API.post("/ai/assistant", data);
export const generateLessonPlan = (data) => API.post("/ai/lesson-plan", data);
export const generateQuiz = (data) => API.post("/ai/quiz", data);
export const generateHomework = (data) => API.post("/ai/homework", data);

// ================= NOTIFICATIONS =================
export const getNotifications = (params) => API.get("/notifications", { params });
export const sendNotification = (data) => API.post("/notifications", data);
export const sendWhatsAppMessage = (data) => API.post("/notifications/whatsapp", data);
export const getNotices = (params) => API.get("/parents/announcements", { params });

export default API;


