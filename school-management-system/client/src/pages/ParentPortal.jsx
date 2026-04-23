import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Bell,
  BookOpen,
  Briefcase,
  Bus,
  CalendarClock,
  CalendarDays,
  CreditCard,
  MessageSquare,
  RefreshCcw,
  ScrollText,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  getParentAnnouncements,
  getParentDashboard,
  getParentExams,
  getParentHomework,
  getParentPortalDashboard,
  getParentGrades,
  setParentStudentLinkPrimary,
  deleteParentStudentLink,
} from '../services/api';

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return '-';
  }

  return parsedDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const getStatusTone = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'approved' || normalized === 'paid' || normalized === 'submitted') {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (normalized === 'rejected' || normalized === 'overdue' || normalized === 'urgent') {
    return 'bg-rose-100 text-rose-700';
  }
  if (normalized === 'pending' || normalized === 'unread') {
    return 'bg-amber-100 text-amber-700';
  }
  return 'bg-slate-200 text-slate-700';
};

const SectionCard = ({ title, subtitle, action, children, className = '' }) => (
  <section className={`rounded-[2rem] border border-slate-200 bg-white shadow-sm ${className}`}>
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
    <div className="px-6 py-5">{children}</div>
  </section>
);

const StatCard = ({ icon: Icon, label, value, accent, helper }) => (
  <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
        <p className={`mt-3 text-3xl font-semibold ${accent}`}>{value}</p>
        {helper ? <p className="mt-2 text-sm text-slate-500">{helper}</p> : null}
      </div>
      <div className="rounded-2xl bg-[#002366]/8 p-3 text-[#002366]">
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </div>
);

const QuickAction = ({ to, icon: Icon, title, description }) => (
  <Link
    to={to}
    className="group rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 transition hover:-translate-y-0.5 hover:border-[#002366]/25 hover:bg-white"
  >
    <div className="flex items-start gap-3">
      <div className="rounded-2xl bg-[#002366] p-2.5 text-white">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  </Link>
);

const EmptyState = ({ text }) => (
  <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
    {text}
  </div>
);

