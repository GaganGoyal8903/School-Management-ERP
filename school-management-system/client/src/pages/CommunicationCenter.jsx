import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { MessageSquare, Send, Users } from 'lucide-react';
import {
  getPortalContacts,
  getPortalConversations,
  getPortalConversationMessages,
  sendPortalMessage,
} from '../services/api';

export default function CommunicationCenter() {
  const [contacts, setContacts] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [newRecipientId, setNewRecipientId] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const loadBase = async () => {
    try {
      setLoading(true);
      const [contactsRes, conversationsRes] = await Promise.all([
        getPortalContacts(),
        getPortalConversations(),
      ]);
      setContacts(contactsRes.data?.data || []);
      setConversations(conversationsRes.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load communication center');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    const loadMessages = async () => {
      if (!selectedConversation?.conversationId) {
        setMessages([]);
        return;
      }

      try {
        const response = await getPortalConversationMessages(selectedConversation.conversationId);
        setMessages(response.data?.data || []);
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to load conversation');
      }
    };

    loadMessages();
  }, [selectedConversation]);

  const selectedRecipient = useMemo(
    () => contacts.find((contact) => String(contact.userId) === String(newRecipientId)) || null,
    [contacts, newRecipientId]
  );

  const handleSend = async () => {
    if (!messageDraft.trim()) {
      return;
    }

    const payload = selectedConversation
      ? {
          recipientUserId: selectedConversation.participantUserId,
          subject: selectedConversation.subject,
          body: messageDraft,
          studentId: selectedConversation.studentId || null,
        }
      : {
          recipientUserId: newRecipientId,
          subject: newSubject,
          body: messageDraft,
        };

    if (!payload.recipientUserId) {
      toast.error('Choose a contact first.');
      return;
    }

    try {
      setSending(true);
      const response = await sendPortalMessage(payload);
      setMessages(response.data?.data || []);
      setMessageDraft('');
      setNewSubject('');
      setNewRecipientId('');
      await loadBase();
      toast.success('Message sent');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-6 px-4 py-6 md:px-8">
      <header className="rounded-[2rem] border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Communication Center</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Direct messaging</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Keep parents, teachers, admins, and finance stakeholders aligned through one SQL-backed message stream.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-[#002366]" />
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Conversations</h2>
                <p className="text-sm text-slate-500">Recent threads and quick start</p>
              </div>
            </div>
          </div>
          <div className="space-y-3 px-6 py-5">
            <div className="rounded-2xl bg-slate-50 p-4">
              <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Start new message</label>
              <select
                value={newRecipientId}
                onChange={(event) => setNewRecipientId(event.target.value)}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
              >
                <option value="">Select recipient</option>
                {contacts.map((contact) => (
                  <option key={contact.userId} value={contact.userId}>
                    {contact.fullName} ({contact.role})
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newSubject}
                onChange={(event) => setNewSubject(event.target.value)}
                placeholder="Subject"
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
              />
              {selectedRecipient ? (
                <p className="mt-3 text-xs text-slate-500">Messaging {selectedRecipient.fullName} directly.</p>
              ) : null}
            </div>

            <div className="space-y-3">
              {loading ? (
                <p className="text-sm text-slate-500">Loading conversations...</p>
              ) : conversations.length ? (
                conversations.map((conversation) => (
                  <button
                    key={conversation.conversationId}
                    type="button"
                    onClick={() => setSelectedConversation(conversation)}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                      selectedConversation?.conversationId === conversation.conversationId
                        ? 'border-[#002366] bg-[#002366] text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">{conversation.participantFullName || conversation.subject || 'Conversation'}</p>
                        <p className={`mt-1 text-xs ${selectedConversation?.conversationId === conversation.conversationId ? 'text-white/75' : 'text-slate-500'}`}>
                          {conversation.participantRoleName || 'contact'}
                        </p>
                      </div>
                      <span className={`text-xs ${selectedConversation?.conversationId === conversation.conversationId ? 'text-white/80' : 'text-slate-400'}`}>
                        {conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleDateString('en-IN') : ''}
                      </span>
                    </div>
                    <p className={`mt-3 line-clamp-2 text-sm ${selectedConversation?.conversationId === conversation.conversationId ? 'text-white/90' : 'text-slate-600'}`}>
                      {conversation.latestMessage || 'Open this conversation to continue the thread.'}
                    </p>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                  No conversations yet.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-[#002366]" />
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {selectedConversation ? selectedConversation.participantFullName : 'Compose a message'}
                </h2>
                <p className="text-sm text-slate-500">
                  {selectedConversation ? (selectedConversation.subject || 'Active conversation') : 'Choose a conversation or start a new one'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex min-h-[34rem] flex-col px-6 py-5">
            <div className="flex-1 space-y-3 overflow-y-auto rounded-3xl bg-slate-50 p-4">
              {messages.length ? (
                messages.map((message) => (
                  <div key={message.messageId} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-semibold text-slate-900">{message.senderFullName}</p>
                      <span className="text-xs text-slate-400">
                        {message.createdAt ? new Date(message.createdAt).toLocaleString('en-IN') : ''}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{message.body}</p>
                  </div>
                ))
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  No messages yet. Start the conversation below.
                </div>
              )}
            </div>

            <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
              <textarea
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                rows={4}
                placeholder="Write your message"
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none"
              />
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#002366] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  {sending ? 'Sending...' : 'Send message'}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
