import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarClock, CheckCircle2, ExternalLink, PlayCircle, XCircle } from 'lucide-react';
import {
  createPortalMeeting,
  getPortalContacts,
  getPortalMeetings,
  reviewPortalMeeting,
  cancelPortalMeeting,
} from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Meetings() {
  const { isParent, isTeacher, isAdmin } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scheduleDrafts, setScheduleDrafts] = useState({});
  const [form, setForm] = useState({
    teacherUserId: '',
    title: '',
    subject: '',
    requestedDate: '',
    requestedTime: '',
    meetingMode: 'offline',
    description: '',
    parentNotes: '',
  });

  const teacherContacts = useMemo(
    () => contacts.filter((contact) => contact.role === 'teacher'),
    [contacts]
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const [contactsRes, meetingsRes] = await Promise.all([
        getPortalContacts().catch(() => ({ data: { data: [] } })),
        getPortalMeetings(),
      ]);
      setContacts(contactsRes.data?.data || []);
      const nextMeetings = meetingsRes.data?.data || [];
      setMeetings(nextMeetings);
      setScheduleDrafts((current) => {
        const nextDrafts = { ...current };
        nextMeetings.forEach((meeting) => {
          if (!nextDrafts[meeting.meetingId]) {
            nextDrafts[meeting.meetingId] = {
              meetingDate: meeting.meetingDate ? String(meeting.meetingDate).split('T')[0] : '',
              meetingTime: meeting.meetingTime || '',
              meetingLink: meeting.meetingLink || '',
              teacherNotes: meeting.teacherNotes || '',
            };
          }
        });
        return nextDrafts;
      });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateMeeting = async () => {
    if (!form.teacherUserId || !form.title || !form.requestedDate) {
      toast.error('Teacher, title, and requested date are required.');
      return;
    }

    try {
      setSaving(true);
      await createPortalMeeting(form);
      setForm({
        teacherUserId: '',
        title: '',
        subject: '',
        requestedDate: '',
        requestedTime: '',
        meetingMode: 'offline',
        description: '',
        parentNotes: '',
      });
      await loadData();
      toast.success('Meeting request submitted');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to request meeting');
    } finally {
      setSaving(false);
    }
  };

  const updateScheduleDraft = (meetingId, key, value) => {
    setScheduleDrafts((current) => ({
      ...current,
      [meetingId]: {
        ...(current[meetingId] || {}),
        [key]: value,
      },
    }));
  };

  const handleReview = async (meetingId, status) => {
    try {
      const draft = scheduleDrafts[meetingId] || {};
      await reviewPortalMeeting(meetingId, {
        status,
        meetingDate: draft.meetingDate || null,
        meetingTime: draft.meetingTime || null,
        meetingLink: draft.meetingLink || null,
        teacherNotes: draft.teacherNotes || null,
      });
      await loadData();
      toast.success(`Meeting ${status}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to review meeting');
    }
  };

  const handleCancel = async (meetingId) => {
    try {
      await cancelPortalMeeting(meetingId, { notes: 'Cancelled from portal.' });
      await loadData();
      toast.success('Meeting cancelled');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel meeting');
    }
  };

  const handleStartMeeting = async (meeting) => {
    if (!meeting || meeting.status !== 'approved') {
      toast.error('Only approved meetings can be started.');
      return;
    }

    if (meeting.meetingMode === 'online') {
      const draft = scheduleDrafts[meeting.meetingId] || {};
      const resolvedMeetingLink = meeting.meetingLink || draft.meetingLink || '';

      if (!resolvedMeetingLink) {
        toast.error(
          isParent
            ? 'The meeting link has not been shared yet.'
            : 'Add a meeting link before starting the online meeting.'
        );
        return;
      }

      if ((isTeacher || isAdmin) && !meeting.meetingLink && draft.meetingLink) {
        try {
          await reviewPortalMeeting(meeting.meetingId, {
            status: 'approved',
            meetingDate: draft.meetingDate || meeting.meetingDate || null,
            meetingTime: draft.meetingTime || meeting.meetingTime || null,
            meetingLink: draft.meetingLink,
            teacherNotes: draft.teacherNotes || meeting.teacherNotes || null,
          });
          await loadData();
        } catch (error) {
          toast.error(error.response?.data?.message || 'Failed to save meeting link before starting');
          return;
        }
      }

      const openedWindow = window.open(resolvedMeetingLink, '_blank', 'noopener,noreferrer');
      if (!openedWindow) {
        try {
          await navigator.clipboard.writeText(resolvedMeetingLink);
          toast.success('Meeting link copied. Paste it into your browser to start the meeting.');
        } catch (error) {
          toast.error('Pop-up blocked. Please allow pop-ups and try again.');
        }
        return;
      }

      toast.success(isParent ? 'Meeting opened' : 'Meeting started');
      return;
    }

    const scheduledDate = meeting.meetingDate
      ? new Date(meeting.meetingDate).toLocaleDateString('en-IN')
      : 'the scheduled date';
    const scheduledTime = meeting.meetingTime || 'the scheduled time';
    toast.success(`Offline meeting is scheduled for ${scheduledDate} at ${scheduledTime}.`);
  };

  return (
    <section className="space-y-6 px-4 py-6 md:px-8">
      <header className="rounded-[2rem] border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">PTM Workflow</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Meetings and appointments</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Parents can request meetings, and teachers or admins can approve, reschedule, or reject them from one workflow.
        </p>
      </header>

      <div className={`grid gap-6 ${isParent ? 'xl:grid-cols-[0.9fr_1.1fr]' : 'xl:grid-cols-1'}`}>
        {isParent ? (
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-xl font-semibold text-slate-900">Request a meeting</h2>
              <p className="mt-1 text-sm text-slate-500">Submit a PTM request directly to a teacher.</p>
            </div>
            <div className="space-y-4 px-6 py-5">
              <select
                value={form.teacherUserId}
                onChange={(event) => setForm((current) => ({ ...current, teacherUserId: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
              >
                <option value="">Select teacher</option>
                {teacherContacts.map((teacher) => (
                  <option key={teacher.userId} value={teacher.userId}>
                    {teacher.fullName}
                  </option>
                ))}
              </select>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Meeting title"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
              />
              <input
                value={form.subject}
                onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                placeholder="Subject or concern"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
              />
              <div className="grid gap-4 md:grid-cols-2">
                <input
                  type="date"
                  value={form.requestedDate}
                  onChange={(event) => setForm((current) => ({ ...current, requestedDate: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                />
                <input
                  type="time"
                  value={form.requestedTime}
                  onChange={(event) => setForm((current) => ({ ...current, requestedTime: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                />
              </div>
              <select
                value={form.meetingMode}
                onChange={(event) => setForm((current) => ({ ...current, meetingMode: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
              >
                <option value="offline">Offline meeting</option>
                <option value="online">Online meeting</option>
              </select>
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                rows={4}
                placeholder="Share the context for the meeting"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
              />
              <button
                type="button"
                onClick={handleCreateMeeting}
                disabled={saving}
                className="rounded-2xl bg-[#002366] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Submitting...' : 'Request meeting'}
              </button>
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-xl font-semibold text-slate-900">Meeting queue</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isTeacher || isAdmin ? 'Approve, reject, or cancel requests.' : 'Track the status of your requests.'}
            </p>
          </div>
          <div className="space-y-4 px-6 py-5">
            {loading ? (
              <p className="text-sm text-slate-500">Loading meetings...</p>
            ) : meetings.length ? (
              meetings.map((meeting) => (
                <div key={meeting.meetingId} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-[#002366]" />
                        <p className="text-sm font-semibold text-slate-900">{meeting.title}</p>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {meeting.parentFullName || 'Parent'} with {meeting.teacherFullName || 'Teacher'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Requested: {meeting.requestedDate ? new Date(meeting.requestedDate).toLocaleDateString('en-IN') : '-'}
                        {meeting.requestedTime ? ` • ${meeting.requestedTime}` : ''}
                      </p>
                      {meeting.description ? (
                        <p className="mt-3 text-sm text-slate-600">{meeting.description}</p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize text-slate-700">
                      {meeting.status}
                    </span>
                  </div>

                  {(isTeacher || isAdmin) ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Schedule meeting</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <input
                          type="date"
                          value={scheduleDrafts[meeting.meetingId]?.meetingDate || ''}
                          onChange={(event) => updateScheduleDraft(meeting.meetingId, 'meetingDate', event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                        />
                        <input
                          type="time"
                          value={scheduleDrafts[meeting.meetingId]?.meetingTime || ''}
                          onChange={(event) => updateScheduleDraft(meeting.meetingId, 'meetingTime', event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                        />
                      </div>
                      <input
                        type="text"
                        value={scheduleDrafts[meeting.meetingId]?.meetingLink || ''}
                        onChange={(event) => updateScheduleDraft(meeting.meetingId, 'meetingLink', event.target.value)}
                        placeholder="Meeting link for online sessions"
                        className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                      />
                      <textarea
                        rows={3}
                        value={scheduleDrafts[meeting.meetingId]?.teacherNotes || ''}
                        onChange={(event) => updateScheduleDraft(meeting.meetingId, 'teacherNotes', event.target.value)}
                        placeholder="Teacher notes or scheduling instructions"
                        className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                      />

                      {meeting.status === 'pending' ? (
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => handleReview(meeting.meetingId, 'approved')}
                            className="inline-flex items-center gap-2 rounded-2xl bg-green-600 px-4 py-2 text-sm font-semibold text-white"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Approve and schedule
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReview(meeting.meetingId, 'rejected')}
                            className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
                          >
                            <XCircle className="h-4 w-4" />
                            Reject
                          </button>
                        </div>
                      ) : meeting.status === 'approved' ? (
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => handleReview(meeting.meetingId, 'approved')}
                            className="inline-flex items-center gap-2 rounded-2xl bg-[#002366] px-4 py-2 text-sm font-semibold text-white"
                          >
                            <CalendarClock className="h-4 w-4" />
                            Update schedule
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartMeeting(meeting)}
                            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                          >
                            <PlayCircle className="h-4 w-4" />
                            Start meeting
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : meeting.status === 'approved' ? (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => handleStartMeeting(meeting)}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[#002366] px-4 py-2 text-sm font-semibold text-white"
                      >
                        <PlayCircle className="h-4 w-4" />
                        {isParent ? 'Join meeting' : 'Start meeting'}
                      </button>
                      {meeting.meetingLink ? (
                        <a
                          href={meeting.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open link
                        </a>
                      ) : null}
                    </div>
                  ) : null}

                  {meeting.status !== 'cancelled' ? (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => handleCancel(meeting.meetingId)}
                        className="text-sm font-semibold text-slate-500 hover:text-slate-900"
                      >
                        Cancel meeting
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No meetings found.
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
