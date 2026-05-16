import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';

const HumanCounsellorPopup = ({ handoff, onClose }) => {
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const messagesEndRef = useRef(null);

  const traceId = handoff?.trace_id || handoff?.traceId;

  const loadMessages = async () => {
    if (!traceId) return;
    try {
      const data = await api.getHandoffMessages(traceId);
      setMessages(data.messages || []);
    } catch (error) {
      toast.error(text.loadError);
    }
  };

  useEffect(() => {
    loadMessages();
    if (!traceId) return undefined;
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [traceId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, collapsed]);

  const handleSend = async () => {
    if (!traceId || !draft.trim() || sending) return;
    setSending(true);
    try {
      const result = await api.sendHandoffMessage(traceId, draft.trim());
      setMessages((current) => [...current, result.message]);
      setDraft('');
    } catch (error) {
      toast.error(error.response?.data?.detail || text.sendError);
    } finally {
      setSending(false);
    }
  };

  if (!traceId) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-[#003466] px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{text.title}</p>
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/75">
            {handoff?.handoff_status || 'pending'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="grid h-8 w-8 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
            title={collapsed ? text.open : text.collapse}
          >
            <span className="material-symbols-outlined text-[18px]">{collapsed ? 'open_in_full' : 'remove'}</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
              title={text.close}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="h-80 overflow-y-auto bg-slate-50 p-3">
            {messages.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                {text.waiting}
              </p>
            ) : messages.map((message, index) => {
              const isStudent = message.role === 'student';
              return (
                <div key={message.id || index} className={`mb-3 flex ${isStudent ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm ${isStudent ? 'rounded-tr-none bg-[#003466] text-white' : 'rounded-tl-none border border-slate-200 bg-white text-slate-800'}`}>
                    <p className="mb-1 text-[10px] font-black uppercase tracking-wider opacity-70">
                      {message.sender_name || (isStudent ? text.you : text.counsellor)}
                    </p>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    <p className="mt-1 text-[10px] opacity-60">{formatTime(message.timestamp)}</p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-slate-100 bg-white p-3">
            <div className="flex items-end gap-2">
              <textarea
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#003466] focus:bg-white focus:ring-4 focus:ring-[#003466]/5"
                placeholder={text.placeholder}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                className="grid h-11 w-11 place-items-center rounded-xl bg-[#003466] text-white shadow-lg shadow-blue-900/20 disabled:opacity-40"
                title={text.send}
              >
                <span className="material-symbols-outlined text-[20px]">send</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const viText = {
  title: 'Tư vấn viên',
  loadError: 'Không thể tải cuộc trò chuyện với tư vấn viên.',
  sendError: 'Không thể gửi tin nhắn.',
  open: 'Mở trò chuyện',
  collapse: 'Thu gọn trò chuyện',
  close: 'Đóng',
  waiting: 'Đang chờ tin nhắn đầu tiên từ tư vấn viên.',
  you: 'Bạn',
  counsellor: 'Tư vấn viên',
  placeholder: 'Nhắn cho tư vấn viên...',
  send: 'Gửi',
};

const enText = {
  title: 'Human counsellor',
  loadError: 'Could not load human counsellor chat.',
  sendError: 'Could not send message.',
  open: 'Open chat',
  collapse: 'Collapse chat',
  close: 'Close',
  waiting: 'Waiting for the first human message.',
  you: 'You',
  counsellor: 'Counsellor',
  placeholder: 'Message the counsellor...',
  send: 'Send',
};

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default HumanCounsellorPopup;
