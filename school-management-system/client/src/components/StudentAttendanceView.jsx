import { useState, useMemo, useEffect } from "react";
import toast from "react-hot-toast";
import { Calendar, CheckCircle, XCircle, Clock, Filter } from "lucide-react";
import CrestLogo from "./CrestLogo";
import { getAttendanceByStudent } from "../services/api";

export default function StudentAttendanceView() {
  const [sms_attendance, setSms_attendance] = useState([]);
  const [sms_loading, setSms_loading] = useState(true);
  const [sms_dateRange, setSms_dateRange] = useState("30"); // days

  // Mock data for demo (in production, fetch from API)
  const mockAttendance = [
    { date: "2024-01-15", status: "Present" },
    { date: "2024-01-16", status: "Present" },
    { date: "2024-01-17", status: "Absent" },
    { date: "2024-01-18", status: "Present" },
    { date: "2024-01-19", status: "Late" },
    { date: "2024-01-20", status: "Present" },
    { date: "2024-01-21", status: "Present" },
    { date: "2024-01-22", status: "Present" },
    { date: "2024-01-23", status: "Present" },
    { date: "2024-01-24", status: "Absent" },
  ];

  useEffect(() => {
    const fetchAttendance = async () => {
      setSms_loading(true);
      try {
        // In production: const response = await getAttendanceByStudent(currentUser.id);
        setTimeout(() => {
          setSms_attendance(mockAttendance);
          setSms_loading(false);
        }, 500);
      } catch (error) {
        toast.error("Failed to load attendance");
        setSms_loading(false);
      }
    };
    fetchAttendance();
  }, []);

  const stats = useMemo(() => {
    const present = sms_attendance.filter(a => a.status === "Present").length;
    const absent = sms_attendance.filter(a => a.status === "Absent").length;
    const late = sms_attendance.filter(a => a.status === "Late").length;
    const total = sms_attendance.length;
    const percentage = total > 0 ? Math.round((present + late) / total * 100) : 0;
    return { present, absent, late, total, percentage };
  }, [sms_attendance]);

  const getStatusIcon = (status) => {
    switch (status) {
      case "Present": return <CheckCircle className="text-green-600" size={16} />;
      case "Absent": return <XCircle className="text-red-600" size={16} />;
      case "Late": return <Clock className="text-amber-600" size={16} />;
      default: return null;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Present": return "bg-green-100 text-green-700";
      case "Absent": return "bg-red-100 text-red-700";
      case "Late": return "bg-amber-100 text-amber-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <section className="min-h-screen bg-transparent px-4 py-6 md:px-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="page-card p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CrestLogo sizeClass="h-12 w-12" className="border-2 border-[#c5a059] bg-[#fffbf2]" imgClassName="h-full w-full rounded-full object-contain p-0.5" />
              <div>
                <h1 className="text-2xl font-bold text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  My Attendance
                </h1>
                <p className="mt-1 text-sm text-slate-600">View your attendance record.</p>
              </div>
            </div>
            <span className="rounded-full border border-[#c5a059] bg-[#fff7e6] px-3 py-1 text-xs font-semibold text-[#8a6d3b]">
              Student View
            </span>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-5">
          <div className="page-card p-4">
            <p className="text-sm text-slate-600">Total Days</p>
            <p className="text-2xl font-bold text-[#002366]">{stats.total}</p>
          </div>
          <div className="page-card p-4 flex items-center gap-2">
            <CheckCircle className="text-green-600" size={20} />
            <div>
              <p className="text-sm text-slate-600">Present</p>
              <p className="text-xl font-bold text-green-600">{stats.present}</p>
            </div>
          </div>
          <div className="page-card p-4 flex items-center gap-2">
            <XCircle className="text-red-600" size={20} />
            <div>
              <p className="text-sm text-slate-600">Absent</p>
              <p className="text-xl font-bold text-red-600">{stats.absent}</p>
            </div>
          </div>
          <div className="page-card p-4 flex items-center gap-2">
            <Clock className="text-amber-600" size={20} />
            <div>
              <p className="text-sm text-slate-600">Late</p>
              <p className="text-xl font-bold text-amber-600">{stats.late}</p>
            </div>
          </div>
          <div className="page-card p-4">
            <p className="text-sm text-slate-600">Attendance %</p>
            <p className="text-2xl font-bold text-[#002366]">{stats.percentage}%</p>
          </div>
        </div>

        <div className="page-card p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#002366]">Attendance History</h2>
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-slate-500" />
              <select
                value={sms_dateRange}
                onChange={(e) => setSms_dateRange(e.target.value)}
                className="rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-1.5 text-sm outline-none focus:border-[#c5a059]"
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </div>
          </div>

          {sms_loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#c5a059] border-t-transparent"></div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#c5a059]">
              <table className="min-w-full divide-y divide-[#d8c08a]">
                <thead className="bg-[#002366] text-[#fffbf2]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                      <Calendar className="inline mr-1" size={14} /> Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e6d3aa] bg-[#fffff0]">
                  {sms_attendance.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-slate-500">No attendance records found</td>
                    </tr>
                  ) : (
                    sms_attendance.map((record, index) => (
                      <tr key={index} className="hover:bg-[#fff7e6]">
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {new Date(record.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${getStatusColor(record.status)}`}>
                            {getStatusIcon(record.status)} {record.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

