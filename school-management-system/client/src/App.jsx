import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./components/DashboardLayout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
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

function LoginRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />;
}

function RootRedirect() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
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
              path="/dashboard"
              element={
                <ProtectedRoute allowedRoles={["admin", "teacher", "student", "parent", "accountant"]}>
                  <Dashboard />
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
                <ProtectedRoute allowedRoles={["admin", "teacher", "student", "parent"]}>
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
