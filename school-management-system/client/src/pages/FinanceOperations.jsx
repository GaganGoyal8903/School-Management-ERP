import { useEffect, useMemo, useState } from 'react';
import { BadgePercent, IndianRupee, RotateCcw, WalletCards } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import {
  createFeeConcession,
  createFeeRefund,
  getFeeConcessions,
  getFees,
  getFinanceOpsSummary,
  getFeeRefunds,
  reviewFeeConcession,
  reviewFeeRefund,
} from '../services/api';

const cardBase = 'rounded-2xl border border-gray-100 bg-white p-5 shadow-sm';

const FinanceOperations = () => {
  const [summary, setSummary] = useState({
    pendingConcessions: 0,
    approvedConcessionAmount: 0,
    pendingRefunds: 0,
    processedRefundAmount: 0,
  });
  const [fees, setFees] = useState([]);
  const [concessions, setConcessions] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [concessionStatus, setConcessionStatus] = useState('');
  const [refundStatus, setRefundStatus] = useState('');
  const [concessionForm, setConcessionForm] = useState({
    studentFeeId: '',
    concessionType: 'Scholarship',
    amount: '',
    reason: '',
  });
  const [refundForm, setRefundForm] = useState({
    studentFeeId: '',
    amount: '',
    refundMode: 'Bank Transfer',
    transactionReference: '',
    reason: '',
  });
  const [reviewModal, setReviewModal] = useState({
    open: false,
    type: 'concession',
    record: null,
    status: '',
    reviewNotes: '',
    refundMode: 'Bank Transfer',
    transactionReference: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [summaryRes, feesRes, concessionsRes, refundsRes] = await Promise.all([
        getFinanceOpsSummary(),
        getFees({ page: 1, limit: 250 }),
        getFeeConcessions({ page: 1, limit: 100, status: concessionStatus || undefined }),
        getFeeRefunds({ page: 1, limit: 100, status: refundStatus || undefined }),
      ]);

      setSummary(summaryRes?.data?.summary || summaryRes?.data?.data || {});
      setFees(feesRes?.data?.fees || []);
      setConcessions(concessionsRes?.data?.concessions || concessionsRes?.data?.data || []);
      setRefunds(refundsRes?.data?.refunds || refundsRes?.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load finance operations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [concessionStatus, refundStatus]);

  const feeOptions = useMemo(() => (
    (fees || []).map((fee) => ({
      value: String(fee.id || fee._id || ''),
      label: `${fee.studentId?.fullName || 'Student'} • ${fee.feeType} • pending ₹${Number(fee.pendingAmount || 0).toFixed(0)}`,
    }))
  ), [fees]);

  const handleConcessionSubmit = async (event) => {
    event.preventDefault();
    try {
      await createFeeConcession({
        ...concessionForm,
        amount: Number(concessionForm.amount || 0),
      });
      toast.success('Concession request created');
      setConcessionForm({
        studentFeeId: '',
        concessionType: 'Scholarship',
        amount: '',
        reason: '',
      });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create concession');
    }
  };

  const handleRefundSubmit = async (event) => {
    event.preventDefault();
    try {
      await createFeeRefund({
        ...refundForm,
        amount: Number(refundForm.amount || 0),
      });
      toast.success('Refund request created');
      setRefundForm({
        studentFeeId: '',
        amount: '',
        refundMode: 'Bank Transfer',
        transactionReference: '',
        reason: '',
      });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create refund');
    }
  };

  const openReviewModal = (type, record, status) => {
    setReviewModal({
      open: true,
      type,
      record,
      status,
      reviewNotes: '',
      refundMode: record?.refundMode || 'Bank Transfer',
      transactionReference: record?.transactionReference || '',
    });
  };

  const submitReview = async (event) => {
    event.preventDefault();
    try {
      if (reviewModal.type === 'concession') {
        await reviewFeeConcession(reviewModal.record.concessionId, {
          status: reviewModal.status,
          reviewNotes: reviewModal.reviewNotes,
        });
      } else {
        await reviewFeeRefund(reviewModal.record.refundId, {
          status: reviewModal.status,
          reviewNotes: reviewModal.reviewNotes,
          refundMode: reviewModal.refundMode,
          transactionReference: reviewModal.transactionReference,
        });
      }

      toast.success('Review saved');
      setReviewModal({
        open: false,
        type: 'concession',
        record: null,
        status: '',
        reviewNotes: '',
        refundMode: 'Bank Transfer',
        transactionReference: '',
      });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save review');
    }
  };

  const concessionColumns = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => (
        <div>
          <p className="font-semibold text-gray-900">{row.studentFullName}</p>
          <p className="text-xs text-gray-500">{row.className} {row.sectionName} • {row.feeType}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Concession',
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900">₹{Number(row.amount || 0).toFixed(0)}</p>
          <p className="text-xs text-gray-500">{row.concessionType}</p>
        </div>
      ),
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
        row.status === 'pending' ? (
          <div className="flex gap-2">
            <button onClick={() => openReviewModal('concession', row, 'approved')} className="rounded-lg border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
              Approve
            </button>
            <button onClick={() => openReviewModal('concession', row, 'rejected')} className="rounded-lg border border-rose-200 px-3 py-1 text-xs font-medium text-rose-700">
              Reject
            </button>
          </div>
        ) : <span className="text-xs text-gray-400">Reviewed</span>
      ),
    },
  ];

  const refundColumns = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => (
        <div>
          <p className="font-semibold text-gray-900">{row.studentFullName}</p>
          <p className="text-xs text-gray-500">{row.className} {row.sectionName} • {row.feeType}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Refund',
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900">₹{Number(row.amount || 0).toFixed(0)}</p>
          <p className="text-xs text-gray-500">{row.refundMode || 'Mode pending'}</p>
        </div>
      ),
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
        row.status === 'pending' ? (
          <div className="flex gap-2">
            <button onClick={() => openReviewModal('refund', row, 'processed')} className="rounded-lg border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
              Process
            </button>
            <button onClick={() => openReviewModal('refund', row, 'rejected')} className="rounded-lg border border-rose-200 px-3 py-1 text-xs font-medium text-rose-700">
              Reject
            </button>
          </div>
        ) : <span className="text-xs text-gray-400">Reviewed</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-[#173214] via-[#1f5c35] to-[#30835c] p-8 text-white shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-100">Finance Operations</p>
        <h1 className="mt-3 text-4xl font-semibold">Concessions and refund workflow</h1>
        <p className="mt-3 max-w-3xl text-sm text-emerald-100">
          Review fee relief decisions, process refund requests, and keep the student fee ledger aligned with every finance action.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={cardBase}><WalletCards className="mb-3 h-5 w-5 text-blue-600" /><p className="text-sm text-gray-500">Pending Concessions</p><p className="mt-2 text-3xl font-semibold text-gray-900">{summary.pendingConcessions || 0}</p></div>
        <div className={cardBase}><BadgePercent className="mb-3 h-5 w-5 text-emerald-600" /><p className="text-sm text-gray-500">Approved Relief</p><p className="mt-2 text-3xl font-semibold text-gray-900">₹{Number(summary.approvedConcessionAmount || 0).toFixed(0)}</p></div>
        <div className={cardBase}><RotateCcw className="mb-3 h-5 w-5 text-amber-600" /><p className="text-sm text-gray-500">Pending Refunds</p><p className="mt-2 text-3xl font-semibold text-gray-900">{summary.pendingRefunds || 0}</p></div>
        <div className={cardBase}><IndianRupee className="mb-3 h-5 w-5 text-rose-600" /><p className="text-sm text-gray-500">Processed Refunds</p><p className="mt-2 text-3xl font-semibold text-gray-900">₹{Number(summary.processedRefundAmount || 0).toFixed(0)}</p></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={handleConcessionSubmit} className={`${cardBase} space-y-4`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Fee Concessions</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">Raise a concession request</h2>
          </div>
          <select value={concessionForm.studentFeeId} onChange={(e) => setConcessionForm((current) => ({ ...current, studentFeeId: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-3">
            <option value="">Select fee record</option>
            {feeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <div className="grid gap-3 md:grid-cols-2">
            <select value={concessionForm.concessionType} onChange={(e) => setConcessionForm((current) => ({ ...current, concessionType: e.target.value }))} className="rounded-xl border border-gray-200 px-4 py-3">
              <option value="Scholarship">Scholarship</option>
              <option value="Sibling">Sibling</option>
              <option value="Hardship">Hardship</option>
              <option value="Merit">Merit</option>
              <option value="Special Approval">Special Approval</option>
            </select>
            <input type="number" min="0" step="0.01" value={concessionForm.amount} onChange={(e) => setConcessionForm((current) => ({ ...current, amount: e.target.value }))} placeholder="Amount" className="rounded-xl border border-gray-200 px-4 py-3" />
          </div>
          <textarea value={concessionForm.reason} onChange={(e) => setConcessionForm((current) => ({ ...current, reason: e.target.value }))} rows={4} placeholder="Why should this concession be granted?" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
          <button type="submit" className="rounded-xl bg-[#173214] px-5 py-3 text-sm font-semibold text-white">Create concession</button>
        </form>

        <form onSubmit={handleRefundSubmit} className={`${cardBase} space-y-4`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Refunds</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">Raise a refund request</h2>
          </div>
          <select value={refundForm.studentFeeId} onChange={(e) => setRefundForm((current) => ({ ...current, studentFeeId: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-4 py-3">
            <option value="">Select fee record</option>
            {feeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <div className="grid gap-3 md:grid-cols-2">
            <input type="number" min="0" step="0.01" value={refundForm.amount} onChange={(e) => setRefundForm((current) => ({ ...current, amount: e.target.value }))} placeholder="Amount" className="rounded-xl border border-gray-200 px-4 py-3" />
            <select value={refundForm.refundMode} onChange={(e) => setRefundForm((current) => ({ ...current, refundMode: e.target.value }))} className="rounded-xl border border-gray-200 px-4 py-3">
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cash">Cash</option>
              <option value="Cheque">Cheque</option>
              <option value="UPI">UPI</option>
            </select>
          </div>
          <input value={refundForm.transactionReference} onChange={(e) => setRefundForm((current) => ({ ...current, transactionReference: e.target.value }))} placeholder="Reference (optional)" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
          <textarea value={refundForm.reason} onChange={(e) => setRefundForm((current) => ({ ...current, reason: e.target.value }))} rows={4} placeholder="Reason for refund" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
          <button type="submit" className="rounded-xl bg-[#173214] px-5 py-3 text-sm font-semibold text-white">Create refund</button>
        </form>
      </div>

      <div className={cardBase}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Relief Queue</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">Concessions</h2>
          </div>
          <select value={concessionStatus} onChange={(e) => setConcessionStatus(e.target.value)} className="rounded-xl border border-gray-200 px-4 py-3">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <DataTable columns={concessionColumns} data={concessions} loading={loading} />
      </div>

      <div className={cardBase}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Outbound Money</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">Refunds</h2>
          </div>
          <select value={refundStatus} onChange={(e) => setRefundStatus(e.target.value)} className="rounded-xl border border-gray-200 px-4 py-3">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processed">Processed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <DataTable columns={refundColumns} data={refunds} loading={loading} />
      </div>

      <Modal isOpen={reviewModal.open} onClose={() => setReviewModal((current) => ({ ...current, open: false }))} title={reviewModal.type === 'concession' ? 'Review concession' : 'Review refund'}>
        <form onSubmit={submitReview} className="space-y-4">
          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            {reviewModal.record?.studentFullName || 'Selected record'} • {reviewModal.record?.feeType || ''} • target status: <span className="font-semibold">{reviewModal.status}</span>
          </div>
          <textarea value={reviewModal.reviewNotes} onChange={(e) => setReviewModal((current) => ({ ...current, reviewNotes: e.target.value }))} rows={4} placeholder="Review notes" className="w-full rounded-xl border border-gray-200 px-4 py-3" />
          {reviewModal.type === 'refund' && reviewModal.status === 'processed' && (
            <div className="grid gap-3 md:grid-cols-2">
              <select value={reviewModal.refundMode} onChange={(e) => setReviewModal((current) => ({ ...current, refundMode: e.target.value }))} className="rounded-xl border border-gray-200 px-4 py-3">
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="UPI">UPI</option>
              </select>
              <input value={reviewModal.transactionReference} onChange={(e) => setReviewModal((current) => ({ ...current, transactionReference: e.target.value }))} placeholder="Transaction reference" className="rounded-xl border border-gray-200 px-4 py-3" />
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setReviewModal((current) => ({ ...current, open: false }))} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
              Cancel
            </button>
            <button type="submit" className="rounded-xl bg-[#173214] px-4 py-2 text-sm font-semibold text-white">
              Save review
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default FinanceOperations;
