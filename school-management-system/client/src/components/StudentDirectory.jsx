import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Users, Plus, Edit2, Trash2, X, User, Mail, Phone, Shield } from "lucide-react";
import CrestLogo from "./CrestLogo";
import { getUsers, createUser, updateUser, deleteUser } from "../services/api";

const roles = ["student", "teacher", "admin", "parent"];
const grades = ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"];
const sections = ["A", "B", "C", "D"];

export default function StudentDirectory() {
  const [sms_users, setSms_users] = useState([]);
  const [sms_loading, setSms_loading] = useState(true);
  const [sms_searchQuery, setSms_searchQuery] = useState("");
  const [sms_roleFilter, setSms_roleFilter] = useState("All");
  const [sms_showAddModal, setSms_showAddModal] = useState(false);
  const [sms_selectedUser, setSms_selectedUser] = useState(null);
  const [sms_creating, setSms_creating] = useState(false);
  const [sms_updating, setSms_updating] = useState(false);

  // Form state
  const [sms_fullName, setSms_fullName] = useState("");
  const [sms_email, setSms_email] = useState("");
  const [sms_password, setSms_password] = useState("");
  const [sms_role, setSms_role] = useState("student");
  const [sms_phone, setSms_phone] = useState("");
  const [sms_address, setSms_address] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setSms_loading(true);
      const response = await getUsers();
      setSms_users(response.data.users || []);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to load users");
    } finally {
      setSms_loading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return sms_users.filter((user) => {
      const matchesSearch = user.fullName?.toLowerCase().includes(sms_searchQuery.toLowerCase()) ||
                           user.email?.toLowerCase().includes(sms_searchQuery.toLowerCase());
      const matchesRole = sms_roleFilter === "All" || user.role === sms_roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [sms_users, sms_searchQuery, sms_roleFilter]);

  const stats = useMemo(() => {
    return {
      total: sms_users.length,
      admins: sms_users.filter(u => u.role === "admin").length,
      teachers: sms_users.filter(u => u.role === "teacher").length,
      students: sms_users.filter(u => u.role === "student").length,
      parents: sms_users.filter(u => u.role === "parent").length,
    };
  }, [sms_users]);

  const getRoleBadge = (role) => {
    const colors = {
      admin: "bg-purple-100 text-purple-700",
      teacher: "bg-blue-100 text-blue-700",
      student: "bg-green-100 text-green-700",
      parent: "bg-amber-100 text-amber-700",
    };
    return colors[role] || "bg-slate-100 text-slate-700";
  };

  const resetForm = () => {
    setSms_fullName("");
    setSms_email("");
    setSms_password("");
    setSms_role("student");
    setSms_phone("");
    setSms_address("");
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setSms_creating(true);

    try {
      await createUser({
        fullName: sms_fullName,
        email: sms_email,
        password: sms_password,
        role: sms_role,
        phone: sms_phone,
        address: sms_address,
      });
      
      toast.success("User created successfully!");
      setSms_showAddModal(false);
      resetForm();
      fetchUsers();
    } catch (error) {
      console.error("Error creating user:", error);
      toast.error(error.response?.data?.message || "Failed to create user");
    } finally {
      setSms_creating(false);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!sms_selectedUser) return;
    setSms_updating(true);

    try {
      await updateUser(sms_selectedUser._id, {
        fullName: sms_fullName,
        email: sms_email,
        role: sms_role,
        phone: sms_phone,
        address: sms_address,
      });
      
      toast.success("User updated successfully!");
      setSms_selectedUser(null);
      resetForm();
      fetchUsers();
    } catch (error) {
      console.error("Error updating user:", error);
      toast.error(error.response?.data?.message || "Failed to update user");
    } finally {
      setSms_updating(false);
    }
  };

  const handleDeleteUser = async (id) => {
    if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) return;
    
    try {
      await deleteUser(id);
      toast.success("User deleted successfully!");
      fetchUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error(error.response?.data?.message || "Failed to delete user");
    }
  };

  const openEditModal = (user) => {
    setSms_selectedUser(user);
    setSms_fullName(user.fullName || "");
    setSms_email(user.email || "");
    setSms_password("");
    setSms_role(user.role || "student");
    setSms_phone(user.phone || "");
    setSms_address(user.address || "");
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
                  User Management
                </h1>
                <p className="mt-1 text-sm text-slate-600">Manage all registered users in the system.</p>
              </div>
            </div>
            <button
              onClick={() => { resetForm(); setSms_showAddModal(true); }}
              className="flex items-center gap-2 rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003399]"
            >
              <Plus size={16} />
              Add User
            </button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-5">
          <div className="page-card p-4 cursor-pointer hover:bg-slate-50" onClick={() => setSms_roleFilter("All")}>
            <p className="text-sm text-slate-600">Total Users</p>
            <p className="text-2xl font-bold text-[#002366]">{stats.total}</p>
          </div>
          <div className="page-card p-4 cursor-pointer hover:bg-slate-50" onClick={() => setSms_roleFilter("admin")}>
            <p className="text-sm text-slate-600">Admins</p>
            <p className="text-2xl font-bold text-purple-600">{stats.admins}</p>
          </div>
          <div className="page-card p-4 cursor-pointer hover:bg-slate-50" onClick={() => setSms_roleFilter("teacher")}>
            <p className="text-sm text-slate-600">Teachers</p>
            <p className="text-2xl font-bold text-blue-600">{stats.teachers}</p>
          </div>
          <div className="page-card p-4 cursor-pointer hover:bg-slate-50" onClick={() => setSms_roleFilter("student")}>
            <p className="text-sm text-slate-600">Students</p>
            <p className="text-2xl font-bold text-green-600">{stats.students}</p>
          </div>
          <div className="page-card p-4 cursor-pointer hover:bg-slate-50" onClick={() => setSms_roleFilter("parent")}>
            <p className="text-sm text-slate-600">Parents</p>
            <p className="text-2xl font-bold text-amber-600">{stats.parents}</p>
          </div>
        </div>

        <div className="page-card p-5 md:p-6">
          <div className="mb-4 flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={sms_searchQuery}
              onChange={(e) => setSms_searchQuery(e.target.value)}
              className="flex-1 min-w-48 rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059] focus:ring-2 focus:ring-[#c5a059]/30"
            />
            <select
              value={sms_roleFilter}
              onChange={(e) => setSms_roleFilter(e.target.value)}
              className="rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
            >
              <option value="All">All Roles</option>
              <option value="admin">Admin</option>
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
              <option value="parent">Parent</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#c5a059]">
            <table className="min-w-full divide-y divide-[#d8c08a]">
              <thead className="bg-[#002366] text-[#fffbf2]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6d3aa] bg-[#fffff0]">
                {sms_loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No users found</td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user._id} className="hover:bg-[#fff7e6]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-[#002366] text-white flex items-center justify-center text-xs font-semibold">
                            {user.fullName?.charAt(0)?.toUpperCase() || "U"}
                          </div>
                          <span className="text-sm font-medium text-slate-900">{user.fullName || "-"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{user.email || "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${getRoleBadge(user.role)}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{user.phone || "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${user.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEditModal(user)}
                            className="rounded-md border border-[#002366] px-2 py-1 text-xs font-semibold text-[#002366] hover:bg-[#002366] hover:text-white"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user._id)}
                            className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add User Modal */}
        {sms_showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[#002366]">Add New User</h3>
                <button onClick={() => setSms_showAddModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Full Name *</label>
                  <input
                    type="text"
                    value={sms_fullName}
                    onChange={(e) => setSms_fullName(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    placeholder="Enter full name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Email *</label>
                  <input
                    type="email"
                    value={sms_email}
                    onChange={(e) => setSms_email(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Password *</label>
                  <input
                    type="password"
                    value={sms_password}
                    onChange={(e) => setSms_password(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    placeholder="Min 6 characters"
                    minLength={6}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Role *</label>
                  <select
                    value={sms_role}
                    onChange={(e) => setSms_role(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                  >
                    {roles.map(r => <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Phone</label>
                  <input
                    type="tel"
                    value={sms_phone}
                    onChange={(e) => setSms_phone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    placeholder="+91 98765 43210"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Address</label>
                  <textarea
                    value={sms_address}
                    onChange={(e) => setSms_address(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    placeholder="Enter address"
                  />
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
                    disabled={sms_creating}
                    className="flex-1 rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003399] disabled:opacity-50"
                  >
                    {sms_creating ? "Creating..." : "Create User"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {sms_selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[#002366]">Edit User</h3>
                <button onClick={() => setSms_selectedUser(null)} className="text-slate-400 hover:text-slate-600 text-xl">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleUpdateUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Full Name *</label>
                  <input
                    type="text"
                    value={sms_fullName}
                    onChange={(e) => setSms_fullName(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Email *</label>
                  <input
                    type="email"
                    value={sms_email}
                    onChange={(e) => setSms_email(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    disabled
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">New Password</label>
                  <input
                    type="password"
                    value={sms_password}
                    onChange={(e) => setSms_password(e.target.value)}
                    placeholder="Leave blank to keep current"
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Role *</label>
                  <select
                    value={sms_role}
                    onChange={(e) => setSms_role(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                  >
                    {roles.map(r => <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>

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
                  <label className="block text-sm font-medium text-slate-700">Address</label>
                  <textarea
                    value={sms_address}
                    onChange={(e) => setSms_address(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSms_selectedUser(null)}
                    className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sms_updating}
                    className="flex-1 rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003399] disabled:opacity-50"
                  >
                    {sms_updating ? "Updating..." : "Update User"}
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

