import { useState } from "react";
import toast from "react-hot-toast";
import { Settings, Save, Bell, Shield, Database, Palette, Mail, Globe, Lock, RefreshCw } from "lucide-react";
import CrestLogo from "./CrestLogo";

export default function SystemSettings() {
  const [sms_settings, setSms_settings] = useState({
    schoolName: "Mayo College, Ajmer",
    schoolCode: "MCA-2024",
    academicYear: "2024-2025",
    timezone: "Asia/Kolkata",
    language: "English",
    emailNotifications: true,
    smsNotifications: false,
    attendanceAlerts: true,
    feeReminders: true,
    maintenanceMode: false,
    darkMode: false,
    sessionTimeout: 30,
    passwordExpiry: 90,
    twoFactorAuth: false,
  });
  const [sms_saving, setSms_saving] = useState(false);

  const handleSave = () => {
    setSms_saving(true);
    setTimeout(() => {
      setSms_saving(false);
      toast.success("Settings saved successfully!");
    }, 1000);
  };

  const handleChange = (key, value) => {
    setSms_settings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <section className="min-h-screen bg-transparent px-4 py-6 md:px-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="page-card p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CrestLogo sizeClass="h-12 w-12" className="border-2 border-[#c5a059] bg-[#fffbf2]" imgClassName="h-full w-full rounded-full object-contain p-0.5" />
              <div>
                <h1 className="text-2xl font-bold text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  System Settings
                </h1>
                <p className="mt-1 text-sm text-slate-600">Configure system preferences and settings.</p>
              </div>
            </div>
            <span className="rounded-full border border-[#c5a059] bg-[#fff7e6] px-3 py-1 text-xs font-semibold text-[#8a6d3b]">
              Admin Panel
            </span>
          </div>
        </header>

        <div className="space-y-4">
          {/* General Settings */}
          <div className="page-card p-5 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="text-[#002366]" size={20} />
              <h2 className="text-lg font-semibold text-[#002366]">General Settings</h2>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">School Name</label>
                <input
                  type="text"
                  value={sms_settings.schoolName}
                  onChange={(e) => handleChange("schoolName", e.target.value)}
                  className="w-full rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">School Code</label>
                <input
                  type="text"
                  value={sms_settings.schoolCode}
                  onChange={(e) => handleChange("schoolCode", e.target.value)}
                  className="w-full rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Academic Year</label>
                <select
                  value={sms_settings.academicYear}
                  onChange={(e) => handleChange("academicYear", e.target.value)}
                  className="w-full rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                >
                  <option value="2023-2024">2023-2024</option>
                  <option value="2024-2025">2024-2025</option>
                  <option value="2025-2026">2025-2026</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
                <select
                  value={sms_settings.timezone}
                  onChange={(e) => handleChange("timezone", e.target.value)}
                  className="w-full rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notification Settings */}
          <div className="page-card p-5 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="text-[#002366]" size={20} />
              <h2 className="text-lg font-semibold text-[#002366]">Notification Settings</h2>
            </div>
            
            <div className="space-y-3">
              {[
                { key: "emailNotifications", label: "Email Notifications", desc: "Receive updates via email" },
                { key: "smsNotifications", label: "SMS Notifications", desc: "Receive updates via SMS" },
                { key: "attendanceAlerts", label: "Attendance Alerts", desc: "Get alerts for attendance issues" },
                { key: "feeReminders", label: "Fee Reminders", desc: "Receive fee payment reminders" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-[#fffff0] border border-[#d8c08a]">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sms_settings[item.key]}
                      onChange={(e) => handleChange(item.key, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#002366]"></div>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Security Settings */}
          <div className="page-card p-5 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="text-[#002366]" size={20} />
              <h2 className="text-lg font-semibold text-[#002366]">Security Settings</h2>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Session Timeout (minutes)</label>
                <input
                  type="number"
                  value={sms_settings.sessionTimeout}
                  onChange={(e) => handleChange("sessionTimeout", parseInt(e.target.value))}
                  className="w-full rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password Expiry (days)</label>
                <input
                  type="number"
                  value={sms_settings.passwordExpiry}
                  onChange={(e) => handleChange("passwordExpiry", parseInt(e.target.value))}
                  className="w-full rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-[#fffff0] border border-[#d8c08a]">
              <div>
                <p className="text-sm font-medium text-slate-900">Two-Factor Authentication</p>
                <p className="text-xs text-slate-500">Require 2FA for all users</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={sms_settings.twoFactorAuth}
                  onChange={(e) => handleChange("twoFactorAuth", e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#002366]"></div>
              </label>
            </div>
          </div>

          {/* System Actions */}
          <div className="page-card p-5 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="text-[#002366]" size={20} />
              <h2 className="text-lg font-semibold text-[#002366]">System Actions</h2>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <button className="flex items-center gap-2 rounded-lg border border-[#002366] bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003399]">
                <RefreshCw size={16} /> Clear Cache
              </button>
              <button className="flex items-center gap-2 rounded-lg border border-[#d8c08a] bg-[#fffff0] px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-[#fff7e6]">
                <Database size={16} /> Backup Database
              </button>
              <button className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">
                <Lock size={16} /> Maintenance Mode
              </button>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={sms_saving}
              className="flex items-center gap-2 rounded-lg border border-[#002366] bg-[#002366] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#003399] disabled:opacity-50"
            >
              <Save size={16} />
              {sms_saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

