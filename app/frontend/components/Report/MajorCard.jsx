import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

const MajorCard = ({ major, onAsk }) => {
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;
  const displayName = major.major_id === 'ee' ? text.eeMajor : major.major_name;
  const breakdown = major.match_breakdown || {};
  const matchedSignals = breakdown.matched_signals || [];
  const tradeoffs = breakdown.tradeoffs || [];
  const evidence = breakdown.evidence || [];

  const getScoreColor = (score) => {
    if (score >= 70) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
    if (score >= 40) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-red-600 bg-red-50 border-red-100';
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold leading-tight text-blue-900">{displayName}</h3>
          {major.department && <p className="mt-1 text-xs text-slate-500">{major.department}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={`rounded border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${getScoreColor(major.match_score)}`}>
            {major.match_score}% {text.match}
          </span>
          {major.verified_source && (
            <span className="rounded border border-emerald-100 bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700">
              {text.verified}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-sm leading-relaxed text-slate-600">
          <p className="mb-1 font-black text-slate-800">{text.whyFit}</p>
          <p>{major.match_reason}</p>
          <p className="mt-2 text-[11px] text-slate-400">{text.checkOfficial}</p>
        </div>

        {(matchedSignals.length > 0 || tradeoffs.length > 0) && (
          <div className="grid gap-3">
            {matchedSignals.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{text.matchedSignals}</p>
                <div className="flex flex-wrap gap-2">
                  {matchedSignals.map((signal, index) => (
                    <span key={`${signal.label}-${index}`} className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">
                      {signal.label}: {String(signal.value)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {tradeoffs.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-amber-600">{text.tradeoffs}</p>
                <ul className="space-y-1">
                  {tradeoffs.map((tradeoff, index) => (
                    <li key={`${tradeoff.label}-${index}`} className="text-[11px] leading-snug text-slate-600">
                      <strong>{tradeoff.label}:</strong> {tradeoff.value}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">{text.studentExperience}</p>
          <p className="text-xs italic leading-relaxed text-slate-500">{major.what_students_do}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {evidence.map((source, index) => (
            <span key={`${source.title}-${index}`} className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
              {source.source_type || text.source}
            </span>
          ))}
          {major.source_url ? (
            <a href={major.source_url} target="_blank" rel="noreferrer" className="inline-flex text-[11px] font-black uppercase tracking-widest text-blue-700 hover:underline">
              {text.sourceVinuni}
            </a>
          ) : (
            <span className="inline-flex text-[11px] font-black uppercase tracking-widest text-amber-700">
              {text.aiEstimate}
            </span>
          )}
        </div>

        {onAsk && (
          <button type="button" onClick={() => onAsk(major)} className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-white">
            {text.askMajor}
          </button>
        )}
      </div>
    </div>
  );
};

const viText = {
  eeMajor: 'Kỹ thuật Điện và Máy tính',
  match: 'phù hợp',
  verified: 'Đã xác minh',
  whyFit: 'Vì sao ngành này phù hợp?',
  checkOfficial: 'Kết quả dùng tín hiệu từ hồ sơ/CV khi có và nên được đối chiếu với điều kiện tuyển sinh chính thức của VinUni.',
  matchedSignals: 'Tín hiệu phù hợp',
  tradeoffs: 'Điểm cần kiểm tra',
  studentExperience: 'Trải nghiệm học tập',
  source: 'nguồn',
  sourceVinuni: 'Nguồn: admissions.vinuni.edu.vn',
  aiEstimate: 'AI ước tính - cần kiểm tra nguồn chính thức',
  askMajor: 'Hỏi thêm về ngành này',
};

const enText = {
  eeMajor: 'Electrical and Computer Engineering',
  match: 'match',
  verified: 'Verified info',
  whyFit: 'Why this fits you?',
  checkOfficial: 'Uses your profile/CV signals when available and should be checked against official VinUni admission conditions.',
  matchedSignals: 'Matched signals',
  tradeoffs: 'Tradeoffs to check',
  studentExperience: 'Student experience',
  source: 'source',
  sourceVinuni: 'Source: admissions.vinuni.edu.vn',
  aiEstimate: 'AI estimate - verify with official sources',
  askMajor: 'Ask about this major',
};

export default MajorCard;
