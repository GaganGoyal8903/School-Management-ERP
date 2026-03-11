import { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, CalendarDays, Mail, Phone, ShieldCheck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { getStudentDetailsById } from '../services/api';

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
});

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatCurrency = (value = 0) => currencyFormatter.format(Number(value) || 0);

const getStatusClass = (status = '') => {
  const key = String(status).toLowerCase();
  if (['paid', 'submitted', 'graded', 'present', 'active', 'approved'].includes(key)) return 'bg-emerald-100 text-emerald-700';
  if (['partial', 'late', 'pending'].includes(key)) return 'bg-amber-100 text-amber-700';
  if (['absent', 'overdue', 'inactive', 'rejected', 'cancelled'].includes(key)) return 'bg-red-100 text-red-700';
  return 'bg-slate-100 text-slate-700';
};

const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'parents', label: 'Parents' },
  { key: 'academic', label: 'Academic' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'fees', label: 'Fees' },
  { key: 'exams', label: 'Exams' },
  { key: 'homework', label: 'Homework' },
  { key: 'additional', label: 'Additional' }
];

const DetailsTable = ({ headers, rows, emptyText }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4">
    {rows.length === 0 ? (
      <p className="text-sm text-gray-600">{emptyText}</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
              {headers.map((header) => (
                <th key={header} className="px-2 py-2">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    )}
  </div>
);

const StatGrid = ({ items }) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {items.map((item) => (
      <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs text-gray-500">{item.label}</p>
        <p className="text-xl font-semibold text-gray-900">{item.value}</p>
        {item.subText ? <p className="text-sm text-gray-600">{item.subText}</p> : null}
      </div>
    ))}
  </div>
);

const StudentDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [details, setDetails] = useState(null);

  const fetchStudentDetails = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await getStudentDetailsById(id);
      setDetails(response?.data || null);
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to load student details';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentDetails();
  }, [id]);

  if (loading) return <LoadingSpinner text="Loading student details..." />;

  if (error) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/students')} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" /> Back to Students
        </button>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <p className="font-semibold">Unable to load student details</p>
          <p className="text-sm">{error}</p>
          <button onClick={fetchStudentDetails} className="mt-3 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700">Retry</button>
        </div>
      </div>
    );
  }

  if (!details?.studentProfile) {
    return <EmptyState title="Student not found" description="Requested student record is unavailable." action={() => navigate('/students')} actionLabel="Go to Students" />;
  }

  const student = details.studentProfile;
  const parents = details.parentDetails || [];
  const academicInfo = details.academicInfo || {};
  const attendance = details.attendance || {};
  const fees = details.fees || {};
  const examResults = details.examResults || {};
  const homework = details.homework || {};
  const additional = details.additionalInfo || {};

  const heroStats = [
    { label: 'Attendance', value: `${attendance.summary?.percentage || 0}%`, subText: `${attendance.summary?.present || 0}/${attendance.summary?.total || 0}` },
    { label: 'Pending Fees', value: formatCurrency(fees.summary?.pendingAmount || 0), subText: `${fees.summary?.overdueCount || 0} overdue` },
    { label: 'Exam Average', value: `${examResults.summary?.averagePercentage || 0}%`, subText: `${examResults.summary?.totalExams || 0} records` },
    { label: 'Homework Pending', value: String(homework.summary?.pending || 0), subText: `${homework.summary?.overdue || 0} overdue` }
  ];

  const tabContent = {
    overview: (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Profile</h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-gray-500">Full Name:</span> <span className="font-medium text-gray-900">{student.fullName}</span></p>
            <p><span className="text-gray-500">Roll Number:</span> <span className="font-medium text-gray-900">{student.rollNumber || '-'}</span></p>
            <p><span className="text-gray-500">Admission No:</span> <span className="font-medium text-gray-900">{student.admissionNumber || '-'}</span></p>
            <p><span className="text-gray-500">Class:</span> <span className="font-medium text-gray-900">{student.class} - {student.section || '-'}</span></p>
            <p><span className="text-gray-500">DOB:</span> <span className="font-medium text-gray-900">{formatDate(student.dateOfBirth)}</span></p>
            <p><span className="text-gray-500">Gender:</span> <span className="font-medium text-gray-900">{student.gender || '-'}</span></p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Contact</h3>
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-[#0b2a66]" /> <span>{student.email || '-'}</span></p>
            <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-[#0b2a66]" /> <span>{student.phone || '-'}</span></p>
            <p><span className="text-gray-500">Address:</span> <span className="font-medium text-gray-900">{[student.address?.street, student.address?.city, student.address?.state, student.address?.pincode].filter(Boolean).join(', ') || '-'}</span></p>
            <p><span className="text-gray-500">Status:</span> <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusClass(student.isActive ? 'active' : 'inactive')}`}>{student.isActive ? 'Active' : 'Inactive'}</span></p>
          </div>
        </div>
      </div>
    ),
    parents: (
      <div className="space-y-4">
        {parents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">No guardian data available.</div>
        ) : parents.map((parent) => (
          <div key={parent.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-gray-900">{parent.fullName || '-'}</h3>
              <span className="text-sm text-gray-600">{parent.relation || 'Guardian'}</span>
            </div>
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <p><span className="text-gray-500">Phone:</span> {parent.phone || '-'}</p>
              <p><span className="text-gray-500">Email:</span> {parent.email || '-'}</p>
              <p><span className="text-gray-500">Occupation:</span> {parent.occupation || '-'}</p>
              <p><span className="text-gray-500">Address:</span> {[parent.address?.street, parent.address?.city, parent.address?.state, parent.address?.pincode].filter(Boolean).join(', ') || '-'}</p>
            </div>
          </div>
        ))}
      </div>
    ),
    academic: (
      <DetailsTable
        headers={['Subject', 'Teacher', 'Teacher Email']}
        emptyText="No subject mapping found."
        rows={(academicInfo.subjects || []).map((subject) => (
          <tr key={subject.id} className="border-b border-gray-50">
            <td className="px-2 py-3 font-medium text-gray-900">{subject.name || '-'}</td>
            <td className="px-2 py-3 text-gray-700">{subject.teacher?.fullName || 'Not Assigned'}</td>
            <td className="px-2 py-3 text-gray-700">{subject.teacher?.email || '-'}</td>
          </tr>
        ))}
      />
    ),
    attendance: (
      <div className="space-y-4">
        <StatGrid items={[
          { label: 'Total', value: attendance.summary?.total || 0 },
          { label: 'Present', value: attendance.summary?.present || 0 },
          { label: 'Absent', value: attendance.summary?.absent || 0 },
          { label: 'Late', value: attendance.summary?.late || 0 }
        ]} />
        <DetailsTable
          headers={['Date', 'Status', 'Marked By', 'Remarks']}
          emptyText="No attendance history found."
          rows={(attendance.recentHistory || []).map((record) => (
            <tr key={record.id} className="border-b border-gray-50">
              <td className="px-2 py-3 text-gray-900">{formatDate(record.date)}</td>
              <td className="px-2 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusClass(record.status)}`}>{record.status}</span></td>
              <td className="px-2 py-3 text-gray-700">{record.markedBy || '-'}</td>
              <td className="px-2 py-3 text-gray-700">{record.remarks || '-'}</td>
            </tr>
          ))}
        />
      </div>
    ),
    fees: (
      <div className="space-y-4">
        <StatGrid items={[
          { label: 'Total Fees', value: formatCurrency(fees.summary?.totalFees || 0) },
          { label: 'Paid', value: formatCurrency(fees.summary?.paidAmount || 0) },
          { label: 'Pending', value: formatCurrency(fees.summary?.pendingAmount || 0) },
          { label: 'Overdue', value: fees.summary?.overdueCount || 0 }
        ]} />
        <DetailsTable
          headers={['Fee Type', 'Due Date', 'Amount', 'Paid', 'Pending', 'Status']}
          emptyText="No fee records found."
          rows={(fees.records || []).map((fee) => (
            <tr key={fee.id} className="border-b border-gray-50">
              <td className="px-2 py-3 font-medium text-gray-900">{fee.feeType || '-'}</td>
              <td className="px-2 py-3 text-gray-700">{formatDate(fee.dueDate)}</td>
              <td className="px-2 py-3 text-gray-700">{formatCurrency(fee.amount)}</td>
              <td className="px-2 py-3 text-gray-700">{formatCurrency(fee.paidAmount)}</td>
              <td className="px-2 py-3 text-gray-700">{formatCurrency(fee.pendingAmount)}</td>
              <td className="px-2 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusClass(fee.status)}`}>{fee.status}</span></td>
            </tr>
          ))}
        />
      </div>
    ),
    exams: (
      <DetailsTable
        headers={['Exam', 'Subject', 'Date', 'Marks', '%', 'Grade']}
        emptyText="No exam records found."
        rows={(examResults.records || []).map((record) => (
          <tr key={record.id} className="border-b border-gray-50">
            <td className="px-2 py-3 font-medium text-gray-900">{record.examName || '-'}</td>
            <td className="px-2 py-3 text-gray-700">{record.subject || '-'}</td>
            <td className="px-2 py-3 text-gray-700">{formatDate(record.examDate)}</td>
            <td className="px-2 py-3 text-gray-700">{record.marksObtained}/{record.totalMarks}</td>
            <td className="px-2 py-3 text-gray-700">{record.percentage || 0}%</td>
            <td className="px-2 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusClass(record.grade === 'F' ? 'overdue' : 'paid')}`}>{record.grade || '-'}</span></td>
          </tr>
        ))}
      />
    ),
    homework: (
      <div className="space-y-4">
        <StatGrid items={[
          { label: 'Total', value: homework.summary?.total || 0 },
          { label: 'Submitted', value: homework.summary?.submitted || 0 },
          { label: 'Pending', value: homework.summary?.pending || 0 },
          { label: 'Overdue', value: homework.summary?.overdue || 0 }
        ]} />
        <DetailsTable
          headers={['Title', 'Subject', 'Due Date', 'Status', 'Marks']}
          emptyText="No homework records found."
          rows={(homework.records || []).map((work) => (
            <tr key={work.id} className="border-b border-gray-50">
              <td className="px-2 py-3 font-medium text-gray-900">{work.title || '-'}</td>
              <td className="px-2 py-3 text-gray-700">{work.subject || '-'}</td>
              <td className="px-2 py-3 text-gray-700">{formatDate(work.dueDate)}</td>
              <td className="px-2 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusClass(work.status)}`}>{work.status}</span></td>
              <td className="px-2 py-3 text-gray-700">{work.submission?.marksObtained ?? '-'}/{work.totalMarks ?? '-'}</td>
            </tr>
          ))}
        />
      </div>
    ),
    additional: (
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Transport</h3>
          {additional.transport?.assigned ? (
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <p><span className="text-gray-500">Bus:</span> {additional.transport.busNumber || '-'}</p>
              <p><span className="text-gray-500">Route:</span> {additional.transport.routeName || '-'}</p>
              <p><span className="text-gray-500">Stop:</span> {additional.transport.stopName || '-'}</p>
              <p><span className="text-gray-500">Driver:</span> {additional.transport.driverName || '-'}</p>
            </div>
          ) : <p className="mt-2 text-sm text-gray-600">No transport assignment found.</p>}
        </div>
        <DetailsTable
          headers={['Title', 'Teacher', 'Subject', 'Requested On', 'Status']}
          emptyText="No meeting records found."
          rows={(additional.meetings || []).map((meeting) => (
            <tr key={meeting.id} className="border-b border-gray-50">
              <td className="px-2 py-3 text-gray-900">{meeting.title}</td>
              <td className="px-2 py-3 text-gray-700">{meeting.teacher || '-'}</td>
              <td className="px-2 py-3 text-gray-700">{meeting.subject || '-'}</td>
              <td className="px-2 py-3 text-gray-700">{formatDate(meeting.requestedDate)}</td>
              <td className="px-2 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusClass(meeting.status)}`}>{meeting.status}</span></td>
            </tr>
          ))}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">{additional.hostel?.message || 'Hostel data unavailable.'}</div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">{additional.library?.message || 'Library data unavailable.'}</div>
        </div>
      </div>
    )
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => navigate('/students')} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" /> Back to Students
        </button>
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#0b2a66]">
          <ShieldCheck className="h-3.5 w-3.5" /> View access for Admin & Teacher
        </div>
      </div>

      <section className="rounded-2xl border border-blue-100 bg-gradient-to-r from-[#0b2a66] via-[#0f3a8a] to-[#1d56c3] p-6 text-white">
        <p className="text-xs uppercase tracking-[0.2em] text-blue-100">Student Details</p>
        <h1 className="mt-1 text-2xl font-bold">{student.fullName}</h1>
        <p className="mt-1 text-sm text-blue-100">
          Roll No: {student.rollNumber || '-'} | {student.class} - Section {student.section || '-'}
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1"><Mail className="h-3.5 w-3.5" /> {student.email || '-'}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1"><Phone className="h-3.5 w-3.5" /> {student.phone || '-'}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1"><CalendarDays className="h-3.5 w-3.5" /> DOB: {formatDate(student.dateOfBirth)}</span>
        </div>
      </section>

      <StatGrid items={heroStats} />

      <div className="rounded-2xl border border-gray-200 bg-white p-2">
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-[#0b2a66] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        {tabContent[activeTab]}
      </section>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-[#0b2a66]">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <p>Secure view-only profile for Admin and Teacher roles.</p>
        </div>
      </div>
    </div>
  );
};

export default StudentDetails;