export default function ParentPortal() {
  const [portalSnapshot, setPortalSnapshot] = useState(null);
  const [dashboardSnapshot, setDashboardSnapshot] = useState(null);
  const [gradeSnapshot, setGradeSnapshot] = useState(null);
  const [homeworkSnapshot, setHomeworkSnapshot] = useState(null);
  const [examSnapshot, setExamSnapshot] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const loadPortal = async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [
        portalResponse,
        dashboardResponse,
        gradesResponse,
        homeworkResponse,
        examsResponse,
        announcementsResponse,
      ] = await Promise.all([
        getParentPortalDashboard(selectedStudentId ? { studentId: selectedStudentId } : undefined),
        getParentDashboard(selectedStudentId ? { studentId: selectedStudentId } : undefined).catch(() => null),
        getParentGrades(selectedStudentId ? { studentId: selectedStudentId } : undefined).catch(() => null),
        getParentHomework(selectedStudentId ? { studentId: selectedStudentId } : undefined).catch(() => null),
        getParentExams(selectedStudentId ? { studentId: selectedStudentId } : undefined).catch(() => null),
        getParentAnnouncements({ isActive: true }).catch(() => null),
      ]);

      setPortalSnapshot(portalResponse.data?.data || portalResponse.data?.snapshot || null);
      setDashboardSnapshot(dashboardResponse?.data || null);
      setGradeSnapshot(gradesResponse?.data || null);
      setHomeworkSnapshot(homeworkResponse?.data || null);
      setExamSnapshot(examsResponse?.data || null);
      setAnnouncements(
        announcementsResponse?.data?.announcements ||
        announcementsResponse?.data?.notices ||
        []
      );
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load parent portal');
      setPortalSnapshot(null);
      setDashboardSnapshot(null);
      setGradeSnapshot(null);
      setHomeworkSnapshot(null);
      setExamSnapshot(null);
      setAnnouncements([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPortal();
  }, [selectedStudentId]);

  const student = portalSnapshot?.student;
  const linkedStudents = Array.isArray(portalSnapshot?.linkedStudents) ? portalSnapshot.linkedStudents : [];
  const attendanceStats = portalSnapshot?.attendance?.stats || {};
  const attendanceRecords = Array.isArray(portalSnapshot?.attendance?.records)
    ? portalSnapshot.attendance.records.slice(0, 6)
    : [];
  const fees = Array.isArray(portalSnapshot?.fees) ? portalSnapshot.fees : [];
  const leaves = Array.isArray(portalSnapshot?.leaves) ? portalSnapshot.leaves : [];
  const notifications = Array.isArray(portalSnapshot?.notifications) ? portalSnapshot.notifications : [];
  const meetings = Array.isArray(portalSnapshot?.meetings) ? portalSnapshot.meetings : [];
  const timetable = Array.isArray(portalSnapshot?.timetable) ? portalSnapshot.timetable.slice(0, 6) : [];
  const grades = Array.isArray(gradeSnapshot?.grades) ? gradeSnapshot.grades.slice(0, 5) : [];
  const homework = Array.isArray(homeworkSnapshot?.homework) ? homeworkSnapshot.homework.slice(0, 5) : [];
  const exams = Array.isArray(examSnapshot?.upcomingExams) ? examSnapshot.upcomingExams.slice(0, 5) : [];

  const feeSummary = useMemo(() => {
    return fees.reduce((summary, fee) => {
      summary.total += Number(fee.amount || fee.totalAmount || 0);
      summary.pending += Number(fee.pendingAmount || 0);
      return summary;
    }, { total: 0, pending: 0 });
  }, [fees]);

  const unreadAlerts = notifications.filter((entry) => !entry.isRead).length;
  const pendingLeaves = leaves.filter((entry) => String(entry.status || '').toLowerCase() === 'pending').length;
  const pendingMeetings = meetings.filter((entry) => String(entry.status || '').toLowerCase() === 'pending').length;

  const handleSetPrimaryStudent = async (linkId, studentId) => {
    try {
      await setParentStudentLinkPrimary(linkId);
      setSelectedStudentId(String(studentId));
      toast.success('Primary child updated successfully.');
      await loadPortal({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update the primary child.');
    }
  };

  const handleRemoveChildLink = async (linkId) => {
    try {
      await deleteParentStudentLink(linkId);
      toast.success('Child link removed successfully.');
      setSelectedStudentId('');
      await loadPortal({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove the child link.');
    }
  };

  if (loading) {
    return <div className="px-6 py-8 text-slate-500">Loading parent portal...</div>;
  }

  return (
    <section className="space-y-6 px-4 py-6 md:px-8">
      <header className="overflow-hidden rounded-[2.2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,#264c95_0%,#143676_38%,#0c2557_100%)] px-6 py-6 text-white shadow-lg">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">Parent Portal</p>
            <h1 className="mt-2 text-3xl font-semibold">Family command center</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/80">
              Stay aligned on attendance, academics, fees, meetings, and school communication from one shared parent workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadPortal({ silent: true })}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/15"
          >
            <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {!student ? (
        <SectionCard
          title="No linked student found"
          subtitle="This parent account needs a student mapping before the dashboard can show attendance, fees, and class data."
        >
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[1.5rem] bg-slate-50 p-5">
              <p className="text-sm text-slate-600">
                Link this parent account to a student from the admin side using the parent-student link flow. Once linked,
                this portal will automatically surface the child profile, fees, timetable, meetings, notices, and academic updates.
              </p>
            </div>
            <div className="grid gap-3">
              <QuickAction to="/communications" icon={MessageSquare} title="Open Communications" description="Reach the school even before mapping is completed." />
              <QuickAction to="/notifications" icon={Bell} title="View Notifications" description="See school-wide updates already sent to this account." />
            </div>
          </div>
        </SectionCard>
      ) : (
        <>
          <SectionCard
            title="Children linked to this parent"
            subtitle="Switch the active child view or choose which student should be the default dashboard selection."
            action={(
              <span className="rounded-full bg-[#002366]/8 px-3 py-1 text-xs font-semibold text-[#002366]">
                {linkedStudents.length} linked
              </span>
            )}
          >
            {linkedStudents.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {linkedStudents.map((entry) => {
                  const isSelected = String(portalSnapshot?.studentId || student?.studentId || '') === String(entry.studentId || '');
                  return (
                    <div
                      key={entry.parentStudentLinkId || entry.studentId}
                      className={`rounded-[1.5rem] border px-4 py-4 ${isSelected ? 'border-[#002366]/25 bg-[#002366]/5' : 'border-slate-200 bg-slate-50'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{entry.studentFullName || 'Student'}</p>
                            {entry.isPrimary ? (
                              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Primary</span>
                            ) : null}
                            {isSelected ? (
                              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700">Open</span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {entry.className || '-'}{entry.sectionName ? ` • Section ${entry.sectionName}` : ''}{entry.rollNumber ? ` • Roll ${entry.rollNumber}` : ''}
                          </p>
                          {entry.relation ? <p className="mt-2 text-xs text-slate-500">Relation: {entry.relation}</p> : null}
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          {!isSelected ? (
                            <button
                              type="button"
                              onClick={() => setSelectedStudentId(String(entry.studentId))}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#002366] transition hover:border-[#002366]/25 hover:bg-[#002366]/5"
                            >
                              View child
                            </button>
                          ) : null}
                          {!entry.isPrimary ? (
                            <button
                              type="button"
                              onClick={() => handleSetPrimaryStudent(entry.parentStudentLinkId, entry.studentId)}
                              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                            >
                              Make primary
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Default child
                            </span>
                          )}
                          {linkedStudents.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveChildLink(entry.parentStudentLinkId)}
                              className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState text="No linked children found." />
            )}
          </SectionCard>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Users} label="Student" value={student.fullName || '-'} accent="text-[#002366]" helper={`${student.className || '-'}${student.sectionName ? ` • Section ${student.sectionName}` : ''}`} />
            <StatCard icon={CalendarDays} label="Attendance" value={`${attendanceStats.percentage || dashboardSnapshot?.stats?.attendancePercentage || 0}%`} accent="text-emerald-600" helper={`${attendanceStats.present || dashboardSnapshot?.stats?.recentAttendance || 0} present days recorded`} />
            <StatCard icon={CreditCard} label="Pending Fees" value={formatCurrency(feeSummary.pending)} accent="text-amber-600" helper={`${fees.length} fee records tracked`} />
            <StatCard icon={Bell} label="Unread Alerts" value={unreadAlerts} accent="text-rose-600" helper={`${pendingMeetings} meeting request(s) in workflow`} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <SectionCard
              title="Student overview"
              subtitle="Core child profile, guardian context, and parent-facing operational status"
              action={
                <span className="rounded-full bg-[#002366]/8 px-3 py-1 text-xs font-semibold text-[#002366]">
                  Roll No. {student.rollNumber || '-'}
                </span>
              }
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.5rem] bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Contact</p>
                  <p className="mt-2 text-sm text-slate-700">{student.email || 'No email available'}</p>
                  <p className="mt-1 text-sm text-slate-700">{student.phone || 'No phone available'}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Guardian</p>
                  <p className="mt-2 text-sm text-slate-700">{student.parentName || student.guardianName || 'Not recorded'}</p>
                  <p className="mt-1 text-sm text-slate-700">{student.parentPhone || student.guardianPhone || 'No guardian phone available'}</p>
                </div>
                <div className="rounded-[1.5rem] bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">School status</p>
                  <p className="mt-2 text-sm text-slate-700">Pending leave requests: {pendingLeaves}</p>
                  <p className="mt-1 text-sm text-slate-700">Upcoming exams: {exams.length || dashboardSnapshot?.stats?.upcomingExams || 0}</p>
                  <p className="mt-1 text-sm text-slate-700">Pending homework: {homeworkSnapshot?.pending || dashboardSnapshot?.stats?.pendingHomework || 0}</p>
                  <p className="mt-1 text-sm text-slate-700">Average marks: {gradeSnapshot?.average || dashboardSnapshot?.stats?.avgMarks || 0}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Quick actions" subtitle="Jump into the most-used parent tasks">
              <div className="grid gap-3 md:grid-cols-2">
                <QuickAction to="/communications" icon={MessageSquare} title="Messages" description="Talk to teachers, admin, or finance staff." />
                <QuickAction to="/meetings" icon={CalendarClock} title="Meetings" description="Request and track PTM appointments." />
                <QuickAction to="/notifications" icon={Bell} title="Notifications" description="Review school alerts and announcements." />
                <QuickAction to="/bus-tracking" icon={Bus} title="Bus Tracking" description="Open the live transport dashboard." />
                <QuickAction to="/timetable" icon={BookOpen} title="Timetable" description="Check the latest class schedule." />
                <QuickAction to="/notifications" icon={ScrollText} title="Notice Feed" description="Read the most recent school notices." />
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <SectionCard title="Attendance snapshot" subtitle="Recent marked attendance records">
              {attendanceRecords.length ? (
                <div className="space-y-3">
                  {attendanceRecords.map((record, index) => (
                    <div key={`${record.date || 'attendance'}-${index}`} className="flex items-center justify-between rounded-[1.25rem] bg-slate-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{formatDate(record.date)}</p>
                        <p className="text-xs text-slate-500">{record.remarks || 'Attendance recorded by school'}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusTone(record.status)}`}>
                        {record.status || 'Recorded'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="No attendance records available yet." />
              )}
            </SectionCard>

            <SectionCard title="Academic pulse" subtitle="Recent grades and performance trend">
              {grades.length ? (
                <div className="space-y-3">
                  {grades.map((grade, index) => (
                    <div key={`${grade._id || grade.examId?.name || 'grade'}-${index}`} className="rounded-[1.25rem] bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{grade.subjectId?.name || 'Subject'}</p>
                          <p className="text-xs text-slate-500">{grade.examId?.name || 'Assessment'} • {formatDate(grade.examId?.examDate || grade.publishedAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">{grade.marksObtained || 0}/{grade.totalMarks || 0}</p>
                          <p className="text-xs text-slate-500">{grade.grade || `${grade.percentage || 0}%`}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="No grade records are available yet." />
              )}
            </SectionCard>

            <SectionCard title="Fee tracker" subtitle="Latest payment status for this student">
              {fees.length ? (
                <div className="space-y-3">
                  {fees.slice(0, 5).map((fee, index) => (
                    <div key={`${fee.id || fee.feeId || 'fee'}-${index}`} className="rounded-[1.25rem] bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{fee.feeType || fee.structureName || 'Fee record'}</p>
                          <p className="text-xs text-slate-500">Due: {formatDate(fee.dueDate)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">{formatCurrency(fee.pendingAmount || fee.amount || 0)}</p>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusTone(fee.status || (fee.pendingAmount > 0 ? 'pending' : 'paid'))}`}>
                            {fee.status || (Number(fee.pendingAmount || 0) > 0 ? 'Pending' : 'Paid')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="No fee records available." />
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <SectionCard title="Homework watchlist" subtitle="Track pending and upcoming homework">
              {homework.length ? (
                <div className="space-y-3">
                  {homework.map((item, index) => (
                    <div key={`${item._id || item.title || 'homework'}-${index}`} className="rounded-[1.25rem] bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{item.title || item.topic || 'Homework'}</p>
                          <p className="text-xs text-slate-500">{item.subject?.name || item.subjectName || 'Subject'} • Due {formatDate(item.dueDate)}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusTone(item.isSubmitted ? 'submitted' : item.isOverdue ? 'overdue' : 'pending')}`}>
                          {item.isSubmitted ? 'Submitted' : item.isOverdue ? 'Overdue' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="No homework items are currently assigned." />
              )}
            </SectionCard>

            <SectionCard title="Upcoming exams" subtitle="Stay ready for the next assessments">
              {exams.length ? (
                <div className="space-y-3">
                  {exams.map((exam, index) => (
                    <div key={`${exam._id || exam.name || 'exam'}-${index}`} className="rounded-[1.25rem] bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{exam.name || exam.examName || 'Exam'}</p>
                          <p className="text-xs text-slate-500">{exam.subjectId?.name || exam.subjectName || 'Subject'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">{formatDate(exam.examDate)}</p>
                          <p className="text-xs text-slate-500">{exam.totalMarks || 0} marks</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="No upcoming exams are published right now." />
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <SectionCard title="Leave and meeting workflow" subtitle="Parent-facing requests and approvals">
              <div className="space-y-5">
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-[#002366]" />
                    <p className="text-sm font-semibold text-slate-900">Leave requests</p>
                  </div>
                  {leaves.length ? (
                    <div className="space-y-3">
                      {leaves.slice(0, 4).map((leave) => (
                        <div key={leave.leaveRequestId} className="rounded-[1.25rem] bg-slate-50 px-4 py-3">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{leave.leaveType || 'Leave request'}</p>
                              <p className="text-xs text-slate-500">{formatDate(leave.fromDate)} to {formatDate(leave.toDate)}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getStatusTone(leave.status)}`}>
                              {leave.status || 'pending'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState text="No leave requests found." />
                  )}
                </div>

                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-[#002366]" />
                    <p className="text-sm font-semibold text-slate-900">Meetings</p>
                  </div>
                  {meetings.length ? (
                    <div className="space-y-3">
                      {meetings.slice(0, 4).map((meeting) => (
                        <div key={meeting.meetingId} className="rounded-[1.25rem] bg-slate-50 px-4 py-3">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{meeting.title || 'Meeting request'}</p>
                              <p className="text-xs text-slate-500">{meeting.teacherFullName || 'School staff'} • {formatDate(meeting.meetingDate || meeting.requestedDate)}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getStatusTone(meeting.status)}`}>
                              {meeting.status || 'pending'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState text="No meetings in the workflow yet." />
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Schedule and notices" subtitle="Class plan plus the latest school-wide updates">
              <div className="space-y-5">
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-[#002366]" />
                    <p className="text-sm font-semibold text-slate-900">Upcoming timetable</p>
                  </div>
                  {timetable.length ? (
                    <div className="space-y-3">
                      {timetable.map((slot, index) => (
                        <div key={`${slot.id || slot.day || 'slot'}-${index}`} className="rounded-[1.25rem] bg-slate-50 px-4 py-3">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{slot.subjectName || slot.subject || 'Subject'}</p>
                              <p className="text-xs text-slate-500">{slot.day || '-'} • {slot.teacherName || 'Teacher TBD'}</p>
                            </div>
                            <span className="text-xs font-medium text-slate-600">{slot.startTime || '-'} - {slot.endTime || '-'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState text="No timetable rows found yet." />
                  )}
                </div>

                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-[#002366]" />
                    <p className="text-sm font-semibold text-slate-900">Latest announcements</p>
                  </div>
                  {announcements.length ? (
                    <div className="space-y-3">
                      {announcements.slice(0, 4).map((notice, index) => (
                        <div key={`${notice._id || notice.title || 'notice'}-${index}`} className="rounded-[1.25rem] bg-slate-50 px-4 py-3">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-semibold text-slate-900">{notice.title || 'School notice'}</p>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusTone(notice.priority || notice.category || 'unread')}`}>
                              {notice.priority || notice.category || 'Notice'}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">{notice.content || notice.message || 'No description provided.'}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState text="No announcements available right now." />
                  )}
                </div>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Notification inbox" subtitle="Recent alerts delivered to this parent account">
            {notifications.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {notifications.map((notification) => (
                  <div key={notification.notificationId} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
                      {!notification.isRead ? (
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700">New</span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{notification.message}</p>
                    <p className="mt-3 text-xs text-slate-400">{formatDate(notification.createdAt)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="No notifications available." />
            )}
          </SectionCard>
        </>
      )}
    </section>
  );
}
