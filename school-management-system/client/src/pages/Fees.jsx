import { useState, useEffect } from 'react';
import { Plus, DollarSign, Receipt, AlertCircle, Search, Filter, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { 
  getFees, 
  getFeeStats,
  createFee, 
  updateFee, 
  deleteFee,
  collectPayment,
  getStudents,
  bulkCreateFees
} from '../services/api';

const Fees = () => {
  const { isAdmin, isAccountant } = useAuth();
  const [fees, setFees] = useState([]);
  const [stats, setStats] = useState({});
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingFee, setEditingFee] = useState(null);
  const [selectedFee, setSelectedFee] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [formData, setFormData] = useState({
    studentId: '',
    class: 'Class 10',
    feeType: 'Tuition',
    amount: '',
    dueDate: '',
    academicYear: '2024-2025'
  });

  const [paymentData, setPaymentData] = useState({
    amount: '',
    mode: 'Cash',
    transactionId: '',
    notes: ''
  });

  const [bulkData, setBulkData] = useState({
    class: 'Class 10',
    feeType: 'Tuition',
    amount: '',
    dueDate: '',
    academicYear: '2024-2025'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [feesRes, statsRes, studentsRes] = await Promise.all([
        getFees({ search: searchTerm, class: filterClass, status: filterStatus }),
        getFeeStats(),
        getStudents(1, 1000)
      ]);

      const feesData = feesRes?.data?.fees;
      const statsData = statsRes?.data?.stats;
      const studentsData = studentsRes?.data?.students;
      if (!Array.isArray(feesData) || !statsData || !Array.isArray(studentsData)) {
        throw new Error('Invalid fees response');
      }

      setFees(feesData);
      setStats(statsData);
      setStudents(studentsData);
      setLoadError('');
    } catch (error) {
      console.error('Error fetching fees data:', error);
      toast.error('Failed to fetch fees');
      setLoadError('Unable to load live fee data from the backend API.');
      setFees([]);
      setStats({});
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchTerm, filterClass, filterStatus]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingFee) {
        await updateFee(editingFee._id, formData);
        toast.success('Fee updated successfully');
      } else {
        await createFee(formData);
        toast.success('Fee created successfully');
      }
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    try {
      await collectPayment(selectedFee._id, paymentData);
      toast.success('Payment collected successfully');
      setShowPaymentModal(false);
      setSelectedFee(null);
      setPaymentData({ amount: '', mode: 'Cash', transactionId: '', notes: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Payment failed');
    }
  };

  const handleBulkCreate = async (e) => {
    e.preventDefault();
    try {
      await bulkCreateFees(bulkData);
      toast.success('Bulk fees created successfully');
      setShowBulkModal(false);
      setBulkData({
        class: 'Class 10',
        feeType: 'Tuition',
        amount: '',
        dueDate: '',
        academicYear: '2024-2025'
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Bulk creation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this fee record?')) return;
    try {
      await deleteFee(id);
      toast.success('Fee deleted successfully');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete fee');
    }
  };

  const resetForm = () => {
    setFormData({
      studentId: '',
      class: 'Class 10',
      feeType: 'Tuition',
      amount: '',
      dueDate: '',
      academicYear: '2024-2025'
    });
    setEditingFee(null);
  };

  const openEditModal = (fee) => {
    setEditingFee(fee);
    setFormData({
      studentId: fee.studentId?._id || '',
      class: fee.class || 'Class 10',
      feeType: fee.feeType || 'Tuition',
      amount: fee.amount || '',
      dueDate: fee.dueDate ? new Date(fee.dueDate).toISOString().split('T')[0] : '',
      academicYear: fee.academicYear || '2024-2025'
    });
    setShowModal(true);
  };

  const openPaymentModal = (fee) => {
    setSelectedFee(fee);
    setPaymentData({
      amount: (fee.amount + (fee.lateFee || 0) - (fee.discount || 0) - (fee.paidAmount || 0)).toString(),
      mode: 'Cash',
      transactionId: '',
      notes: ''
    });
    setShowPaymentModal(true);
  };

  const getStatusBadge = (status) => {
    const styles = {
      Paid: 'bg-green-100 text-green-800',
      Partial: 'bg-yellow-100 text-yellow-800',
      Pending: 'bg-blue-100 text-blue-800',
      Overdue: 'bg-red-100 text-red-800',
      Exempted: 'bg-gray-100 text-gray-800'
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const columns = [
    { 
      key: 'receiptNumber', 
      header: 'Receipt No',
      width: '140px'
    },
    { 
      key: 'student', 
      header: 'Student',
      render: (row) => row.studentId?.fullName || '-'
    },
    { key: 'class', header: 'Class' },
    { key: 'feeType', header: 'Type' },
    { 
      key: 'amount', 
      header: 'Amount',
      render: (row) => `₹${row.amount?.toLocaleString() || 0}`
    },
    { 
      key: 'paidAmount', 
      header: 'Paid',
      render: (row) => `₹${row.paidAmount?.toLocaleString() || 0}`
    },
    { 
      key: 'dueDate', 
      header: 'Due Date',
      render: (row) => row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '-'
    },
    { 
      key: 'status', 
      header: 'Status',
      render: (row) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(row.status)}`}>
          {row.status}
        </span>
      )
    },
    { 
      key: 'actions', 
      header: 'Actions',
      width: '150px',
      render: (row) => (
        <div className="flex items-center gap-1">
          {(isAdmin || isAccountant) && row.status !== 'Paid' && (
            <button
              onClick={() => openPaymentModal(row)}
              className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
            >
              Pay
            </button>
          )}
          {isAdmin && (
            <>
              <button
                onClick={() => openEditModal(row)}
                className="p-1 rounded hover:bg-blue-50 text-blue-600"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(row._id)}
                className="p-1 rounded hover:bg-red-50 text-red-600"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )
    }
  ];

  const classes = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
  const feeTypes = ['Tuition', 'Transport', 'Hostel', 'Books', 'Uniform', 'Examination', 'Other'];
  const paymentModes = ['Cash', 'Online', 'Cheque', 'DD', 'Bank Transfer', 'UPI'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Fee Management</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              <Filter className="w-4 h-4" />
              Bulk Create
            </button>
            <button
              onClick={() => { resetForm(); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d]"
            >
              <Plus className="w-4 h-4" />
              Add Fee
            </button>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Fees</p>
              <p className="text-xl font-bold">₹{stats.totalFees?.toLocaleString() || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Receipt className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Paid</p>
              <p className="text-xl font-bold">₹{stats.totalPaid?.toLocaleString() || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Pending</p>
              <p className="text-xl font-bold">₹{stats.totalPending?.toLocaleString() || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Overdue</p>
              <p className="text-xl font-bold">{stats.overdueCount || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search by student name or receipt..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
          >
            <option value="">All Classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
          >
            <option value="">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Partial">Partial</option>
            <option value="Paid">Paid</option>
            <option value="Overdue">Overdue</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={fees}
        loading={loading}
        searchPlaceholder="Search fees..."
      />
      {loadError ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {/* Add/Edit Fee Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={editingFee ? 'Edit Fee' : 'Add New Fee'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Student *</label>
              <select
                required
                value={formData.studentId}
                onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                <option value="">Select Student</option>
                {students.map(s => (
                  <option key={s._id} value={s._id}>{s.fullName} - {s.class} ({s.rollNumber})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
              <select
                required
                value={formData.class}
                onChange={(e) => setFormData({ ...formData, class: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type *</label>
              <select
                required
                value={formData.feeType}
                onChange={(e) => setFormData({ ...formData, feeType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              >
                {feeTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
              <input
                type="number"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
              <input
                type="date"
                required
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
              <input
                type="text"
                value={formData.academicYear}
                onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => { setShowModal(false); resetForm(); }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#002366] text-white rounded-lg hover:bg-[#001a4d]"
            >
              {editingFee ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => { setShowPaymentModal(false); setSelectedFee(null); }}
        title="Collect Payment"
        size="md"
      >
        <form onSubmit={handlePayment} className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <p className="text-sm text-gray-600">Student: <span className="font-medium">{selectedFee?.studentId?.fullName}</span></p>
            <p className="text-sm text-gray-600">Total Fee: <span className="font-medium">₹{selectedFee?.amount}</span></p>
            <p className="text-sm text-gray-600">Already Paid: <span className="font-medium">₹{selectedFee?.paidAmount || 0}</span></p>
            <p className="text-sm text-gray-600">Pending: <span className="font-medium text-red-600">₹{selectedFee?.amount - (selectedFee?.paidAmount || 0)}</span></p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
            <input
              type="number"
              required
              value={paymentData.amount}
              onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode *</label>
            <select
              required
              value={paymentData.mode}
              onChange={(e) => setPaymentData({ ...paymentData, mode: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              {paymentModes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Transaction ID</label>
            <input
              type="text"
              value={paymentData.transactionId}
              onChange={(e) => setPaymentData({ ...paymentData, transactionId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={paymentData.notes}
              onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => { setShowPaymentModal(false); setSelectedFee(null); }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Collect Payment
            </button>
          </div>
        </form>
      </Modal>

      {/* Bulk Create Modal */}
      <Modal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        title="Bulk Create Fees"
        size="md"
      >
        <form onSubmit={handleBulkCreate} className="space-y-4">
          <div className="bg-yellow-50 p-4 rounded-lg mb-4">
            <p className="text-sm text-yellow-800">This will create fee records for all active students in the selected class.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
            <select
              required
              value={bulkData.class}
              onChange={(e) => setBulkData({ ...bulkData, class: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type *</label>
            <select
              required
              value={bulkData.feeType}
              onChange={(e) => setBulkData({ ...bulkData, feeType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            >
              {feeTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
            <input
              type="number"
              required
              value={bulkData.amount}
              onChange={(e) => setBulkData({ ...bulkData, amount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
            <input
              type="date"
              required
              value={bulkData.dueDate}
              onChange={(e) => setBulkData({ ...bulkData, dueDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#002366]"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => setShowBulkModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Create Bulk Fees
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Fees;

