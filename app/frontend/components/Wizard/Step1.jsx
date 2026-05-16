import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

const Step1 = ({ data, onUpdate }) => {
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;

  const toggleOption = (option) => {
    const nextData = data.includes(option.id)
      ? data.filter((item) => item !== option.id)
      : [...data, option.id];
    onUpdate({ interests: nextData });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="mb-4">
        <h3 className="text-left text-lg font-bold text-blue-900">{text.title}</h3>
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
  title: 'Bạn thích lĩnh vực nào?',
  multipleChoices: 'Có thể chọn nhiều đáp án',
  options: [
    { id: 'technology', label: 'Công nghệ' },
    { id: 'business', label: 'Kinh doanh' },
    { id: 'arts', label: 'Nghệ thuật' },
    { id: 'social_science', label: 'Khoa học xã hội' },
  ],
};

const enText = {
  title: 'Which fields do you like?',
  multipleChoices: 'Multiple choices',
  options: [
    { id: 'technology', label: 'Technology' },
    { id: 'business', label: 'Business' },
    { id: 'arts', label: 'Arts' },
    { id: 'social_science', label: 'Social Science' },
  ],
};

export default Step1;
