import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import Step1 from '../components/Wizard/Step1';
import Step2 from '../components/Wizard/Step2';
import Step3 from '../components/Wizard/Step3';
import Step4 from '../components/Wizard/Step4';
import CVUpload from '../components/CVUpload/CVUpload';

const WizardPage = () => {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const { language, toggleLanguage } = useLanguage();
  const text = language === 'vi' ? viText : enText;
  const { wizardData, setWizardData, setMatchResults, cvText, cvSignals, cvDocumentId, setCVData } = useStore();
  const { userId, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated || !userId) navigate('/login');
  }, [isAuthenticated, userId, navigate]);

  const validateStep = () => {
    if (step === 0) return true;
    if (step === 1) return wizardData.interests.length > 0;
    if (step === 2) return wizardData.strengths.length > 0;
    if (step === 3) return wizardData.dislikes.length > 0;
    if (step === 4) return wizardData.work_style !== '';
    return false;
  };

  const handleSkip = () => {
    const email = userId || localStorage.getItem('user_email');
    if (email) localStorage.setItem(`wizard_completed_${email}`, 'true');
    navigate('/dashboard');
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep((current) => current + 1);
    } else {
      alert(text.chooseOne);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep()) {
      alert(text.completeStep);
      return;
    }

    setLoading(true);
    try {
      const data = await api.runMatch({
        user_id: userId,
        answers: wizardData,
        cv_text: cvText,
        cv_signals: cvSignals,
        cv_document_id: cvDocumentId
      });
      setMatchResults(normalizeMatchResult(data, language));
      const email = userId || localStorage.getItem('user_email');
      if (email) {
        localStorage.setItem(`wizard_completed_${email}`, 'true');
        localStorage.setItem(`latest_report_${email}`, JSON.stringify(normalizeMatchResult(data, language)));
      }
      navigate('/report');
    } catch (err) {
      console.error('Match submission failed:', err);
      alert(text.submitError);
    } finally {
      setLoading(false);
    }
  };

  const stepsMap = {
    0: (
      <div className="step-container">
        <h2 className="mb-4 text-2xl font-black text-blue-900">{text.welcome}</h2>
        <p className="mb-8 text-slate-600">{text.cvIntro}</p>
        <CVUpload onUploadSuccess={(data) => setCVData(data.cv_text, data.cv_signals, data.cv_document_id, data.structured_data)} />

        {(cvSignals?.extracted_skills?.length > 0 || cvSignals?.extracted_job_titles?.length > 0) && (
          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/30 p-6 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-600">analytics</span>
              <h3 className="text-sm font-black uppercase tracking-tight text-blue-900">{text.cvAnalysis}</h3>
            </div>

            {cvSignals?.persona_summary && (
              <div className="mb-6 rounded-xl border border-blue-50 bg-white p-4 shadow-sm">
                <p className="text-sm italic leading-relaxed text-slate-700">"{cvSignals.persona_summary}"</p>
              </div>
            )}

            {cvSignals?.extracted_job_titles?.length > 0 && (
              <SignalGroup title={text.experienceSignals} items={cvSignals.extracted_job_titles} tone="dark" />
            )}

            {cvSignals?.extracted_skills?.length > 0 && (
              <SignalGroup title={text.skillSignals} items={cvSignals.extracted_skills} />
            )}

            {cvSignals?.suggested_majors?.length > 0 && (
              <div className="mt-4 border-t border-slate-50 pt-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-emerald-600">{text.initialSuggestions}</p>
                <p className="flex flex-wrap items-center gap-x-1 text-xs font-medium leading-relaxed text-slate-600">
                  {text.basedOnProfile}
                  {cvSignals.suggested_majors.map((major, index) => (
                    <span key={major} className="font-bold text-blue-900">
                      {major}{index < cvSignals.suggested_majors.length - 1 ? ',' : ''}
                    </span>
                  ))}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    ),
    1: <Step1 data={wizardData.interests} onUpdate={setWizardData} />,
    2: <Step2 data={wizardData.strengths} onUpdate={setWizardData} />,
    3: <Step3 data={wizardData.dislikes} onUpdate={setWizardData} />,
    4: <Step4 data={wizardData.work_style} onUpdate={setWizardData} />,
  };

  return (
    <div className="wizard-page flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl">
        <div className="h-2 w-full bg-slate-100">
          <div className="h-full bg-blue-900 transition-all duration-500" style={{ width: `${(step / 4) * 100}%` }} />
        </div>

        <div className="p-8 md:p-12">
          <div className="mb-10 flex items-center justify-between gap-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-900/40">
              {text.step} {step} {text.of} 4
            </span>
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-bold text-blue-900">Brilliant Mentor AI</h1>
              <button
                type="button"
                onClick={toggleLanguage}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-widest text-blue-900 hover:bg-slate-50"
              >
                {language === 'vi' ? 'Eng' : 'Việt'}
              </button>
            </div>
          </div>

          <div className="step-content flex min-h-[300px] w-full flex-col justify-start">
            {stepsMap[step]}
          </div>

          <div className="nav-buttons mt-12 flex justify-between gap-4">
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button onClick={() => setStep(step - 1)} className="px-6 py-3 font-bold text-slate-500 transition-colors hover:text-blue-900">
                  {text.back}
                </button>
              )}
              <button onClick={handleSkip} className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 transition-colors hover:text-slate-600">
                {text.skip}
              </button>
            </div>

            {step < 4 ? (
              <button onClick={handleNext} className="rounded-xl bg-blue-900 px-10 py-3 font-bold text-white shadow-lg shadow-blue-900/20 transition-all active:scale-95">
                {text.next}
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={loading} className="rounded-xl bg-blue-900 px-10 py-3 font-bold text-white shadow-lg shadow-blue-900/20 transition-all active:scale-95 disabled:opacity-50">
                {loading ? text.processing : text.viewResult}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const SignalGroup = ({ title, items, tone = 'light' }) => (
  <div className="mb-4">
    <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</p>
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className={tone === 'dark'
          ? 'rounded-lg bg-blue-900 px-3 py-1 text-[11px] font-bold text-white shadow-sm'
          : 'rounded-lg border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-700'}
        >
          {item}
        </span>
      ))}
    </div>
  </div>
);

const normalizeMatchResult = (data, language) => {
  const friendlyReason = language === 'vi'
    ? 'AI chưa có đủ thông tin chắc chắn để đưa ra kết luận. Bạn có thể bổ sung hồ sơ, tải CV hoặc yêu cầu tư vấn viên hỗ trợ.'
    : 'AI does not have enough reliable information yet. You can complete your profile, upload a CV, or ask a human counsellor for help.';

  if (!data?.fallback_card && !data?.fallback) return data;
  return {
    ...data,
    fallback_card: {
      ...(data.fallback_card || {}),
      reason: typeof data.fallback_card?.reason === 'string' && !looksLikeJson(data.fallback_card.reason)
        ? data.fallback_card.reason
        : friendlyReason,
    },
    recovery_actions: (data.recovery_actions || []).map((action) => ({
      ...action,
      label: translateAction(action.label || action.id, language),
    })),
  };
};

const looksLikeJson = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.includes('"reason_code"') || trimmed.includes('trace_id');
};

const translateAction = (value, language) => {
  const key = String(value || '').toLowerCase();
  const dictionary = {
    open_wizard: { vi: 'Mở Wizard', en: 'Open Wizard' },
    edit_profile: { vi: 'Cập nhật hồ sơ', en: 'Edit profile' },
    request_human_fallback: { vi: 'Gặp tư vấn viên', en: 'Ask a counsellor' },
    'complete profile fields': { vi: 'Hoàn thiện thông tin hồ sơ', en: 'Complete profile fields' },
  };
  return dictionary[key]?.[language] || value;
};

const viText = {
  welcome: 'Chào mừng bạn!',
  cvIntro: 'Bạn có thể tải CV để AI hiểu rõ hơn về năng lực và kinh nghiệm của mình. Nếu chưa có CV, bạn vẫn có thể tiếp tục trả lời Wizard.',
  cvAnalysis: 'Kết quả phân tích CV',
  experienceSignals: 'Kinh nghiệm chuyên môn',
  skillSignals: 'Kỹ năng nổi bật',
  initialSuggestions: 'Gợi ý ban đầu từ AI',
  basedOnProfile: 'Dựa trên hồ sơ, bạn có tiềm năng cao ở: ',
  step: 'Bước',
  of: 'trên',
  back: 'Quay lại',
  skip: 'Bỏ qua phần chọn lựa',
  next: 'Tiếp theo',
  processing: 'Đang xử lý...',
  viewResult: 'Xem kết quả',
  chooseOne: 'Vui lòng chọn ít nhất một lựa chọn để tiếp tục.',
  completeStep: 'Vui lòng hoàn thành bước này trước khi xem kết quả.',
  submitError: 'Không thể tải kết quả. Vui lòng kiểm tra lại thông tin hoặc thử lại sau.',
};

const enText = {
  welcome: 'Welcome!',
  cvIntro: 'You can upload your CV so AI better understands your skills and experience. If you do not have a CV yet, you can still continue with the Wizard.',
  cvAnalysis: 'CV analysis result',
  experienceSignals: 'Professional experience',
  skillSignals: 'Highlighted skills',
  initialSuggestions: 'Initial AI suggestions',
  basedOnProfile: 'Based on your profile, you may be strong in: ',
  step: 'Step',
  of: 'of',
  back: 'Back',
  skip: 'Skip selection',
  next: 'Next',
  processing: 'Processing...',
  viewResult: 'View result',
  chooseOne: 'Please choose at least one option to continue.',
  completeStep: 'Please complete this step before viewing results.',
  submitError: 'Could not load results. Please check your information or try again later.',
};

export default WizardPage;
