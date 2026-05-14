import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import api from '../services/api';
import { useAuth } from '../context/AuthContext'; // Import useAuth
import Step1 from '../components/Wizard/Step1';
import Step2 from '../components/Wizard/Step2';
import Step3 from '../components/Wizard/Step3';
import Step4 from '../components/Wizard/Step4';
import CVUpload from '../components/CVUpload/CVUpload';

const WizardPage = () => {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const { wizardData, setWizardData, setMatchResults, cvText, cvSignals, cvDocumentId, setCVData } = useStore(); 
  const { userId, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const stepsMap = {
    0: (
      <div className="step-container">
        <h2 className="text-2xl font-black text-blue-900 mb-4">Chào mừng bạn!</h2>
        <p className="text-slate-600 mb-8">Để bắt đầu, bạn có thể tải lên CV để AI hiểu rõ hơn về năng lực và kinh nghiệm của bạn.</p>
        <CVUpload onUploadSuccess={(data) => setCVData(data.cv_text, data.cv_signals, data.cv_document_id, data.structured_data)} />
        
        {/* Visual feedback for extracted CV signals */}
        {(cvSignals?.extracted_skills?.length > 0 || cvSignals?.extracted_job_titles?.length > 0) && (
          <div className="mt-6 p-6 bg-blue-50/30 rounded-2xl border border-blue-100 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-blue-600">analytics</span>
              <h3 className="text-sm font-black text-blue-900 uppercase tracking-tight">Kết quả phân tích CV</h3>
            </div>
            
            {cvSignals?.persona_summary && (
              <div className="mb-6 p-4 bg-white rounded-xl border border-blue-50 shadow-sm">
                <p className="text-sm text-slate-700 leading-relaxed italic">"{cvSignals.persona_summary}"</p>
              </div>
            )}
            
            {cvSignals?.extracted_job_titles?.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Kinh nghiệm chuyên môn</p>
                <div className="flex flex-wrap gap-2">
                  {cvSignals.extracted_job_titles.map((title, i) => (
                    <span key={i} className="px-3 py-1 bg-blue-900 text-white text-[11px] font-bold rounded-lg shadow-sm">
                      {title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {cvSignals?.extracted_skills?.length > 0 && (
              <div className={cvSignals?.suggested_majors?.length > 0 ? "mb-4" : ""}>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Kỹ năng nổi bật</p>
                <div className="flex flex-wrap gap-2">
                  {cvSignals.extracted_skills.map((skill, i) => (
                    <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-lg border border-blue-100">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {cvSignals?.suggested_majors?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-50">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 italic">Gợi ý ban đầu từ AI</p>
                <p className="text-xs text-slate-600 font-medium leading-relaxed flex flex-wrap items-center gap-x-1">
                  Dựa trên hồ sơ, bạn có tiềm năng cao ở: 
                  {cvSignals.suggested_majors.map((major, i) => (
                    <span 
                      key={i} 
                      className="group relative inline-block cursor-help border-b border-dotted border-blue-400 text-blue-900 font-bold"
                    >
                      {major}{i < cvSignals.suggested_majors.length - 1 ? "," : ""}
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                        {cvSignals.major_explanations?.[major] || "Gợi ý dựa trên phân tích hồ sơ."}
                        <span className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800"></span>
                      </span>
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

  // Redirect to login if not authenticated or userId is missing
  useEffect(() => {
    if (!isAuthenticated || !userId) navigate('/login');
  }, [isAuthenticated, userId, navigate]);

  /**
   * Basic validation to ensure the student has selected 
   * at least one option before proceeding.
   */
  const validateStep = () => {
    if (step === 0) return true; // CV step is optional
    if (step === 1) return wizardData.interests.length > 0;
    if (step === 2) return wizardData.strengths.length > 0;
    if (step === 3) return wizardData.dislikes.length > 0;
    if (step === 4) return wizardData.work_style !== '';
    return false;
  };

  const handleSkip = () => {
    const email = userId || localStorage.getItem('user_email');
    if (email) {
      localStorage.setItem(`wizard_completed_${email}`, 'true');
    }
    navigate('/dashboard');
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep(s => s + 1);
    } else {
      alert("Vui lòng chọn ít nhất một lựa chọn để tiếp tục.");
    }
  };

  const handleSubmit = async () => {
    if (!validateStep()) {
      alert("Vui lòng hoàn thành bước này trước khi xem kết quả.");
      return;
    }

    setLoading(true);
    try {
      // Calls the /api/match endpoint to get structured Top 3 recommendations
      const data = await api.runMatch({
        user_id: userId, 
        answers: wizardData, 
        cv_text: cvText,
        cv_signals: cvSignals,
        cv_document_id: cvDocumentId
      });
      setMatchResults(data);
      const email = userId || localStorage.getItem('user_email');
      if (email) {
        localStorage.setItem(`wizard_completed_${email}`, 'true');
        localStorage.setItem(`latest_report_${email}`, JSON.stringify(data));
      }
      navigate('/dashboard');
      navigate('/report');
    } catch (err) {
      console.error("Match submission failed:", err);
      alert("Không thể tải kết quả. Vui lòng kiểm tra lại thông tin hoặc thử lại sau.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wizard-page min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        {/* Top Progress Bar */}
        <div className="h-2 bg-slate-100 w-full">
          <div 
            className="h-full bg-blue-900 transition-all duration-500" 
            style={{ width: `${(step / 4) * 100}%` }}
          ></div>
        </div>

        <div className="p-8 md:p-12">
          <div className="flex justify-between items-center mb-10">
            <span className="text-[10px] uppercase tracking-widest font-black text-blue-900/40">Step {step} of 4</span>
            <h1 className="text-sm font-bold text-blue-900">Brilliant Mentor AI</h1>
          </div>

          <div className="step-content min-h-[300px] w-full flex flex-col justify-start">
            {stepsMap[step]}
          </div>
          
          <div className="nav-buttons mt-12 flex justify-between gap-4">
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button onClick={() => setStep(step - 1)} className="px-6 py-3 text-slate-500 font-bold hover:text-blue-900 transition-colors">Quay lại</button>
              )}
              <button onClick={handleSkip} className="px-4 py-2 text-slate-400 text-[11px] font-bold uppercase tracking-widest hover:text-slate-600 transition-colors">Bỏ qua phần chọn lựa</button>
            </div>
            
            {step < 4 ? (
              <button onClick={handleNext} className="px-10 py-3 bg-blue-900 text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all">Tiếp theo</button>
            ) : (
              <button onClick={handleSubmit} disabled={loading} className="px-10 py-3 bg-blue-900 text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all disabled:opacity-50">
                {loading ? "Đang xử lý..." : "Xem kết quả"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default WizardPage;
