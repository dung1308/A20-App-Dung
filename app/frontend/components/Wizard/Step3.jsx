import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

const Step3 = ({ data, onUpdate }) => {
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;

  const toggleOption = (option) => {
    const next = data.includes(option.id)
      ? data.filter((item) => item !== option.id)
      : [...data, option.id];
    onUpdate({ dislikes: next });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="mb-4">
        <h2 className="text-left text-lg font-bold text-blue-900">{text.title}</h2>
        <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{text.multipleChoices}</p>
      </div>
      {text.options.map((option) => (
        <button
          key={option.id}
          onClick={() => toggleOption(option)}
          className={`w-full rounded-xl border-2 p-4 text-left font-semibold transition-all duration-200 ${
            data.includes(option.id)
              ? 'border-blue-900 bg-blue-50 text-blue-900 shadow-md'
              : 'border-slate-200 text-slate-600 hover:border-blue-300'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

const viText = {
  title: 'Bạn không thích làm gì?',
  multipleChoices: 'Có thể chọn nhiều đáp án',
  options: [
    { id: 'programming', label: 'Lập trình' },
    { id: 'writing', label: 'Viết lách' },
    { id: 'calculation', label: 'Tính toán nhiều' },
    { id: 'public_speaking', label: 'Nói trước đám đông' },
    { id: 'detail_work', label: 'Công việc quá chi tiết' },
  ],
};

const enText = {
  title: 'What do you dislike doing?',
  multipleChoices: 'Multiple choices',
  options: [
    { id: 'programming', label: 'Programming' },
    { id: 'writing', label: 'Writing' },
    { id: 'calculation', label: 'Heavy calculation' },
    { id: 'public_speaking', label: 'Public speaking' },
    { id: 'detail_work', label: 'Detail-heavy work' },
  ],
};

export default Step3;
