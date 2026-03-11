import CrestLogo from "./CrestLogo";
import LiveNotices from "./LiveNotices";

const classSchedule = [
  { period: "I", startTime: "08:30", endTime: "09:15", className: "Class 10-A", subject: "Mathematics", room: "201" },
  { period: "II", startTime: "09:20", endTime: "10:05", className: "Class 9-B", subject: "Science", room: "Lab 2" },
  { period: "III", startTime: "10:40", endTime: "11:25", className: "Class 8-C", subject: "Mathematics", room: "104" },
  { period: "IV", startTime: "12:00", endTime: "12:45", className: "Class 10-A", subject: "Mentoring", room: "201" },
];

const facultyAnnouncements = [
  { id: "ANN-1", title: "Staff Meeting", note: "Faculty briefing at 3:30 PM in Conference Hall." },
  { id: "ANN-2", title: "Exam Moderation", note: "Submit moderated papers by Friday, 5 PM." },
  { id: "ANN-3", title: "Invigilation Roster", note: "Updated roster published on staff notice board." },
];

export default function TeacherDashboard() {
  return (
    <section className="min-h-screen bg-transparent p-4 md:p-6">
      <header className="page-card mb-5 p-4">
        <div className="flex items-center gap-3">
          <CrestLogo sizeClass="h-12 w-12" className="border-2 border-[#c5a059] bg-[#fffbf2]" imgClassName="h-full w-full rounded-full object-contain p-0.5" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Teacher Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-600">Faculty ledger for classes, timetable, and announcements.</p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-3">
        <article className="page-card xl:col-span-2 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Class Schedule
            </h2>
            <span className="rounded-full border border-[#c5a059] bg-[#fff7e6] px-2.5 py-1 text-xs font-semibold text-[#8a6d3b]">
              Formal Timetable
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#d8c08a]">
            <table className="min-w-full border-collapse">
              <thead className="bg-[#002366] text-[#fffbf2]">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Period</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Start</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">End</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Class</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Subject</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Room</th>
                </tr>
              </thead>
              <tbody>
                {classSchedule.map((item, index) => (
                  <tr key={`${item.period}-${item.startTime}`} className={index % 2 === 0 ? "bg-[#fffcf4]" : "bg-[#fff8e8]"}>
                    <td className="border-t border-[#e6d3aa] px-3 py-2 text-sm font-semibold text-[#002366]">{item.period}</td>
                    <td className="border-t border-[#e6d3aa] px-3 py-2 text-sm text-slate-700">{item.startTime}</td>
                    <td className="border-t border-[#e6d3aa] px-3 py-2 text-sm text-slate-700">{item.endTime}</td>
                    <td className="border-t border-[#e6d3aa] px-3 py-2 text-sm text-slate-700">{item.className}</td>
                    <td className="border-t border-[#e6d3aa] px-3 py-2 text-sm text-slate-700">{item.subject}</td>
                    <td className="border-t border-[#e6d3aa] px-3 py-2 text-sm text-slate-700">{item.room}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <div className="space-y-4">
          <article className="rounded-xl border border-[#b99b5f] bg-[#efe2c2] p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-[#6b4f1d]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Faculty Announcements
            </h2>
            <ul className="space-y-2">
              {facultyAnnouncements.map((item) => (
                <li key={item.id} className="rounded-lg border border-[#d0b374] bg-[#f8eed8] px-3 py-2.5">
                  <p className="text-sm font-semibold text-[#6b4f1d]">{item.title}</p>
                  <p className="mt-1 text-xs text-[#7a6540]">{item.note}</p>
                </li>
              ))}
            </ul>
          </article>

          <LiveNotices maxNotices={3} />
        </div>
      </div>
    </section>
  );
}

