import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BadgeIndianRupee,
  BookOpen,
  Bus,
  CalendarDays,
  Clock3,
  GraduationCap,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import toast from "react-hot-toast";
import LoadingSpinner from "../components/LoadingSpinner";
import EmptyState from "../components/EmptyState";
import LiveNotices from "../components/LiveNotices";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import {
  getMyStudentDetails,
  payStudentFee,
  startOnlineExamSession,
  submitOnlineExamSession,
} from "../services/api";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const STUDENT_PAYMENT_PORTAL_ENABLED = String(
  import.meta.env.VITE_ENABLE_STUDENT_PAYMENT_PORTAL || (import.meta.env.PROD ? "false" : "true")
).trim().toLowerCase() === "true";

const formatCurrency = (value = 0) => currencyFormatter.format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }

  return parsedDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getStatusClass = (status = "") => {
  const normalizedStatus = String(status || "").trim().toLowerCase();

  if (["paid", "submitted", "graded", "present", "active"].includes(normalizedStatus)) {
    return "bg-emerald-100 text-emerald-700";
  }

  if (["partial", "late", "pending"].includes(normalizedStatus)) {
    return "bg-amber-100 text-amber-700";
  }

  if (["live", "in progress"].includes(normalizedStatus)) {
    return "bg-blue-100 text-blue-700";
  }

  if (["absent", "overdue", "inactive", "cancelled"].includes(normalizedStatus)) {
    return "bg-red-100 text-red-700";
  }

  return "bg-slate-100 text-slate-700";
};

const tabItems = [
  { key: "overview", label: "Overview", icon: ShieldCheck, helper: "Daily view" },
  { key: "attendance", label: "Attendance", icon: CalendarDays, helper: "Recent records" },
  { key: "academics", label: "Academics", icon: BookOpen, helper: "Subjects and timetable" },
  { key: "exams", label: "Exams", icon: GraduationCap, helper: "Results and schedule" },
  { key: "fees", label: "Fees", icon: BadgeIndianRupee, helper: "Dues and payments" },
];

const panelCardClassName = "rounded-[1.75rem] border border-slate-200/80 bg-white shadow-sm";

