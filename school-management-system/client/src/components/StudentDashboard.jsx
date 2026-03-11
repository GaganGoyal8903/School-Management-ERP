import { useState, useEffect, useMemo } from "react";
import { BookOpen, FileText, Calendar, CheckCircle, Clock, AlertCircle, Download, ExternalLink, User, Award } from "lucide-react";
import "./StudentDashboard.css";
import LiveNotices from "./LiveNotices";

const MAYO_LOGO = "https://upload.wikimedia.org/wikipedia/en/b/b5/Mayo_College_logo.png";

const mockGrades = [
  { _id: "1", subject: "Mathematics", examType: "Midterm", marks: 85, grade: "A", remarks: "Excellent work" },
  { _id: "2", subject: "Science", examType: "Midterm", marks: 78, grade: "B", remarks: "Good understanding" },
  { _id: "3", subject: "English", examType: "Midterm", marks: 92, grade: "A", remarks: "Outstanding" },
  { _id: "4", subject: "History", examType: "Midterm", marks: 72, grade: "B", remarks: "Well done" },
];

const mockHomework = [
  { _id: "HW-1", subject: "Mathematics", title: "Algebra Problems", description: "Complete exercises 1-15", dueDate: "2024-02-10", status: "Pending" },
  { _id: "HW-2", subject: "Science", title: "Lab Report", description: "Write up the titration experiment", dueDate: "2024-02-08", status: "Overdue" },
  { _id: "HW-3", subject: "English", title: "Essay Writing", description: "500 word essay on technology", dueDate: "2024-02-15", status: "Pending" },
];

const mockMaterials = [
  { _id: "M-1", type: "PDF", title: "Math Chapter 5", subject: "Mathematics", description: "Algebraic expressions notes" },
  { _id: "M-2", type: "Link", title: "Science Videos", subject: "Science", description: "Video lectures" },
  { _id: "M-3", type: "PDF", title: "History Timeline", subject: "History", description: "World War II events" },
];

function ProgressRing({ value }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (value / 100) * circumference;

  return (
    <div className="attendance-ring-wrap">
      <svg viewBox="0 0 140 140" className="attendance-ring">
        <circle className="track" cx="70" cy="70" r={radius} />
        <circle className="fill" cx="70" cy="70" r={radius} strokeDasharray={circumference} strokeDashoffset={dashOffset} />
      </svg>
      <div className="attendance-center">
        <strong>{value}%</strong>
        <span>Attendance</span>
      </div>
    </div>
  );
}

