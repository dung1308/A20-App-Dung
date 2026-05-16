import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { useLanguage } from '../context/LanguageContext';

const StaffDashboard = () => {
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;
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
      toast.error(text.loadJobsError);
    } finally {
      setLoading(false);
    }
  };

  const loadHandoffMessages = async (traceId) => {
    if (!traceId) {
      setMessages([]);
      return;
    }
    try {
      const data = await api.getHandoffMessages(traceId);
      setMessages(data.messages || []);
    } catch (err) {
      toast.error(text.loadChatError);
    }
  };

  useEffect(() => {
    loadHandoffs();
    const interval = setInterval(loadHandoffs, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeHandoff) return;
    loadHandoffMessages(activeHandoff.trace_id);
    const interval = setInterval(() => loadHandoffMessages(activeHandoff.trace_id), 3000);
    return () => clearInterval(interval);
  }, [activeHandoff?.trace_id]);

  const handleSelect = async (handoff) => {
    setSelected(handoff);
    setManualSummary(null);
    setSummary('');
    try {
      const data = await api.getHandoffSummary(handoff.user_id);
      setSummary(data.handoff_summary || '');
    } catch (err) {
      setSummary(text.noSummary);
    }
  };

  const handleAccept = async (handoff) => {
    try {
      const result = await api.updateHandoffStatus(handoff.trace_id, 'accepted');
      const next = { ...handoff, ...result, handoff_status: 'accepted' };
      setSelected(next);
      await handleSelect(next);
      toast.success(text.accepted);
    } catch (err) {
      toast.error(err.response?.data?.detail || text.acceptError);
    }
  };

  const handleBusy = async (handoff) => {
    try {
      await api.updateHandoffStatus(handoff.trace_id, 'busy');
      toast.success(text.busy);
      loadHandoffs();
    } catch (err) {
      toast.error(text.statusError);
    }
  };

  const handleSendReply = async () => {
    const target = selected || activeHandoff;
    if (!target?.trace_id || !reply.trim()) return;
    setSending(true);
    try {
      const result = await api.sendHandoffMessage(target.trace_id, reply.trim());
      setReply('');
      if (result.message) {
        setMessages((current) => [...current, result.message]);
      } else {
        await loadHandoffMessages(target.trace_id);
      }
      const acceptedTarget = { ...target, handoff_status: 'accepted' };
      setSelected(acceptedTarget);
      setHandoffs((current) => current.map((handoff) =>
        handoff.trace_id === target.trace_id ? acceptedTarget : handoff
      ));
      toast.success(text.replySent);
    } catch (err) {
      toast.error(err.response?.data?.detail || text.replyError);
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
      toast.error(err.response?.data?.detail || text.lookupError);
    }
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-50/50">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="border-b-4 border-primary pb-4">
          <h1 className="text-3xl font-black text-primary tracking-tight">{text.title}</h1>
          <p className="text-slate-500 font-medium mt-1">
            {text.subtitle}
          </p>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          <aside className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">{text.jobs}</h2>
                <p className="text-xs text-slate-500 mt-1">{handoffs.length} {text.pending}</p>
              </div>
              <button onClick={loadHandoffs} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase text-primary">
                {text.refresh}
              </button>
            </div>

            <div className="divide-y divide-slate-100 max-h-[620px] overflow-y-auto">
              {loading ? (
                <p className="p-5 text-sm text-slate-500">{text.loadingJobs}</p>
              ) : handoffs.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">{text.noJobs}</p>
              ) : handoffs.map((handoff) => (
                <button
                  key={handoff.trace_id}
                  onClick={() => handleSelect(handoff)}
                  className={`w-full text-left p-4 hover:bg-slate-50 ${activeHandoff?.trace_id === handoff.trace_id ? 'bg-blue-50/60' : ''}`}
                >
                  <p className="text-sm font-black text-slate-900 truncate">{handoff.student_name || handoff.user_id}</p>
                  {handoff.student_name && <p className="text-[11px] text-slate-400 truncate">{handoff.user_id}</p>}
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{handoff.input || text.noQuestion}</p>
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
                      <h2 className="text-xl font-black text-slate-900">{activeHandoff.student_name || activeHandoff.user_id}</h2>
                      {activeHandoff.student_name && <p className="text-xs text-slate-400 mt-1">{activeHandoff.user_id}</p>}
                      <p className="text-sm text-slate-500 mt-1">{activeHandoff.input}</p>
                      {activeHandoff.escalation_reason && (
                        <p className="text-xs text-amber-700 mt-2">{activeHandoff.escalation_reason}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAccept(activeHandoff)}
                        className="px-4 py-3 bg-[#003466] text-white border border-[#003466] rounded-xl text-xs font-black uppercase tracking-widest shadow-sm shadow-blue-900/20 hover:bg-[#0b477f] active:scale-95 transition-all"
                      >
                        {text.accept}
                      </button>
                      <button onClick={() => handleBusy(activeHandoff)} className="px-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest">
                        {text.markBusy}
                      </button>
                    </div>
                  </div>
                </section>

                <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100">
                      <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">{text.chatTitle}</h3>
                    </div>
                    <div className="h-[420px] overflow-y-auto p-4 space-y-3 bg-slate-50/60">
                      {messages.length === 0 ? (
                        <p className="text-sm text-slate-500">{text.noMessages}</p>
                      ) : messages.map((message, index) => {
                        const isStaffMessage = message.role === 'staff' || message.sender_role === 'admin' || message.sender_role === 'editor';
                        return (
                        <div key={message.id || index} className={`flex ${isStaffMessage ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-6 ${isStaffMessage ? 'bg-primary text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}>
                            <p className="mb-1 text-[10px] font-black uppercase tracking-wider opacity-70">
                              {message.sender_name || (isStaffMessage ? text.staff : text.student)}
                            </p>
                            <p className="whitespace-pre-wrap">{message.content}</p>
                            <p className="text-[10px] opacity-60 mt-2">{formatDate(message.timestamp)}</p>
                          </div>
                        </div>
                      )})}
                    </div>
                    <div className="p-4 border-t border-slate-100 bg-white">
                      <textarea
                        className="w-full min-h-24 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder={text.replyPlaceholder}
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                      />
                      <button
                        onClick={handleSendReply}
                        disabled={sending || !reply.trim()}
                        className="mt-3 px-4 py-3 bg-[#003466] text-white border border-[#003466] rounded-xl text-xs font-black uppercase tracking-widest shadow-sm shadow-blue-900/20 hover:bg-[#0b477f] active:scale-95 transition-all disabled:cursor-not-allowed disabled:bg-slate-200 disabled:border-slate-200 disabled:text-slate-500 disabled:shadow-none"
                      >
                        {text.sendReply}
                      </button>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100">
                      <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">{text.summaryTitle}</h3>
                    </div>
                    <pre className="p-4 text-xs text-slate-700 whitespace-pre-wrap h-[560px] overflow-y-auto font-mono">{summary || text.selectJob}</pre>
                  </div>
                </section>
              </>
            ) : (
              <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
                <h2 className="text-xl font-black text-slate-900">{text.noSelection}</h2>
                <p className="text-sm text-slate-500 mt-2">{text.noSelectionBody}</p>
              </section>
            )}

            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">{text.manualLookup}</h2>
              <form onSubmit={handleManualSearch} className="mt-4 flex flex-col md:flex-row gap-3">
                <input
                  className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="student@email.com"
                  value={targetUser}
                  onChange={(event) => setTargetUser(event.target.value)}
                />
                <button className="px-4 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest">
                  {text.loadSummary}
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

const viText = {
  title: 'Tư vấn viên / Hỗ trợ trực tiếp',
  subtitle: 'Tài khoản admin và biên tập viên có thể nhận yêu cầu hỗ trợ và trả lời trong khung chat riêng với học sinh.',
  jobs: 'Yêu cầu hỗ trợ',
  pending: 'đang chờ',
  refresh: 'Làm mới',
  loadingJobs: 'Đang tải yêu cầu...',
  noJobs: 'Hiện chưa có yêu cầu hỗ trợ nào.',
  noQuestion: 'Chưa ghi nhận câu hỏi',
  accept: 'Nhận xử lý',
  markBusy: 'Đang bận',
  chatTitle: 'Chat với tư vấn viên',
  noMessages: 'Chưa có tin nhắn tư vấn.',
  staff: 'Tư vấn viên',
  student: 'Học sinh',
  replyPlaceholder: 'Nhập phản hồi của tư vấn viên cho học sinh...',
  sendReply: 'Gửi vào chat tư vấn',
  summaryTitle: 'Tóm tắt ngữ cảnh',
  selectJob: 'Chọn một yêu cầu để tải ngữ cảnh.',
  noSelection: 'Chưa chọn yêu cầu',
  noSelectionBody: 'Khi AI không thể trả lời an toàn, yêu cầu sẽ xuất hiện ở đây để admin/editor xem xét.',
  manualLookup: 'Tra cứu học sinh thủ công',
  loadSummary: 'Tải tóm tắt',
  loadJobsError: 'Không thể tải danh sách yêu cầu hỗ trợ.',
  loadChatError: 'Không thể tải chat tư vấn viên.',
  noSummary: 'Chưa có tóm tắt yêu cầu hỗ trợ.',
  accepted: 'Đã nhận xử lý yêu cầu.',
  acceptError: 'Không thể nhận xử lý yêu cầu.',
  busy: 'Đã đánh dấu đang bận.',
  statusError: 'Không thể cập nhật trạng thái yêu cầu.',
  replySent: 'Đã gửi phản hồi tới khung chat tư vấn.',
  replyError: 'Không thể gửi phản hồi.',
  lookupError: 'Không tìm thấy ngữ cảnh hỗ trợ.',
};

const enText = {
  title: 'Staff / Human Fallback',
  subtitle: 'Admin and editor accounts can accept fallback jobs and reply in a separate human-only chat.',
  jobs: 'Fallback Jobs',
  pending: 'pending',
  refresh: 'Refresh',
  loadingJobs: 'Loading jobs...',
  noJobs: 'No human fallback jobs right now.',
  noQuestion: 'No captured question',
  accept: 'Accept',
  markBusy: 'Busy',
  chatTitle: 'Human Counsellor Chat',
  noMessages: 'No human messages found.',
  staff: 'Staff',
  student: 'Student',
  replyPlaceholder: 'Type a human advisor reply for this student...',
  sendReply: 'Send to Human Chat',
  summaryTitle: 'Handoff Summary',
  selectJob: 'Select a job to load context.',
  noSelection: 'No fallback selected',
  noSelectionBody: 'When AI cannot safely answer, a job appears here for admin/editor review.',
  manualLookup: 'Manual Student Lookup',
  loadSummary: 'Load Summary',
  loadJobsError: 'Could not load human fallback jobs.',
  loadChatError: 'Could not load human counsellor chat.',
  noSummary: 'No handoff summary available.',
  accepted: 'Fallback job accepted.',
  acceptError: 'Could not accept fallback job.',
  busy: 'Marked as busy.',
  statusError: 'Could not update handoff status.',
  replySent: 'Reply sent to the human chat popup.',
  replyError: 'Could not send reply.',
  lookupError: 'No handoff context found.',
};

export default StaffDashboard;
