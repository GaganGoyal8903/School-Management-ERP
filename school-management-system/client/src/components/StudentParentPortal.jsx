import { Star } from "lucide-react";
import CrestLogo from "./CrestLogo";

const transcript = [
  { subject: "Mathematics", score: 88 },
  { subject: "Science", score: 84 },
  { subject: "English", score: 91 },
  { subject: "History", score: 79 },
  { subject: "Computer Science", score: 94 },
  { subject: "Economics", score: 86 },
];

const achievements = [
  "Inter-House Debate Winner (2026)",
  "District Chess Semi-Finalist",
  "Science Exhibition Merit Certificate",
];

function AttendanceRing({ value }) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative mx-auto h-48 w-48" aria-label={`Attendance ${value}%`}>
      <svg viewBox="0 0 150 150" className="h-48 w-48 -rotate-90">
        <circle cx="75" cy="75" r={radius} stroke="#d9d9cf" strokeWidth="12" fill="none" />
        <circle
          cx="75"
          cy="75"
          r={radius}
          stroke="#C5A059"
          strokeWidth="12"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 m-auto flex h-32 w-32 flex-col items-center justify-center rounded-full border-4 border-[#002366] bg-[#fffff0]">
        <p className="text-3xl font-bold text-[#002366]">{value}%</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#8a6d3b]">Attendance</p>
      </div>
    </div>
  );
}

export default function StudentParentPortal() {
  const attendance = 89;

  return (
    <section className="min-h-screen bg-[#f7f7f2] p-4 md:p-6">
      <header className="mb-5 rounded-xl border border-[#c5a059] bg-[#fffff0] p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <CrestLogo sizeClass="h-12 w-12" className="border-2 border-[#c5a059] bg-[#fffbf2]" imgClassName="h-full w-full rounded-full object-contain p-0.5" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Student Portal
            </h1>
            <p className="mt-1 text-sm text-slate-600">Performance transcript and co-curricular milestones.</p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border border-[#c5a059] bg-[#fffff0] p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Attendance Progress
          </h2>
          <AttendanceRing value={attendance} />
        </article>

        <article className="rounded-xl border border-[#c5a059] bg-[#fffff0] p-4 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Grade Transcript
            </h2>
            <span className="rounded-full border border-[#c5a059] bg-[#fff7e6] px-2.5 py-1 text-xs font-semibold text-[#8a6d3b]">
              Subject Cards
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {transcript.map((item) => (
              <div key={item.subject} className="rounded-lg border border-[#d8c08a] bg-[#fffcf4] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                    {item.subject}
                  </h3>
                  <span className="text-xs font-semibold text-slate-600">{item.score}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-[#002366]" style={{ width: `${item.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="mt-4 rounded-xl border border-[#c5a059] bg-[#fffff0] p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
          Extra-Curricular Achievements
        </h2>
        <ul className="space-y-2">
          {achievements.map((item) => (
            <li key={item} className="flex items-center gap-2 rounded-lg border border-[#d8c08a] bg-[#fffcf4] px-3 py-2">
              <Star size={16} fill="#c5a059" color="#c5a059" />
              <span className="text-sm text-slate-700">{item}</span>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

