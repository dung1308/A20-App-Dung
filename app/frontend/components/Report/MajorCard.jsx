import React from 'react';

const MajorCard = ({ major }) => {
  const getScoreColor = (score) => {
    if (score >= 70) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
    if (score >= 40) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-red-600 bg-red-50 border-red-100';
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex justify-between items-start gap-4 mb-4">
        <div>
          <h3 className="text-lg font-bold text-blue-900 leading-tight">{major.major_name}</h3>
          {major.department && <p className="text-xs text-slate-500 mt-1">{major.department}</p>}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider border ${getScoreColor(major.match_score)}`}>
            {major.match_score}% Match
          </span>
          {major.verified_source && (
            <span className="px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border bg-emerald-50 text-emerald-700 border-emerald-100">
              Verified Info
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-sm text-slate-600 leading-relaxed">
          <p className="font-black text-slate-800 mb-1">Why this fits you?</p>
          <p>{major.match_reason}</p>
          <p className="text-[11px] text-slate-400 mt-2">
            Uses your profile/CV signals when available and should be checked against official VinUni admission conditions.
          </p>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Student experience</p>
          <p className="text-xs text-slate-500 leading-relaxed italic">{major.what_students_do}</p>
        </div>

        {major.source_url ? (
          <a href={major.source_url} target="_blank" rel="noreferrer" className="inline-flex text-[11px] font-black uppercase tracking-widest text-blue-700 hover:underline">
            Source: admissions.vinuni.edu.vn
          </a>
        ) : (
          <span className="inline-flex text-[11px] font-black uppercase tracking-widest text-amber-700">
            AI Estimate - verify with official sources
          </span>
        )}
      </div>
    </div>
  );
};

export default MajorCard;
