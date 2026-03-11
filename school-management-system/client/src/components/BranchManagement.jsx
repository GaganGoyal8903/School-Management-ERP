import { useState, useMemo, useEffect } from "react";
import toast from "react-hot-toast";
import { Building2, Plus, Edit2, Trash2, X, MapPin, Phone, Mail, Users, Search } from "lucide-react";
import CrestLogo from "./CrestLogo";

export default function BranchManagement() {
  const [sms_branches, setSms_branches] = useState([]);
  const [sms_loading, setSms_loading] = useState(true);
  const [sms_searchQuery, setSms_searchQuery] = useState("");
  const [sms_showAddModal, setSms_showAddModal] = useState(false);
  const [sms_selectedBranch, setSms_selectedBranch] = useState(null);
  const [sms_adding, setSms_adding] = useState(false);

  // Form state
  const [sms_name, setSms_name] = useState("");
  const [sms_code, setSms_code] = useState("");
  const [sms_address, setSms_address] = useState("");
  const [sms_city, setSms_city] = useState("");
  const [sms_state, setSms_state] = useState("");
  const [sms_pincode, setSms_pincode] = useState("");
  const [sms_phone, setSms_phone] = useState("");
  const [sms_email, setSms_email] = useState("");
  const [sms_principal, setSms_principal] = useState("");
  const [sms_capacity, setSms_capacity] = useState("");

  // Mock branches
  const mockBranches = [
    {
      id: 1,
      name: "Mayo College, Ajmer",
      code: "MCA-MAIN",
      address: "Mayo College, Ajmer",
      city: "Ajmer",
      state: "Rajasthan",
      pincode: "305001",
      phone: "+91 145 242 1200",
      email: "info@mayocollege.com",
      principal: "Dr. S. K. Sharma",
      capacity: 1200,
      students: 980,
      status: "Active"
    },
    {
      id: 2,
      name: "Mayo College, Girls Section",
      code: "MCA-GIRLS",
      address: "Mayo College Campus, Ajmer",
      city: "Ajmer",
      state: "Rajasthan",
      pincode: "305001",
      phone: "+91 145 242 1300",
      email: "girls@mayocollege.com",
      principal: "Mrs. Anjali Sharma",
      capacity: 600,
      students: 520,
      status: "Active"
    },
    {
      id: 3,
      name: "Mayo College, Jaipur Branch",
      code: "MCA-JP",
      address: "Jhalana Institutional Area",
      city: "Jaipur",
      state: "Rajasthan",
      pincode: "302004",
      phone: "+91 141 234 5600",
      email: "jaipur@mayocollege.com",
      principal: "Mr. Rajesh Kumar",
      capacity: 800,
      students: 650,
      status: "Active"
    },
  ];

  useEffect(() => {
    setTimeout(() => {
      setSms_branches(mockBranches);
      setSms_loading(false);
    }, 500);
  }, []);

  const filteredBranches = useMemo(() => {
    return sms_branches.filter(branch =>
      branch.name.toLowerCase().includes(sms_searchQuery.toLowerCase()) ||
      branch.code.toLowerCase().includes(sms_searchQuery.toLowerCase()) ||
      branch.city.toLowerCase().includes(sms_searchQuery.toLowerCase())
    );
  }, [sms_branches, sms_searchQuery]);

  const stats = useMemo(() => {
    return {
      total: sms_branches.length,
      totalStudents: sms_branches.reduce((sum, b) => sum + b.students, 0),
      totalCapacity: sms_branches.reduce((sum, b) => sum + b.capacity, 0),
    };
  }, [sms_branches]);

  const resetForm = () => {
    setSms_name("");
    setSms_code("");
    setSms_address("");
    setSms_city("");
    setSms_state("");
    setSms_pincode("");
    setSms_phone("");
    setSms_email("");
    setSms_principal("");
    setSms_capacity("");
  };

  const handleAddBranch = (e) => {
    e.preventDefault();
    setSms_adding(true);

    setTimeout(() => {
      const newBranch = {
        id: Date.now(),
        name: sms_name,
        code: sms_code,
        address: sms_address,
        city: sms_city,
        state: sms_state,
        pincode: sms_pincode,
        phone: sms_phone,
        email: sms_email,
        principal: sms_principal,
        capacity: parseInt(sms_capacity) || 0,
        students: 0,
        status: "Active"
      };
      
      setSms_branches([...sms_branches, newBranch]);
      toast.success("Branch added successfully!");
      setSms_showAddModal(false);
      resetForm();
      setSms_adding(false);
    }, 500);
  };

  const handleDeleteBranch = (id) => {
    if (!confirm("Are you sure you want to delete this branch?")) return;
    
    setSms_branches(sms_branches.filter(b => b.id !== id));
    toast.success("Branch deleted successfully!");
  };

  return (
    <section className="min-h-screen bg-transparent px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="page-card p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CrestLogo sizeClass="h-12 w-12" className="border-2 border-[#c5a059] bg-[#fffbf2]" imgClassName="h-full w-full rounded-full object-contain p-0.5" />
              <div>
                <h1 className="text-2xl font-bold text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  Branch Management
                </h1>
                <p className="mt-1 text-sm text-slate-600">Manage multiple school branches and campuses.</p>
              </div>
            </div>
            <button
              onClick={() => { resetForm(); setSms_showAddModal(true); }}
              className="flex items-center gap-2 rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003399]"
            >
              <Plus size={16} /> Add Branch
            </button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="page-card p-4">
            <p className="text-sm text-slate-600">Total Branches</p>
            <p className="text-2xl font-bold text-[#002366]">{stats.total}</p>
          </div>
          <div className="page-card p-4">
            <p className="text-sm text-slate-600">Total Students</p>
            <p className="text-2xl font-bold text-green-600">{stats.totalStudents}</p>
          </div>
          <div className="page-card p-4">
            <p className="text-sm text-slate-600">Total Capacity</p>
            <p className="text-2xl font-bold text-amber-600">{stats.totalCapacity}</p>
          </div>
        </div>

        <div className="page-card p-5 md:p-6">
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="flex-1 min-w-48">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search branches..."
                  value={sms_searchQuery}
                  onChange={(e) => setSms_searchQuery(e.target.value)}
                  className="w-full rounded-lg border border-[#d8c08a] bg-[#fffff0] pl-10 pr-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                />
              </div>
            </div>
          </div>

          {sms_loading ? (
            <div className="py-8 text-center text-slate-500">Loading...</div>
          ) : filteredBranches.length === 0 ? (
            <div className="py-8 text-center text-slate-500">No branches found</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredBranches.map((branch) => (
                <div key={branch.id} className="rounded-xl border border-[#d8c08a] bg-[#fffff0] p-4 hover:border-[#c5a059] hover:shadow-md transition">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-[#002366] text-white flex items-center justify-center">
                        <Building2 size={24} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-[#002366]">{branch.name}</h3>
                        <p className="text-xs text-slate-500">{branch.code}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      branch.status === "Active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {branch.status}
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-start gap-2 text-sm text-slate-600">
                      <MapPin size={14} className="mt-0.5 flex-shrink-0" />
                      <span>{branch.address}, {branch.city}, {branch.state} - {branch.pincode}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone size={14} className="flex-shrink-0" />
                      <span>{branch.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Mail size={14} className="flex-shrink-0" />
                      <span>{branch.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Users size={14} className="flex-shrink-0" />
                      <span>Principal: {branch.principal}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-[#d8c08a]">
                    <div className="text-sm">
                      <span className="text-slate-500">Students: </span>
                      <span className="font-semibold text-[#002366]">{branch.students}/{branch.capacity}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSms_selectedBranch(branch)}
                        className="rounded-md border border-[#002366] px-2 py-1 text-xs font-semibold text-[#002366] hover:bg-[#002366] hover:text-white"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteBranch(branch.id)}
                        className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Branch Modal */}
        {sms_showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[#002366]">Add New Branch</h3>
                <button onClick={() => setSms_showAddModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleAddBranch} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Branch Name *</label>
                    <input
                      type="text"
                      value={sms_name}
                      onChange={(e) => setSms_name(e.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                      placeholder="School name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Branch Code *</label>
                    <input
                      type="text"
                      value={sms_code}
                      onChange={(e) => setSms_code(e.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                      placeholder="e.g., MCA-02"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Address *</label>
                  <input
                    type="text"
                    value={sms_address}
                    onChange={(e) => setSms_address(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    placeholder="Full address"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">City *</label>
                    <input
                      type="text"
                      value={sms_city}
                      onChange={(e) => setSms_city(e.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">State *</label>
                    <input
                      type="text"
                      value={sms_state}
                      onChange={(e) => setSms_state(e.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Pincode *</label>
                    <input
                      type="text"
                      value={sms_pincode}
                      onChange={(e) => setSms_pincode(e.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Phone</label>
                    <input
                      type="tel"
                      value={sms_phone}
                      onChange={(e) => setSms_phone(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Email</label>
                    <input
                      type="email"
                      value={sms_email}
                      onChange={(e) => setSms_email(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Principal Name</label>
                    <input
                      type="text"
                      value={sms_principal}
                      onChange={(e) => setSms_principal(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Student Capacity</label>
                    <input
                      type="number"
                      value={sms_capacity}
                      onChange={(e) => setSms_capacity(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSms_showAddModal(false)}
                    className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sms_adding}
                    className="flex-1 rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003399] disabled:opacity-50"
                  >
                    {sms_adding ? "Adding..." : "Add Branch"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

