import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../services/api';

const StaffDashboard = () => {
  const [handoffs, setHandoffs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState('');
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [targetUser, setTargetUser] = useState('');
  const [manualSummary, setManualSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const activeHandoff = useMemo(() => selected || handoffs[0] || null, [selected, handoffs]);

  const loadHandoffs = async () => {
    try {
      const data = await api.getPendingHandoffs();
      setHandoffs(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Could not load human fallback jobs.');
    } finally {
      setLoading(false);
    }
  };

  const loadSessionMessages = async (sessionId) => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    try {
      const data = await api.getSessionMessages(sessionId);
      setMessages(data.messages || []);
    } catch (err) {
      toast.error('Could not load fallback session.');
    }
  };

  useEffect(() => {
    loadHandoffs();
    const interval = setInterval(loadHandoffs, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeHandoff) return;
    loadSessionMessages(activeHandoff.session_id);
  }, [activeHandoff?.session_id]);

  const handleSelect = async (handoff) => {
    setSelected(handoff);
    setManualSummary(null);
    setSummary('');
    try {
      const data = await api.getHandoffSummary(handoff.user_id);
      setSummary(data.handoff_summary || '');
    } catch (err) {
      setSummary('No handoff summary available.');
    }
  };

  const handleAccept = async (handoff) => {
    try {
      const result = await api.updateHandoffStatus(handoff.trace_id, 'accepted');
      const next = { ...handoff, ...result, handoff_status: 'accepted' };
      setSelected(next);
      await handleSelect(next);
      toast.success('Fallback job accepted.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not accept fallback job.');
    }
  };

  const handleBusy = async (handoff) => {
    try {
      await api.updateHandoffStatus(handoff.trace_id, 'busy');
      toast.success('Marked as busy.');
      loadHandoffs();
    } catch (err) {
      toast.error('Could not update handoff status.');
    }
  };

  const handleSendReply = async () => {
    if (!selected?.trace_id || !reply.trim()) return;
    setSending(true);
    try {
      await api.sendHandoffReply(selected.trace_id, reply.trim());
      setReply('');
      await loadSessionMessages(selected.session_id);
      toast.success('Reply sent to the student chat.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not send reply.');
    } finally {
      setSending(false);
    }
  };

  const handleManualSearch = async (event) => {
    event.preventDefault();
    if (!targetUser.trim()) return;
    try {
      const data = await api.getHandoffSummary(targetUser.trim());
      setManualSummary(data.handoff_summary);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No handoff context found.');
    }
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-50/50">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="border-b-4 border-primary pb-4">
          <h1 className="text-3xl font-black text-primary tracking-tight">Staff / Human Fallback</h1>
          <p className="text-slate-500 font-medium mt-1">
            Admin and editor accounts can accept fallback jobs, inspect the session, and reply inside the student's chat.
          </p>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          <aside className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Fallback Jobs</h2>
                <p className="text-xs text-slate-500 mt-1">{handoffs.length} pending</p>
              </div>
              <button onClick={loadHandoffs} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase text-primary">
                Refresh
              </button>
            </div>

            <div className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
              {loading ? (
                <p className="p-5 text-sm text-slate-500">Loading jobs...</p>
              ) : handoffs.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">No human fallback jobs right now.</p>
              ) : handoffs.map((handoff) => (
                <button
                  key={handoff.trace_id}
                  onClick={() => handleSelect(handoff)}
                  className={`w-full text-left p-4 hover:bg-slate-50 ${activeHandoff?.trace_id === handoff.trace_id ? 'bg-blue-50/60' : ''}`}
                >
                  <p className="text-sm font-black text-slate-900 truncate">{handoff.user_id}</p>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{handoff.input || 'No captured question'}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded text-[10px] font-black uppercase">
                      {handoff.escalation_level || 'fallback'}
                    </span>
                    <span className="text-[10px] text-slate-400">{formatDate(handoff.timestamp)}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <main className="space-y-6">
            {activeHandoff ? (
              <>
                <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-black text-slate-900">{activeHandoff.user_id}</h2>
                      <p className="text-sm text-slate-500 mt-1">{activeHandoff.input}</p>
                      {activeHandoff.escalation_reason && (
                        <p className="text-xs text-amber-700 mt-2">{activeHandoff.escalation_reason}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAccept(activeHandoff)} className="px-4 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest">
                        Accept
                      </button>
                      <button onClick={() => handleBusy(activeHandoff)} className="px-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest">
                        Busy
                      </button>
                    </div>
                  </div>
                </section>

                <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100">
                      <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Session Chat</h3>
                    </div>
                    <div className="h-[420px] overflow-y-auto p-4 space-y-3 bg-slate-50/60">
                      {messages.length === 0 ? (
                        <p className="text-sm text-slate-500">No session messages found.</p>
                      ) : messages.map((message, index) => (
                        <div key={message.id || index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-6 ${message.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}>
                            <p className="whitespace-pre-wrap">{message.content}</p>
                            <p className="text-[10px] opacity-60 mt-2">{formatDate(message.timestamp)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-4 border-t border-slate-100 bg-white">
                      <textarea
                        className="w-full min-h-24 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Type a human advisor reply for this student..."
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                      />
                      <button
                        onClick={handleSendReply}
                        disabled={sending || !reply.trim()}
                        className="mt-3 px-4 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        Send to Student Chat
                      </button>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100">
                      <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Handoff Summary</h3>
                    </div>
                    <pre className="p-4 text-xs text-slate-700 whitespace-pre-wrap h-[560px] overflow-y-auto font-mono">{summary || 'Select a job to load context.'}</pre>
                  </div>
                </section>
              </>
            ) : (
              <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
                <h2 className="text-xl font-black text-slate-900">No fallback selected</h2>
                <p className="text-sm text-slate-500 mt-2">When AI cannot safely answer, a job appears here for admin/editor review.</p>
              </section>
            )}

            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Manual Student Lookup</h2>
              <form onSubmit={handleManualSearch} className="mt-4 flex flex-col md:flex-row gap-3">
                <input
                  className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="student@email.com"
                  value={targetUser}
                  onChange={(event) => setTargetUser(event.target.value)}
                />
                <button className="px-4 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest">
                  Load Summary
                </button>
              </form>
              {manualSummary && (
                <pre className="mt-4 p-4 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-700 whitespace-pre-wrap max-h-80 overflow-y-auto font-mono">
                  {manualSummary}
                </pre>
              )}
            </section>
          </main>
        </section>
      </div>
    </div>
  );
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export default StaffDashboard;
