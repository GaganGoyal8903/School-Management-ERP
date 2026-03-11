import { useState, useMemo } from "react";
import CrestLogo from "./CrestLogo";

const initialFeeRecords = [
  { id: "STU-1001", name: "Aarav Sharma", grade: "Class 10", section: "A", totalFee: 50000, paid: 25000, balance: 25000, status: "Partial" },
  { id: "STU-1002", name: "Riya Nair", grade: "Class 10", section: "A", totalFee: 50000, paid: 50000, balance: 0, status: "Paid" },
  { id: "STU-1003", name: "Kabir Mehta", grade: "Class 10", section: "A", totalFee: 50000, paid: 12500, balance: 37500, status: "Partial" },
  { id: "STU-1004", name: "Arjun Verma", grade: "Class 10", section: "B", totalFee: 50000, paid: 50000, balance: 0, status: "Paid" },
  { id: "STU-1005", name: "Saanvi Patel", grade: "Class 10", section: "B", totalFee: 50000, paid: 37500, balance: 12500, status: "Partial" },
  { id: "STU-1006", name: "Dev Joshi", grade: "Class 10", section: "B", totalFee: 50000, paid: 0, balance: 50000, status: "Unpaid" },
  { id: "STU-1007", name: "Anaya Rao", grade: "Class 9", section: "A", totalFee: 45000, paid: 45000, balance: 0, status: "Paid" },
  { id: "STU-1008", name: "Vihaan Khanna", grade: "Class 9", section: "A", totalFee: 45000, paid: 22500, balance: 22500, status: "Partial" },
];

const grades = ["All", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"];
const sections = ["All", "A", "B", "C", "D"];
const statusFilters = ["All", "Paid", "Partial", "Unpaid"];

export default function FeeRecords() {
  const [records, setRecords] = useState(initialFeeRecords);
  const [searchQuery, setSearchQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState("All");
  const [sectionFilter, setSectionFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [notice, setNotice] = useState("");

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const matchesSearch = record.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           record.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesGrade = gradeFilter === "All" || record.grade === gradeFilter;
      const matchesSection = sectionFilter === "All" || record.section === sectionFilter;
      const matchesStatus = statusFilter === "All" || record.status === statusFilter;
      return matchesSearch && matchesGrade && matchesSection && matchesStatus;
    });
  }, [records, searchQuery, gradeFilter, sectionFilter, statusFilter]);

  const totalCollected = filteredRecords.reduce((sum, r) => sum + r.paid, 0);
  const totalBalance = filteredRecords.reduce((sum, r) => sum + r.balance, 0);

  const openPaymentModal = (student) => {
    setSelectedStudent(student);
    setPaymentAmount("");
    setShowPaymentModal(true);
  };

  const handlePayment = () => {
    if (!selectedStudent || !paymentAmount) return;
    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;

    setRecords((prev) => 
      prev.map((record) => {
        if (record.id === selectedStudent.id) {
          const newPaid = Math.min(record.totalFee, record.paid + amount);
          const newBalance = record.totalFee - newPaid;
          return {
            ...record,
            paid: newPaid,
            balance: newBalance,
            status: newBalance === 0 ? "Paid" : "Partial"
          };
        }
        return record;
      })
    );
    setNotice(`Payment of ₹${amount} recorded for ${selectedStudent.name}`);
    setShowPaymentModal(false);
  };

  return (
    <section className="min-h-screen bg-transparent px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="page-card p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CrestLogo sizeClass="h-12 w-12" className="border-2 border-[#c5a059] bg-[#fffbf2]" imgClassName="h-full w-full rounded-full object-contain p-0.5" />
              <div>
                <h1 className="text-2xl font-bold text-[#002366]">Fee Records</h1>
                <p className="mt-1 text-sm text-slate-600">Manage student fee payments and track outstanding balances.</p>
              </div>
            </div>
            <span className="rounded-full border border-[#c5a059] bg-[#fff7e6] px-3 py-1 text-xs font-semibold text-[#8a6d3b]">Admin Panel</span>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="page-card p-4">
            <p className="text-sm text-slate-600">Total Students</p>
            <p className="text-2xl font-bold text-[#002366]">{filteredRecords.length}</p>
          </div>
          <div className="page-card p-4">
            <p className="text-sm text-slate-600">Total Collected</p>
            <p className="text-2xl font-bold text-green-600">₹{totalCollected.toLocaleString()}</p>
          </div>
          <div className="page-card p-4">
            <p className="text-sm text-slate-600">Total Outstanding</p>
            <p className="text-2xl font-bold text-red-600">₹{totalBalance.toLocaleString()}</p>
          </div>
        </div>

        <div className="page-card p-5 md:p-6">
          <div className="mb-4 flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-48 rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
            />
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
            >
              {grades.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
            >
              {sections.map((s) => <option key={s} value={s}>{s === "All" ? "All Sections" : `Section ${s}`}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
            >
              {statusFilters.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#c5a059]">
            <table className="min-w-full divide-y divide-[#d8c08a]">
              <thead className="bg-[#002366] text-[#fffbf2]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Grade</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Total Fee</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Paid</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Balance</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6d3aa] bg-[#fffff0]">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No records found</td>
                  </tr>
                ) : (
                  filteredRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-[#fff7e6]">
                      <td className="px-4 py-3 text-sm text-slate-700">{record.id}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{record.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{record.grade} - {record.section}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right">₹{record.totalFee.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right">₹{record.paid.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm font-medium text-red-600 text-right">₹{record.balance.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          record.status === "Paid" ? "bg-green-100 text-green-700" :
                          record.status === "Partial" ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {record.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openPaymentModal(record)}
                          className="rounded-md bg-[#002366] px-3 py-1 text-xs font-semibold text-white hover:bg-[#003399]"
                        >
                          Add Payment
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {notice && (
            <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-3">
              <p className="text-sm text-green-700">{notice}</p>
            </div>
          )}
        </div>

        {showPaymentModal && selectedStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-bold text-[#002366]">Record Payment</h3>
              <p className="mt-1 text-sm text-slate-600">{selectedStudent.name} ({selectedStudent.id})</p>
              <p className="mt-2 text-sm text-slate-600">Current Balance: ₹{selectedStudent.balance.toLocaleString()}</p>
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700">Payment Amount (₹)</label>
                <input
                  type="number"
                  min="1"
                  max={selectedStudent.balance}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
                />
              </div>
              
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePayment}
                  className="flex-1 rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003399]"
                >
                  Record Payment
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