const StatCard = ({ icon: Icon, label, value, subText }) => (
  <article className={`${panelCardClassName} relative overflow-hidden p-5`}>
    <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#002366_0%,#0d4ea6_58%,#d9b36a_100%)]" />
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
        {subText ? <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">{subText}</p> : null}
      </div>
      <span className="rounded-2xl border border-[#002366]/10 bg-[#002366]/5 p-3 text-[#002366] shadow-inner shadow-[#002366]/5">
        <Icon className="h-5 w-5" />
      </span>
    </div>
  </article>
);

const PanelCard = ({ icon: Icon, title, eyebrow, action, className = "", children }) => (
  <article className={`${panelCardClassName} overflow-hidden ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        {Icon ? (
          <span className="rounded-2xl border border-[#002366]/10 bg-[#002366]/5 p-2.5 text-[#002366]">
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
        <div>
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
          ) : null}
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
      </div>
      {action}
    </div>
    <div className="p-5 sm:p-6">{children}</div>
  </article>
);

const InfoTile = ({ icon: Icon, label, value, className = "", valueClassName = "" }) => (
  <div className={`rounded-2xl border border-slate-200 bg-slate-50/90 p-4 ${className}`}>
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
    <div className="mt-3 flex items-start gap-3">
      {Icon ? (
        <span className="rounded-xl bg-white p-2 text-[#002366] shadow-sm">
          <Icon className="h-4 w-4" />
        </span>
      ) : null}
      <p className={`min-w-0 break-words text-sm font-semibold text-slate-900 ${valueClassName}`}>{value || "-"}</p>
    </div>
  </div>
);

const EmptySnapshotState = ({ icon: Icon, title, description, actionLabel, onAction }) => (
  <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50/80 p-5">
    <div className="flex flex-wrap items-center gap-4">
      <span className="rounded-2xl bg-white p-3 text-[#002366] shadow-sm">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#002366] transition hover:border-[#002366]/20 hover:bg-[#002366]/5"
        >
          {actionLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  </div>
);

const DetailsTable = ({ headers, rows, emptyText }) => (
  <div className={`overflow-hidden ${panelCardClassName}`}>
    {rows.length === 0 ? (
      <div className="p-5 text-sm text-slate-600">{emptyText}</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/95">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-semibold">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

const defaultPaymentFormState = {
  amount: "",
  mode: "Online",
  notes: "",
};

export default function StudentPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [details, setDetails] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedFee, setSelectedFee] = useState(null);
  const [paymentForm, setPaymentForm] = useState(defaultPaymentFormState);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [showExamModal, setShowExamModal] = useState(false);
  const [examSessionLoading, setExamSessionLoading] = useState(false);
  const [examSubmitting, setExamSubmitting] = useState(false);
  const [examSession, setExamSession] = useState(null);
  const [examAnswers, setExamAnswers] = useState({});

  const loadStudentPortal = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await getMyStudentDetails();
      setDetails(response?.data || null);
    } catch (fetchError) {
      setError(fetchError?.response?.data?.message || "Unable to load the student portal right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudentPortal();
  }, []);

  const student = details?.studentProfile || null;
  const attendance = details?.attendance || {};
  const fees = details?.fees || {};
  const examResults = details?.examResults || {};
  const feeRecords = fees.records || [];
  const paymentHistory = fees.paymentHistory || [];
  const examRecords = examResults.records || [];
  const examSchedule = examResults.schedule || [];
  const academicInfo = details?.academicInfo || {};
  const parentDetails = details?.parentDetails || [];
  const transport = details?.additionalInfo?.transport || {};
  const timetable = details?.timetable || {};
  const portalNotes = details?.additionalInfo?.notes || [];
  const pendingFeeRecords = useMemo(
    () => [...feeRecords]
      .filter((fee) => Number(fee.pendingAmount || 0) > 0)
      .sort((left, right) => new Date(left.dueDate || 0) - new Date(right.dueDate || 0)),
    [feeRecords]
  );
  const recentPayments = useMemo(
    () => [...paymentHistory]
      .sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0)),
    [paymentHistory]
  );
  const nextScheduledExam = useMemo(
    () => examSchedule.find((record) => record.status === "Upcoming") || examSchedule[0] || null,
    [examSchedule]
  );
  const firstPayableFee = useMemo(
    () => pendingFeeRecords.find((fee) => Number(fee.pendingAmount || 0) > 0) || null,
    [pendingFeeRecords]
  );
  const todayPeriods = useMemo(
    () => (Array.isArray(timetable.today?.periods) ? timetable.today.periods : []),
    [timetable.today]
  );
  const publishedTimetableDays = useMemo(
    () => (timetable.records || []).filter((record) => Array.isArray(record.periods) && record.periods.length > 0).length,
    [timetable.records]
  );
  const weeklyTimetablePeriods = useMemo(
    () => (timetable.records || []).reduce((sum, record) => sum + ((record.periods || []).length || 0), 0),
    [timetable.records]
  );
  const feeCompletionPercentage = useMemo(() => {
    const totalFees = Number(fees.summary?.totalFees || 0);
    const paidAmount = Number(fees.summary?.paidAmount || 0);
    if (totalFees <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round((paidAmount / totalFees) * 100)));
  }, [fees.summary]);
  const currentFocusText = firstPayableFee
    ? `${firstPayableFee.feeType || "Fee"} is due on ${formatDate(firstPayableFee.dueDate)}.`
    : nextScheduledExam
      ? `${nextScheduledExam.examName || "Upcoming exam"} is scheduled for ${formatDate(nextScheduledExam.examDate)}.`
      : "You are up to date. New academic or payment updates will appear here.";

  const openPaymentModal = (fee) => {
    if (!fee) {
      return;
    }

    if (!STUDENT_PAYMENT_PORTAL_ENABLED) {
      toast.error("Online student fee payments are not enabled in this deployment.");
      return;
    }

    setSelectedFee(fee);
    setPaymentForm({
      amount: String(Number(fee.pendingAmount || 0)),
      mode: "Online",
      notes: "",
    });
    setShowPaymentModal(true);
  };

  const closePaymentModal = (forceClose = false) => {
    if (paymentSubmitting && !forceClose) {
      return;
    }

    setShowPaymentModal(false);
    setSelectedFee(null);
    setPaymentForm(defaultPaymentFormState);
  };

  const handleStudentPaymentSubmit = async (event) => {
    event.preventDefault();

    if (!selectedFee?.id) {
      toast.error("Please choose a fee item first.");
      return;
    }

    const amount = Number(paymentForm.amount);
    const maxAmount = Number(selectedFee.pendingAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Please enter a valid payment amount.");
      return;
    }

    if (amount > maxAmount) {
      toast.error("Payment amount cannot exceed the pending balance.");
      return;
    }

    try {
      setPaymentSubmitting(true);
      const response = await payStudentFee(selectedFee.id, {
        amount,
        mode: paymentForm.mode || "Online",
        notes: paymentForm.notes || "",
      });

      await loadStudentPortal();
      closePaymentModal(true);

      const paymentMessage = response?.data?.paymentContext?.message
        || "Fee payment recorded successfully.";
      toast.success(paymentMessage);
    } catch (paymentError) {
      toast.error(paymentError?.response?.data?.message || "Unable to record the fee payment right now.");
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const closeExamModal = (forceClose = false) => {
    if ((examSessionLoading || examSubmitting) && !forceClose) {
      return;
    }

    setShowExamModal(false);
    setExamSession(null);
    setExamAnswers({});
  };

  const handleStartExam = async (record) => {
    if (!record?.examId) {
      toast.error("Exam session is unavailable right now.");
      return;
    }

    try {
      setExamSessionLoading(true);
      const response = await startOnlineExamSession(record.examId);
      const sessionData = response?.data || {};
      setExamSession(sessionData);
      setExamAnswers(
        Object.fromEntries(
          (sessionData.questions || []).map((question) => [question.questionId, ""])
        )
      );
      setShowExamModal(true);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to open the online test right now.");
    } finally {
      setExamSessionLoading(false);
    }
  };

  const handleSubmitExam = async (event) => {
    event.preventDefault();

    if (!examSession?.exam?.id) {
      toast.error("Exam session is unavailable right now.");
      return;
    }

    try {
      setExamSubmitting(true);
      const response = await submitOnlineExamSession(examSession.exam.id, {
        answers: (examSession.questions || []).map((question) => ({
          questionId: question.questionId,
          answer: examAnswers[question.questionId] || "",
        })),
      });

      setExamSession(response?.data || null);
      await loadStudentPortal();
      toast.success(response?.data?.message || "Test submitted successfully.");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to submit the test right now.");
    } finally {
      setExamSubmitting(false);
    }
  };

  const summaryCards = useMemo(() => ([
    {
      icon: ShieldCheck,
      label: "Attendance",
      value: `${attendance.summary?.percentage || 0}%`,
      subText: `${attendance.summary?.present || 0} present out of ${attendance.summary?.total || 0} records`,
    },
    {
      icon: GraduationCap,
      label: examRecords.length > 0 ? "Exam Average" : "Exam Schedule",
      value: examRecords.length > 0
        ? `${examResults.summary?.averagePercentage || 0}%`
        : String(examResults.summary?.scheduledCount || examSchedule.length || 0),
      subText: examRecords.length > 0
        ? `${examResults.summary?.totalExams || 0} exam records available`
        : nextScheduledExam
          ? `${nextScheduledExam.examName || "Exam"} on ${formatDate(nextScheduledExam.examDate)}`
          : "No exam schedule published yet",
    },
    {
      icon: BadgeIndianRupee,
      label: "Pending Fees",
      value: formatCurrency(fees.summary?.pendingAmount || 0),
      subText: pendingFeeRecords[0]
        ? `Next due ${formatDate(pendingFeeRecords[0].dueDate)}`
        : `${fees.summary?.overdueCount || 0} overdue fee items`,
    },
    {
      icon: BookOpen,
      label: "Subjects",
      value: String((academicInfo.subjects || []).length),
      subText: `${student?.class || "Class"}${student?.section ? ` - ${student.section}` : ""}`,
    },
  ]), [
    academicInfo.subjects,
    attendance.summary,
    examRecords.length,
    examResults.summary,
    examSchedule,
    fees.summary,
    pendingFeeRecords,
    nextScheduledExam,
    student?.class,
    student?.section,
  ]);

  if (loading) {
    return <LoadingSpinner text="Loading your student portal..." />;
  }

  if (error) {
    return (
      <section className="space-y-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div>
              <p className="font-semibold">Student portal unavailable</p>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!student) {
    return (
      <EmptyState
        title="Student profile not available"
        description="The logged-in account is not linked to a student profile yet."
      />
    );
  }

  const overviewContent = (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.16fr)_minmax(360px,0.84fr)]">
      <section className="space-y-5">
        <PanelCard
          icon={UserRound}
          title="Profile Snapshot"
          eyebrow="Student identity"
          action={(
            <span className="rounded-full border border-[#002366]/10 bg-[#002366]/5 px-3 py-1 text-xs font-semibold text-[#002366]">
              {student.class || "Class"}{student.section ? ` - ${student.section}` : ""}
            </span>
          )}
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_320px]">
            <div className="relative overflow-hidden rounded-[1.8rem] border border-slate-200/80 bg-[linear-gradient(135deg,#eef4ff_0%,#ffffff_48%,#fff1d9_100%)] p-6">
              <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[#d9b36a]/20 blur-3xl" />
              <div className="pointer-events-none absolute -left-12 bottom-0 h-28 w-28 rounded-full bg-[#0d4ea6]/10 blur-3xl" />

              <div className="relative z-10">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#002366]/70">Current student</p>
                    <h3 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{student.fullName}</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      A focused student workspace for attendance, fees, results, and class updates with your day&apos;s priorities at a glance.
                    </p>
                  </div>
                  <span className="rounded-[1.6rem] border border-white/60 bg-white/75 p-4 text-[#002366] shadow-lg shadow-[#002366]/10 backdrop-blur">
                    <ShieldCheck className="h-6 w-6" />
                  </span>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-sm">
                    Admission {student.admissionNumber || "-"}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-sm">
                    Roll {student.rollNumber || "-"}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-sm">
                    {academicInfo.subjects?.length || 0} subjects
                  </span>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1.4rem] border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Attendance</p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{attendance.summary?.percentage || 0}%</p>
                    <p className="mt-1 text-sm text-slate-600">{attendance.summary?.present || 0} present days</p>
                  </div>
                  <div className="rounded-[1.4rem] border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pending Fees</p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{formatCurrency(fees.summary?.pendingAmount || 0)}</p>
                    <p className="mt-1 text-sm text-slate-600">{pendingFeeRecords.length} active due items</p>
                  </div>
                  <div className="rounded-[1.4rem] border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Next Exam</p>
                    <p className="mt-3 text-lg font-semibold tracking-tight text-slate-900">
                      {nextScheduledExam ? (nextScheduledExam.subject || nextScheduledExam.examName || "Scheduled") : "Not published"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {nextScheduledExam ? formatDate(nextScheduledExam.examDate) : "Waiting for schedule"}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <InfoTile
                    label="Date of Birth"
                    value={formatDate(student.dateOfBirth)}
                    className="border-white/70 bg-white/80 shadow-sm backdrop-blur"
                  />
                  <InfoTile
                    label="Blood Group"
                    value={student.bloodGroup || "-"}
                    className="border-white/70 bg-white/80 shadow-sm backdrop-blur"
                  />
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab("fees")}
                    className="inline-flex items-center gap-2 rounded-full bg-[#002366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#001a4d]"
                  >
                    Open Fee Desk
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("exams")}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#002366]/20 hover:bg-[#002366]/5 hover:text-[#002366]"
                  >
                    View Exam Desk
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Contact desk</p>
                    <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-900">Direct student contact</h3>
                  </div>
                  <span className="rounded-2xl bg-slate-100 p-3 text-[#002366]">
                    <Mail className="h-5 w-5" />
                  </span>
                </div>
                <div className="mt-4 grid gap-3">
                  <InfoTile icon={Mail} label="Email" value={student.email || "-"} valueClassName="text-slate-800" className="bg-slate-50" />
                  <InfoTile icon={Phone} label="Phone" value={student.phone || "-"} valueClassName="text-slate-800" className="bg-slate-50" />
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-[#002366]/10 bg-[linear-gradient(180deg,#082a63_0%,#0f3f8c_100%)] p-5 text-white shadow-lg shadow-[#002366]/15">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100">Portal pulse</p>
                <p className="mt-3 text-xl font-semibold tracking-tight">What needs attention now</p>
                <p className="mt-2 text-sm leading-6 text-blue-100">{currentFocusText}</p>

                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100">Attendance</p>
                      <p className="mt-1 text-sm font-semibold text-white">{attendance.summary?.percentage || 0}% this term</p>
                    </div>
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
                      {attendance.summary?.present || 0} present
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100">Fee status</p>
                      <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(fees.summary?.pendingAmount || 0)} pending</p>
                    </div>
                    <span className="rounded-full bg-amber-300/15 px-3 py-1 text-xs font-semibold text-amber-100">
                      {pendingFeeRecords.length} dues
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100">Exam window</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {nextScheduledExam ? nextScheduledExam.examName || "Scheduled exam" : "No exam published"}
                      </p>
                    </div>
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
                      {nextScheduledExam ? formatDate(nextScheduledExam.examDate) : "Pending"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </PanelCard>

        <PanelCard
          icon={Clock3}
          title="Today's Timetable"
          eyebrow="Class schedule"
          action={(
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {timetable.today?.day || "No classes today"}
            </span>
          )}
        >
          {todayPeriods.length === 0 ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_220px]">
              <div className="rounded-[1.6rem] border border-dashed border-[#002366]/15 bg-[linear-gradient(135deg,#f8fbff_0%,#ffffff_100%)] p-5">
                <div className="flex items-start gap-4">
                  <span className="rounded-2xl bg-white p-3 text-[#002366] shadow-sm">
                    <Clock3 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-semibold tracking-tight text-slate-900">No live timetable for today</p>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                      Your timetable will appear here as soon as the school publishes your class schedule. Until then, use the weekly view to check the full class plan.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("academics")}
                      className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#002366] transition hover:border-[#002366]/20 hover:bg-[#002366]/5"
                    >
                      Open weekly view
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-[#002366]/10 bg-[linear-gradient(180deg,#082a63_0%,#0f3f8c_100%)] p-5 text-white">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100">Week snapshot</p>
                <div className="mt-5 space-y-4">
                  <div>
                    <p className="text-3xl font-semibold tracking-tight">{publishedTimetableDays}</p>
                    <p className="mt-1 text-sm text-blue-100">published class days</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100">Weekly periods</p>
                    <p className="mt-2 text-lg font-semibold text-white">{weeklyTimetablePeriods}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {todayPeriods.map((period) => (
                <div
                  key={`${timetable.today.day}-${period.periodNumber}`}
                  className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(135deg,#f8fbff_0%,#ffffff_100%)] p-4 transition hover:-translate-y-0.5 hover:border-[#002366]/15 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Period {period.periodNumber}</p>
                      <p className="mt-2 text-lg font-semibold tracking-tight text-slate-900">{period.subject}</p>
                      <p className="mt-2 text-sm text-slate-600">{period.teacher}</p>
                    </div>
                    <span className="rounded-full border border-[#002366]/10 bg-white px-3 py-1 text-xs font-semibold text-[#002366] shadow-sm">
                      {period.startTime || "--:--"} - {period.endTime || "--:--"}
                    </span>
                  </div>
                  <div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <span>Room</span>
                    <span className="text-slate-700">{period.roomNumber || "TBA"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </section>

      <section className="space-y-5">
        <PanelCard
          icon={UserRound}
          title="Guardian Desk"
          eyebrow="Primary family contacts"
          action={(
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {parentDetails.length} saved
            </span>
          )}
        >
          {parentDetails.length === 0 ? (
            <div className="rounded-[1.6rem] border border-dashed border-slate-200 bg-slate-50/80 p-5">
              <p className="text-xl font-semibold tracking-tight text-slate-900">Guardian contact is not available yet</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Ask the administration team to complete the guardian profile so contact and relationship details appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {parentDetails.map((parent) => (
                <div key={parent.id} className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold tracking-tight text-slate-900">{parent.fullName || "Guardian"}</p>
                      <p className="mt-1 text-sm font-medium text-slate-600">{parent.relation || "Guardian"}</p>
                    </div>
                    <span className="rounded-full bg-[#002366]/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#002366]">
                      {parent.isPrimaryGuardian ? "Primary" : "Family"}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <InfoTile icon={Phone} label="Phone" value={parent.phone || "-"} className="bg-white" />
                    <InfoTile icon={Mail} label="Email" value={parent.email || "-"} className="bg-white" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        <LiveNotices maxNotices={4} />

        <PanelCard
          icon={GraduationCap}
          title="Student Activity Board"
          eyebrow="Exam and fee snapshot"
        >
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-[1.6rem] border border-[#002366]/10 bg-[linear-gradient(135deg,#eef4ff_0%,#ffffff_64%,#fff3de_100%)] p-5">
              <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#d9b36a]/20 blur-3xl" />
              <div className="relative z-10">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Exam desk</p>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-900">Latest exam snapshot</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("exams")}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#002366] transition hover:border-[#002366]/20 hover:bg-[#002366]/5"
                >
                  Open exams
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {examRecords.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {examRecords.slice(0, 2).map((record) => (
                    <div key={record.id} className="rounded-[1.5rem] border border-white/70 bg-white/90 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold tracking-tight text-slate-900">{record.examName || "-"}</p>
                          <p className="mt-1 text-sm text-slate-600">{record.subject || "-"}</p>
                        </div>
                        <span className="rounded-full bg-[#002366]/5 px-3 py-1 text-xs font-semibold text-[#002366]">
                          {record.marksObtained || 0}/{record.totalMarks || 0}
                        </span>
                      </div>
                      <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                        {formatDate(record.examDate)} | Grade {record.grade || "-"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : examSchedule.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {examSchedule.slice(0, 2).map((record) => (
                    <div key={record.id} className="rounded-[1.5rem] border border-white/70 bg-white/90 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold tracking-tight text-slate-900">{record.examName || "-"}</p>
                          <p className="mt-1 text-sm text-slate-600">{record.subject || "General"}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(record.status)}`}>
                          {record.status}
                        </span>
                      </div>
                      <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                        {formatDate(record.examDate)}
                        {record.startTime ? ` | ${record.startTime}` : ""}
                        {record.endTime ? ` - ${record.endTime}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4">
                  <EmptySnapshotState
                    icon={GraduationCap}
                    title="No exam data published yet"
                    description="Once the school publishes your exam schedule or results, they will appear here automatically."
                    actionLabel="Open exams"
                    onAction={() => setActiveTab("exams")}
                  />
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  {examResults.summary?.scheduledCount || examSchedule.length || 0} scheduled items
                </div>
                <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  {examSchedule.filter((record) => record.isOnlineEnabled).length} online-ready
                </div>
              </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[1.6rem] border border-emerald-100 bg-[linear-gradient(135deg,#ffffff_0%,#f6fbff_45%,#edf9f1_100%)] p-5">
              <div className="pointer-events-none absolute -left-10 -top-10 h-28 w-28 rounded-full bg-emerald-100/70 blur-3xl" />
              <div className="relative z-10">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Fee desk</p>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-900">Current dues and payments</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("fees")}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#002366] transition hover:border-[#002366]/20 hover:bg-[#002366]/5"
                >
                  Open fees
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {pendingFeeRecords.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {pendingFeeRecords.slice(0, 2).map((fee) => (
                    <div key={fee.id} className="rounded-[1.5rem] border border-white/70 bg-white/90 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold tracking-tight text-slate-900">{fee.feeType || "Fee"}</p>
                          <p className="mt-1 text-sm text-slate-600">Due {formatDate(fee.dueDate)}</p>
                        </div>
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          {formatCurrency(fee.pendingAmount || 0)}
                        </span>
                      </div>
                      <div className="mt-4 h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-[linear-gradient(90deg,#002366_0%,#0d4ea6_100%)]"
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, ((Number(fee.paidAmount || 0) / Math.max(Number(fee.amount || 0), 1)) * 100))
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                          Paid {formatCurrency(fee.paidAmount || 0)} of {formatCurrency(fee.amount || 0)}
                        </p>
                        <button
                          type="button"
                          onClick={() => openPaymentModal(fee)}
                          disabled={!STUDENT_PAYMENT_PORTAL_ENABLED}
                          className="rounded-full bg-[#002366] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#001a4d] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                        >
                          {STUDENT_PAYMENT_PORTAL_ENABLED ? "Pay Now" : "Payment Unavailable"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentPayments.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {recentPayments.slice(0, 2).map((payment) => (
                    <div key={payment.id || `${payment.date}-${payment.amount}`} className="rounded-[1.5rem] border border-white/70 bg-white/90 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold tracking-tight text-slate-900">{payment.feeType || "Payment"}</p>
                          <p className="mt-1 text-sm text-slate-600">{formatDate(payment.date)}</p>
                        </div>
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          {formatCurrency(payment.amount || 0)}
                        </span>
                      </div>
                      <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                        {payment.mode || "Payment recorded"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4">
                  <EmptySnapshotState
                    icon={BadgeIndianRupee}
                    title="No fee dues are active right now"
                    description="When new fee records or payment updates are added, they will show up in this panel."
                    actionLabel="Open fees"
                    onAction={() => setActiveTab("fees")}
                  />
                </div>
              )}
              <div className="mt-4 rounded-[1.3rem] border border-emerald-100 bg-white/80 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Fee completion</p>
                  <span className="text-sm font-semibold text-slate-900">{feeCompletionPercentage}%</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-[linear-gradient(90deg,#002366_0%,#0d4ea6_65%,#22c55e_100%)]"
                    style={{ width: `${feeCompletionPercentage}%` }}
                  />
                </div>
              </div>
              </div>
            </div>
          </div>
        </PanelCard>

        <PanelCard
          icon={Bus}
          title="Transport"
          eyebrow="Commute details"
          action={(
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${transport.assigned ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
              {transport.assigned ? "Active route" : "Awaiting assignment"}
            </span>
          )}
        >
          {transport.assigned ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.04fr)_minmax(240px,0.96fr)]">
              <div className="rounded-[1.6rem] border border-[#002366]/10 bg-[linear-gradient(135deg,#eef4ff_0%,#ffffff_100%)] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned route</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{transport.routeName || "Transport route"}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Pickup point: {transport.pickupPoint || transport.stopName || "Not assigned"}{transport.dropPoint ? ` | Drop point: ${transport.dropPoint}` : ""}
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <InfoTile label="Current Status" value={transport.currentStatus || "Active"} className="bg-white" />
                  <InfoTile label="Driver Phone" value={transport.driverPhone || "-"} className="bg-white" />
                </div>
              </div>
              <div className="grid gap-3">
                <InfoTile label="Bus" value={transport.busNumber || "-"} />
                <InfoTile label="Route" value={transport.routeName || "-"} />
                <InfoTile label="Stop" value={transport.stopName || "-"} />
                <InfoTile label="Driver" value={transport.driverName || "-"} />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.06fr)_220px]">
              <div className="rounded-[1.6rem] border border-dashed border-slate-200 bg-[linear-gradient(135deg,#f8fbff_0%,#ffffff_100%)] p-5">
                <p className="text-xl font-semibold tracking-tight text-slate-900">No active transport assignment</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Transport details will appear here when a bus route or pickup point is linked to your student profile.
                </p>
              </div>
              <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50/90 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Commute status</p>
                <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">Pending</p>
                <p className="mt-2 text-sm text-slate-600">Route assignment will appear here automatically.</p>
              </div>
            </div>
          )}
        </PanelCard>
      </section>
    </div>
  );

  const attendanceContent = (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={CalendarDays} label="Total Records" value={attendance.summary?.total || 0} />
        <StatCard icon={ShieldCheck} label="Present" value={attendance.summary?.present || 0} />
        <StatCard icon={AlertCircle} label="Absent" value={attendance.summary?.absent || 0} />
        <StatCard icon={Clock3} label="Late" value={attendance.summary?.late || 0} />
      </div>
      <DetailsTable
        headers={["Date", "Status", "Marked By", "Remarks"]}
        emptyText="No attendance history has been recorded yet."
        rows={(attendance.recentHistory || []).map((record) => (
          <tr key={record.id} className="border-t border-slate-100">
            <td className="px-4 py-3 text-slate-900">{formatDate(record.date)}</td>
            <td className="px-4 py-3">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(record.status)}`}>
                {record.status || "-"}
              </span>
            </td>
            <td className="px-4 py-3 text-slate-600">{record.markedBy || "-"}</td>
            <td className="px-4 py-3 text-slate-600">{record.remarks || "-"}</td>
          </tr>
        ))}
      />
    </div>
  );

  const academicsContent = (
    <div className="space-y-4">
      <DetailsTable
        headers={["Subject", "Code", "Teacher"]}
        emptyText="No subject assignments are available for your class yet."
        rows={(academicInfo.subjects || []).map((subject) => (
          <tr key={subject.id} className="border-t border-slate-100">
            <td className="px-4 py-3 font-medium text-slate-900">{subject.name || "-"}</td>
            <td className="px-4 py-3 text-slate-600">{subject.code || "-"}</td>
            <td className="px-4 py-3 text-slate-600">{subject.teacher?.fullName || "Not Assigned"}</td>
          </tr>
        ))}
      />
      <DetailsTable
        headers={["Day", "Periods"]}
        emptyText="No timetable has been published for this class yet."
        rows={(timetable.records || []).map((record) => (
          <tr key={record.day} className="border-t border-slate-100 align-top">
            <td className="px-4 py-3 font-medium text-slate-900">{record.day}</td>
            <td className="px-4 py-3 text-slate-600">
              <div className="space-y-2">
                {(record.periods || []).map((period) => (
                  <div key={`${record.day}-${period.periodNumber}`} className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="font-medium text-slate-800">{period.subject}</p>
                    <p className="text-xs text-slate-500">{period.startTime || "--:--"} - {period.endTime || "--:--"} | {period.teacher}</p>
                  </div>
                ))}
              </div>
            </td>
          </tr>
        ))}
      />
    </div>
  );

  const examsContent = (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={GraduationCap} label="Published Results" value={examResults.summary?.totalExams || 0} />
        <StatCard icon={BookOpen} label="Total Marks" value={examResults.summary?.totalMarks || 0} />
        <StatCard icon={ShieldCheck} label="Obtained" value={examResults.summary?.totalObtained || 0} />
        <StatCard icon={CalendarDays} label="Scheduled Exams" value={examResults.summary?.scheduledCount || examSchedule.length || 0} />
      </div>
      {examSchedule.some((record) => record.isOnlineEnabled) ? (
        <div className="rounded-[1.5rem] border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
          <p className="font-semibold">Online test mode is enabled for selected exams</p>
          <p className="mt-1 text-blue-800">
            When the exam window becomes live, the portal will show a `Start Test` button and your score will be graded instantly after submission.
          </p>
        </div>
      ) : null}
      <DetailsTable
        headers={["Exam", "Subject", "Date", "Marks", "Percentage", "Grade"]}
        emptyText="No exam results are available yet."
        rows={examRecords.map((record) => (
          <tr key={record.id} className="border-t border-slate-100">
            <td className="px-4 py-3 font-medium text-slate-900">{record.examName || "-"}</td>
            <td className="px-4 py-3 text-slate-600">{record.subject || "-"}</td>
            <td className="px-4 py-3 text-slate-600">{formatDate(record.examDate)}</td>
            <td className="px-4 py-3 text-slate-600">{record.marksObtained || 0}/{record.totalMarks || 0}</td>
            <td className="px-4 py-3 text-slate-600">{record.percentage || 0}%</td>
            <td className="px-4 py-3">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(record.grade === "F" ? "overdue" : "paid")}`}>
                {record.grade || "-"}
              </span>
            </td>
          </tr>
        ))}
      />
      <DetailsTable
        headers={["Exam", "Subject", "Date", "Time", "Marks", "Status", "Action"]}
        emptyText="No exam schedule has been published yet."
        rows={examSchedule.map((record) => (
          <tr key={record.id} className="border-t border-slate-100">
            <td className="px-4 py-3 font-medium text-slate-900">
              <div className="space-y-1">
                <p>{record.examName || "-"}</p>
                {record.isOnlineEnabled ? (
                  <span className="inline-flex rounded-full bg-[#002366]/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#002366]">
                    Online Test
                  </span>
                ) : null}
              </div>
            </td>
            <td className="px-4 py-3 text-slate-600">{record.subject || "-"}</td>
            <td className="px-4 py-3 text-slate-600">{formatDate(record.examDate)}</td>
            <td className="px-4 py-3 text-slate-600">
              {record.startTime || "--:--"}{record.endTime ? ` - ${record.endTime}` : ""}
            </td>
            <td className="px-4 py-3 text-slate-600">{record.totalMarks || 0}</td>
            <td className="px-4 py-3">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(record.status)}`}>
                {record.status || "-"}
              </span>
            </td>
            <td className="px-4 py-3">
              {record.canStartTest ? (
                <button
                  type="button"
                  onClick={() => handleStartExam(record)}
                  className="rounded-lg bg-[#002366] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#001a4d]"
                  disabled={examSessionLoading}
                >
                  {examSessionLoading ? "Opening..." : "Start Test"}
                </button>
              ) : record.attemptStatus === "Submitted" || record.status === "Submitted" ? (
                <span className="text-xs font-semibold text-emerald-700">Result Ready</span>
              ) : record.isOnlineEnabled ? (
                <span className="text-xs text-slate-500">
                  {record.status === "Upcoming" ? "Opens on exam time" : "Window closed"}
                </span>
              ) : (
                <span className="text-xs text-slate-400">Offline exam</span>
              )}
            </td>
          </tr>
        ))}
      />
    </div>
  );

  const feesContent = (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={BadgeIndianRupee} label="Total Fees" value={formatCurrency(fees.summary?.totalFees || 0)} />
        <StatCard icon={ShieldCheck} label="Paid" value={formatCurrency(fees.summary?.paidAmount || 0)} />
        <StatCard icon={AlertCircle} label="Pending" value={formatCurrency(fees.summary?.pendingAmount || 0)} />
        <StatCard icon={Clock3} label="Overdue" value={fees.summary?.overdueCount || 0} />
      </div>
      {firstPayableFee ? (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
          <div>
            <p className="font-semibold">Development payment checkout is enabled</p>
            <p className="mt-1 text-emerald-800">
              Local student payments use a sandbox/mock flow, so no real money is charged during testing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openPaymentModal(firstPayableFee)}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
          >
            Pay Next Due
          </button>
        </div>
      ) : null}
      <DetailsTable
        headers={["Fee Type", "Due Date", "Amount", "Paid", "Pending", "Status", "Action"]}
        emptyText="No fee records are available yet."
        rows={feeRecords.map((fee) => (
          <tr key={fee.id} className="border-t border-slate-100">
            <td className="px-4 py-3 font-medium text-slate-900">{fee.feeType || "-"}</td>
            <td className="px-4 py-3 text-slate-600">{formatDate(fee.dueDate)}</td>
            <td className="px-4 py-3 text-slate-600">{formatCurrency(fee.amount || 0)}</td>
            <td className="px-4 py-3 text-slate-600">{formatCurrency(fee.paidAmount || 0)}</td>
            <td className="px-4 py-3 text-slate-600">{formatCurrency(fee.pendingAmount || 0)}</td>
            <td className="px-4 py-3">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(fee.status)}`}>
                {fee.status || "-"}
              </span>
            </td>
            <td className="px-4 py-3">
              {Number(fee.pendingAmount || 0) > 0 ? (
                <button
                  type="button"
                  onClick={() => openPaymentModal(fee)}
                  disabled={!STUDENT_PAYMENT_PORTAL_ENABLED}
                  className="rounded-lg bg-[#002366] px-3 py-2 text-xs font-semibold text-white hover:bg-[#001a4d] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                >
                  {STUDENT_PAYMENT_PORTAL_ENABLED ? "Pay Now" : "Unavailable"}
                </button>
              ) : (
                <span className="text-xs text-slate-400">Settled</span>
              )}
            </td>
          </tr>
        ))}
      />
      <DetailsTable
        headers={["Date", "Fee Type", "Amount", "Mode", "Receipt"]}
        emptyText="No fee payments have been recorded yet."
        rows={recentPayments.map((payment) => (
          <tr key={payment.id || `${payment.date}-${payment.amount}`} className="border-t border-slate-100">
            <td className="px-4 py-3 text-slate-600">{formatDate(payment.date)}</td>
            <td className="px-4 py-3 font-medium text-slate-900">{payment.feeType || "-"}</td>
            <td className="px-4 py-3 text-slate-600">{formatCurrency(payment.amount || 0)}</td>
            <td className="px-4 py-3 text-slate-600">{payment.mode || "-"}</td>
            <td className="px-4 py-3 text-slate-600">{payment.receiptNumber || "-"}</td>
          </tr>
        ))}
      />
    </div>
  );

  const activeContent = {
    overview: overviewContent,
    attendance: attendanceContent,
    academics: academicsContent,
    exams: examsContent,
    fees: feesContent,
  }[activeTab];

  return (
    <section className="space-y-6">
      <header className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#082a63_0%,#123f8f_55%,#d9b36a_180%)] px-6 py-7 text-white shadow-xl">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top,#ffffff26_0%,transparent_58%)]" />
        <div className="pointer-events-none absolute -right-16 top-10 h-48 w-48 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute bottom-0 right-20 h-32 w-32 rounded-full bg-white/5 blur-2xl" />

        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)] xl:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-100">Student Portal</p>
            <h1 className="mt-3 text-3xl font-semibold">{student.fullName}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">
              Your personal school workspace for attendance, timetable, exam updates, fee tracking, and notices from the school.
            </p>

            <div className="mt-6 flex flex-wrap gap-3 text-sm text-blue-50">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">Admission No: {student.admissionNumber || "-"}</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">Roll No: {student.rollNumber || "-"}</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">Academic Year: {student.academicYear || timetable.academicYear || "-"}</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                Status: {student.isActive ? "Active" : "Inactive"}
              </span>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-[#002366] shadow-sm transition hover:bg-blue-50"
              >
                Open overview
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("fees")}
                className="rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Review dues
              </button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/15 bg-white/10 p-5 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-100">At a glance</p>
                <p className="mt-2 text-lg font-semibold">{student.class} {student.section ? `- ${student.section}` : ""}</p>
                <p className="mt-1 text-sm text-blue-100">Signed in as {user?.role || "Student"}</p>
              </div>
              <span className="rounded-2xl bg-white/15 p-3 text-white">
                <ShieldCheck className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100">Attendance</p>
                <p className="mt-2 text-2xl font-semibold">{attendance.summary?.percentage || 0}%</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-blue-100">{attendance.summary?.present || 0} present days</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100">Pending fees</p>
                <p className="mt-2 text-2xl font-semibold">{formatCurrency(fees.summary?.pendingAmount || 0)}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-blue-100">{pendingFeeRecords.length} active due items</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100">Current focus</p>
              <p className="mt-2 text-sm font-medium leading-6 text-white">
                {firstPayableFee
                  ? `${firstPayableFee.feeType || "Fee"} is due on ${formatDate(firstPayableFee.dueDate)}.`
                  : nextScheduledExam
                    ? `${nextScheduledExam.examName || "Upcoming exam"} is scheduled for ${formatDate(nextScheduledExam.examDate)}.`
                    : "You are up to date. New academic or payment updates will appear here."}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => (
          <StatCard
            key={item.label}
            icon={item.icon}
            label={item.label}
            value={item.value}
            subText={item.subText}
          />
        ))}
      </div>

      {portalNotes.length > 0 ? (
        <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5" />
            <div className="space-y-2">
              {portalNotes.map((note) => (
                <div key={note.id || note.title}>
                  <p className="font-semibold">{note.title || "Portal note"}</p>
                  <p className="text-sm text-amber-800">{note.message || "-"}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className={`${panelCardClassName} flex flex-nowrap items-stretch gap-2 overflow-x-auto p-2`}>
        {tabItems.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex min-w-[150px] shrink-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
              activeTab === tab.key
                ? "bg-[#002366] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span className={`rounded-2xl p-2 ${
              activeTab === tab.key ? "bg-white/15 text-white" : "bg-[#002366]/5 text-[#002366]"
            }`}>
              <tab.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span className={`block text-xs ${activeTab === tab.key ? "text-blue-100" : "text-slate-500"}`}>
                {tab.helper}
              </span>
            </span>
          </button>
        ))}
      </div>

      {activeContent}

      <Modal
        isOpen={showExamModal}
        onClose={closeExamModal}
        title={examSession?.exam?.name || examSession?.exam?.title || "Online Test"}
        size="xl"
      >
        {examSession?.breakdown ? (
          <div className="space-y-5">
            <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
              <p className="text-sm font-semibold uppercase tracking-[0.18em]">Result Summary</p>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Marks</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {examSession.attempt?.marksObtained || 0}/{examSession.attempt?.totalMarks || 0}
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Percentage</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{examSession.attempt?.percentage || 0}%</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Correct</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{examSession.attempt?.correctAnswers || 0}</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Grade</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{examSession.attempt?.grade || "-"}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {examSession.breakdown.map((question, index) => (
                <div key={question.questionId} className="rounded-[1.4rem] border border-slate-200 bg-slate-50/90 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Question {index + 1}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{question.questionText}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${question.isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {question.marksAwarded || 0}/{question.marks || 0}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Your answer</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">{question.studentAnswer || "-"}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Answer sheet</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">{question.correctAnswer || "-"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => closeExamModal(true)}
                className="rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#001a4d]"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmitExam} className="space-y-5">
            <div className="rounded-[1.5rem] border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
              <p className="font-semibold">Live online test</p>
              <p className="mt-1 text-blue-800">
                Answer every question carefully. Once you submit, the portal will check your answers against the answer sheet and calculate your score instantly.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <InfoTile label="Questions" value={(examSession?.questions || []).length} className="bg-white" />
              <InfoTile label="Duration" value={`${examSession?.paper?.durationMinutes || 0} min`} className="bg-white" />
              <InfoTile label="Total Marks" value={examSession?.paper?.totalMarks || 0} className="bg-white" />
            </div>

            {(examSession?.questions || []).map((question, index) => (
              <div key={question.questionId} className="rounded-[1.4rem] border border-slate-200 bg-slate-50/90 p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Question {index + 1}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{question.questionText}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                    {question.marks || 0} marks
                  </span>
                </div>

                {question.questionType === "mcq" ? (
                  <div className="grid gap-3">
                    {(question.options || []).map((option) => (
                      <label key={option.key} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                        <input
                          type="radio"
                          name={`question-${question.questionId}`}
                          value={option.key}
                          checked={examAnswers[question.questionId] === option.key}
                          onChange={(event) => setExamAnswers((current) => ({
                            ...current,
                            [question.questionId]: event.target.value,
                          }))}
                        />
                        <span className="font-semibold text-slate-900">{option.key}.</span>
                        <span>{option.text}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    rows={3}
                    value={examAnswers[question.questionId] || ""}
                    onChange={(event) => setExamAnswers((current) => ({
                      ...current,
                      [question.questionId]: event.target.value,
                    }))}
                    placeholder="Write your answer here"
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                  />
                )}
              </div>
            ))}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeExamModal}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={examSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#001a4d] disabled:opacity-60"
                disabled={examSubmitting}
              >
                {examSubmitting ? "Submitting..." : "Submit Test"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={showPaymentModal}
        onClose={closePaymentModal}
        title="Pay Student Fee"
        size="md"
      >
        <form onSubmit={handleStudentPaymentSubmit} className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Development sandbox payment</p>
            <p className="mt-1 text-emerald-800">
              This local checkout records the payment in the database and updates the dashboards, but it does not charge real money.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p><span className="text-slate-500">Fee Type:</span> <span className="font-medium text-slate-900">{selectedFee?.feeType || "-"}</span></p>
            <p className="mt-1"><span className="text-slate-500">Due Date:</span> <span className="font-medium text-slate-900">{formatDate(selectedFee?.dueDate)}</span></p>
            <p className="mt-1"><span className="text-slate-500">Pending:</span> <span className="font-medium text-slate-900">{formatCurrency(selectedFee?.pendingAmount || 0)}</span></p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Amount</label>
            <input
              type="number"
              min="1"
              max={Number(selectedFee?.pendingAmount || 0)}
              step="0.01"
              value={paymentForm.amount}
              onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Mode</label>
            <select
              value={paymentForm.mode}
              onChange={(event) => setPaymentForm((current) => ({ ...current, mode: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              <option value="Online">Online</option>
              <option value="UPI">UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
            <textarea
              rows={3}
              value={paymentForm.notes}
              onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Optional payment note"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closePaymentModal}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              disabled={paymentSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#001a4d] disabled:opacity-60"
              disabled={paymentSubmitting}
            >
              {paymentSubmitting ? "Recording Payment..." : "Pay Now"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
