import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useLanguage } from '../context/LanguageContext';

const ResourcesPage = () => {
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;
  const [contextual, setContextual] = useState([]);
  const [readiness, setReadiness] = useState(null);

  useEffect(() => {
    let mounted = true;
    api.getContextualResources({ surface: 'resources' })
      .then((data) => {
        if (!mounted) return;
        setContextual(data.resources || []);
        setReadiness(data.readiness || null);
      })
      .catch(() => {
        if (mounted) {
          setContextual([]);
          setReadiness(null);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-slate-50/50 p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="border-b-4 border-primary pb-4">
          <h1 className="text-3xl font-black tracking-tight text-primary">{text.title}</h1>
          <p className="mt-1 font-medium text-slate-500">{text.subtitle}</p>
        </header>

        {readiness && (
          <section className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">{text.nextActions}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {text.readinessPrefix} {Math.round((readiness.completion_ratio || 0) * 100)}%. {text.readinessSuffix}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(readiness.next_actions || []).map((action) => (
                  <span key={action.id} className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700">
                    {translateActionLabel(action.label, language)}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {contextual.length > 0 && (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {contextual.map((item) => (
              <article key={item.id} className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">{item.surface}</p>
                <h2 className="mt-2 text-lg font-black text-slate-900">{translateResourceText(item.title, language)}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{translateResourceText(item.snippet, language)}</p>
              </article>
            ))}
          </section>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {text.guides.map((guide) => (
            <article key={guide.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-slate-900">{guide.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{guide.body}</p>
              <Link to={guide.href} className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white">
                {guide.action}
              </Link>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">{text.workflowTitle}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            {text.workflowSteps.map((step, index) => (
              <div key={step} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">{text.step} {index + 1}</p>
                <p className="mt-2 text-sm font-bold text-slate-800">{step}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

const viText = {
  title: 'Tài nguyên',
  subtitle: 'Hướng dẫn ngắn gọn để học sinh biết nên dùng tính năng nào trong từng bước chuẩn bị hồ sơ.',
  nextActions: 'Việc nên làm tiếp theo',
  readinessPrefix: 'Mức hoàn thiện hồ sơ là',
  readinessSuffix: 'Hoàn tất các mục này để AI tư vấn chính xác hơn.',
  workflowTitle: 'Quy trình đề xuất',
  step: 'Bước',
  workflowSteps: ['Hoàn thành Wizard', 'Tải CV PDF', 'Hỏi AI khi cần giải thích', 'Đọc báo cáo và cập nhật hồ sơ'],
  guides: [
    { title: 'Bắt đầu với Wizard', body: 'Trả lời Wizard để hệ thống hiểu học lực, sở thích, mục tiêu nghề nghiệp và ưu tiên ngành học của bạn.', action: 'Mở Wizard', href: '/wizard' },
    { title: 'Quản lý hồ sơ và CV', body: 'Cập nhật thông tin cá nhân, xem lại CV PDF đã tải lên và làm lại Wizard khi muốn thay đổi câu trả lời.', action: 'Mở hồ sơ', href: '/profile' },
    { title: 'Hỏi Tư vấn AI', body: 'Dùng trang Tư vấn AI để hỏi về ngành học, yêu cầu tuyển sinh, học bổng, hạn nộp hồ sơ và các bước ứng tuyển.', action: 'Mở Tư vấn AI', href: '/consultant' },
    { title: 'Xem báo cáo', body: 'Báo cáo tổng hợp kết quả matching, gợi ý ngành phù hợp, điểm cần cải thiện và bước tiếp theo cho hồ sơ.', action: 'Mở báo cáo', href: '/report' },
  ],
};

const enText = {
  title: 'Resources',
  subtitle: 'Short guidance to help students choose the right feature at each application step.',
  nextActions: 'Next best actions',
  readinessPrefix: 'Profile readiness is',
  readinessSuffix: 'Complete these items to improve AI guidance.',
  workflowTitle: 'Suggested workflow',
  step: 'Step',
  workflowSteps: ['Complete the Wizard', 'Upload a PDF CV', 'Ask AI for explanations', 'Read the report and update your profile'],
  guides: [
    { title: 'Start with the Wizard', body: 'Answer the Wizard so the system understands your academics, interests, career goals, and major preferences.', action: 'Open Wizard', href: '/wizard' },
    { title: 'Manage Profile and CV', body: 'Update personal information, review uploaded PDF CVs, and rerun the Wizard when your answers change.', action: 'Open Profile', href: '/profile' },
    { title: 'Ask the AI Consultant', body: 'Use AI Consultant to ask about majors, admission requirements, scholarships, deadlines, and application steps.', action: 'Open AI Consultant', href: '/consultant' },
    { title: 'Review Report', body: 'The report summarizes matching results, suitable majors, improvement areas, and next steps for your application.', action: 'Open Report', href: '/report' },
  ],
};

export default ResourcesPage;

const translateActionLabel = (label, language) => {
  const normalized = String(label || '').trim().toLowerCase();
  const dictionary = {
    'complete profile fields': { vi: 'Hoàn thiện thông tin hồ sơ', en: 'Complete profile fields' },
    'open wizard': { vi: 'Mở Wizard', en: 'Open Wizard' },
    'edit profile': { vi: 'Chỉnh sửa hồ sơ', en: 'Edit profile' },
    'upload cv': { vi: 'Tải CV lên', en: 'Upload CV' },
  };
  return dictionary[normalized]?.[language] || label;
};

const translateResourceText = (value, language) => {
  if (language !== 'vi') return value;
  const normalized = String(value || '').trim().toLowerCase();
  const dictionary = {
    'use the wizard to improve major recommendations': 'Dùng Wizard để cải thiện gợi ý ngành học',
    'answer interests, strengths, dislikes, and work style so the advisor can explain fit with clearer signals.': 'Trả lời về sở thích, thế mạnh, điều không thích và phong cách làm việc để cố vấn giải thích mức độ phù hợp rõ hơn.',
    'complete profile fields': 'Hoàn thiện thông tin hồ sơ',
    'add gpa, test scores, preferred majors, and goals so recommendations are more personal.': 'Bổ sung GPA, điểm thi, ngành quan tâm và mục tiêu để gợi ý cá nhân hóa hơn.',
    'upload or confirm your cv': 'Tải lên hoặc xác nhận CV',
    'a current cv helps the advisor use your activities, skills, and achievements in recommendations.': 'CV mới nhất giúp cố vấn dùng hoạt động, kỹ năng và thành tích của bạn trong gợi ý.',
  };
  return dictionary[normalized] || value;
};