export default function StudentDashboard() {
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    setTimeout(() => {
      setStudent({ fullName: "Aarav Sharma", grade: "Class 10", section: "A" });
      setLoading(false);
    }, 500);
  }, []);

  const gradeStats = useMemo(() => {
    if (!mockGrades.length) return { average: 0 };
    const total = mockGrades.reduce((sum, g) => sum + g.marks, 0);
    return { average: Math.round(total / mockGrades.length) };
  }, []);

  const pendingHomework = mockHomework.filter(hw => hw.status === "Pending");
  const overdueHomework = mockHomework.filter(hw => hw.status === "Overdue");

  const getGradeColor = (grade) => {
    if (grade === "A") return "text-green-600";
    if (grade === "B") return "text-blue-600";
    return "text-amber-600";
  };

  const isDueSoon = (date) => {
    const due = new Date(date);
    const now = new Date();
    const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 2;
  };

  if (loading) {
    return (
      <section className="student-dashboard">
        <header className="student-header">
          <img src={MAYO_LOGO} alt="Mayo" className="h-11 w-11 rounded-full border-2 border-[#c5a059]" />
          <div>
            <h1>Student Dashboard</h1>
            <p>Loading...</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="student-dashboard">
      <header className="student-header">
        <img src={MAYO_LOGO} alt="Mayo" className="h-11 w-11 rounded-full border-2 border-[#c5a059]" />
        <div>
          <h1>Student Dashboard</h1>
          <p>Welcome back, {student?.fullName} | {student?.grade} - Section {student?.section}</p>
        </div>
      </header>

      <div className="mb-4 flex gap-2 border-b border-[#d8c08a] pb-2">
        {["overview", "grades", "homework", "materials"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t-lg text-sm font-semibold ${activeTab === tab ? "bg-[#002366] text-white" : "text-[#002366] hover:bg-[#fffff0]"}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="student-grid">
          <article className="student-card">
            <h2>Attendance</h2>
            <ProgressRing value={92} />
            <div className="attendance-stats">
              <div className="stat"><CheckCircle className="text-green-600" size={16} /><span>85 Present</span></div>
              <div className="stat"><AlertCircle className="text-red-600" size={16} /><span>5 Absent</span></div>
              <div className="stat"><Clock className="text-amber-600" size={16} /><span>2 Late</span></div>
            </div>
          </article>

          <article className="student-card">
            <h2>Academic Overview</h2>
            <div className="overview-stats">
              <div className="stat-card">
                <Award className="text-[#002366]" size={24} />
                <div>
                  <p className="text-2xl font-bold text-[#002366]">{gradeStats.average}%</p>
                  <p className="text-xs text-slate-500">Average Marks</p>
                </div>
              </div>
              <div className="stat-card">
                <BookOpen className="text-green-600" size={24} />
                <div><p className="text-2xl font-bold text-green-600">{pendingHomework.length}</p><p className="text-xs text-slate-500">Pending HW</p></div>
              </div>
              <div className="stat-card">
                <FileText className="text-blue-600" size={24} />
                <div><p className="text-2xl font-bold text-blue-600">{mockMaterials.length}</p><p className="text-xs text-slate-500">Materials</p></div>
              </div>
            </div>
          </article>

          <article className="student-card" style={{ gridColumn: "1 / -1" }}>
            <LiveNotices maxNotices={5} />
          </article>
        </div>
      )}

      {activeTab === "grades" && (
        <div className="student-grid lower">
          <article className="student-card" style={{ gridColumn: "1 / -1" }}>
            <h2>My Grades</h2>
            <table>
              <thead><tr><th>Subject</th><th>Exam</th><th>Marks</th><th>Grade</th><th>Remarks</th></tr></thead>
              <tbody>
                {mockGrades.map(g => (
                  <tr key={g._id}>
                    <td>{g.subject}</td><td>{g.examType}</td><td>{g.marks}</td>
                    <td className={getGradeColor(g.grade)}>{g.grade}</td>
                    <td className="text-slate-500">{g.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </div>
      )}

      {activeTab === "homework" && (
        <div className="student-grid lower">
          <article className="student-card" style={{ gridColumn: "1 / -1" }}>
            <h2>Homework</h2>
            <div className="homework-feed">
              {mockHomework.map(hw => (
                <div key={hw._id} className={`homework-item ${hw.status.toLowerCase()}`}>
                  <span className="subject-badge">{hw.subject}</span>
                  <h4>{hw.title}</h4>
                  <p>{hw.description}</p>
                  <span className={isDueSoon(hw.dueDate) ? "text-amber-600" : ""}>
                    Due: {new Date(hw.dueDate).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}

      {activeTab === "materials" && (
        <div className="student-grid lower">
          <article className="student-card" style={{ gridColumn: "1 / -1" }}>
            <h2>Study Materials</h2>
            <div className="materials-grid">
              {mockMaterials.map(m => (
                <div key={m._id} className="material-card">
                  <div className="material-icon">
                    {m.type === "PDF" && <FileText className="text-red-500" size={24} />}
                    {m.type === "Link" && <ExternalLink className="text-blue-500" size={24} />}
                  </div>
                  <div className="material-content">
                    <span className="type-badge">{m.type}</span>
                    <h4>{m.title}</h4>
                    <p className="text-sm text-slate-600">{m.subject}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

