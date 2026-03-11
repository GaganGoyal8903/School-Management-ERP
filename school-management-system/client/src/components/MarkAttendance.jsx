import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Calendar, Users, CheckCircle, Clock, XCircle } from "lucide-react";
import CrestLogo from "./CrestLogo";
import { getStudents, submitAttendance } from "../services/api";

const sms_gradeOptions = [
  { id: "Class 6", label: "Class 6" },
  { id: "Class 7", label: "Class 7" },
  { id: "Class 8", label: "Class 8" },
  { id: "Class 9", label: "Class 9" },
  { id: "Class 10", label: "Class 10" },
  { id: "Class 11", label: "Class 11" },
  { id: "Class 12", label: "Class 12" },
];

const sms_sectionOptions = [
  { id: "A", label: "Section A" },
  { id: "B", label: "Section B" },
  { id: "C", label: "Section C" },
  { id: "D", label: "Section D" },
];

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function MarkAttendance() {
  const [sms_date, sms_setDate] = useState(todayIsoDate());
  const [sms_selectedGrade, sms_setSelectedGrade] = useState("");
  const [sms_selectedSection, sms_setSelectedSection] = useState("");
  const [sms_students, sms_setStudents] = useState([]);
  const [sms_attendanceMap, sms_setAttendanceMap] = useState({});
  const [sms_loading, sms_setLoading] = useState(false);
  const [sms_studentsLoading, sms_setStudentsLoading] = useState(false);

  useEffect(() => {
    const sms_fetchStudents = async () => {
      if (!sms_selectedGrade || !sms_selectedSection) {
        sms_setStudents([]);
        sms_setAttendanceMap({});
        return;
      }

      sms_setStudentsLoading(true);

      try {
        const response = await getStudents({ grade: sms_selectedGrade, section: sms_selectedSection });
        const studentsData = response.data.students || [];
        sms_setStudents(studentsData);

        const nextMap = {};
        studentsData.forEach((student) => {
          nextMap[student._id] = "Present";
        });
        sms_setAttendanceMap(nextMap);
      } catch (error) {
        console.error("Fetch students error:", error);
        toast.error("Failed to load students");
        sms_setStudents([]);
      } finally {
        sms_setStudentsLoading(false);
      }
    };

    sms_fetchStudents();
  }, [sms_selectedGrade, sms_selectedSection]);

  const sms_handleGradeChange = (value) => {
    sms_setSelectedGrade(value);
  };

  const sms_handleSectionChange = (value) => {
    sms_setSelectedSection(value);
  };

  const sms_handleStatusChange = (studentId, status) => {
    sms_setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: status,
    }));
  };

  const sms_handleSubmit = async (event) => {
    event.preventDefault();

    if (!sms_selectedGrade || !sms_selectedSection || sms_students.length === 0) {
      toast.error("Please select a grade and section first.");
      return;
    }

    sms_setLoading(true);

    try {
      const sms_user = JSON.parse(localStorage.getItem("sms_user") || "{}");
      const sms_teacherId = sms_user?.id;

      if (!sms_teacherId) {
        toast.error("Teacher session not found. Please login again.");
        sms_setLoading(false);
        return;
      }

      const attendanceList = sms_students.map((student) => ({
        studentId: student._id,
        status: sms_attendanceMap[student._id] || "Present",
      }));

      await submitAttendance({
        date: sms_date,
        grade: sms_selectedGrade,
        section: sms_selectedSection,
        attendanceList,
        markedBy: sms_teacherId,
      });

      toast.success(`Attendance submitted for ${sms_selectedGrade} - Section ${sms_selectedSection}`);
    } catch (error) {
      console.error("Submit attendance error:", error);
      toast.error(error.response?.data?.message || "Failed to submit attendance");
    } finally {
      sms_setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const present = Object.values(sms_attendanceMap).filter(s => s === "Present").length;
    const absent = Object.values(sms_attendanceMap).filter(s => s === "Absent").length;
    const late = Object.values(sms_attendanceMap).filter(s => s === "Late").length;
    return { present, absent, late, total: sms_students.length };
  }, [sms_attendanceMap, sms_students]);

  return (
    <section className="min-h-screen bg-transparent px-4 py-6 md:px-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="page-card p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CrestLogo 
                sizeClass="h-12 w-12" 
                className="border-2 border-[#c5a059] bg-[#fffbf2]" 
                imgClassName="h-full w-full rounded-full object-contain p-0.5" 
              />
              <div>
                <h1 
                  className="text-2xl font-bold text-[#002366]" 
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                >
                  Faculty Portal
                </h1>
                <p className="mt-1 text-sm text-slate-600">Mark daily attendance for your class.</p>
              </div>
            </div>
            <span className="rounded-full border border-[#c5a059] bg-[#fff7e6] px-3 py-1 text-xs font-semibold text-[#8a6d3b]">
              Teacher Action
            </span>
          </div>
        </header>

        {sms_students.length > 0 && (
          <div className="grid gap-4 md:grid-cols-4">
            <div className="page-card p-4">
              <p className="text-sm text-slate-600">Total Students</p>
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
          </div>
        )}

        <div className="page-card p-5 md:p-6">
          <form onSubmit={sms_handleSubmit} className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label 
                  htmlFor="attendance-date" 
                  className="mb-1 block text-sm font-medium text-[#002366]" 
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                >
                  <Calendar className="inline mr-1" size={14} /> Date
                </label>
                <input
                  id="attendance-date"
                  type="date"
                  value={sms_date}
                  onChange={(event) => sms_setDate(event.target.value)}
                  className="w-full rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
                />
              </div>

              <div>
                <label 
                  htmlFor="select-grade" 
                  className="mb-1 block text-sm font-medium text-[#002366]" 
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                >
                  <Users className="inline mr-1" size={14} /> Grade
                </label>
                <select
                  id="select-grade"
                  value={sms_selectedGrade}
                  onChange={(event) => sms_handleGradeChange(event.target.value)}
                  className="w-full rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
                >
                  <option value="">Select Grade</option>
                  {sms_gradeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label 
                  htmlFor="select-section" 
                  className="mb-1 block text-sm font-medium text-[#002366]" 
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                >
                  Section
                </label>
                <select
                  id="select-section"
                  value={sms_selectedSection}
                  onChange={(event) => sms_handleSectionChange(event.target.value)}
                  disabled={!sms_selectedGrade}
                  className="w-full rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Select Section</option>
                  {sms_sectionOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {sms_studentsLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#c5a059] border-t-transparent"></div>
                <span className="ml-3 text-sm text-slate-600">Loading students...</span>
              </div>
            )}

            {sms_selectedGrade && sms_selectedSection && !sms_studentsLoading && sms_students.length === 0 && (
              <div className="rounded-lg border border-[#d8c08a] bg-[#fffff0] px-4 py-8 text-center">
                <CrestLogo sizeClass="h-12 w-12" className="mx-auto mb-2 opacity-50" />
                <p className="text-slate-600">No students found for this grade and section.</p>
              </div>
            )}

            {sms_students.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-[#c5a059]">
                <table className="min-w-full divide-y divide-[#d8c08a]">
                  <thead className="bg-[#002366] text-[#fffbf2]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Roll No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Student Name</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e6d3aa] bg-[#fffff0]">
                    {sms_students.map((student) => (
                      <tr key={student._id} className="hover:bg-[#fff7e6]">
                        <td className="px-4 py-3 text-sm text-slate-700">{student.rollNo}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{student.fullName}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            {["Present", "Absent", "Late"].map((status) => (
                              <button
                                key={status}
                                type="button"
                                onClick={() => sms_handleStatusChange(student._id, status)}
                                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                  sms_attendanceMap[student._id] === status
                                    ? status === "Present"
                                      ? "bg-green-100 text-green-700 border-2 border-green-500"
                                      : status === "Absent"
                                      ? "bg-red-100 text-red-700 border-2 border-red-500"
                                      : "bg-amber-100 text-amber-700 border-2 border-amber-500"
                                    : "bg-gray-100 text-gray-500 border border-gray-300"
                                }`}
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {sms_students.length > 0 && (
              <div className="flex items-center justify-end gap-3">
                <button
                  type="submit"
                  disabled={sms_loading}
                  className="flex items-center gap-2 rounded-lg border border-[#002366] bg-[#002366] px-4 py-2 text-sm font-semibold text-white transition hover:border-[#c5a059] hover:shadow-[0_0_0_1px_#c5a059] disabled:opacity-50"
                >
                  <CheckCircle size={16} />
                  {sms_loading ? "Submitting..." : "Submit Attendance"}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

