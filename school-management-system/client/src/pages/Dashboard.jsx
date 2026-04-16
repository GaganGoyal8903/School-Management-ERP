import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  CheckCircle,
  ArrowRight
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
import { DASHBOARD_REFRESH_EVENT, getDashboardStats } from "../services/api";
import StatCard from "../components/StatCard";
import ChartCard from "../components/ChartCard";
import LoadingSpinner from "../components/LoadingSpinner";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0
});

const formatCurrency = (value = 0) => `₹${currencyFormatter.format(Number(value) || 0)}`;

const formatCompactCurrency = (value = 0) => {
  const numericValue = Number(value) || 0;
  const absoluteValue = Math.abs(numericValue);

  if (absoluteValue >= 10000000) {
    return `₹${(numericValue / 10000000).toFixed(1)}Cr`;
  }

  if (absoluteValue >= 100000) {
    return `₹${(numericValue / 100000).toFixed(1)}L`;
  }

  if (absoluteValue >= 1000) {
    return `₹${(numericValue / 1000).toFixed(1)}K`;
  }

  return formatCurrency(numericValue);
};

const hasMeaningfulSeriesData = (data = [], keys = []) =>
  Array.isArray(data) && data.some((item) => keys.some((key) => Number(item?.[key] || 0) > 0));

const DashboardPanelEmptyState = ({ title, description }) => (
  <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 text-center">
    <p className="text-sm font-semibold text-gray-900">{title}</p>
    <p className="mt-2 max-w-sm text-sm text-gray-500">{description}</p>
  </div>
);

const defaultStats = {
  students: 0,
  teachers: 0,
  subjects: 0,
  materials: 0
};

const defaultFeeStats = {
  totalFees: 0,
  totalPaid: 0,
  totalPending: 0,
  overdueCount: 0,
  overdueAmount: 0,
  overduePenaltyAmount: 0,
  penaltyPerDay: 10,
};

const defaultBusStats = {
  total: 0,
  active: 0,
  onRoute: 0,
  filters: {
    total: "",
    active: "Active",
    onRoute: "On Route"
  }
};

const defaultAttendanceSummary = {
  totalStudents: 0,
  markedStudents: 0,
  unmarkedStudents: 0,
  present: 0,
  absent: 0,
  late: 0,
  leave: 0,
  percentage: 0,
  isMarked: false
};

const normalizeRecentStudent = (student) => {
  if (!student) {
    return null;
  }

  const studentId = student.studentId || student.id || student._id || null;
  if (!studentId) {
    return null;
  }

  const name = student.name || student.fullName || "Unknown";
  const rollNumber = student.rollNumber || student.rollNo || null;
  const className = student.class || student.className || "";
  const sectionName = student.section || student.sectionName || "";

  return {
    ...student,
    _id: String(studentId),
    id: String(studentId),
    studentId: String(studentId),
    name,
    fullName: name,
    rollNumber,
    rollNo: rollNumber,
    class: className,
    className,
    section: sectionName,
    sectionName,
  };
};

const normalizeStudentGrowthPoint = (point = {}) => ({
  month: point.month || point.label || "",
  year: Number(point.year || 0),
  students: Number(point.students ?? point.count ?? point.total ?? 0),
});

const normalizeFeeCollectionPoint = (point = {}) => ({
  month: point.month || point.label || "",
  year: Number(point.year || 0),
  collected: Number(point.collected ?? point.totalCollected ?? point.paid ?? 0),
  pending: Number(point.pending ?? point.totalPending ?? point.due ?? 0),
});

