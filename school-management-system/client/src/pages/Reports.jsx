import { useState, useEffect } from 'react';
import { BarChart3, Users, BookOpen, FileText, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { getDashboardStats, getAttendanceReport, getExamReport } from '../services/api';
import StatCard from '../components/StatCard';

const Reports = () => {
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    totalSubjects: 0,
    totalMaterials: 0
  });
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState('overview');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await getDashboardStats();
      // Handle API response - response.data contains { success, totalStudents, totalTeachers, etc. }
      const statsData = response?.data || {};
      setStats({
        totalStudents: statsData.totalStudents || statsData.stats?.students || 0,
        totalTeachers: statsData.totalTeachers || statsData.stats?.teachers || 0,
        totalSubjects: statsData.totalSubjects || statsData.stats?.subjects || 0,
        totalMaterials: statsData.totalMaterials || statsData.stats?.materials || 0
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      toast.error('Failed to fetch report data');
      setStats({
        totalStudents: 0,
        totalTeachers: 0,
        totalSubjects: 0,
        totalMaterials: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      let data;
      if (reportType === 'attendance') {
        data = await getAttendanceReport(dateRange);
      } else if (reportType === 'exams') {
        data = await getExamReport(dateRange);
      }
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-report-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
    } catch (error) {
      console.error('Export failed');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
        {isAdmin && (
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d]"
          >
            <Download className="w-4 h-4" />
            Export Report
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Students"
          value={stats.totalStudents || 0}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Total Teachers"
          value={stats.totalTeachers || 0}
          icon={BookOpen}
          color="green"
        />
        <StatCard
          title="Total Subjects"
          value={stats.totalSubjects || 0}
          icon={FileText}
          color="purple"
        />
        <StatCard
          title="Study Materials"
          value={stats.totalMaterials || 0}
          icon={BarChart3}
          color="yellow"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Generate Reports</h2>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              <option value="overview">Overview</option>
              <option value="attendance">Attendance Report</option>
              <option value="exams">Exam Results</option>
              <option value="students">Student Performance</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Student Distribution by Class</h3>
          <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
            <p className="text-gray-500">Chart visualization will appear here</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Attendance Overview</h3>
          <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
            <p className="text-gray-500">Chart visualization will appear here</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Exam Performance</h3>
          <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
            <p className="text-gray-500">Chart visualization will appear here</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Subject Distribution</h3>
          <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
            <p className="text-gray-500">Chart visualization will appear here</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;

