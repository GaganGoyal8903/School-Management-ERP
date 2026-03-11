import { useState, useMemo, useEffect } from "react";
import toast from "react-hot-toast";
import { MessageSquare, Send, User, Clock, Search, Plus, X } from "lucide-react";
import CrestLogo from "./CrestLogo";

export default function TeacherCommunication() {
  const [sms_conversations, setSms_conversations] = useState([]);
  const [sms_selectedConversation, setSms_selectedConversation] = useState(null);
  const [sms_message, setSms_message] = useState("");
  const [sms_loading, setSms_loading] = useState(true);
  const [sms_sending, setSms_sending] = useState(false);
  const [sms_searchQuery, setSms_searchQuery] = useState("");
  const [sms_showNewMessage, setSms_showNewMessage] = useState(false);
  const [sms_newRecipient, setSms_newRecipient] = useState("");
  const [sms_newSubject, setSms_newSubject] = useState("");

  // Mock conversations
  const mockConversations = [
    {
      id: 1,
      participant: "Vikram Rathore",
      role: "Teacher",
      subject: "Mathematics - Progress Update",
      lastMessage: "Your child is making good progress in algebra.",
      timestamp: "2024-01-24T10:30:00",
      unread: 2,
      messages: [
        { id: 1, sender: "teacher", text: "Hello, I wanted to discuss your child's progress in Mathematics.", time: "2024-01-24T09:00:00" },
        { id: 2, sender: "parent", text: "Thank you for reaching out. How is he performing?", time: "2024-01-24T09:15:00" },
        { id: 3, sender: "teacher", text: "Your child is making good progress in algebra. They score well in class tests.", time: "2024-01-24T10:30:00" },
      ]
    },
    {
      id: 2,
      participant: "Arjun Pratap",
      role: "Teacher",
      subject: "Science - Lab Performance",
      lastMessage: "Please ensure they complete the lab report on time.",
      timestamp: "2024-01-23T14:00:00",
      unread: 0,
      messages: [
        { id: 1, sender: "teacher", text: "Your child performed well in the Chemistry lab experiment.", time: "2024-01-23T13:00:00" },
        { id: 2, sender: "parent", text: "That's great to hear! Any areas for improvement?", time: "2024-01-23T13:30:00" },
        { id: 3, sender: "teacher", text: "Please ensure they complete the lab report on time.", time: "2024-01-23T14:00:00" },
      ]
    },
    {
      id: 3,
      participant: "Sarah Mitchell",
      role: "Teacher",
      subject: "English - Essay Submission",
      lastMessage: "The essay has been submitted successfully.",
      timestamp: "2024-01-22T16:45:00",
      unread: 0,
      messages: [
        { id: 1, sender: "parent", text: "When is the essay submission deadline?", time: "2024-01-22T15:00:00" },
        { id: 2, sender: "teacher", text: "The essay has been submitted successfully.", time: "2024-01-22T16:45:00" },
      ]
    },
  ];

  useEffect(() => {
    setTimeout(() => {
      setSms_conversations(mockConversations);
      setSms_loading(false);
    }, 500);
  }, []);

  const filteredConversations = useMemo(() => {
    return sms_conversations.filter(conv => 
      conv.participant.toLowerCase().includes(sms_searchQuery.toLowerCase()) ||
      conv.subject.toLowerCase().includes(sms_searchQuery.toLowerCase())
    );
  }, [sms_conversations, sms_searchQuery]);

  const handleSendMessage = () => {
    if (!sms_message.trim() || !sms_selectedConversation) return;
    setSms_sending(true);

    setTimeout(() => {
      const updatedConversations = sms_conversations.map(conv => {
        if (conv.id === sms_selectedConversation.id) {
          return {
            ...conv,
            lastMessage: sms_message,
            timestamp: new Date().toISOString(),
            messages: [
              ...conv.messages,
              { id: Date.now(), sender: "parent", text: sms_message, time: new Date().toISOString() }
            ]
          };
        }
        return conv;
      });
      setSms_conversations(updatedConversations);
      setSms_selectedConversation(updatedConversations.find(c => c.id === sms_selectedConversation.id));
      setSms_message("");
      setSms_sending(false);
      toast.success("Message sent successfully!");
    }, 500);
  };

  const handleNewMessage = () => {
    if (!sms_newRecipient.trim() || !sms_newSubject.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    toast.success("Message sent!");
    setSms_showNewMessage(false);
    setSms_newRecipient("");
    setSms_newSubject("");
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return "Yesterday";
    if (days < 7) return date.toLocaleDateString('en-IN', { weekday: 'short' });
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const totalUnread = sms_conversations.reduce((sum, c) => sum + c.unread, 0);

  return (
    <section className="min-h-screen bg-transparent px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="page-card p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CrestLogo sizeClass="h-12 w-12" className="border-2 border-[#c5a059] bg-[#fffbf2]" imgClassName="h-full w-full rounded-full object-contain p-0.5" />
              <div>
                <h1 className="text-2xl font-bold text-[#002366]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  Teacher Communication
                </h1>
                <p className="mt-1 text-sm text-slate-600">Communicate with your child's teachers.</p>
              </div>
            </div>
            <button
              onClick={() => setSms_showNewMessage(true)}
              className="flex items-center gap-2 rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003399]"
            >
              <Plus size={16} /> New Message
            </button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="page-card p-4">
            <p className="text-sm text-slate-600">Total Messages</p>
            <p className="text-2xl font-bold text-[#002366]">{sms_conversations.length}</p>
          </div>
          <div className="page-card p-4">
            <p className="text-sm text-slate-600">Unread</p>
            <p className="text-2xl font-bold text-amber-600">{totalUnread}</p>
          </div>
          <div className="page-card p-4">
            <p className="text-sm text-slate-600">Teachers</p>
            <p className="text-2xl font-bold text-green-600">{new Set(sms_conversations.map(c => c.participant)).size}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3" style={{ minHeight: '500px' }}>
          {/* Conversation List */}
          <div className="page-card p-4 md:col-span-1">
            <div className="mb-3 flex items-center gap-2">
              <Search size={16} className="text-slate-500" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={sms_searchQuery}
                onChange={(e) => setSms_searchQuery(e.target.value)}
                className="flex-1 rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-1.5 text-sm outline-none focus:border-[#c5a059]"
              />
            </div>
            
            <div className="space-y-2">
              {sms_loading ? (
                <div className="py-8 text-center text-slate-500">Loading...</div>
              ) : filteredConversations.length === 0 ? (
                <div className="py-8 text-center text-slate-500">No conversations</div>
              ) : (
                filteredConversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => setSms_selectedConversation(conv)}
                    className={`cursor-pointer rounded-lg p-3 transition ${
                      sms_selectedConversation?.id === conv.id
                        ? "bg-[#002366] text-white"
                        : "bg-[#fffff0] hover:bg-[#fff7e6]"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                          sms_selectedConversation?.id === conv.id ? "bg-white text-[#002366]" : "bg-[#002366] text-white"
                        }`}>
                          {conv.participant.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{conv.participant}</p>
                          <p className={`text-xs ${sms_selectedConversation?.id === conv.id ? "text-gray-300" : "text-slate-500"}`}>
                            {conv.role}
                          </p>
                        </div>
                      </div>
                      {conv.unread > 0 && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          sms_selectedConversation?.id === conv.id ? "bg-white text-[#002366]" : "bg-amber-100 text-amber-700"
                        }`}>
                          {conv.unread}
                        </span>
                      )}
                    </div>
                    <p className={`mt-2 text-xs line-clamp-1 ${
                      sms_selectedConversation?.id === conv.id ? "text-gray-300" : "text-slate-600"
                    }`}>
                      {conv.subject}
                    </p>
                    <p className={`mt-1 text-xs ${
                      sms_selectedConversation?.id === conv.id ? "text-gray-400" : "text-slate-500"
                    }`}>
                      {formatTime(conv.timestamp)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Message View */}
          <div className="page-card p-4 md:col-span-2 flex flex-col">
            {sms_selectedConversation ? (
              <>
                <div className="border-b border-[#d8c08a] pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-full bg-[#002366] text-white flex items-center justify-center font-semibold">
                      {sms_selectedConversation.participant.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-[#002366]">{sms_selectedConversation.participant}</p>
                      <p className="text-xs text-slate-500">{sms_selectedConversation.role} • {sms_selectedConversation.subject}</p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 mb-3">
                  {sms_selectedConversation.messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender === "parent" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] rounded-lg p-3 ${
                        msg.sender === "parent" 
                          ? "bg-[#002366] text-white" 
                          : "bg-[#fffff0] border border-[#d8c08a] text-slate-700"
                      }`}>
                        <p className="text-sm">{msg.text}</p>
                        <p className={`text-xs mt-1 ${msg.sender === "parent" ? "text-gray-400" : "text-slate-500"}`}>
                          {formatTime(msg.time)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sms_message}
                    onChange={(e) => setSms_message(e.target.value)}
                    placeholder="Type your message..."
                    className="flex-1 rounded-lg border border-[#d8c08a] bg-[#fffff0] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                    onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={sms_sending || !sms_message.trim()}
                    className="flex items-center gap-2 rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003399] disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <MessageSquare size={48} className="mx-auto mb-2 opacity-50" />
                  <p>Select a conversation to view messages</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* New Message Modal */}
        {sms_showNewMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[#002366]">New Message</h3>
                <button onClick={() => setSms_showNewMessage(false)} className="text-slate-400 hover:text-slate-600 text-xl">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">To (Teacher) *</label>
                  <select
                    value={sms_newRecipient}
                    onChange={(e) => setSms_newRecipient(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                  >
                    <option value="">Select teacher</option>
                    <option value="vikram">Vikram Rathore - Mathematics</option>
                    <option value="arjun">Arjun Pratap - Science</option>
                    <option value="sarah">Sarah Mitchell - English</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Subject *</label>
                  <input
                    type="text"
                    value={sms_newSubject}
                    onChange={(e) => setSms_newSubject(e.target.value)}
                    placeholder="Message subject"
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Message *</label>
                  <textarea
                    rows={4}
                    placeholder="Type your message..."
                    className="mt-1 w-full rounded-lg border border-[#d8c08a] px-3 py-2 text-sm outline-none focus:border-[#c5a059]"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setSms_showNewMessage(false)}
                    className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleNewMessage}
                    className="flex-1 rounded-lg bg-[#002366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#003399]"
                  >
                    Send Message
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

