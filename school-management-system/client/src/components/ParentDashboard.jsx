import { useMemo, useState } from "react";
import "./ParentDashboard.css";
import CrestLogo from "./CrestLogo";

const childrenData = [
  {
    id: "CH-101",
    name: "Aarav Sharma",
    grade: "Class 8-C",
    attendance: 92,
    examResults: [
      { id: "ER-1", subject: "Mathematics", marks: 88, grade: "A-" },
      { id: "ER-2", subject: "Science", marks: 91, grade: "A" },
      { id: "ER-3", subject: "English", marks: 84, grade: "B+" },
    ],
    fee: { status: "Paid", dueDate: "2026-03-20", amount: 45000 },
  },
  {
    id: "CH-102",
    name: "Diya Sharma",
    grade: "Class 5-A",
    attendance: 86,
    examResults: [
      { id: "ER-4", subject: "Mathematics", marks: 79, grade: "B" },
      { id: "ER-5", subject: "Science", marks: 82, grade: "B+" },
      { id: "ER-6", subject: "English", marks: 90, grade: "A-" },
    ],
    fee: { status: "Pending", dueDate: "2026-03-20", amount: 38000 },
  },
];

function AttendanceBar({ value }) {
  return (
    <div className="attendance-summary">
      <div className="attendance-row">
        <strong>{value}%</strong>
        <span>Present</span>
      </div>
      <div className="attendance-track" aria-label={`Attendance ${value}%`}>
        <div className="attendance-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ParentDashboard({ onPayNow }) {
  const [selectedChildId, setSelectedChildId] = useState(childrenData[0].id);

  const selectedChild = useMemo(() => {
    return childrenData.find((child) => child.id === selectedChildId) || childrenData[0];
  }, [selectedChildId]);

  const isPending = selectedChild.fee.status === "Pending";

  return (
    <section className="parent-dashboard">
      <header className="parent-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <CrestLogo sizeClass="h-11 w-11" className="border-2 border-[#c5a059] bg-[#fffbf2]" imgClassName="h-full w-full rounded-full object-contain p-0.5" />
          <div>
            <h1>Parent Dashboard</h1>
            <p>Track attendance, exam performance, and fee payment status.</p>
          </div>
        </div>
      </header>

      <article className="parent-card">
        <div className="child-switcher">
          <div>
            <h2>Child Overview</h2>
            <p>{selectedChild.grade}</p>
          </div>
          <select
            value={selectedChildId}
            onChange={(event) => setSelectedChildId(event.target.value)}
            aria-label="Select child"
          >
            {childrenData.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </select>
        </div>
      </article>

      <div className="parent-grid">
        <article className="parent-card">
          <h3>Attendance Summary</h3>
          <AttendanceBar value={selectedChild.attendance} />
        </article>

        <article className={`parent-card fee-card ${isPending ? "pending" : "paid"}`}>
          <h3>Fee Status</h3>
          <p className="fee-status">
            <span>{selectedChild.fee.status}</span>
          </p>
          <p>
            Amount: <strong>{formatCurrency(selectedChild.fee.amount)}</strong>
          </p>
          <p>
            Due Date: <strong>{selectedChild.fee.dueDate}</strong>
          </p>
          <button
            type="button"
            className="pay-btn"
            onClick={onPayNow}
            disabled={!isPending}
          >
            Pay Now
          </button>
        </article>
      </div>

      <article className="parent-card">
        <h3>Exam Results</h3>
        <div className="results-wrap">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Marks</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {selectedChild.examResults.map((result) => (
                <tr key={result.id}>
                  <td>{result.subject}</td>
                  <td>{result.marks}</td>
                  <td>{result.grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

