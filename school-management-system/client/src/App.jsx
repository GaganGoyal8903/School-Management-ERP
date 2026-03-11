import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./components/DashboardLayout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
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

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>

          {/* Public Route */}
          <Route path="/login" element={<Login />} />

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
                <ProtectedRoute allowedRoles={["admin", "teacher", "student"]}>
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
                <ProtectedRoute allowedRoles={["admin"]}>
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
                <ProtectedRoute allowedRoles={["admin"]}>
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
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;