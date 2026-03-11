import { useState, useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import { BookOpen, Save, User, Calendar } from "lucide-react";
import CrestLogo from "./CrestLogo";
import { getStudents, createGrade, getGrades } from "../services/api";

const subjects = ["Mathematics", "Science", "English", "History", "Geography"];
const examTypes = ["Midterm", "Final", "Quiz", "Assignment"];
const grades = ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"];
const sections = ["A", "B", "C", "D"];
const academicYears = ["2024-2025", "2025-2026"];

function getGradeLetter(marks) {
  const value = Number(marks);
  if (Number.isNaN(value) || marks === "") return "-";
  if (value >= 85) return "A";
  if (value >= 70) return "B";
  if (value >= 60) return "C";
  if (value >= 50) return "D";
  return "F";
}

export default function GradeEntry() {
  const [sms_students, setSms_students] = useState([]);
  const [sms_loading, setSms_loading] = useState(true);
  const [sms_subject, setSms_subject] = useState(subjects[0]);
  const [sms_examType, setSms_examType] = useState(examTypes[0]);
  const [sms_grade, setSms_grade] = useState("Class 10");
  const [sms_section, setSms_section] = useState("A");
  const [sms_academicYear, setSms_academicYear] = useState("2024-2025");
  const [sms_entries, setSms_entries] = useState({});
  const [sms_saving, setSms_saving] = useState(false);

  useEffect(() => {
    fetchStudents();
  }, [sms_grade, sms_section]);

  const fetchStudents = async () => {
    try {
      setSms_loading(true);
      const response = await getStudents({ grade: sms_grade, section: sms_section });
      const studentsData = response.data.students || [];
      setSms_students(studentsData);
      
      // Initialize entries with empty values
      const initialEntries = {};
      studentsData.forEach((student) => {
        initialEntries[student._id] = { marks: "", remarks: "" };
      });
      setSms_entries(initialEntries);
    } catch (error) {
      console.error("Error fetching students:", error);
      toast.error("Failed to load students");
    } finally {
      setSms_loading(false);
    }
  };

  const fetchExistingGrades = async () => {
    try {
      const response = await getGrades({ 
        grade: sms_grade, 
        examType: sms_examType,
        academicYear: sms_academicYear 
      });
      const gradesData = response.data.grades || [];
      
      // Populate existing grades
      const existingEntries = { ...sms_entries };
      gradesData.forEach((grade) => {
        if (grade.studentId && grade.studentId._id) {
          existingEntries[grade.studentId._id] = { 
            marks: grade.marks, 
            remarks: grade.remarks || "" 
          };
        }
      });
      setSms_entries(existingEntries);
    } catch (error) {
      console.error("Error fetching grades:", error);
    }
  };

  useEffect(() => {
    if (sms_students.length > 0) {
      fetchExistingGrades();
    }
  }, [sms_examType, sms_academicYear, sms_students.length]);

  const sms_rows = useMemo(() => {
    return sms_students.map((student) => {
      const current = sms_entries[student._id] || { marks: "", remarks: "" };
      return {
        ...student,
        marks: current.marks,
        remarks: current.remarks,
        grade: getGradeLetter(current.marks),
      };
    });
  }, [sms_students, sms_entries]);

  const updateEntry = (studentId, field, value) => {
    setSms_entries((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value,
      },
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSms_saving(true);

    try {
      const gradePromises = sms_rows
        .filter((row) => row.marks !== "")
        .map((row) =>
          createGrade({
            studentId: row._id,
            subject: sms_subject,
            examType: sms_examType,
            marks: Number(row.marks),
            remarks: row.remarks,
            academicYear: sms_academicYear,
          })
        );

      await Promise.all(gradePromises);
      toast.success(`Grades saved for ${sms_subject} (${sms_examType})`);
    } catch (error) {
      console.error("Error saving grades:", error);
      toast.error("Failed to save grades");
    } finally {
      setSms_saving(false);
    }
  };

  return (
    <section className="min-h-screen bg-transparent px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="page-card p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CrestLogo sizeClass="h-12 w-12" className="border-2 border-[#c5a059] bg-[#fffbf2]" imgClassName="h-full w-full rounded-full object-contain p-0.5" />
              <div>
                <h1 className="text-2xl font-bold text-[#002366]">Grade Entry</h1>
                <p className="mt-1 text-sm text-slate-600">Enter marks with auto grade calculation for exam cycles.</p>
              </div>
            </div>
            <span className="rounded-full border border-[#c5a059] bg-[#fff7e6] px-3 py-1 text-xs font-semibold text-[#8a6d3b]">Teacher Evaluation</span>
          </div>
        </header>

        <div className="page-card p-5 md:p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-3 md:grid-cols-5">
              <div>
                <label htmlFor="sms_grade" className="mb-1 block text-sm font-medium text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  <BookOpen className="inline mr-1" size={14} /> Grade
                </label>
                <select
                  id="sms_grade"
                  value={sms_grade}
                  onChange={(event) => setSms_grade(event.target.value)}
                  className="w-full rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
                >
                  {grades.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="sms_section" className="mb-1 block text-sm font-medium text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  <User className="inline mr-1" size={14} /> Section
                </label>
                <select
                  id="sms_section"
                  value={sms_section}
                  onChange={(event) => setSms_section(event.target.value)}
                  className="w-full rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
                >
                  {sections.map((item) => (
                    <option key={item} value={item}>Section {item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="sms_subject" className="mb-1 block text-sm font-medium text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  <BookOpen className="inline mr-1" size={14} /> Subject
                </label>
                <select
                  id="sms_subject"
                  value={sms_subject}
                  onChange={(event) => setSms_subject(event.target.value)}
                  className="w-full rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
                >
                  {subjects.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="sms_examType" className="mb-1 block text-sm font-medium text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  <Calendar className="inline mr-1" size={14} /> Exam Type
                </label>
                <select
                  id="sms_examType"
                  value={sms_examType}
                  onChange={(event) => setSms_examType(event.target.value)}
                  className="w-full rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
                >
                  {examTypes.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="sms_academicYear" className="mb-1 block text-sm font-medium text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  Academic Year
                </label>
                <select
                  id="sms_academicYear"
                  value={sms_academicYear}
                  onChange={(event) => setSms_academicYear(event.target.value)}
                  className="w-full rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
                >
                  {academicYears.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>

            {sms_loading ? (
              <div className="py-8 text-center text-slate-500">Loading students...</div>
            ) : sms_rows.length === 0 ? (
              <div className="py-8 text-center text-slate-500">No students found for this grade and section.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#c5a059]">
                <table className="min-w-full divide-y divide-[#d8c08a]">
                  <thead className="bg-[#002366] text-[#fffbf2]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Roll No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Marks Obtained</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Remarks</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e6d3aa] bg-[#fffff0]">
                    {sms_rows.map((row) => (
                      <tr key={row._id} className="hover:bg-[#fff7e6]">
                        <td className="px-4 py-3 text-sm text-slate-700">{row.rollNo}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{row.fullName}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={row.marks}
                            onChange={(event) => updateEntry(row._id, "marks", event.target.value)}
                            placeholder="0 - 100"
                            className="w-28 rounded-md border border-[#d8c08a] px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={row.remarks}
                            onChange={(event) => updateEntry(row._id, "remarks", event.target.value)}
                            placeholder="Add remarks"
                            className="w-full min-w-44 rounded-md border border-[#d8c08a] px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex min-w-8 justify-center rounded-full bg-[#f7f7f2] px-2 py-1 text-xs font-semibold text-slate-700">
                            {row.grade}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                {sms_rows.filter(r => r.marks).length} / {sms_rows.length} students graded
              </p>
              <button
                type="submit"
                disabled={sms_saving || sms_rows.length === 0}
                className="ml-auto flex items-center gap-2 rounded-lg border border-[#002366] bg-[#002366] px-4 py-2 text-sm font-semibold text-white transition hover:border-[#c5a059] hover:shadow-[0_0_0_1px_#c5a059] disabled:opacity-50"
              >
                <Save size={16} />
                {sms_saving ? "Saving..." : "Save Grades"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

