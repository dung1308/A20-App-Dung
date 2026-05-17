import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../state/store';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../hooks/useChat';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import api from '../services/api';
import ErrorBoundary from '../components/ErrorBoundary';
import SourceList from '../components/Chat/SourceList';
import HumanCounsellorPopup from '../components/Chat/HumanCounsellorPopup';
import { useLanguage } from '../context/LanguageContext';

const majorNameMap = {
  'cs': 'Khoa học Máy tính',
  'ee': 'Kỹ thuật Điện & Máy tính',
  'me': 'Kỹ thuật Cơ khí',
  'bme': 'Kỹ thuật Y sinh',
  'ba': 'Quản trị Kinh doanh',
  'finance': 'Tài chính',
  'data_science': 'Khoa học Dữ liệu',
  'liberal_arts': 'Khoa học Xã hội & Nhân văn',
  'architecture': 'Kiến trúc'
};

const fallbackLabels = {
  rate_limit: 'Rate limit',
  judge_rejected: 'Judge rejected',
  missing_profile: 'Missing profile',
  backend_fallback: 'Backend fallback',
  guardrail_blocked: 'Guardrail blocked',
  model_or_network_error: 'Model/network error',
  cancelled: 'Cancelled',
};

const ACTIVE_HANDOFF_STATUSES = new Set(['pending', 'accepted', 'busy']);

const isTrackableHandoff = (handoff) =>
  Boolean(
    handoff?.trace_id &&
    ACTIVE_HANDOFF_STATUSES.has(String(handoff.handoff_status || '').toLowerCase())
  );

const reportStorageKey = (userId) => `latest_report_${userId}`;

