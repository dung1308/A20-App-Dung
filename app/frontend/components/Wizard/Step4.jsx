import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

const Step4 = ({ data, onUpdate }) => {
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="mb-4 text-left text-lg font-bold text-blue-900">{text.title}</h3>
      {text.options.map((option) => (
        <button
          key={option.id}
          onClick={() => onUpdate({ work_style: option.id })}
          className={`w-full rounded-xl border-2 p-4 text-left font-semibold transition-all duration-200 ${
            data === option.id
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
  title: 'Phong cách làm việc của bạn?',
  options: [
    { id: 'solo', label: 'Làm việc độc lập' },
    { id: 'team', label: 'Làm việc nhóm' },
    { id: 'mixed', label: 'Linh hoạt cả hai' },
  ],
};

const enText = {
  title: 'What is your working style?',
  options: [
    { id: 'solo', label: 'Independent work' },
    { id: 'team', label: 'Teamwork' },
    { id: 'mixed', label: 'Flexible between both' },
  ],
};

export default Step4;
