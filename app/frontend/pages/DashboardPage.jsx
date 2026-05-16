import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

const DashboardPage = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-4 text-2xl font-bold text-slate-800">{text.title}</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-6 text-lg text-slate-600">{text.body}</p>
          <button
            onClick={() => navigate('/consultant')}
            className="rounded-xl bg-blue-700 px-8 py-4 font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-800 active:scale-95"
          >
            {text.cta}
          </button>
        </div>
      </div>
    </div>
  );
};

const viText = {
  title: 'Chào mừng trở lại!',
  body: 'Bạn đã hoàn thành khảo sát định hướng. Bây giờ, hãy trò chuyện với Cố vấn AI để khám phá các lựa chọn phù hợp nhất dành cho bạn.',
  cta: 'Bắt đầu tư vấn ngay',
};

const enText = {
  title: 'Welcome back!',
  body: 'You have completed the orientation survey. Now chat with the AI Advisor to explore the best options for you.',
  cta: 'Start consulting now',
};

export default DashboardPage;
