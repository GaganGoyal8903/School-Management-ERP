import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardPenLine, ShieldAlert, Target } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/DataTable';
import {
  createStudentIntervention,
  createStudentRemark,
  getStudentInterventions,
  getStudentRemarks,
  getStudentSupportSummary,
  getStudents,
  updateStudentInterventionStatus,
  updateStudentRemarkStatus,
} from '../services/api';

const cardBase = 'rounded-2xl border border-gray-100 bg-white p-5 shadow-sm';

const StudentSupport = () => {
  const [students, setStudents] = useState([]);
  const [summary, setSummary] = useState({
    openRemarks: 0,
    activeInterventions: 0,
    highRiskInterventions: 0,
    upcomingFollowUps: 0,
  });
  const [remarks, setRemarks] = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [remarkStatusFilter, setRemarkStatusFilter] = useState('');
  const [interventionStatusFilter, setInterventionStatusFilter] = useState('');
  const [remarkForm, setRemarkForm] = useState({
    studentId: '',
    remarkType: 'general',
    severity: 'medium',
    category: 'academic',
    title: '',
    notes: '',
    followUpDate: '',
  });
  const [interventionForm, setInterventionForm] = useState({
    studentId: '',
    category: 'academic',
    riskLevel: 'moderate',
    triggerSource: '',
    summary: '',
    actionPlan: '',
    parentContactNeeded: false,
    followUpDate: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [studentsRes, summaryRes, remarksRes, interventionsRes] = await Promise.all([
        getStudents({ page: 1, limit: 1000 }),
        getStudentSupportSummary(),
        getStudentRemarks({ page: 1, limit: 100, search, status: remarkStatusFilter || undefined }),
        getStudentInterventions({ page: 1, limit: 100, search, status: interventionStatusFilter || undefined }),
      ]);

      setStudents(studentsRes?.data?.students || []);
      setSummary(summaryRes?.data?.summary || summaryRes?.data?.data || {});
      setRemarks(remarksRes?.data?.remarks || remarksRes?.data?.data || []);
      setInterventions(interventionsRes?.data?.interventions || interventionsRes?.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load student support data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, remarkStatusFilter, interventionStatusFilter]);

  const studentOptions = useMemo(() => (
    (students || []).map((student) => ({
      value: String(student.studentId || student._id || student.id || ''),
      label: `${student.fullName || student.name} • ${student.className || student.class || ''} ${student.sectionName || student.section || ''}`.trim(),
    }))
  ), [students]);

  const handleRemarkSubmit = async (event) => {
    event.preventDefault();
    try {
      await createStudentRemark(remarkForm);
      toast.success('Remark saved');
      setRemarkForm({
        studentId: '',
        remarkType: 'general',
        severity: 'medium',
        category: 'academic',
        title: '',
        notes: '',
        followUpDate: '',
      });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save remark');
    }
  };

  const handleInterventionSubmit = async (event) => {
    event.preventDefault();
    try {
      await createStudentIntervention(interventionForm);
      toast.success('Intervention created');
      setInterventionForm({
        studentId: '',
        category: 'academic',
        riskLevel: 'moderate',
        triggerSource: '',
        summary: '',
        actionPlan: '',
        parentContactNeeded: false,
        followUpDate: '',
      });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save intervention');
    }
  };

  const handleRemarkStatus = async (remarkId, status) => {
    try {
      await updateStudentRemarkStatus(remarkId, { status });
      toast.success(`Remark marked ${status}`);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update remark');
    }
  };

  const handleInterventionStatus = async (interventionId, status) => {
    try {
      await updateStudentInterventionStatus(interventionId, { status });
      toast.success(`Intervention marked ${status}`);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update intervention');
    }
  };

  const remarkColumns = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => (
        <div>
          <p className="font-semibold text-gray-900">{row.studentFullName}</p>
          <p className="text-xs text-gray-500">{row.className} {row.sectionName} • {row.rollNumber || 'No roll'}</p>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Remark',
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900">{row.title}</p>
          <p className="text-xs text-gray-500">{row.category} • {row.remarkType}</p>
        </div>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      render: (row) => <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{row.severity}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{row.status}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex gap-2">
          {row.status !== 'monitored' && (
            <button onClick={() => handleRemarkStatus(row.remarkId, 'monitored')} className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700">
              Monitor
            </button>
          )}
          {row.status !== 'closed' && (
            <button onClick={() => handleRemarkStatus(row.remarkId, 'closed')} className="rounded-lg border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
              Close
            </button>
          )}
        </div>
      ),
    },
  ];

  const interventionColumns = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => (
        <div>
          <p className="font-semibold text-gray-900">{row.studentFullName}</p>
          <p className="text-xs text-gray-500">{row.className} {row.sectionName} • {row.rollNumber || 'No roll'}</p>
        </div>
      ),
    },
    {
      key: 'summary',
      header: 'Intervention',
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900">{row.summary}</p>
          <p className="text-xs text-gray-500">{row.category} • trigger: {row.triggerSource || 'manual'}</p>
        </div>
      ),
    },
    {
      key: 'riskLevel',
      header: 'Risk',
      render: (row) => <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">{row.riskLevel}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">{row.status}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex gap-2">
          {row.status !== 'monitoring' && (
            <button onClick={() => handleInterventionStatus(row.interventionId, 'monitoring')} className="rounded-lg border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700">
              Monitor
            </button>
          )}
          {row.status !== 'resolved' && (
            <button onClick={() => handleInterventionStatus(row.interventionId, 'resolved')} className="rounded-lg border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
              Resolve
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-[#0b2454] via-[#173a79] to-[#2850a1] p-8 text-white shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-100">Student Support Desk</p>
        <h1 className="mt-3 text-4xl font-semibold">Teacher remarks and intervention tracking</h1>
        <p className="mt-3 max-w-3xl text-sm text-blue-100">
          Spot risk early, log classroom observations, and keep follow-up actions visible for the teaching team.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={cardBase}><AlertTriangle className="mb-3 h-5 w-5 text-amber-600" /><p className="text-sm text-gray-500">Open Remarks</p><p className="mt-2 text-3xl font-semibold text-gray-900">{summary.openRemarks || 0}</p></div>
        <div className={cardBase}><ShieldAlert className="mb-3 h-5 w-5 text-rose-600" /><p className="text-sm text-gray-500">Active Interventions</p><p className="mt-2 text-3xl font-semibold text-gray-900">{summary.activeInterventions || 0}</p></div>
        <div className={cardBase}><Target className="mb-3 h-5 w-5 text-purple-600" /><p className="text-sm text-gray-500">High Risk Cases</p><p className="mt-2 text-3xl font-semibold text-gray-900">{summary.highRiskInterventions || 0}</p></div>
        <div className={cardBase}><CheckCircle2 className="mb-3 h-5 w-5 text-emerald-600" /><p className="text-sm text-gray-500">Follow-Ups In 7 Days</p><p className="mt-2 text-3xl font-semibold text-gray-900">{summary.upcomingFollowUps || 0}</p></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={handleRemarkSubmit} className={`${cardBase} space-y-4`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Teacher Remarks</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">Log a classroom observation</h2>
          </div>
          <select value={remarkForm.studentId} onChange={(e) => setRemarkForm((current) => ({ ...current, studentId: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-3">
            <option value="">Select student</option>
            {studentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <div className="grid gap-3 md:grid-cols-3">
            <select value={remarkForm.category} onChange={(e) => setRemarkForm((current) => ({ ...current, category: e.target.value }))} className="rounded-xl border border-gray-200 px-4 py-3">
              <option value="academic">Academic</option>
              <option value="attendance">Attendance</option>
              <option value="behavior">Behavior</option>
              <option value="wellbeing">Wellbeing</option>
            </select>
            <select value={remarkForm.remarkType} onChange={(e) => setRemarkForm((current) => ({ ...current, remarkType: e.target.value }))} className="rounded-xl border border-gray-200 px-4 py-3">
              <option value="general">General</option>
              <option value="positive">Positive</option>
              <option value="concern">Concern</option>
            </select>
            <select value={remarkForm.severity} onChange={(e) => setRemarkForm((current) => ({ ...current, severity: e.target.value }))} className="rounded-xl border border-gray-200 px-4 py-3">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <input value={remarkForm.title} onChange={(e) => setRemarkForm((current) => ({ ...current, title: e.target.value }))} placeholder="Remark title" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
          <textarea value={remarkForm.notes} onChange={(e) => setRemarkForm((current) => ({ ...current, notes: e.target.value }))} rows={4} placeholder="Notes for the teaching team" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
          <input type="date" value={remarkForm.followUpDate} onChange={(e) => setRemarkForm((current) => ({ ...current, followUpDate: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-3" />
          <button type="submit" className="rounded-xl bg-[#0b2454] px-5 py-3 text-sm font-semibold text-white">Save remark</button>
        </form>

        <form onSubmit={handleInterventionSubmit} className={`${cardBase} space-y-4`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Interventions</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">Open a support action plan</h2>
          </div>
          <select value={interventionForm.studentId} onChange={(e) => setInterventionForm((current) => ({ ...current, studentId: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-3">
            <option value="">Select student</option>
            {studentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <div className="grid gap-3 md:grid-cols-3">
            <select value={interventionForm.category} onChange={(e) => setInterventionForm((current) => ({ ...current, category: e.target.value }))} className="rounded-xl border border-gray-200 px-4 py-3">
              <option value="academic">Academic</option>
              <option value="attendance">Attendance</option>
              <option value="behavior">Behavior</option>
              <option value="wellbeing">Wellbeing</option>
            </select>
            <select value={interventionForm.riskLevel} onChange={(e) => setInterventionForm((current) => ({ ...current, riskLevel: e.target.value }))} className="rounded-xl border border-gray-200 px-4 py-3">
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <input value={interventionForm.triggerSource} onChange={(e) => setInterventionForm((current) => ({ ...current, triggerSource: e.target.value }))} placeholder="Trigger source" className="rounded-xl border border-gray-200 px-4 py-3" />
          </div>
          <input value={interventionForm.summary} onChange={(e) => setInterventionForm((current) => ({ ...current, summary: e.target.value }))} placeholder="Short intervention summary" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
          <textarea value={interventionForm.actionPlan} onChange={(e) => setInterventionForm((current) => ({ ...current, actionPlan: e.target.value }))} rows={4} placeholder="Action plan and checkpoints" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={interventionForm.parentContactNeeded} onChange={(e) => setInterventionForm((current) => ({ ...current, parentContactNeeded: e.target.checked }))} />
              Parent contact needed
            </label>
            <input type="date" value={interventionForm.followUpDate} onChange={(e) => setInterventionForm((current) => ({ ...current, followUpDate: e.target.value }))} className="rounded-xl border border-gray-200 px-4 py-3" />
          </div>
          <button type="submit" className="rounded-xl bg-[#0b2454] px-5 py-3 text-sm font-semibold text-white">Create intervention</button>
        </form>
      </div>

      <div className={cardBase}>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Live Queue</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">Remarks</h2>
          </div>
          <div className="flex gap-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student or note" className="rounded-xl border border-gray-200 px-4 py-3" />
            <select value={remarkStatusFilter} onChange={(e) => setRemarkStatusFilter(e.target.value)} className="rounded-xl border border-gray-200 px-4 py-3">
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="monitored">Monitored</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
        <DataTable columns={remarkColumns} data={remarks} loading={loading} />
      </div>

      <div className={cardBase}>
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Action Plans</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">Interventions</h2>
          </div>
          <div className="flex gap-3">
            <select value={interventionStatusFilter} onChange={(e) => setInterventionStatusFilter(e.target.value)} className="rounded-xl border border-gray-200 px-4 py-3">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="monitoring">Monitoring</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>
        <DataTable columns={interventionColumns} data={interventions} loading={loading} />
      </div>
    </div>
  );
};

export default StudentSupport;
