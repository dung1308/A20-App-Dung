import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

const Step2 = ({ data, onUpdate }) => {
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;

  const toggleOption = (option) => {
    const next = data.includes(option.id)
      ? data.filter((item) => item !== option.id)
      : [...data, option.id];
    onUpdate({ strengths: next });
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
  title: 'Thế mạnh của bạn là gì?',
  multipleChoices: 'Có thể chọn nhiều đáp án',
  options: [
    { id: 'problem_solving', label: 'Giải quyết vấn đề' },
    { id: 'communication', label: 'Giao tiếp' },
    { id: 'leadership', label: 'Lãnh đạo' },
    { id: 'creativity', label: 'Sáng tạo' },
    { id: 'data_analysis', label: 'Phân tích dữ liệu' },
  ],
};

const enText = {
  title: 'What are your strengths?',
  multipleChoices: 'Multiple choices',
  options: [
    { id: 'problem_solving', label: 'Problem solving' },
    { id: 'communication', label: 'Communication' },
    { id: 'leadership', label: 'Leadership' },
    { id: 'creativity', label: 'Creativity' },
    { id: 'data_analysis', label: 'Data analysis' },
  ],
};

export default Step2;
