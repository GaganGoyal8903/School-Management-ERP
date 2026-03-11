import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  BookOpen,
  FileText,
  Calendar,
  GraduationCap,
  TrendingUp,
  DollarSign,
  Bus,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

import { useAuth } from "../context/AuthContext";
import { getDashboard, getDashboardStats, getStudents, getFeeStats, getBuses, getAttendance } from "../services/api";
import StatCard from "../components/StatCard";
import ChartCard from "../components/ChartCard";
import LoadingSpinner from "../components/LoadingSpinner";

const Dashboard = () => {
  const { user, isAdmin, isTeacher } = useAuth();

  const [stats, setStats] = useState({
    students: 0,
    teachers: 0,
    subjects: 0,
    materials: 0
  });

  const [feeStats, setFeeStats] = useState({
    totalFees: 0,
    totalPaid: 0,
    totalPending: 0,
    overdueCount: 0
  });

  const [busStats, setBusStats] = useState({
    total: 0,
    active: 0,
    onRoute: 0
  });

  const [attendanceData, setAttendanceData] = useState([]);
  const [recentStudents, setRecentStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Chart data
  const [studentGrowthData, setStudentGrowthData] = useState([]);
  const [feeCollectionData, setFeeCollectionData] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const [statsRes, studentsRes, feeRes, busRes, attendanceRes] = await Promise.all([
        getDashboardStats(),
        getStudents(1, 5),
        isAdmin ? getFeeStats() : Promise.resolve({ data: { data: {} } }),
        isAdmin ? getBuses() : Promise.resolve({ data: { data: [] } }),
        isAdmin ? getAttendance({ date: new Date().toISOString().split('T')[0] }) : Promise.resolve({ data: { data: [] } })
      ]);

      const statsData = statsRes?.data?.stats || statsRes?.data || {};
      setStats({
        students: statsData.students || 0,
        teachers: statsData.teachers || 0,
        subjects: statsData.subjects || 0,
        materials: statsData.materials || 0
      });

      // Fee stats
      if (feeRes?.data?.data) {
        setFeeStats(feeRes.data.data);
      }

      // Bus stats
      const busesData = busRes?.data?.data || [];
      setBusStats({
        total: busesData.length,
        active: busesData.filter(b => b.currentStatus === 'Active').length,
        onRoute: busesData.filter(b => b.currentStatus === 'On Route').length
      });

      // Attendance data for pie chart
      const attendanceRecords = attendanceRes?.data?.data || [];
      const present = attendanceRecords.filter(a => a.status === 'Present').length;
      const absent = attendanceRecords.filter(a => a.status === 'Absent').length;
      const leave = attendanceRecords.filter(a => a.status === 'Leave').length;

      setAttendanceData([
        { name: 'Present', value: present || 85, color: '#10B981' },
        { name: 'Absent', value: absent || 10, color: '#EF4444' },
        { name: 'Leave', value: leave || 5, color: '#F59E0B' }
      ]);

      // Safely handle students array
      const studentsData = studentsRes?.data?.students || studentsRes?.data || [];
      setRecentStudents(Array.isArray(studentsData) ? studentsData : []);

      // Generate mock chart data (in production, fetch from API)
      setStudentGrowthData([
        { month: 'Jan', students: 120 },
        { month: 'Feb', students: 135 },
        { month: 'Mar', students: 148 },
        { month: 'Apr', students: 156 },
        { month: 'May', students: 168 },
        { month: 'Jun', students: 180 }
      ]);

      setFeeCollectionData([
        { month: 'Jan', collected: 45000, pending: 12000 },
        { month: 'Feb', collected: 52000, pending: 8000 },
        { month: 'Mar', collected: 48000, pending: 15000 },
        { month: 'Apr', collected: 61000, pending: 5000 },
        { month: 'May', collected: 55000, pending: 10000 },
        { month: 'Jun', collected: 67000, pending: 3000 }
      ]);
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      setRecentStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  if (loading) {
    return <LoadingSpinner text="Loading dashboard..." />;
  }

  return (
    <div>
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-[#002366] to-[#001a4d] rounded-xl p-6 mb-6 text-white">
        <h1 className="text-2xl font-bold">
          {getGreeting()}, {user?.fullName?.split(" ")[0] || "User"}!
        </h1>
        <p className="text-blue-200 mt-1">
          Welcome back to Mayo College Management System
        </p>
        <div className="flex items-center gap-2 mt-4 text-sm text-blue-200">
          <TrendingUp className="w-4 h-4" />
          <span>
            Your role:
            <span className="text-white font-medium capitalize ml-1">
              {user?.role || "user"}
            </span>
          </span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {isAdmin && (
          <>
            <StatCard
              title="Total Students"
              value={stats.students}
              icon={Users}
              color="blue"
              trend={5}
            />
            <StatCard
              title="Total Teachers"
              value={stats.teachers}
              icon={GraduationCap}
              color="green"
              trend={2}
            />
            <StatCard
              title="Total Fees Collected"
              value={`₹${(feeStats.totalPaid / 1000).toFixed(1)}K`}
              icon={DollarSign}
              color="purple"
              trend={12}
            />
            <StatCard
              title="Pending Fees"
              value={`₹${(feeStats.totalPending / 1000).toFixed(1)}K`}
              icon={AlertCircle}
              color="yellow"
            />
          </>
        )}

        {isTeacher && (
          <>
            <StatCard
              title="My Subjects"
              value={stats.subjects}
              icon={BookOpen}
              color="blue"
            />
            <StatCard
              title="Students"
              value={stats.students}
              icon={Users}
              color="green"
            />
            <StatCard
              title="Materials"
              value={stats.materials}
              icon={FileText}
              color="purple"
            />
            <StatCard
              title="Attendance Today"
              value="95%"
              icon={CheckCircle}
              color="green"
            />
          </>
        )}
      </div>

      {/* Charts Section */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Student Growth Chart */}
          <ChartCard title="Student Growth" subtitle="Monthly student enrollment">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={studentGrowthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month" stroke="#6B7280" fontSize={12} />
                  <YAxis stroke="#6B7280" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #E5E7EB',
                      borderRadius: '8px'
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="students"
                    stroke="#002366"
                    strokeWidth={3}
                    dot={{ fill: '#002366', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Fee Collection Chart */}
          <ChartCard title="Fee Collection" subtitle="Monthly fee collection vs pending">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={feeCollectionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month" stroke="#6B7280" fontSize={12} />
                  <YAxis stroke="#6B7280" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #E5E7EB',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="collected" name="Collected" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" name="Pending" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      )}

      {/* Second Row: Attendance Pie & Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Attendance Pie Chart */}
        {isAdmin && (
          <ChartCard title="Today's Attendance" subtitle="Attendance overview">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={attendanceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {attendanceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}

        {/* Bus Stats */}
        {isAdmin && (
          <ChartCard title="Bus Fleet Status" subtitle="Active vehicles">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Bus className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{busStats.total}</p>
                    <p className="text-sm text-gray-500">Total Buses</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{busStats.active}</p>
                    <p className="text-sm text-gray-500">Active</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{busStats.onRoute}</p>
                    <p className="text-sm text-gray-500">On Route</p>
                  </div>
                </div>
              </div>
            </div>
          </ChartCard>
        )}

        {/* Recent Students + Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Recent Students
          </h2>
          <div className="space-y-3">
            {recentStudents.length > 0 ? (
              recentStudents.map((student) => (
                <div
                  key={student._id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-[#002366] flex items-center justify-center text-white font-medium">
                    {student?.fullName?.charAt(0) || "S"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {student?.fullName || "Unknown"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {student?.className || student?.class || "-"} {student?.section || ""}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">
                No students found
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(isAdmin || isTeacher) && (
            <>
              <Link
                to="/students"
                className="p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition text-center"
              >
                <Users className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                <p className="font-medium text-blue-900">Students</p>
              </Link>
              <Link
                to="/attendance"
                className="p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition text-center"
              >
                <Calendar className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                <p className="font-medium text-purple-900">Attendance</p>
              </Link>
              <Link
                to="/fees"
                className="p-4 bg-green-50 rounded-lg hover:bg-green-100 transition text-center"
              >
                <DollarSign className="w-6 h-6 text-green-600 mx-auto mb-2" />
                <p className="font-medium text-green-900">Fees</p>
              </Link>
              <Link
                to="/bus-tracking"
                className="p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition text-center"
              >
                <Bus className="w-6 h-6 text-orange-600 mx-auto mb-2" />
                <p className="font-medium text-orange-900">Bus Tracking</p>
              </Link>
            </>
          )}
          <Link
            to="/materials"
            className="p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition text-center"
          >
            <FileText className="w-6 h-6 text-indigo-600 mx-auto mb-2" />
            <p className="font-medium text-indigo-900">Materials</p>
          </Link>
          <Link
            to="/timetable"
            className="p-4 bg-teal-50 rounded-lg hover:bg-teal-100 transition text-center"
          >
            <BookOpen className="w-6 h-6 text-teal-600 mx-auto mb-2" />
            <p className="font-medium text-teal-900">Timetable</p>
          </Link>
        </div>
      </div>

      {/* System Info */}
      <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          System Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">Academic Year</p>
            <p className="font-semibold text-gray-900">2024-2025</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">School</p>
            <p className="font-semibold text-gray-900">Mayo College</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">Version</p>
            <p className="font-semibold text-gray-900">1.0.0</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