const Dashboard = () => {
  const { user, isAdmin, isTeacher, isStudent, isParent, isAccountant } = useAuth();
  const navigate = useNavigate();
  const canViewStudentPreview = isAdmin || isTeacher;
  const dashboardSubtitle = isStudent
    ? "Welcome to your student portal."
    : isParent
      ? "Welcome to your parent portal."
      : isAccountant
        ? "Welcome back to the school finance workspace."
        : "Welcome back to Mayo College Management System";

  const [stats, setStats] = useState(defaultStats);
  const [feeStats, setFeeStats] = useState(defaultFeeStats);
  const [busStats, setBusStats] = useState(defaultBusStats);
  const [todayAttendanceSummary, setTodayAttendanceSummary] = useState(defaultAttendanceSummary);
  const [recentStudents, setRecentStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studentGrowthData, setStudentGrowthData] = useState([]);
  const [feeCollectionData, setFeeCollectionData] = useState([]);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    fetchDashboardData({ showLoader: refreshToken === 0 });
  }, [refreshToken]);

  useEffect(() => {
    const requestDashboardRefresh = () => {
      setRefreshToken((currentValue) => currentValue + 1);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestDashboardRefresh();
      }
    };

    window.addEventListener(DASHBOARD_REFRESH_EVENT, requestDashboardRefresh);
    window.addEventListener("focus", requestDashboardRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const refreshIntervalId = window.setInterval(requestDashboardRefresh, 60000);

    return () => {
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, requestDashboardRefresh);
      window.removeEventListener("focus", requestDashboardRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(refreshIntervalId);
    };
  }, []);

  const fetchDashboardData = async ({ showLoader = true } = {}) => {
    try {
      if (showLoader) {
        setLoading(true);
      }

      const response = await getDashboardStats();
      const dashboardData = response?.data?.data || response?.data || {};
      const statsData = dashboardData.stats || {};
      const feeSummary = dashboardData.feeSummary || {};
      const busFleetStatus = dashboardData.busFleetStatus || {};
      const attendanceSummary = dashboardData.attendanceSummary || dashboardData.todayAttendance || {};

      setStats({
        students: Number(statsData.students || statsData.totalStudents || dashboardData.totalStudents || 0),
        teachers: Number(statsData.teachers || statsData.totalTeachers || dashboardData.totalTeachers || 0),
        subjects: Number(statsData.subjects || statsData.totalSubjects || dashboardData.totalSubjects || 0),
        materials: Number(statsData.materials || statsData.totalMaterials || dashboardData.totalMaterials || 0)
      });

      setFeeStats({
        totalFees: Number(feeSummary.totalFees || statsData.totalFees || 0),
        totalPaid: Number(feeSummary.totalPaid || statsData.totalFeesCollected || dashboardData.totalFeesCollected || 0),
        totalPending: Number(feeSummary.totalPending || statsData.pendingFees || dashboardData.pendingFees || 0),
        overdueCount: Number(feeSummary.overdueCount || 0),
        overdueAmount: Number(feeSummary.overdueAmount || 0),
        overduePenaltyAmount: Number(feeSummary.overduePenaltyAmount || 0),
        penaltyPerDay: Number(feeSummary.penaltyPerDay || 10),
      });

      setBusStats({
        total: Number(busFleetStatus.total || busFleetStatus.totalBuses || 0),
        active: Number(busFleetStatus.active || busFleetStatus.activeBuses || 0),
        onRoute: Number(busFleetStatus.onRoute || busFleetStatus.onRouteBuses || 0),
        filters: busFleetStatus.filters || defaultBusStats.filters
      });

      setTodayAttendanceSummary({
        totalStudents: Number(
          attendanceSummary.totalStudents || attendanceSummary.total || dashboardData.totalStudents || 0
        ),
        markedStudents: Number(attendanceSummary.markedStudents || 0),
        unmarkedStudents: Number(attendanceSummary.unmarkedStudents || 0),
        present: Number(attendanceSummary.present || 0),
        absent: Number(attendanceSummary.absent || 0),
        late: Number(attendanceSummary.late || 0),
        leave: Number(attendanceSummary.leave || 0),
        percentage: Number(attendanceSummary.percentage || 0),
        isMarked: Boolean(
          attendanceSummary.isMarked || Number(attendanceSummary.markedStudents || 0) > 0
        )
      });

      setRecentStudents(
        (Array.isArray(dashboardData.recentStudents) ? dashboardData.recentStudents : [])
          .map(normalizeRecentStudent)
          .filter(Boolean)
      );
      setStudentGrowthData(
        (Array.isArray(dashboardData.studentGrowthTrend)
          ? dashboardData.studentGrowthTrend
          : Array.isArray(dashboardData.studentGrowth)
            ? dashboardData.studentGrowth
            : []
        ).map(normalizeStudentGrowthPoint)
      );

      const feeGraphData = Array.isArray(dashboardData.feeCollectionGraph)
        ? dashboardData.feeCollectionGraph
        : Array.isArray(dashboardData.feeCollectionTrend)
          ? dashboardData.feeCollectionTrend
          : [];
      setFeeCollectionData(feeGraphData.map(normalizeFeeCollectionPoint));
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      if (showLoader) {
        setStats(defaultStats);
        setFeeStats(defaultFeeStats);
        setBusStats(defaultBusStats);
        setTodayAttendanceSummary(defaultAttendanceSummary);
        setRecentStudents([]);
        setStudentGrowthData([]);
        setFeeCollectionData([]);
      }
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  const openBusDetails = (status = "") => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    navigate(`/bus-tracking${query}`);
  };

  const openStudentDetails = (studentId) => {
    if (!studentId) return;
    navigate(`/students/${studentId}`);
  };

  const feeCollectionHasData = hasMeaningfulSeriesData(feeCollectionData, ["collected", "pending"]);
  const studentGrowthHasData = hasMeaningfulSeriesData(studentGrowthData, ["students"]);
  const attendanceData = todayAttendanceSummary.isMarked
    ? [
        { name: "Present", value: todayAttendanceSummary.present, color: "#10B981" },
        { name: "Absent", value: todayAttendanceSummary.absent, color: "#EF4444" },
        ...(todayAttendanceSummary.late > 0
          ? [{ name: "Late", value: todayAttendanceSummary.late, color: "#F59E0B" }]
          : []),
        ...(todayAttendanceSummary.leave > 0
          ? [{ name: "Leave", value: todayAttendanceSummary.leave, color: "#6366F1" }]
          : [])
      ].filter((entry) => entry.value > 0)
    : [];
  const attendanceHasData = todayAttendanceSummary.isMarked && attendanceData.length > 0;

  const feeCollectionContent = (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-emerald-50 p-4">
          <p className="text-sm text-emerald-700">Collected Fees</p>
          <p className="mt-1 text-xl font-semibold text-emerald-900">
            {formatCurrency(feeStats.totalPaid)}
          </p>
        </div>
        <div className="rounded-lg bg-amber-50 p-4">
          <p className="text-sm text-amber-700">Pending Fees</p>
          <p className="mt-1 text-xl font-semibold text-amber-900">
            {formatCurrency(feeStats.totalPending)}
          </p>
        </div>
      </div>

      {feeCollectionHasData ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={feeCollectionData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="month" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                stroke="#6B7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatCompactCurrency}
              />
              <Tooltip
                formatter={(value, name) => [formatCurrency(value), name]}
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #E5E7EB",
                  borderRadius: "8px"
                }}
              />
              <Legend />
              <Bar dataKey="collected" name="Collected Fees" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar dataKey="pending" name="Pending Fees" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <DashboardPanelEmptyState
          title="No fee collection data available"
          description="Monthly collected and pending fee trends will appear here once fee records are available."
        />
      )}
    </div>
  );

  const attendanceSummaryCards = [
    {
      label: "Total Students",
      value: todayAttendanceSummary.totalStudents,
      className: "bg-slate-50 text-slate-900",
      labelClassName: "text-slate-500"
    },
    {
      label: "Present",
      value: todayAttendanceSummary.present,
      className: "bg-emerald-50 text-emerald-900",
      labelClassName: "text-emerald-700"
    },
    {
      label: "Absent",
      value: todayAttendanceSummary.absent,
      className: "bg-red-50 text-red-900",
      labelClassName: "text-red-700"
    },
    {
      label: "Attendance %",
      value: `${todayAttendanceSummary.percentage.toFixed(1)}%`,
      className: "bg-blue-50 text-blue-900",
      labelClassName: "text-blue-700",
      helper: `Based on ${todayAttendanceSummary.markedStudents} marked students`
    }
  ];

  const busFleetItems = [
    {
      key: "total",
      label: "Total Buses",
      value: busStats.total,
      icon: Bus,
      filter: busStats.filters?.total || "",
      containerClass: "bg-blue-50 hover:bg-blue-100",
      iconClass: "bg-blue-100 text-blue-600"
    },
    {
      key: "active",
      label: "Active",
      value: busStats.active,
      icon: CheckCircle,
      filter: busStats.filters?.active || "Active",
      containerClass: "bg-green-50 hover:bg-green-100",
      iconClass: "bg-green-100 text-green-600"
    },
    {
      key: "onRoute",
      label: "On Route",
      value: busStats.onRoute,
      icon: TrendingUp,
      filter: busStats.filters?.onRoute || "On Route",
      containerClass: "bg-purple-50 hover:bg-purple-100",
      iconClass: "bg-purple-100 text-purple-600"
    }
  ];

  if (loading) {
    return <LoadingSpinner text="Loading dashboard..." />;
  }

  return (
    <div>
      <div className="bg-gradient-to-r from-[#002366] to-[#001a4d] rounded-xl p-6 mb-6 text-white">
        <h1 className="text-2xl font-bold">
          {getGreeting()}, {user?.fullName?.split(" ")[0] || "User"}!
        </h1>
        <p className="text-blue-200 mt-1">
          {dashboardSubtitle}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6 mb-6">
        {isAdmin && (
          <>
            <StatCard title="Total Students" value={stats.students} icon={Users} color="blue" trend={5} />
            <StatCard title="Total Teachers" value={stats.teachers} icon={GraduationCap} color="green" trend={2} />
            <StatCard
              title="Total Fees Collected"
              value={formatCompactCurrency(feeStats.totalPaid)}
              icon={DollarSign}
              color="purple"
              trend={12}
            />
            <StatCard
              title="Pending Fees"
              value={formatCompactCurrency(feeStats.totalPending)}
              icon={AlertCircle}
              color="yellow"
            />
            <StatCard
              title="Overdue Fees"
              value={formatCompactCurrency(feeStats.overdueAmount)}
              icon={TrendingUp}
              color="red"
              hint={`${Number(feeStats.overdueCount || 0)} accounts • ${formatCompactCurrency(feeStats.overduePenaltyAmount)} penalty`}
            />
          </>
        )}

        {isTeacher && (
          <>
            <StatCard title="My Subjects" value={stats.subjects} icon={BookOpen} color="blue" />
            <StatCard title="Students" value={stats.students} icon={Users} color="green" />
            <StatCard title="Materials" value={stats.materials} icon={FileText} color="purple" />
            <StatCard
              title="Attendance Today"
              value={`${Number(todayAttendanceSummary.percentage || 0).toFixed(1)}%`}
              icon={CheckCircle}
              color="green"
            />
          </>
        )}

        {isAccountant && (
          <>
            <StatCard title="Total Fee Ledger" value={formatCompactCurrency(feeStats.totalFees)} icon={DollarSign} color="blue" />
            <StatCard title="Collected" value={formatCompactCurrency(feeStats.totalPaid)} icon={CheckCircle} color="green" />
            <StatCard title="Pending" value={formatCompactCurrency(feeStats.totalPending)} icon={AlertCircle} color="yellow" />
            <StatCard
              title="Overdue Fees"
              value={formatCompactCurrency(feeStats.overdueAmount)}
              icon={TrendingUp}
              color="red"
              hint={`${Number(feeStats.overdueCount || 0)} accounts • ${formatCompactCurrency(feeStats.overduePenaltyAmount)} penalty`}
            />
          </>
        )}
      </div>

      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ChartCard title="Student Growth" subtitle="Monthly student enrollment">
            {studentGrowthHasData ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={studentGrowthData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="month" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(value) => [`${value} students`, "Enrolled"]}
                      contentStyle={{
                        backgroundColor: "#fff",
                        border: "1px solid #E5E7EB",
                        borderRadius: "8px"
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="students"
                      stroke="#002366"
                      strokeWidth={3}
                      dot={{ fill: "#002366", strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <DashboardPanelEmptyState
                title="No student growth data available"
                description="Monthly enrollment data will show here after student records are created."
              />
            )}
          </ChartCard>

          <ChartCard title="Fee Collection" subtitle="Monthly fee collection vs pending">
            {feeCollectionContent}
          </ChartCard>
        </div>
      )}

      {isAccountant && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ChartCard title="Fee Collection" subtitle="Monthly fee collection vs pending">
            {feeCollectionContent}
          </ChartCard>

          <ChartCard title="Collection Snapshot" subtitle="Finance summary for the current cycle">
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-4">
                <div>
                  <p className="text-sm text-emerald-700">Collected</p>
                  <p className="text-2xl font-semibold text-emerald-900">
                    {formatCurrency(feeStats.totalPaid)}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-amber-50 p-4">
                <div>
                  <p className="text-sm text-amber-700">Pending</p>
                  <p className="text-2xl font-semibold text-amber-900">
                    {formatCurrency(feeStats.totalPending)}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-amber-600" />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4">
                <div>
                  <p className="text-sm text-slate-600">Overdue Fees</p>
                  <p className="text-2xl font-semibold text-slate-900">
                    {formatCurrency(feeStats.overdueAmount)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {Number(feeStats.overdueCount || 0)} accounts with {formatCurrency(feeStats.overduePenaltyAmount)} penalty
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-slate-600" />
              </div>
            </div>
          </ChartCard>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {isAdmin && (
          <ChartCard title="Today's Attendance" subtitle="Attendance overview">
            {attendanceHasData ? (
              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={attendanceData}
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={84}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {attendanceData.map((entry, index) => (
                          <Cell key={`attendance-cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                  {attendanceSummaryCards.map((item) => (
                    <div key={item.label} className={`rounded-lg p-4 ${item.className}`}>
                      <p className={`text-sm ${item.labelClassName}`}>{item.label}</p>
                      <p className="mt-1 text-2xl font-semibold">{item.value}</p>
                      {item.helper ? (
                        <p className={`mt-1 text-xs ${item.labelClassName}`}>{item.helper}</p>
                      ) : null}
                    </div>
                  ))}

                  {(todayAttendanceSummary.late > 0 || todayAttendanceSummary.leave > 0 || todayAttendanceSummary.unmarkedStudents > 0) && (
                    <div className="sm:col-span-2 rounded-lg bg-amber-50 p-4">
                      <p className="text-sm text-amber-800">
                        Late: {todayAttendanceSummary.late} | Leave: {todayAttendanceSummary.leave}
                        {todayAttendanceSummary.unmarkedStudents > 0
                          ? ` | Awaiting mark: ${todayAttendanceSummary.unmarkedStudents}`
                          : ""}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <DashboardPanelEmptyState
                title="Attendance not marked for today"
                description={
                  todayAttendanceSummary.totalStudents > 0
                    ? `No attendance records are available yet for ${todayAttendanceSummary.totalStudents} students.`
                    : "No attendance records are available yet."
                }
              />
            )}
          </ChartCard>
        )}

        {isAdmin && (
          <ChartCard title="Bus Fleet Status" subtitle="Active vehicles">
            <div className="space-y-4">
              {busFleetItems.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => openBusDetails(item.filter)}
                    className={`flex w-full items-center justify-between rounded-lg p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${item.containerClass}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`rounded-lg p-2 ${item.iconClass}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{item.value}</p>
                        <p className="text-sm text-gray-500">{item.label}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                  </button>
                );
              })}
            </div>
          </ChartCard>
        )}

        {isAccountant && (
          <ChartCard title="Finance Highlights" subtitle="Core numbers at a glance">
            <div className="space-y-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm text-blue-700">Total Students Linked To Fees</p>
                <p className="mt-2 text-2xl font-semibold text-blue-900">{stats.students || 0}</p>
              </div>
              <div className="rounded-lg bg-violet-50 p-4">
                <p className="text-sm text-violet-700">Fee Structures / Subjects Snapshot</p>
                <p className="mt-2 text-2xl font-semibold text-violet-900">{stats.subjects || 0}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-4">
                <p className="text-sm text-emerald-700">Materials / Notices Feed</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-900">{stats.materials || 0}</p>
              </div>
            </div>
          </ChartCard>
        )}

        {canViewStudentPreview && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Recent Students
            </h2>
            <div className="space-y-3">
              {recentStudents.length > 0 ? (
                recentStudents.map((student) => (
                  <button
                    key={student.studentId || student.id || student._id}
                    type="button"
                    onClick={() => openStudentDetails(student.studentId || student.id || student._id)}
                    className="flex w-full items-center gap-3 rounded-lg bg-gray-50 p-3 text-left transition-all hover:-translate-y-0.5 hover:bg-gray-100 hover:shadow-sm"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#002366] flex items-center justify-center text-white font-medium">
                      {(student?.name || student?.fullName || "S").charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {student?.name || student?.fullName || "Unknown"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {student?.class || "-"} {student?.section || ""}
                      </p>
                      {(student?.rollNumber || student?.admissionNumber) && (
                        <p className="text-xs text-gray-400">
                          {student?.rollNumber
                            ? `Roll No: ${student.rollNumber}`
                            : `Admission No: ${student.admissionNumber}`}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                  </button>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">
                  No recent students available
                </p>
              )}
            </div>
          </div>
        )}

        {(isStudent || isParent) && (
          <ChartCard
            title={isStudent ? "Student Access" : "Parent Access"}
            subtitle={isStudent ? "Modules available in your portal" : "Modules available in your parent portal"}
          >
            <div className="space-y-3">
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Current Role</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{user?.role || "User"}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm text-blue-600">Dashboard Access</p>
                <p className="mt-1 text-base font-medium text-blue-900">Enabled</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-4">
                <p className="text-sm text-amber-700">Admin Controls</p>
                <p className="mt-1 text-base font-medium text-amber-900">Hidden for your role</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-4">
                <p className="text-sm text-emerald-600">Primary Modules</p>
                <p className="mt-1 text-base font-medium text-emerald-900">
                  {isStudent ? "Timetable and academic overview" : "Timetable and transport overview"}
                </p>
              </div>
            </div>
          </ChartCard>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {isAdmin && (
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

          {isTeacher && (
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
            </>
          )}

          {isAccountant && (
            <>
              <Link
                to="/fees"
                className="p-4 bg-green-50 rounded-lg hover:bg-green-100 transition text-center"
              >
                <DollarSign className="w-6 h-6 text-green-600 mx-auto mb-2" />
                <p className="font-medium text-green-900">Fees</p>
              </Link>
              <Link
                to="/reports"
                className="p-4 bg-sky-50 rounded-lg hover:bg-sky-100 transition text-center"
              >
                <TrendingUp className="w-6 h-6 text-sky-600 mx-auto mb-2" />
                <p className="font-medium text-sky-900">Reports</p>
              </Link>
            </>
          )}

          {isStudent && (
            <Link
              to="/timetable"
              className="p-4 bg-teal-50 rounded-lg hover:bg-teal-100 transition text-center"
            >
              <BookOpen className="w-6 h-6 text-teal-600 mx-auto mb-2" />
              <p className="font-medium text-teal-900">Timetable</p>
            </Link>
          )}

          {isParent && (
            <>
              <Link
                to="/bus-tracking"
                className="p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition text-center"
              >
                <Bus className="w-6 h-6 text-orange-600 mx-auto mb-2" />
                <p className="font-medium text-orange-900">Bus Tracking</p>
              </Link>
              <Link
                to="/timetable"
                className="p-4 bg-teal-50 rounded-lg hover:bg-teal-100 transition text-center"
              >
                <BookOpen className="w-6 h-6 text-teal-600 mx-auto mb-2" />
                <p className="font-medium text-teal-900">Timetable</p>
              </Link>
            </>
          )}
        </div>
      </div>

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
