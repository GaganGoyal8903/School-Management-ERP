import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./components/DashboardLayout";
import { getRoleHomePath } from "./utils/roleRoutes";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import StudentPortal from "./pages/StudentPortal";
import Unauthorized from "./pages/Unauthorized";
import Students from "./pages/Students";
import StudentDetails from "./pages/StudentDetails";
import Teachers from "./pages/Teachers";
import Subjects from "./pages/Subjects";
import Materials from "./pages/Materials";
import Attendance from "./pages/Attendance";
import Exams from "./pages/Exams";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Fees from "./pages/Fees";
import BusTracking from "./pages/BusTracking";
import Timetable from "./pages/Timetable";
import AITools from "./pages/AITools";

const AuthLoadingScreen = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="h-10 w-10 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
  </div>
);

function LoginRoute() {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  return isAuthenticated ? <Navigate to={getRoleHomePath(user)} replace /> : <Login />;
}

function RootRedirect() {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  return <Navigate to={isAuthenticated ? getRoleHomePath(user) : "/login"} replace />;
}

function DashboardRoute() {
  const { loading, user } = useAuth();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (getRoleHomePath(user) !== "/dashboard") {
    return <Navigate to={getRoleHomePath(user)} replace />;
  }

  return <Dashboard />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>

          {/* Public Route */}
          <Route path="/login" element={<LoginRoute />} />

          {/* Protected Layout */}
          <Route
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            {/* Dashboard */}
            <Route
              path="/unauthorized"
              element={
                <ProtectedRoute>
                  <Unauthorized />
                </ProtectedRoute>
              }
            />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute allowedRoles={["admin", "teacher", "student", "parent", "accountant"]}>
                  <DashboardRoute />
                </ProtectedRoute>
              }
            />

            <Route
              path="/student/dashboard"
              element={
                <ProtectedRoute allowedRoles={["student"]}>
                  <StudentPortal />
                </ProtectedRoute>
              }
            />

            {/* Students */}
            <Route
              path="/students"
              element={
                <ProtectedRoute allowedRoles={["admin", "teacher"]}>
                  <Students />
                </ProtectedRoute>
              }
            />
            <Route
              path="/students/:id"
              element={
                <ProtectedRoute allowedRoles={["admin", "teacher"]}>
                  <StudentDetails />
                </ProtectedRoute>
              }
            />

            {/* Teachers */}
            <Route
              path="/teachers"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <Teachers />
                </ProtectedRoute>
              }
            />

            {/* Subjects */}
            <Route
              path="/subjects"
              element={
                <ProtectedRoute allowedRoles={["admin", "teacher"]}>
                  <Subjects />
                </ProtectedRoute>
              }
            />

            {/* Materials */}
            <Route
              path="/materials"
              element={
                <ProtectedRoute allowedRoles={["admin", "teacher"]}>
                  <Materials />
                </ProtectedRoute>
              }
            />

            {/* Attendance */}
            <Route
              path="/attendance"
              element={
                <ProtectedRoute allowedRoles={["admin", "teacher"]}>
                  <Attendance />
                </ProtectedRoute>
              }
            />

            {/* Exams */}
            <Route
              path="/exams"
              element={
                <ProtectedRoute allowedRoles={["admin", "teacher"]}>
                  <Exams />
                </ProtectedRoute>
              }
            />

            {/* Reports */}
            <Route
              path="/reports"
              element={
                <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                  <Reports />
                </ProtectedRoute>
              }
            />

            {/* Settings */}
            <Route
              path="/settings"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <Settings />
                </ProtectedRoute>
              }
            />

            {/* Fees */}
            <Route
              path="/fees"
              element={
                <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                  <Fees />
                </ProtectedRoute>
              }
            />

            {/* Bus Tracking */}
            <Route
              path="/bus-tracking"
              element={
                <ProtectedRoute allowedRoles={["admin", "teacher", "parent"]}>
                  <BusTracking />
                </ProtectedRoute>
              }
            />

            {/* Timetable */}
            <Route
              path="/timetable"
              element={
                <ProtectedRoute allowedRoles={["admin", "teacher", "parent"]}>
                  <Timetable />
                </ProtectedRoute>
              }
            />

            {/* AI Tools */}
            <Route
              path="/ai-tools"
              element={
                <ProtectedRoute allowedRoles={["admin", "teacher"]}>
                  <AITools />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Redirects */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<RootRedirect />} />

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
