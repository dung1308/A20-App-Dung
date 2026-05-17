import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { useLanguage } from '../context/LanguageContext';

const extractRequirements = (major) => {
  if (major?.admission_requirements) return major.admission_requirements;
  if (major?.requirements) return major.requirements;
  const requirementSection = (major?.sections || []).find((section) =>
    /yêu cầu|đầu vào|admission|requirement/i.test(section.title || '')
  );
  return requirementSection?.paragraphs?.join(' ') || '';
};

const parseRequirementLines = (requirements) =>
  String(requirements || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const MajorDetailPage = () => {
  const { majorId } = useParams();
  const location = useLocation();
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;
  const matchContext = location.state?.matchContext || null;
  const [major, setMajor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('reason');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.getMajorDetail(majorId)
      .then((data) => active && setMajor(data))
      .catch((err) => active && setError(err.response?.status === 404 ? text.notFound : text.loadError))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [majorId, text.loadError, text.notFound]);

  const skills = useMemo(() => matchContext?.match_breakdown?.matched_signals || [], [matchContext]);
  const requirements = useMemo(() => extractRequirements(major), [major]);
  const requirementLines = useMemo(() => parseRequirementLines(requirements), [requirements]);

  if (loading) return <div className="flex min-h-full items-center justify-center bg-slate-50 p-8"><LoadingSpinner size="lg" /></div>;

  if (error || !major) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 p-8">
        <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-black text-slate-900">{text.errorTitle}</h1>
          <p className="mt-2 text-sm text-slate-500">{error || text.loadError}</p>
          <Link to="/report" className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 text-xs font-black uppercase tracking-widest text-white">{text.backToReport}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50/50 p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-blue-700">{major.school_or_college || text.vinuniMajor}</p>
          <h1 className="mt-3 text-3xl font-black text-slate-950">{major.major_name}</h1>
          {major.degree_name && <p className="mt-2 text-sm font-bold text-slate-500">{major.degree_name}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            {major.official_url && (
              <a href={major.official_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-white">
                {text.officialPage}<ExternalLink size={14} />
              </a>
            )}
            <Link to="/report" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-700">{text.backToReport}</Link>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap border-b border-slate-100">
            {[
              ['reason', text.reasonTab],
              ['skills', text.skillsTab],
              ['requirements', text.requirementsTab],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`px-5 py-4 text-xs font-black uppercase tracking-widest ${activeTab === id ? 'border-b-2 border-blue-700 text-blue-800' : 'text-slate-400'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {activeTab === 'reason' && (
              matchContext ? (
                <div>
                  <p className="text-sm font-black text-blue-800">{matchContext.match_score}% {text.match}</p>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">{matchContext.match_reason}</p>
                </div>
              ) : (
                <p className="text-sm leading-7 text-slate-500">{text.noReason}</p>
              )
            )}

            {activeTab === 'skills' && (
              skills.length ? (
                <div className="flex flex-wrap gap-2">
                  {skills.map((signal, index) => (
                    <span key={`${signal.label}-${index}`} className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800">
                      {signal.label}: {String(signal.value)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-7 text-slate-500">{text.noSkills}</p>
              )
            )}

            {activeTab === 'requirements' && (
              requirementLines.length ? (
                <ul className="max-w-3xl space-y-2 pl-5 text-sm leading-7 text-slate-700">
                  {requirementLines.map((line, index) => (
                    <li key={`requirement-${index}`} className="list-disc">
                      {line.replace(/^\d+\.\s*/, '').replace(/^-\s*/, '')}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm leading-7 text-slate-500">{text.noRequirements}</p>
              )
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

const viText = {
  vinuniMajor: 'Ngành học VinUni',
  officialPage: 'Trang chính thức',
  backToReport: 'Quay lại báo cáo',
  reasonTab: 'Lý do AI đề xuất',
  skillsTab: 'Kỹ năng phù hợp',
  requirementsTab: 'Yêu cầu đầu vào',
  match: 'phù hợp',
  noReason: 'Chưa có ngữ cảnh report để hiển thị lý do AI đề xuất ngành này.',
  noSkills: 'Chưa có tín hiệu kỹ năng phù hợp từ Wizard/CV.',
  noRequirements: 'Chưa có yêu cầu đầu vào được lưu cho ngành này.',
  errorTitle: 'Không thể tải ngành học',
  notFound: 'Không tìm thấy ngành học này.',
  loadError: 'Đã có lỗi khi tải dữ liệu ngành học.',
};

const enText = {
  vinuniMajor: 'VinUni major',
  officialPage: 'Official page',
  backToReport: 'Back to report',
  reasonTab: 'Why AI suggested it',
  skillsTab: 'Matched skills',
  requirementsTab: 'Entry requirements',
  match: 'match',
  noReason: 'There is no report context available for this recommendation yet.',
  noSkills: 'No matched Wizard/CV signals are available yet.',
  noRequirements: 'No entry requirements are stored for this major yet.',
  errorTitle: 'Could not load major',
  notFound: 'This major was not found.',
  loadError: 'There was an error loading this major.',
};

export default MajorDetailPage;