const ConsultantPage = () => {
  const { matchResults, setMatchResults } = useStore();
  const navigate = useNavigate();
  const { userId, isAuthenticated, role } = useAuth(); // Moved up to ensure userId is available
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;
  const canSeeDebugMeta = role === 'admin' || role === 'editor';
  const hasWizardCompleted = userId ? localStorage.getItem(`wizard_completed_${userId}`) === 'true' : false;
  const [currentSessionId, setCurrentSessionId] = useState('new');
  const [sessions, setSessions] = useState([]);

  const fetchSessions = useCallback(async () => {
    if (!userId) return;
    try {
      // Đảm bảo gọi đúng tên hàm API (getSessions)
      const res = await api.getSessions(userId);
      if (res.status === 'success') {
        setSessions(res.sessions || []);
      }
    } catch (err) {
      console.error("Error fetching sessions:", err);
    }
  }, [userId]);

  const { 
    messages, 
    setMessages, 
    sendMessage, 
    loading: isTyping 
  } = useChat(userId, currentSessionId, (newId, newTitle) => {
    // Transition from 'new' placeholder to a real session ID
    if (currentSessionId === 'new' && newId) {
      setCurrentSessionId(newId);
      fetchSessions(); // Refresh the list to include the new record
    } else if (newTitle) {
      // Auto-rename logic: update the specific session title in local state immediately
      setSessions(prev => prev.map(s => 
        (s.id === newId || s.sessionId === newId) ? { ...s, title: newTitle } : s
      ));
    }
  });

  const [input, setInput] = useState('');
  const [selectedMajor, setSelectedMajor] = useState(null);
  const [handoffStatus, setHandoffStatus] = useState(null);
  const dismissedHandoffTraces = useRef(new Set(JSON.parse(localStorage.getItem('dismissed_handoff_traces') || '[]')));
  const scrollRef = useRef(null);

  // Restore recommendation context after a refresh or direct entry to /consultant.
  useEffect(() => {
    if (matchResults || !userId) return;
    const savedReport = localStorage.getItem(reportStorageKey(userId));
    if (!savedReport) return;
    try {
      setMatchResults(JSON.parse(savedReport));
    } catch {
      localStorage.removeItem(reportStorageKey(userId));
    }
  }, [matchResults, setMatchResults, userId]);

  // Initialize chat with top results if they exist
  useEffect(() => {
    const initialData = matchResults?.major || matchResults?.top3;
    if (initialData && messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: matchResults.answer || "Xin chào! Dựa trên năng lực và sở thích bạn đã cung cấp, tôi đã chọn ra 3 ngành học tiềm năng nhất tại VinUni dành cho bạn.",
          type: 'recommendation',
          data: initialData
        }
      ]);
    }
  }, [matchResults, messages.length, setMessages]);

  // Load sessions list on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated && !userId) navigate('/login');
  }, [isAuthenticated, userId, navigate]);

  const handleDeleteSession = async (e, sid) => {
    e.stopPropagation(); // Ngăn việc kích hoạt sự kiện chọn session
    if (!window.confirm("Bạn có chắc chắn muốn xóa cuộc hội thoại này?")) return;

    try {
      const res = await api.deleteSession(sid);
      if (res.status === 'success') {
        // Cập nhật danh sách local để giao diện phản hồi ngay lập tức
        setSessions(prev => prev.filter(s => (s.id || s.sessionId) !== sid));
        // Nếu đang xóa session hiện tại, quay về trạng thái 'mới'
        if (currentSessionId === sid) {
          setCurrentSessionId('new');
          setMessages([]);
        }
      }
    } catch (err) {
      console.error("Error deleting session:", err);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = (text = input) => {
    if (!text.trim()) return;
    sendMessage(text);
    if (text === input) setInput('');
  };

  const handleRequestHandoff = async () => {
    try {
      const result = await api.requestHandoff({
        session_id: currentSessionId,
        message: 'Student clicked Xin người tư vấn from Consultant quick actions.'
      });
      const traceId = result.traceId || result.trace_id;
      if (traceId) dismissedHandoffTraces.current.delete(traceId);
      localStorage.setItem('dismissed_handoff_traces', JSON.stringify([...dismissedHandoffTraces.current]));
      setHandoffStatus({
        trace_id: traceId,
        handoff_status: result.handoffStatus || result.handoff_status || 'pending',
        reason: result.fallbackCard?.reason || text.handoffRequested
      });
      toast.success(text.handoffSuccess);
    } catch (error) {
      toast.error(error.response?.data?.detail || text.handoffError);
    }
  };

  useEffect(() => {
    const latestHandoff = [...messages].reverse().find((message) => message.traceId && message.handoffStatus);
    if (latestHandoff) {
      if (dismissedHandoffTraces.current.has(latestHandoff.traceId)) return;
      setHandoffStatus({
        trace_id: latestHandoff.traceId,
        handoff_status: latestHandoff.handoffStatus,
        reason: latestHandoff.fallbackCard?.reason || text.handoffRequested
      });
    }
  }, [messages, text.handoffRequested]);

  const loadHandoffStatus = useCallback(async () => {
    try {
      const data = await api.getHandoffStatus();
      const nextHandoff = data.handoff || null;
      const nextTrace = nextHandoff?.trace_id || nextHandoff?.traceId;
      setHandoffStatus(nextTrace && dismissedHandoffTraces.current.has(nextTrace) ? null : nextHandoff);
    } catch {
      setHandoffStatus(null);
    }
  }, []);

  useEffect(() => {
    loadHandoffStatus();
  }, [loadHandoffStatus]);

  useEffect(() => {
    if (!isTrackableHandoff(handoffStatus)) return undefined;
    const interval = setInterval(loadHandoffStatus, 10000);
    return () => clearInterval(interval);
  }, [handoffStatus, loadHandoffStatus]);

  const closeHandoffPopup = () => {
    const traceId = handoffStatus?.trace_id || handoffStatus?.traceId;
    if (traceId) {
      dismissedHandoffTraces.current.add(traceId);
      localStorage.setItem('dismissed_handoff_traces', JSON.stringify([...dismissedHandoffTraces.current]));
    }
    setHandoffStatus(null);
  };

  return (
    <ErrorBoundary>
      <div className="flex h-full w-full overflow-hidden bg-[#f8f9ff] font-inter text-[#0d1c2e]">
      {/* Sidebar for Chat Sessions */}
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col hidden md:flex">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <span className="font-bold text-blue-900 tracking-tight">{text.historyTitle}</span>
          <button 
            onClick={() => { setCurrentSessionId('new'); setMessages([]); }}
            className="p-2 hover:bg-slate-50 rounded-lg text-blue-600 transition-colors"
            title="Cuộc hội thoại mới"
          >
            <span className="material-symbols-outlined">add_comment</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 chat-scrollbar">
          {sessions.map((s) => {
            const sid = s.id || s.sessionId;
            const isActive = currentSessionId === sid;
            return (
              <div key={sid} className="group relative">
                <button
                  onClick={() => setCurrentSessionId(sid)}
                  className={`w-full text-left p-4 rounded-xl transition-all duration-200 ${
                    isActive 
                      ? 'bg-blue-50 border-blue-100 border' 
                      : 'hover:bg-slate-50 border-transparent border'
                  }`}
                >
                  <div className="flex items-center gap-3 pr-8">
                    <span className={`material-symbols-outlined text-[20px] ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
                      chat_bubble
                    </span>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-semibold truncate text-slate-700">
                        {s.sessionTitle || s.title || 'Cuộc trò chuyện mới'}
                      </p>
                      {s.created_at && (
                        <p className="text-[10px] opacity-40 mt-0.5">
                          {new Date(s.created_at).toLocaleDateString('vi-VN')}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => handleDeleteSession(e, sid)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  title="Xóa cuộc hội thoại"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Chat Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-8 md:px-12 lg:px-24 scroll-smooth chat-scrollbar">
          <div className="max-w-4xl mx-auto space-y-8">
            {messages.length === 0 && !hasWizardCompleted && (
              <div className="bg-white border border-blue-100 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-700 border border-blue-100">
                    <span className="material-symbols-outlined">route</span>
                  </div>
                  <div>
                    <p className="text-sm font-black text-blue-900">Bạn chưa làm Wizard chọn ngành</p>
                    <p className="text-xs text-slate-500 mt-1">Nếu muốn nhận Top 3 ngành phù hợp, vào Wizard để trả lời 4 bước về sở thích, thế mạnh và phong cách làm việc.</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/wizard')}
                  className="px-5 py-3 bg-[#003466] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:shadow-lg active:scale-95 transition-all shrink-0"
                >
                  Mở Wizard
                </button>
              </div>
            )}
            {messages.length === 0 && hasWizardCompleted && !matchResults && (
              <div className="bg-white border border-blue-100 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-700 border border-blue-100">
                    <span className="material-symbols-outlined">forum</span>
                  </div>
                  <div>
                    <p className="text-sm font-black text-blue-900">{text.readyToChat}</p>
                    <p className="text-xs text-slate-500 mt-1">{text.readyToChatBody}</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/report')}
                  className="px-5 py-3 bg-[#003466] text-white rounded-xl text-xs font-black uppercase tracking-widest hover:shadow-lg active:scale-95 transition-all shrink-0"
                >
                  {text.openReport}
                </button>
              </div>
            )}
            {messages.map((msg, index) => {
              let displayContent = msg.content;
              let recommendationData = msg.type === 'recommendation' ? msg.data : null;

              return (
              <div key={index} className={`flex gap-4 items-start ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 border border-blue-100">
                    <span className="material-symbols-outlined text-blue-700" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                  </div>
                )}
                
                <div className="flex-1 max-w-[85%] space-y-6">
                  <div className={`p-5 rounded-2xl shadow-sm border ${
                    msg.role === 'user' 
                      ? 'bg-[#003466] text-white rounded-tr-none' 
                      : 'bg-white text-[#0d1c2e] border-slate-200 rounded-tl-none'
                  }`}>
                    <p className="text-[16px] leading-relaxed">{displayContent}</p>
                    {canSeeDebugMeta && msg.role === 'assistant' && (msg.intent || msg.status) && (
                      <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider">
                        {msg.intent && <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-100">Intent: {msg.intent}</span>}
                        {msg.status && <span className="px-2 py-1 rounded bg-slate-50 text-slate-500 border border-slate-100">Status: {msg.status}</span>}
                        {msg.fallbackReason && <span className="px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-100">Reason: {fallbackLabels[msg.fallbackReason] || msg.fallbackReason}</span>}
                      </div>
                    )}
                  </div>

                  {msg.role === 'assistant' && (
                    <SourceList sources={msg.sources || msg.references || []} showEmpty />
                  )}

                  {/* Recommendation Grid */}
                  {recommendationData && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {recommendationData.map((major, idx) => (
                          <div key={idx} className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-xl transition-all duration-300">
                            <div className="flex justify-between items-start mb-4">
                              <div className="p-2 bg-blue-50 rounded-lg text-blue-700">
                                <span className="material-symbols-outlined text-[20px]">school</span>
                              </div>
                              <span className="px-2 py-1 bg-green-50 text-green-700 text-[10px] font-bold rounded uppercase tracking-wider">{major.match_score}% Match</span>
                            </div>
                            <h4 className="font-bold text-blue-900 mb-1">{major.major_name || majorNameMap[major.major_id] || major.major_id}</h4>
                            <p className="text-xs text-slate-500 mb-6 leading-relaxed line-clamp-2">{major.match_reason || major.reason || "Xem chi tiết để biết thêm thông tin."}</p>
                            <button 
                              onClick={() => setSelectedMajor(major)}
                              className="w-full py-2.5 bg-slate-50 text-blue-700 font-semibold text-sm rounded-xl group-hover:bg-[#003466] group-hover:text-white transition-colors"
                            >
                              Chi tiết
                            </button>
                          </div>
                        ))}
                      </div>
                      {msg.type === 'recommendation' && (
                        <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded-r-2xl max-w-[85%]">
                          <div className="flex gap-2 items-center text-blue-900 font-bold mb-1">
                            <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                            <span className="text-sm">Mentor Insight</span>
                          </div>
                          <p className="text-sm text-blue-800 leading-relaxed italic">"Dựa trên hồ sơ của bạn, các ngành kỹ thuật và khoa học máy tính sẽ tận dụng tốt nhất thế mạnh về tư duy logic mà bạn đã thể hiện."</p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                    <div className="w-full h-full bg-blue-200 flex items-center justify-center text-blue-900 font-bold">U</div>
                  </div>
                )}
              </div>
              );
            })}

            {isTyping && (
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-blue-700" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                </div>
                <div className="flex gap-1 items-center bg-white px-4 py-3 rounded-full border border-slate-200 shadow-sm">
                  <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Input Section */}
        <div className="p-6 bg-white border-t border-slate-200">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3 mb-4 overflow-x-auto pb-1 no-scrollbar">
              {!hasWizardCompleted && (
                <button 
                  onClick={() => navigate('/wizard')}
                  className="whitespace-nowrap px-3 py-1.5 bg-[#003466] text-white rounded-full text-xs font-semibold hover:bg-blue-900 transition-colors border border-[#003466]"
                >
                  Làm Wizard chọn ngành
                </button>
              )}
              {['So sánh mức lương', 'Triển vọng nghề nghiệp', 'Phân tích hồ sơ'].map((hint) => (
                <button 
                  key={hint}
                  onClick={() => handleSend(hint)}
                  className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold hover:bg-blue-100 transition-colors border border-blue-100"
                >
                  {hint}
                </button>
              ))}
              <button
                type="button"
                onClick={handleRequestHandoff}
                className="whitespace-nowrap px-3 py-1.5 bg-amber-50 text-amber-800 rounded-full text-xs font-semibold hover:bg-amber-100 transition-colors border border-amber-200 inline-flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">support_agent</span>
                Xin người tư vấn
              </button>
            </div>
            <div className="relative flex items-center">
              <input 
                className="w-full pl-6 pr-16 py-4 bg-slate-100 border-transparent focus:border-blue-900 focus:bg-white focus:ring-4 focus:ring-blue-900/5 rounded-2xl transition-all outline-none text-body-md shadow-inner"
                placeholder="Hỏi Mentor bất cứ điều gì về ngành học, sự nghiệp..." 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              />
              <button 
                onClick={() => handleSend()}
                disabled={!input.trim() || isTyping}
                className="absolute right-3 w-10 h-10 bg-blue-900 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20 active:scale-95 transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
              </button>
            </div>
            <p className="text-[10px] text-center text-slate-400 mt-4 uppercase tracking-wider font-medium">Powered by Brilliant Mentor AI • Guidance based on current 2024 academic standards</p>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedMajor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all">
          <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-8">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-50 rounded-2xl text-blue-700">
                    <span className="material-symbols-outlined text-3xl">school</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-blue-900">{selectedMajor.major_name || majorNameMap[selectedMajor.major_id]}</h3>
                    <div className="inline-block px-2 py-0.5 bg-green-50 text-green-700 text-[11px] font-bold rounded uppercase tracking-wider mt-1">
                      {selectedMajor.match_score}% Match Strength
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedMajor(null)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">Tại sao ngành này phù hợp?</h4>
                  <p className="text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    {selectedMajor.match_reason}
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">Sinh viên VinUni học gì?</h4>
                  <p className="text-slate-600 leading-relaxed">
                    {selectedMajor.what_students_do || "Học sinh sẽ được học về các kiến thức chuyên sâu, thực hành dự án thực tế và tham gia các kỳ thực tập tại doanh nghiệp đối tác của VinUni."}
                  </p>
                </div>
              </div>

              <div className="mt-10">
                <button onClick={() => { handleSend(`Tôi muốn tìm hiểu sâu hơn về ngành ${selectedMajor.major_name || majorNameMap[selectedMajor.major_id]}`); setSelectedMajor(null); }} className="w-full py-4 bg-[#003466] text-white font-bold rounded-2xl shadow-xl shadow-blue-900/20 hover:scale-[1.02] active:scale-95 transition-all">Hỏi thêm về ngành này</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {handoffStatus?.trace_id && (
        <HumanCounsellorPopup handoff={handoffStatus} onClose={closeHandoffPopup} />
      )}
    </div>
    </ErrorBoundary>
  );
};

const viText = {
  handoffRequested: 'Học sinh đã yêu cầu gặp tư vấn viên.',
  handoffSuccess: 'Đã gửi yêu cầu tới tư vấn viên.',
  handoffError: 'Không thể gửi yêu cầu tư vấn lúc này.',
  historyTitle: 'Lịch sử tư vấn',
  readyToChat: 'Bạn đã sẵn sàng để hỏi thêm',
  readyToChatBody: 'Bạn có thể hỏi Mentor về ngành học, hồ sơ hoặc mở lại báo cáo gợi ý gần nhất.',
  openReport: 'Mở báo cáo',
};

const enText = {
  handoffRequested: 'Student requested a human counselor.',
  handoffSuccess: 'Request sent to the human counsellor.',
  handoffError: 'Could not send the counselling request right now.',
  historyTitle: 'Consultation history',
  readyToChat: 'You are ready to ask follow-up questions',
  readyToChatBody: 'Ask Mentor about majors or your profile, or reopen your latest recommendation report.',
  openReport: 'Open report',
};

export default ConsultantPage;
