import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useStore } from '../state/store';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import MajorCard from '../components/Report/MajorCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ChatBox from '../components/Chat/ChatBox';
import api from '../services/api';

const reportStorageKey = (userId) => `latest_report_${userId}`;

const ReportPage = () => {
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;
  const { matchResults, setMatchResults } = useStore();
  const { userId, isAuthenticated } = useAuth();
  const [showChat, setShowChat] = useState(false);
  const [chatContext, setChatContext] = useState(null);

  useEffect(() => {
    if (!matchResults && userId) {
      const saved = localStorage.getItem(reportStorageKey(userId));
      if (saved) {
        try {
          setMatchResults(JSON.parse(saved));
        } catch {
          localStorage.removeItem(reportStorageKey(userId));
        }
      }
    }
  }, [matchResults, setMatchResults, userId]);

  const topMajors = matchResults?.top3 || [];
  const reportStats = useMemo(() => {
    const verified = topMajors.filter((major) => major.verified_source || major.source_url).length;
    const avgScore = topMajors.length
      ? Math.round(topMajors.reduce((sum, major) => sum + Number(major.match_score || 0), 0) / topMajors.length)
      : 0;
    return { verified, avgScore };
  }, [topMajors]);

  const handleConsultationClick = async () => {
    try {
      await api.logConsultationClick('report');
      toast.success(text.consultationLogged);
    } catch (err) {
      toast.error(text.consultationError);
    }
  };

  const handleRestart = () => {
    setMatchResults(null);
  };

  const handleAskMajor = (major) => {
    setChatContext({
      surface: 'report',
      major_id: major.major_id,
      major_name: major.major_name,
      selected_signals: major.match_breakdown?.matched_signals || [],
    });
    setShowChat(true);
    toast.success(language === 'vi' ? `Chat sẽ dùng ngành ${major.major_name} làm ngữ cảnh.` : `Chat will use ${major.major_name} as context.`);
  };

  if (!isAuthenticated || !userId) {
    return <div className="p-8 text-center text-red-500">{text.loginRequired}</div>;
  }

  if (!matchResults) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <LoadingSpinner size="lg" className="mb-4" timeoutMessage={text.spinnerTimeout} />
          <h1 className="text-2xl font-black text-primary">{text.noReport}</h1>
          <p className="mt-2 text-sm text-slate-500">{text.noReportBody}</p>
          <Link to="/wizard" className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 text-xs font-black uppercase tracking-widest text-white">
            {text.startWizard}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50/50 p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-[#0b477f] bg-[#003466] p-8 text-white shadow-xl shadow-blue-900/20">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-blue-100">{text.eyebrow}</p>
              <h1 className="mt-2 text-3xl font-black text-white">{text.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50">
                {matchResults.disclaimer || text.defaultDisclaimer}
              </p>
            </div>
            <div className="grid min-w-full grid-cols-3 gap-3 lg:min-w-[420px]">
              <SummaryCard label={text.topMajors} value={topMajors.length} />
              <SummaryCard label={text.avgMatch} value={`${reportStats.avgScore}%`} />
              <SummaryCard label={text.verified} value={`${reportStats.verified}/${topMajors.length || 0}`} />
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <main className="space-y-6">
            {matchResults.fallback && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <p className="font-black text-amber-800">{text.notEnoughSignals}</p>
                <p className="mt-1 text-sm text-amber-700">{friendlyFallbackReason(matchResults.fallback_card?.reason, language) || text.fallbackBody}</p>
                {(matchResults.recovery_actions || []).length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {matchResults.recovery_actions.map((action) => (
                      <span key={action.id} className="rounded-lg border border-amber-100 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-700">
                        {friendlyActionLabel(action.label || action.id, language)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {topMajors.map((major) => (
                <MajorCard key={major.major_id || major.major_name} major={major} onAsk={handleAskMajor} />
              ))}
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              {!showChat ? (
                <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">{text.needClarify}</h2>
                    <p className="mt-1 text-sm text-slate-500">{text.needClarifyBody}</p>
                  </div>
                  <button className="rounded-xl bg-[#fed65b] px-5 py-3 text-xs font-black uppercase tracking-widest text-[#745c00]" onClick={() => setShowChat(true)}>
                    {text.askMore}
                  </button>
                </div>
              ) : (
                <ChatBox userId={userId} initialContext={chatContext} />
              )}
            </section>
          </main>

          <aside className="space-y-4">
            <ActionCard title={text.updateProfile} body={text.updateProfileBody} action={text.openProfile} href="/profile" />
            <ActionCard title={text.rerunWizard} body={text.rerunWizardBody} action={text.runWizardAgain} href="/wizard" onClick={handleRestart} />
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">{text.deepConsulting}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{text.deepConsultingBody}</p>
              <button onClick={handleConsultationClick} className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-white">
                {text.registerConsulting}
              </button>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value }) => (
  <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-black text-[#003466]">{value}</p>
  </div>
);

const ActionCard = ({ title, body, action, href, onClick }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">{title}</h2>
    <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
    <Link to={href} onClick={onClick} className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-primary hover:bg-slate-50">
      {action}
    </Link>
  </div>
);

const viText = {
  consultationLogged: 'Đã ghi nhận nhu cầu tư vấn. Chuyên viên sẽ có dữ liệu để hỗ trợ bạn.',
  consultationError: 'Không thể ghi nhận yêu cầu tư vấn lúc này.',
  loginRequired: 'Bạn cần đăng nhập để xem báo cáo.',
  spinnerTimeout: 'Nếu bạn chưa làm Wizard, hãy bắt đầu khảo sát để tạo báo cáo.',
  noReport: 'Chưa có báo cáo',
  noReportBody: 'Báo cáo được tạo sau khi bạn hoàn thành Wizard và, nếu có, tải lên CV PDF.',
  startWizard: 'Bắt đầu Wizard',
  eyebrow: 'Gợi ý ngành VinUni',
  title: 'Báo cáo gợi ý ngành học',
  defaultDisclaimer: 'Kết quả do AI phân tích dựa trên câu trả lời Wizard và CV nếu bạn đã tải lên.',
  topMajors: 'Ngành nổi bật',
  avgMatch: 'Độ phù hợp TB',
  verified: 'Đã xác minh',
  notEnoughSignals: 'AI chưa đủ tín hiệu để kết luận chắc chắn.',
  fallbackBody: 'Hãy bổ sung hồ sơ/CV hoặc đăng ký tư vấn để chuyên viên xem bối cảnh đầy đủ hơn.',
  needClarify: 'Cần làm rõ thêm?',
  needClarifyBody: 'Hỏi AI về điểm phù hợp, điều kiện tuyển sinh, học bổng hoặc lộ trình nghề nghiệp của từng ngành.',
  askMore: 'Hỏi thêm câu hỏi',
  updateProfile: 'Cập nhật hồ sơ',
  updateProfileBody: 'Bổ sung GPA, điểm thi, ngành yêu thích và xem lại CV PDF đã tải lên.',
  openProfile: 'Mở hồ sơ',
  rerunWizard: 'Làm lại Wizard',
  rerunWizardBody: 'Dùng khi bạn muốn thay đổi câu trả lời hoặc thử một hướng ngành khác.',
  runWizardAgain: 'Chạy lại Wizard',
  deepConsulting: 'Tư vấn chuyên sâu',
  deepConsultingBody: 'Gửi tín hiệu cho tư vấn viên nếu bạn cần người thật kiểm tra hồ sơ và giải thích kết quả.',
  registerConsulting: 'Đăng ký tư vấn',
};

const enText = {
  consultationLogged: 'Consultation request recorded. Staff will have context to support you.',
  consultationError: 'Could not record the consultation request right now.',
  loginRequired: 'You need to sign in to view the report.',
  spinnerTimeout: 'If you have not completed the Wizard, start the survey to generate a report.',
  noReport: 'No report yet',
  noReportBody: 'The report is created after you complete the Wizard and, optionally, upload a PDF CV.',
  startWizard: 'Start Wizard',
  eyebrow: 'VinUni Major Match',
  title: 'Major Recommendation Report',
  defaultDisclaimer: 'AI analyzed your Wizard answers and CV if you uploaded one.',
  topMajors: 'Top majors',
  avgMatch: 'Avg match',
  verified: 'Verified',
  notEnoughSignals: 'AI does not have enough signals for a confident conclusion.',
  fallbackBody: 'Add profile/CV details or request counselling so staff can review the full context.',
  needClarify: 'Need more clarity?',
  needClarifyBody: 'Ask AI about match reasons, admission requirements, scholarships, or career paths for each major.',
  askMore: 'Ask another question',
  updateProfile: 'Update Profile',
  updateProfileBody: 'Add GPA, test scores, preferred majors, and review your uploaded PDF CV.',
  openProfile: 'Open Profile',
  rerunWizard: 'Rerun Wizard',
  rerunWizardBody: 'Use this when you want to change answers or try another academic direction.',
  runWizardAgain: 'Run Wizard Again',
  deepConsulting: 'Deep Consulting',
  deepConsultingBody: 'Ask staff to review your profile and explain the result when you need a human check.',
  registerConsulting: 'Register for consulting',
};

export default ReportPage;

const friendlyFallbackReason = (value, language) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('{') || text.startsWith('[') || text.includes('trace_id') || text.includes('reason_code')) {
    return language === 'vi'
      ? 'AI chưa có đủ thông tin chắc chắn để kết luận. Bạn có thể bổ sung hồ sơ, tải CV hoặc yêu cầu tư vấn viên hỗ trợ.'
      : 'AI does not have enough reliable information yet. You can complete your profile, upload a CV, or ask a human counsellor for help.';
  }
  return text;
};

const friendlyActionLabel = (value, language) => {
  const key = String(value || '').trim().toLowerCase();
  const labels = {
    open_wizard: { vi: 'Mở Wizard', en: 'Open Wizard' },
    edit_profile: { vi: 'Cập nhật hồ sơ', en: 'Edit profile' },
    request_human_fallback: { vi: 'Gặp tư vấn viên', en: 'Ask a counsellor' },
    'complete profile fields': { vi: 'Hoàn thiện thông tin hồ sơ', en: 'Complete profile fields' },
  };
  return labels[key]?.[language] || value;
};
