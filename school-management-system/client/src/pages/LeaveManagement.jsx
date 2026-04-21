import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, History, Loader2, RefreshCw, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import {
  getLeaveReviewHistory,
  getPendingLeaveRequests,
  getSubjects,
  reviewLeaveRequest,
} from "../services/api";

const PENDING_TAB = "pending";
const HISTORY_TAB = "history";
const DEFAULT_HISTORY_FILTERS = {
  className: "",
  sectionName: "",
  status: "",
  startDate: "",
  endDate: "",
};

const normalizeText = (value) => String(value || "").trim();
const normalizeKey = (value) => normalizeText(value).toLowerCase();

const formatDisplayDate = (value) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDisplayDateTime = (value) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildScopeOptions = (subjects = []) => {
  const options = new Map();

  subjects.forEach((subject) => {
    const className = normalizeText(subject?.className || subject?.grade);
    const sectionName = normalizeText(subject?.sectionName || subject?.section);

    if (!className) {
      return;
    }

    const currentSections = options.get(className) || new Set();
    if (sectionName) {
      currentSections.add(sectionName);
    }
    options.set(className, currentSections);
  });

  return Array.from(options.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([className, sectionSet]) => ({
      className,
      sections: Array.from(sectionSet).sort((left, right) => left.localeCompare(right)),
    }));
};

const buildStatusBadge = (status) => {
  switch (normalizeKey(status)) {
    case "approved":
      return "bg-green-100 text-green-700 border-green-200";
    case "rejected":
      return "bg-red-100 text-red-700 border-red-200";
    case "cancelled":
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-amber-100 text-amber-700 border-amber-200";
  }
};

