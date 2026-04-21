import { useEffect, useMemo, useState } from 'react';
import { Bell, KeyRound, Save, Shield, User, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import {
  adminResetUserPassword,
  changeMyPassword,
  getSettings,
  getSettingsAuditLogs,
  getSettingsUsers,
  updateMyProfile,
  updateSettings,
} from '../services/api';

const AdminSectionCard = ({ title, subtitle, children }) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
    {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
    <div className="mt-4">{children}</div>
  </div>
);

const toBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  return String(value || '').trim().toLowerCase() === 'true';
};

const Settings = () => {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [settingsState, setSettingsState] = useState({
    system: {
      schoolName: 'Mayo College',
      academicYear: '2024-2025',
      appVersion: '1.0.0',
      contactEmail: '',
      contactPhone: '',
      address: '',
      notificationsEnabled: true,
      parentPortalEnabled: true,
    },
  });
  const [auditLogs, setAuditLogs] = useState([]);
  const [managedUsers, setManagedUsers] = useState([]);

  const [profileData, setProfileData] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [resetPasswordData, setResetPasswordData] = useState({
    userId: '',
    email: '',
    role: 'parent',
    newPassword: '',
  });

  useEffect(() => {
    setProfileData({
      fullName: user?.fullName || '',
      email: user?.email || '',
      phone: user?.phone || '',
    });
  }, [user]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const loadAdminData = async () => {
      try {
        setAdminLoading(true);
        const [settingsRes, logsRes, usersRes] = await Promise.all([
          getSettings(),
          getSettingsAuditLogs({ limit: 20 }),
          getSettingsUsers({ limit: 50 }),
        ]);

        const nextSettings = settingsRes.data?.data || settingsRes.data?.settings || {};
        setSettingsState({
          system: {
            schoolName: nextSettings.system?.schoolName?.value || 'Mayo College',
            academicYear: nextSettings.system?.academicYear?.value || '2024-2025',
            appVersion: nextSettings.system?.appVersion?.value || '1.0.0',
            contactEmail: nextSettings.system?.contactEmail?.value || '',
            contactPhone: nextSettings.system?.contactPhone?.value || '',
            address: nextSettings.system?.address?.value || '',
            notificationsEnabled: toBoolean(nextSettings.system?.notificationsEnabled?.value),
            parentPortalEnabled: toBoolean(nextSettings.system?.parentPortalEnabled?.value),
          },
        });
        setAuditLogs(logsRes.data?.data || logsRes.data?.logs || []);
        setManagedUsers(usersRes.data?.data || usersRes.data?.users || []);
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to load admin settings');
      } finally {
        setAdminLoading(false);
      }
    };

    loadAdminData();
  }, [isAdmin]);

  const tabs = useMemo(() => {
    const baseTabs = [
      { id: 'profile', label: 'Profile', icon: User },
      { id: 'security', label: 'Security', icon: Shield },
    ];

    if (isAdmin) {
      baseTabs.push(
        { id: 'system', label: 'System', icon: Wrench },
        { id: 'audit', label: 'Audit', icon: Bell }
      );
    }

    return baseTabs;
  }, [isAdmin]);

  const handleProfileSave = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await updateMyProfile({
        fullName: profileData.fullName,
        phone: profileData.phone,
      });
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSave = async (event) => {
    event.preventDefault();
    if (!passwordData.currentPassword || !passwordData.newPassword) {
      toast.error('Current and new password are required.');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('New password and confirm password must match.');
      return;
    }

    setLoading(true);
    try {
      await changeMyPassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      toast.success('Password updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const handleSystemSave = async () => {
    setLoading(true);
    try {
      await updateSettings({
        settings: {
          system: settingsState.system,
        },
      });
      toast.success('System settings saved');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save system settings');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminResetPassword = async (event) => {
    event.preventDefault();
    if (!resetPasswordData.newPassword) {
      toast.error('New password is required.');
      return;
    }

    if (!resetPasswordData.userId && (!resetPasswordData.email || !resetPasswordData.role)) {
      toast.error('Select a user or provide email and role.');
      return;
    }

    setLoading(true);
    try {
      await adminResetUserPassword({
        userId: resetPasswordData.userId || null,
        email: resetPasswordData.email || null,
        role: resetPasswordData.role || null,
        newPassword: resetPasswordData.newPassword,
      });
      setResetPasswordData((current) => ({
        ...current,
        newPassword: '',
      }));
      const logsRes = await getSettingsAuditLogs({ limit: 20 });
      setAuditLogs(logsRes.data?.data || logsRes.data?.logs || []);
      toast.success('User password reset successfully');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reset user password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100">
          <div className="flex flex-wrap gap-1 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[#002366] text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSave} className="space-y-6">
              <div>
                <h3 className="mb-4 text-lg font-semibold text-gray-900">Personal Information</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Full Name</label>
                    <input
                      type="text"
                      value={profileData.fullName}
                      onChange={(event) => setProfileData((current) => ({ ...current, fullName: event.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      value={profileData.email}
                      disabled
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
                    <input
                      type="tel"
                      value={profileData.phone}
                      onChange={(event) => setProfileData((current) => ({ ...current, phone: event.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                    <input
                      type="text"
                      value={user?.role || ''}
                      disabled
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-500"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg bg-[#002366] px-4 py-2 text-white hover:bg-[#001a4d]"
                >
                  <Save className="h-4 w-4" />
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <form onSubmit={handlePasswordSave} className="space-y-4 rounded-2xl border border-gray-200 p-5">
                <h3 className="text-lg font-semibold text-gray-900">Change Password</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <input
                    type="password"
                    placeholder="Current password"
                    value={passwordData.currentPassword}
                    onChange={(event) => setPasswordData((current) => ({ ...current, currentPassword: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                  />
                  <input
                    type="password"
                    placeholder="New password"
                    value={passwordData.newPassword}
                    onChange={(event) => setPasswordData((current) => ({ ...current, newPassword: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                  />
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={passwordData.confirmPassword}
                    onChange={(event) => setPasswordData((current) => ({ ...current, confirmPassword: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg bg-[#002366] px-4 py-2 text-white hover:bg-[#001a4d]"
                  >
                    {loading ? 'Saving...' : 'Update Password'}
                  </button>
                </div>
              </form>

              {isAdmin && (
                <AdminSectionCard
                  title="Admin Password Reset"
                  subtitle="Reset credentials for any portal user and record the action in the audit log."
                >
                  <form onSubmit={handleAdminResetPassword} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Select user</label>
                        <select
                          value={resetPasswordData.userId}
                          onChange={(event) => {
                            const selectedUser = managedUsers.find((entry) => String(entry.userId) === event.target.value);
                            setResetPasswordData({
                              userId: event.target.value,
                              email: selectedUser?.email || '',
                              role: selectedUser?.role || 'parent',
                              newPassword: resetPasswordData.newPassword,
                            });
                          }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                        >
                          <option value="">Select a user</option>
                          {managedUsers.map((managedUser) => (
                            <option key={managedUser.userId} value={managedUser.userId}>
                              {managedUser.fullName} ({managedUser.role})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">New password</label>
                        <input
                          type="password"
                          value={resetPasswordData.newPassword}
                          onChange={(event) => setResetPasswordData((current) => ({ ...current, newPassword: event.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <input
                        type="email"
                        placeholder="Fallback email"
                        value={resetPasswordData.email}
                        onChange={(event) => setResetPasswordData((current) => ({ ...current, email: event.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                      />
                      <select
                        value={resetPasswordData.role}
                        onChange={(event) => setResetPasswordData((current) => ({ ...current, role: event.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                      >
                        <option value="admin">Admin</option>
                        <option value="teacher">Teacher</option>
                        <option value="student">Student</option>
                        <option value="parent">Parent</option>
                        <option value="accountant">Accountant</option>
                      </select>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-white hover:bg-rose-700"
                      >
                        <KeyRound className="h-4 w-4" />
                        {loading ? 'Resetting...' : 'Reset Password'}
                      </button>
                    </div>
                  </form>
                </AdminSectionCard>
              )}
            </div>
          )}

          {activeTab === 'system' && isAdmin && (
            <div className="space-y-6">
              <AdminSectionCard
                title="System Configuration"
                subtitle="Manage visible school metadata and global feature toggles from SQL-backed settings."
              >
                {adminLoading ? (
                  <p className="text-sm text-gray-500">Loading system settings...</p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <input
                        type="text"
                        placeholder="School name"
                        value={settingsState.system.schoolName}
                        onChange={(event) => setSettingsState((current) => ({
                          ...current,
                          system: { ...current.system, schoolName: event.target.value },
                        }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                      />
                      <input
                        type="text"
                        placeholder="Academic year"
                        value={settingsState.system.academicYear}
                        onChange={(event) => setSettingsState((current) => ({
                          ...current,
                          system: { ...current.system, academicYear: event.target.value },
                        }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                      />
                      <input
                        type="text"
                        placeholder="App version"
                        value={settingsState.system.appVersion}
                        onChange={(event) => setSettingsState((current) => ({
                          ...current,
                          system: { ...current.system, appVersion: event.target.value },
                        }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                      />
                      <input
                        type="email"
                        placeholder="Contact email"
                        value={settingsState.system.contactEmail}
                        onChange={(event) => setSettingsState((current) => ({
                          ...current,
                          system: { ...current.system, contactEmail: event.target.value },
                        }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                      />
                      <input
                        type="text"
                        placeholder="Contact phone"
                        value={settingsState.system.contactPhone}
                        onChange={(event) => setSettingsState((current) => ({
                          ...current,
                          system: { ...current.system, contactPhone: event.target.value },
                        }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                      />
                      <input
                        type="text"
                        placeholder="School address"
                        value={settingsState.system.address}
                        onChange={(event) => setSettingsState((current) => ({
                          ...current,
                          system: { ...current.system, address: event.target.value },
                        }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#002366]"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <label className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
                        <span className="text-sm font-medium text-gray-700">Notifications Enabled</span>
                        <input
                          type="checkbox"
                          checked={settingsState.system.notificationsEnabled}
                          onChange={(event) => setSettingsState((current) => ({
                            ...current,
                            system: { ...current.system, notificationsEnabled: event.target.checked },
                          }))}
                          className="h-5 w-5 rounded text-[#002366] focus:ring-[#002366]"
                        />
                      </label>
                      <label className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
                        <span className="text-sm font-medium text-gray-700">Parent Portal Enabled</span>
                        <input
                          type="checkbox"
                          checked={settingsState.system.parentPortalEnabled}
                          onChange={(event) => setSettingsState((current) => ({
                            ...current,
                            system: { ...current.system, parentPortalEnabled: event.target.checked },
                          }))}
                          className="h-5 w-5 rounded text-[#002366] focus:ring-[#002366]"
                        />
                      </label>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSystemSave}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#002366] px-4 py-2 text-white hover:bg-[#001a4d]"
                      >
                        <Save className="h-4 w-4" />
                        {loading ? 'Saving...' : 'Save System Settings'}
                      </button>
                    </div>
                  </div>
                )}
              </AdminSectionCard>
            </div>
          )}

          {activeTab === 'audit' && isAdmin && (
            <AdminSectionCard
              title="Audit Log"
              subtitle="Track sensitive administrative actions like system updates and password resets."
            >
              {adminLoading ? (
                <p className="text-sm text-gray-500">Loading audit log...</p>
              ) : auditLogs.length ? (
                <div className="space-y-3">
                  {auditLogs.map((log) => (
                    <div key={log.auditLogId} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{log.summary || log.actionName}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {log.actorFullName || 'System'} • {log.actorRole || 'system'} • {log.entityName}
                          </p>
                        </div>
                        <p className="text-xs text-gray-400">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString('en-IN') : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No audit log entries found yet.</p>
              )}
            </AdminSectionCard>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
