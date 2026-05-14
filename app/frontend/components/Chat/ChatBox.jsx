import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useChat } from '../../hooks/useChat';
import api from '../../services/api';
import SourceList from './SourceList';

// For demo purposes, this is hardcoded. 
const IS_DEMO_MODE = import.meta.env.VITE_USE_MOCK === 'true';
const DEFAULT_USER = "admin@vinuni.edu.vn";
const FALLBACK_LABELS = {
  rate_limit: 'Rate limit',
  judge_rejected: 'Judge rejected',
  missing_profile: 'Missing profile',
  backend_fallback: 'Backend fallback',
  guardrail_blocked: 'Guardrail blocked',
  model_or_network_error: 'Model/network error',
  cancelled: 'Cancelled',
};

const ChatBox = ({ userId, sessionId, onSessionUpdate }) => {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pendingPdfContext, setPendingPdfContext] = useState(null);
  const fileInputRef = useRef(null);
  const viewerRole = localStorage.getItem('user_role');
  const canSeeDebugMeta = viewerRole === 'admin' || viewerRole === 'editor';
  
  /**
   * We use the passed userId (prop) or fall back to the logged-in email.
   * This ensures the DB service in the backend retrieves the correct history.
   */
  const effectiveUserId = userId || localStorage.getItem('user_email') || DEFAULT_USER;
  const hasWizardCompleted = localStorage.getItem(`wizard_completed_${effectiveUserId}`) === 'true';
  
  const { messages, sendMessage, deleteMessage, editUserMessage, stopGenerating, loading } = useChat(effectiveUserId, sessionId, onSessionUpdate);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = () => {
    if (!input.trim() || loading) return;
    sendMessage(input, pendingPdfContext ? {
      contextText: pendingPdfContext.text,
      contextLabel: `PDF attached: ${pendingPdfContext.filename}`
    } : {});
    setInput('');
    setPendingPdfContext(null);
    setShowAttachMenu(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDownload = async () => {
    if (sessionId === 'new' || messages.length === 0) return;
    
    try {
      const response = await api.downloadSessionHistory(sessionId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `history_${sessionId.substring(0, 8)}.txt`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Không thể tải lịch sử trò chuyện.");
    }
  };

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => {
      setCopiedIndex(null);
    }, 2000);
  };

  const handlePdfSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF files can be attached.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    setUploadingPdf(true);
    try {
      const result = await api.uploadCV(formData);
      setPendingPdfContext({
        filename: result.filename || file.name,
        text: result.cv_text || '',
        signals: result.cv_signals || {}
      });
      toast.success('PDF context attached for your next message.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not process PDF.');
    } finally {
      setUploadingPdf(false);
      setShowAttachMenu(false);
    }
  };

  const handleEditMessage = (index, currentText) => {
    const nextText = window.prompt('Edit your message and regenerate the response:', currentText);
    if (nextText === null || nextText.trim() === currentText.trim()) return;
    editUserMessage(index, nextText);
  };

  const handleRequestHandoff = async () => {
    try {
      // Triggers the creation of a handoff summary for human advisors
      await api.getHandoffSummary(effectiveUserId);
      toast.success("Yêu cầu đã được gửi! Chuyên viên sẽ sớm liên hệ với bạn qua email.", {
        duration: 5000,
      });
    } catch (error) {
      console.error("Handoff request failed:", error);
      toast.error("Không thể gửi yêu cầu hỗ trợ lúc này. Vui lòng thử lại sau.");
    }
  };

  return (
    <div className="flex flex-col h-[min(680px,calc(100vh-8rem))] min-h-[420px] bg-slate-50 rounded-2xl overflow-hidden border border-slate-200">
      {IS_DEMO_MODE && (
        <div className="bg-amber-50 text-amber-800 text-[10px] text-center py-1 font-bold uppercase tracking-wider border-b border-amber-100">
          Demo Mode: Phản hồi được mô phỏng
        </div>
      )}

      {/* Chat Header */}
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex justify-between items-center">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Hội thoại</span>
        {sessionId !== 'new' && messages.length > 0 && (
          <button 
            onClick={handleDownload}
            title="Tải lịch sử trò chuyện"
            className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-[#003466] transition-colors"
          >
            <span className="material-symbols-outlined text-xl">download</span>
          </button>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 chat-scrollbar bg-slate-50/50">
        {messages.length === 0 && !loading && (
          <div className="text-center py-10">
            <span className="material-symbols-outlined text-slate-300 text-5xl mb-2">forum</span>
            <p className="text-slate-400 text-sm">Hãy đặt câu hỏi về các ngành học bạn quan tâm!</p>
            {!hasWizardCompleted && (
              <button
                onClick={() => navigate('/wizard')}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-blue-100 text-[#003466] rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-50 transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">route</span>
                Làm Wizard chọn ngành
              </button>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col group ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
              m.role === 'user' 
                ? 'bg-[#003466] text-white rounded-tr-none' 
                : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none whitespace-pre-wrap'
            }`}>
              <ReactMarkdown 
                components={{ p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} /> }}
              >
                {m.content}
              </ReactMarkdown>
              {m.contextLabel && (
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 text-[10px] font-bold uppercase tracking-wider">
                  <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                  {m.contextLabel}
                </div>
              )}

              {canSeeDebugMeta && m.role === 'assistant' && (m.intent || m.status) && (
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider">
                  {m.intent && <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-100">Intent: {m.intent}</span>}
                  {m.status && <span className="px-2 py-1 rounded bg-slate-50 text-slate-500 border border-slate-100">Status: {m.status}</span>}
                  {m.fallbackReason && <span className="px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-100">Reason: {FALLBACK_LABELS[m.fallbackReason] || m.fallbackReason}</span>}
                </div>
              )}

              {m.role === 'assistant' && (
                <SourceList sources={m.sources || m.references || []} compact />
              )}

              {/* Render Major Recommendations if available in the LLM response */}
              {m.type === 'recommendation' && Array.isArray(m.data) && m.data.length > 0 && (
                <div className="mt-4 space-y-3">
                  {m.data.map((major, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-slate-800">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-[#003466]">{major.major_name}</h4>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                            {major.match_score}% Match
                          </span>
                          {major.verified_source && (
                            <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100">
                              Verified Info
                            </span>
                          )}
                        </div>
                      </div>
                      {major.department && <p className="text-[11px] text-slate-500 mb-2">{major.department}</p>}
                      <p className="text-xs italic mb-2">"{major.match_reason}"</p>
                      <p className="text-[11px] opacity-70 leading-snug">{major.what_students_do}</p>
                      {major.source_url && (
                        <a href={major.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-[10px] font-black uppercase tracking-widest text-blue-700 hover:underline">
                          View Details
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Human Fallback Button - Only shown when AI triggers fallback and provides no recommendations */}
              {m.role === 'assistant' && m.fallback && (!m.data || m.data.length === 0) && (
                <div className="mt-4 pt-3 border-t border-slate-50">
                  <button 
                    onClick={handleRequestHandoff}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-50 hover:bg-slate-100 text-[#003466] border border-slate-200 rounded-xl text-xs font-bold transition-all active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-[18px]">support_agent</span>
                    Kết nối chuyên viên tư vấn
                  </button>
                </div>
              )}
            </div>
            {m.timestamp && (
              <div className="flex items-center gap-2 mt-1 px-1">
                <span className="text-[10px] text-slate-400">
                  {new Date(m.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {m.role === 'assistant' && (
                  <button 
                    onClick={() => handleCopy(m.content, i)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-[#003466]"
                    title="Sao chép"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {copiedIndex === i ? 'check' : 'content_copy'}
                    </span>
                  </button>
                )}
                {m.role === 'user' && (
                  <button
                    onClick={() => handleEditMessage(i, m.content)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-[#003466]"
                    title="Edit message"
                  >
                    <span className="material-symbols-outlined text-[14px]">edit</span>
                  </button>
                )}
                <button
                  onClick={() => deleteMessage(i)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"
                  title="Delete message"
                >
                  <span className="material-symbols-outlined text-[14px]">delete</span>
                </button>
              </div>
            )}
          </div>
        ))}
        
        {loading && (
          <div className="flex justify-start animate-fade-in">
            <div className="flex flex-col items-start max-w-[85%]">
              <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-none shadow-sm flex gap-1.5 items-center">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-[#003466]/40 rounded-full animate-bounce [animation-duration:0.8s]"></div>
                  <div className="w-1.5 h-1.5 bg-[#003466]/40 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.2s]"></div>
                  <div className="w-1.5 h-1.5 bg-[#003466]/40 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.4s]"></div>
                </div>
                <span className="text-[11px] text-slate-400 ml-1 font-medium italic">
                  VinUni Bot đang soạn câu trả lời...
                </span>
                <button 
                  onClick={stopGenerating}
                  className="ml-2 p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-full transition-colors flex items-center justify-center border border-transparent hover:border-red-100"
                  title="Dừng tạo phản hồi"
                >
                  <span className="material-symbols-outlined text-[14px]">stop_circle</span>
                </button>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Section */}
      <div className="p-3 bg-white border-t border-slate-200">
        {pendingPdfContext && (
          <div className="mb-2 flex items-center justify-between gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
            <span className="text-xs font-bold text-blue-800 truncate">
              PDF attached for next message: {pendingPdfContext.filename}
            </span>
            <button onClick={() => setPendingPdfContext(null)} className="text-blue-700 hover:text-red-600">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        )}
        <div className="relative flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handlePdfSelected} />
          <div className="relative">
            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              disabled={loading || uploadingPdf}
              className="w-11 h-11 bg-white border border-slate-200 text-[#003466] rounded-xl flex items-center justify-center hover:bg-slate-50 disabled:opacity-40"
              title="Add context"
            >
              <span className="material-symbols-outlined text-[22px]">{uploadingPdf ? 'hourglass_top' : 'add'}</span>
            </button>
            {showAttachMenu && (
              <div className="absolute bottom-12 left-0 w-44 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-20">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-2 px-3 py-3 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                  Add PDF
                </button>
              </div>
            )}
          </div>
          <input 
            className="flex-1 min-h-[44px] pl-4 pr-12 py-3 bg-slate-100 border-transparent focus:border-[#003466] focus:bg-white focus:ring-4 focus:ring-[#003466]/5 rounded-xl transition-all outline-none text-sm"
            placeholder="Hỏi thêm về ngành học, sự nghiệp..." 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={loading}
          />
          <button 
            onClick={handleSend} 
            disabled={!input.trim() || loading}
            className="absolute right-2 w-10 h-10 bg-[#003466] text-white rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20 active:scale-95 transition-all disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-[20px]">send</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default ChatBox;