const SummaryCard = ({ label, value, tone = "slate" }) => {
  const toneClasses = {
    slate: "bg-white border-gray-200 text-gray-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    green: "bg-green-50 border-green-200 text-green-900",
    red: "bg-red-50 border-red-200 text-red-900",
  };

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneClasses[tone] || toneClasses.slate}`}>
      <p className="text-sm opacity-75">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
};

const LeaveManagement = () => {
  const { isTeacher } = useAuth();
  const [activeTab, setActiveTab] = useState(PENDING_TAB);
  const [scopeOptions, setScopeOptions] = useState([]);

  const [pendingRecords, setPendingRecords] = useState([]);
  const [pendingSummary, setPendingSummary] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 });
  const [pendingPagination, setPendingPagination] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [pendingFilters, setPendingFilters] = useState({ className: "", sectionName: "" });
  const [pendingLoading, setPendingLoading] = useState(true);

  const [historyRecords, setHistoryRecords] = useState([]);
  const [historySummary, setHistorySummary] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 });
  const [historyPagination, setHistoryPagination] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [historyFilters, setHistoryFilters] = useState(DEFAULT_HISTORY_FILTERS);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [reviewForm, setReviewForm] = useState({ status: "approved", reviewNotes: "" });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    const loadScope = async () => {
      try {
        const response = await getSubjects({ page: 1, limit: 1000 });
        const nextOptions = buildScopeOptions(Array.isArray(response?.data?.subjects) ? response.data.subjects : []);
        if (active) {
          setScopeOptions(nextOptions);
        }
      } catch (error) {
        if (active) {
          setScopeOptions([]);
        }
      }
    };

    loadScope();
    return () => {
      active = false;
    };
  }, []);

  const availableSectionsForPending = useMemo(() => {
    const selectedOption = scopeOptions.find((option) => option.className === pendingFilters.className);
    return selectedOption?.sections || [];
  }, [pendingFilters.className, scopeOptions]);

  const availableSectionsForHistory = useMemo(() => {
    const selectedOption = scopeOptions.find((option) => option.className === historyFilters.className);
    return selectedOption?.sections || [];
  }, [historyFilters.className, scopeOptions]);

  useEffect(() => {
    let active = true;

    const loadPending = async () => {
      setPendingLoading(true);
      try {
        const response = await getPendingLeaveRequests({
          page: pendingPagination.page,
          limit: pendingPagination.limit,
          className: pendingFilters.className || undefined,
          sectionName: pendingFilters.sectionName || undefined,
        });

        if (!active) {
          return;
        }

        setPendingRecords(Array.isArray(response?.data?.leaves) ? response.data.leaves : []);
        setPendingSummary(response?.data?.summary || { total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 });
        setPendingPagination((current) => ({
          ...current,
          ...(response?.data?.pagination || {}),
        }));
      } catch (error) {
        if (!active) {
          return;
        }

        setPendingRecords([]);
        setPendingSummary({ total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 });
        toast.error(error?.response?.data?.message || "Unable to load pending leave requests.");
      } finally {
        if (active) {
          setPendingLoading(false);
        }
      }
    };

    loadPending();
    return () => {
      active = false;
    };
  }, [pendingFilters.className, pendingFilters.sectionName, pendingPagination.page, pendingPagination.limit, refreshToken]);

  useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const response = await getLeaveReviewHistory({
          page: historyPagination.page,
          limit: historyPagination.limit,
          className: historyFilters.className || undefined,
          sectionName: historyFilters.sectionName || undefined,
          status: historyFilters.status || undefined,
          startDate: historyFilters.startDate || undefined,
          endDate: historyFilters.endDate || undefined,
        });

        if (!active) {
          return;
        }

        setHistoryRecords(Array.isArray(response?.data?.leaves) ? response.data.leaves : []);
        setHistorySummary(response?.data?.summary || { total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 });
        setHistoryPagination((current) => ({
          ...current,
          ...(response?.data?.pagination || {}),
        }));
      } catch (error) {
        if (!active) {
          return;
        }

        setHistoryRecords([]);
        setHistorySummary({ total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 });
        toast.error(error?.response?.data?.message || "Unable to load leave review history.");
      } finally {
        if (active) {
          setHistoryLoading(false);
        }
      }
    };

    loadHistory();
    return () => {
      active = false;
    };
  }, [
    historyFilters.className,
    historyFilters.sectionName,
    historyFilters.status,
    historyFilters.startDate,
    historyFilters.endDate,
    historyPagination.page,
    historyPagination.limit,
    refreshToken,
  ]);

  const handlePendingFilterChange = (field, value) => {
    setPendingFilters((current) => {
      const nextState = { ...current, [field]: value };
      if (field === "className") {
        nextState.sectionName = "";
      }
      return nextState;
    });
    setPendingPagination((current) => ({ ...current, page: 1 }));
  };

  const handleHistoryFilterChange = (field, value) => {
    setHistoryFilters((current) => {
      const nextState = { ...current, [field]: value };
      if (field === "className") {
        nextState.sectionName = "";
      }
      return nextState;
    });
    setHistoryPagination((current) => ({ ...current, page: 1 }));
  };

  const handleOpenReview = (leave, status) => {
    setSelectedLeave(leave);
    setReviewForm({
      status,
      reviewNotes: "",
    });
  };

  const handleSubmitReview = async () => {
    if (!selectedLeave?.leaveRequestId) {
      return;
    }

    setReviewSubmitting(true);
    try {
      await reviewLeaveRequest(selectedLeave.leaveRequestId, reviewForm);
      toast.success(`Leave request ${reviewForm.status} successfully.`);
      setSelectedLeave(null);
      setReviewForm({ status: "approved", reviewNotes: "" });
      setRefreshToken((value) => value + 1);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Unable to review the leave request right now.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const activeSummary = activeTab === PENDING_TAB ? pendingSummary : historySummary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
          <p className="mt-1 text-sm text-gray-600">
            Review student leave submissions, approve or reject pending requests, and track the full audit trail.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRefreshToken((value) => value + 1)}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard label="Total Records" value={activeSummary.total || 0} />
        <SummaryCard label="Pending" value={activeSummary.pending || 0} tone="amber" />
        <SummaryCard label="Approved" value={activeSummary.approved || 0} tone="green" />
        <SummaryCard label="Rejected" value={activeSummary.rejected || 0} tone="red" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-gray-200 p-4">
          <button
            type="button"
            onClick={() => setActiveTab(PENDING_TAB)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === PENDING_TAB ? "bg-[#002366] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <Clock3 className="h-4 w-4" />
            Pending Queue
          </button>
          <button
            type="button"
            onClick={() => setActiveTab(HISTORY_TAB)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === HISTORY_TAB ? "bg-[#002366] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <History className="h-4 w-4" />
            Review History
          </button>
        </div>

        {activeTab === PENDING_TAB ? (
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Class</label>
                <select
                  value={pendingFilters.className}
                  onChange={(event) => handlePendingFilterChange("className", event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                >
                  <option value="">All Classes</option>
                  {scopeOptions.map((option) => (
                    <option key={option.className} value={option.className}>
                      {option.className}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Section</label>
                <select
                  value={pendingFilters.sectionName}
                  onChange={(event) => handlePendingFilterChange("sectionName", event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                >
                  <option value="">All Sections</option>
                  {availableSectionsForPending.map((sectionName) => (
                    <option key={sectionName} value={sectionName}>
                      {sectionName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-[#002366]">
                {isTeacher
                  ? "Teacher access is automatically limited to your assigned classes and sections."
                  : "Admins can review pending requests across the school."}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Student</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Class</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Period</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Requested</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {pendingLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading pending leave requests...
                        </span>
                      </td>
                    </tr>
                  ) : pendingRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                        No pending leave requests matched the current filters.
                      </td>
                    </tr>
                  ) : (
                    pendingRecords.map((leave) => (
                      <tr key={leave.leaveRequestId} className="align-top">
                        <td className="px-4 py-4">
                          <p className="font-medium text-gray-900">{leave.studentFullName}</p>
                          <p className="text-xs text-gray-500">
                            Adm: {leave.admissionNumber || "-"} | Roll: {leave.rollNumber || "-"}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">
                          {leave.className || "-"}{leave.sectionName ? ` / ${leave.sectionName}` : ""}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">
                          <p>{formatDisplayDate(leave.fromDate)} to {formatDisplayDate(leave.toDate)}</p>
                          <p className="text-xs text-gray-500">{leave.daysRequested || 0} day(s) • {leave.leaveType || "General"}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">
                          <p className="max-w-md whitespace-pre-wrap break-words">{leave.reason || "-"}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">{formatDisplayDateTime(leave.createdAt)}</td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenReview(leave, "approved")}
                              className="inline-flex items-center gap-2 rounded-lg bg-green-100 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-200"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenReview(leave, "rejected")}
                              className="inline-flex items-center gap-2 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
                            >
                              <XCircle className="h-4 w-4" />
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing page {pendingPagination.page || 1} of {pendingPagination.pages || 1} • {pendingPagination.total || 0} total pending request(s)
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPendingPagination((current) => ({ ...current, page: Math.max((current.page || 1) - 1, 1) }))}
                  disabled={(pendingPagination.page || 1) <= 1}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPendingPagination((current) => ({ ...current, page: Math.min((current.page || 1) + 1, current.pages || 1) }))}
                  disabled={(pendingPagination.page || 1) >= (pendingPagination.pages || 1)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Class</label>
                <select
                  value={historyFilters.className}
                  onChange={(event) => handleHistoryFilterChange("className", event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                >
                  <option value="">All Classes</option>
                  {scopeOptions.map((option) => (
                    <option key={option.className} value={option.className}>
                      {option.className}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Section</label>
                <select
                  value={historyFilters.sectionName}
                  onChange={(event) => handleHistoryFilterChange("sectionName", event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                >
                  <option value="">All Sections</option>
                  {availableSectionsForHistory.map((sectionName) => (
                    <option key={sectionName} value={sectionName}>
                      {sectionName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={historyFilters.status}
                  onChange={(event) => handleHistoryFilterChange("status", event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Start Date</label>
                <input
                  type="date"
                  value={historyFilters.startDate}
                  onChange={(event) => handleHistoryFilterChange("startDate", event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">End Date</label>
                <input
                  type="date"
                  value={historyFilters.endDate}
                  onChange={(event) => handleHistoryFilterChange("endDate", event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Student</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Reviewed By</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading leave review history...
                        </span>
                      </td>
                    </tr>
                  ) : historyRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                        No leave records matched the current filters.
                      </td>
                    </tr>
                  ) : (
                    historyRecords.map((leave) => (
                      <tr key={leave.leaveRequestId}>
                        <td className="px-4 py-4">
                          <p className="font-medium text-gray-900">{leave.studentFullName}</p>
                          <p className="text-xs text-gray-500">
                            {leave.className || "-"}{leave.sectionName ? ` / ${leave.sectionName}` : ""} • {formatDisplayDate(leave.fromDate)} to {formatDisplayDate(leave.toDate)}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">
                          <p>{leave.leaveType || "General"}</p>
                          <p className="text-xs text-gray-500">{leave.daysRequested || 0} day(s)</p>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${buildStatusBadge(leave.status)}`}>
                            {leave.status || "pending"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">
                          <p>{leave.reviewedByFullName || leave.requestedByFullName || "-"}</p>
                          <p className="text-xs text-gray-500">{leave.reviewedByRole || "-"}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">
                          <p className="max-w-sm whitespace-pre-wrap break-words">{leave.reviewNotes || "-"}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">{formatDisplayDateTime(leave.updatedAt || leave.reviewedAt || leave.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing page {historyPagination.page || 1} of {historyPagination.pages || 1} • {historyPagination.total || 0} total record(s)
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryPagination((current) => ({ ...current, page: Math.max((current.page || 1) - 1, 1) }))}
                  disabled={(historyPagination.page || 1) <= 1}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryPagination((current) => ({ ...current, page: Math.min((current.page || 1) + 1, current.pages || 1) }))}
                  disabled={(historyPagination.page || 1) >= (historyPagination.pages || 1)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedLeave ? (
        <div className="rounded-xl border border-[#002366]/20 bg-[#f8fbff] p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#002366]">
                {reviewForm.status === "approved" ? "Approve Leave Request" : "Reject Leave Request"}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {selectedLeave.studentFullName} • {selectedLeave.className || "-"}{selectedLeave.sectionName ? ` / ${selectedLeave.sectionName}` : ""} • {selectedLeave.leaveType || "General"}
              </p>
              <p className="mt-2 text-sm text-gray-700">
                {formatDisplayDate(selectedLeave.fromDate)} to {formatDisplayDate(selectedLeave.toDate)} • {selectedLeave.daysRequested || 0} day(s)
              </p>
              <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap break-words">{selectedLeave.reason || "-"}</p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedLeave(null)}
              className="self-start rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Decision</label>
              <select
                value={reviewForm.status}
                onChange={(event) => setReviewForm((current) => ({ ...current, status: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                <option value="approved">Approve</option>
                <option value="rejected">Reject</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Review Notes</label>
              <textarea
                rows={4}
                value={reviewForm.reviewNotes}
                onChange={(event) => setReviewForm((current) => ({ ...current, reviewNotes: event.target.value }))}
                placeholder="Optional notes for the student and school record."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setSelectedLeave(null)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitReview}
              disabled={reviewSubmitting}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white ${
                reviewForm.status === "approved" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {reviewSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {reviewForm.status === "approved" ? "Approve Request" : "Reject Request"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default LeaveManagement;
