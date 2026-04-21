import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { BellRing, Send } from 'lucide-react';
import {
  createPortalNotification,
  getPortalNotifications,
  markPortalNotificationRead,
} from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function NotificationsCenter() {
  const { isAdmin, isTeacher } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    title: '',
    message: '',
    type: 'info',
    audienceRoles: ['student', 'parent'],
  });

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const response = await getPortalNotifications({ limit: 30 });
      setNotifications(response.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      toast.error('Title and message are required.');
      return;
    }

    try {
      await createPortalNotification(form);
      setForm({
        title: '',
        message: '',
        type: 'info',
        audienceRoles: ['student', 'parent'],
      });
      await loadNotifications();
      toast.success('Notification sent');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send notification');
    }
  };

  const handleMarkRead = async (notificationId) => {
    try {
      const response = await markPortalNotificationRead(notificationId);
      setNotifications(response.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to mark notification as read');
    }
  };

  const toggleRole = (role) => {
    setForm((current) => ({
      ...current,
      audienceRoles: current.audienceRoles.includes(role)
        ? current.audienceRoles.filter((item) => item !== role)
        : [...current.audienceRoles, role],
    }));
  };

  return (
    <section className="space-y-6 px-4 py-6 md:px-8">
      <header className="rounded-[2rem] border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Notification Center</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Role-based alerts</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Deliver announcements and operational alerts to the right portal users with a real read-tracking inbox.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        {(isAdmin || isTeacher) ? (
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-xl font-semibold text-slate-900">Send a notification</h2>
              <p className="mt-1 text-sm text-slate-500">Target one or more portal audiences.</p>
            </div>
            <div className="space-y-4 px-6 py-5">
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Notification title"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
              />
              <textarea
                value={form.message}
                onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                rows={5}
                placeholder="Notification message"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
              />
              <select
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
              >
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
              <div className="flex flex-wrap gap-3">
                {['student', 'parent', 'teacher', 'accountant'].map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold capitalize ${
                      form.audienceRoles.includes(role)
                        ? 'bg-[#002366] text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleCreate}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#002366] px-5 py-3 text-sm font-semibold text-white"
              >
                <Send className="h-4 w-4" />
                Send notification
              </button>
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <BellRing className="h-5 w-5 text-[#002366]" />
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Inbox</h2>
                <p className="text-sm text-slate-500">Recent notifications for this account</p>
              </div>
            </div>
          </div>
          <div className="space-y-4 px-6 py-5">
            {loading ? (
              <p className="text-sm text-slate-500">Loading notifications...</p>
            ) : notifications.length ? (
              notifications.map((notification) => (
                <button
                  key={notification.notificationId}
                  type="button"
                  onClick={() => handleMarkRead(notification.notificationId)}
                  className={`w-full rounded-3xl border px-5 py-4 text-left ${
                    notification.isRead ? 'border-slate-200 bg-slate-50' : 'border-blue-200 bg-blue-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
                    {!notification.isRead ? (
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-blue-700">Unread</span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{notification.message}</p>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No notifications found.
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
