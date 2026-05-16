import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

const SourceList = ({ sources = [], compact = false, showEmpty = false }) => {
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;
  const cleanSources = sources.filter(Boolean).map((source, index) => normalizeSource(source, index, text));

  if (cleanSources.length === 0) {
    if (!showEmpty) return null;

    return (
      <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined mt-0.5 text-[17px]">info</span>
          <p>{text.noSources}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${compact ? 'mt-3' : 'mt-4'} overflow-hidden rounded-xl border border-blue-100 bg-blue-50/40`}>
      <div className="flex items-center justify-between gap-3 border-b border-blue-100 bg-white/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-blue-700">verified</span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800">{text.sourcesTitle}</p>
            <p className="truncate text-[11px] text-slate-500">{text.sourcesSubtitle}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
          {cleanSources.length} {text.sourceCount}
        </span>
      </div>

      <div className="divide-y divide-blue-100/80">
        {cleanSources.map((source, index) => {
          const content = (
            <div className="block px-3 py-2.5 transition-colors hover:bg-white/70">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-white text-[11px] font-bold text-blue-700">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="line-clamp-1 text-[12px] font-semibold text-slate-800">{source.title}</p>
                    <span className="rounded border border-slate-100 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{source.host}</span>
                    {source.sourceTypeLabel && (
                      <span className="rounded border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black uppercase text-emerald-700">
                        {source.sourceTypeLabel}
                      </span>
                    )}
                    {source.date && <span className="text-[10px] text-slate-500">{text.updated} {source.date}</span>}
                  </div>
                  {source.snippet && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-600">{source.snippet}</p>}
                  {source.url && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-blue-700">
                      {text.openSource}
                      <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          );

          return source.url ? (
            <a key={source.key} href={source.url} target="_blank" rel="noopener noreferrer" className="block">{content}</a>
          ) : (
            <div key={source.key}>{content}</div>
          );
        })}
      </div>

      <div className="flex items-start gap-1.5 bg-white/60 px-3 py-2 text-[11px] text-slate-500">
        <span className="material-symbols-outlined mt-0.5 text-[14px]">fact_check</span>
        <span>{text.verifyNote}</span>
      </div>
    </div>
  );
};

const getHostLabel = (url, text) => {
  if (!url) return text.vinuniAdmissions;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('admissions.vinuni.edu.vn')) return text.vinuniAdmissions;
    if (host.includes('vinuni.edu.vn')) return 'VinUni';
    return host;
  } catch {
    return text.reference;
  }
};

const formatDate = (value, language) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US');
};

const sourceTitle = (source, index, text) => {
  if (typeof source === 'string') return source;
  return source.title || source.name || source.document_title || source.source || source.url || `${text.sourceLabel} ${index + 1}`;
};

const normalizeSource = (source, index, text) => {
  const url = typeof source === 'string' ? source : source?.url || source?.link || '';
  const sourceType = source?.source_type || source?.type || null;
  return {
    key: `${url || sourceTitle(source, index, text)}-${index}`,
    title: sourceTitle(source, index, text),
    url,
    host: getHostLabel(url, text),
    date: formatDate(source?.date || source?.updated_at || source?.retrieved_at, text.language),
    snippet: source?.snippet || source?.summary || source?.text_preview || source?.excerpt || null,
    sourceTypeLabel: text.sourceTypes[sourceType] || null,
  };
};

const viText = {
  language: 'vi',
  noSources: 'Chưa có nguồn chính thức được đính kèm cho câu trả lời này. Với thông tin tuyển sinh quan trọng, bạn nên kiểm tra lại trên trang VinUni.',
  sourcesTitle: 'Nguồn đã tham khảo',
  sourcesSubtitle: 'Dùng để bạn kiểm tra lại thông tin chính thức',
  sourceCount: 'nguồn',
  updated: 'Cập nhật',
  openSource: 'Mở nguồn',
  verifyNote: 'AI có thể tóm tắt chưa đầy đủ. Hãy ưu tiên thông tin trên trang chính thức khi ra quyết định.',
  vinuniAdmissions: 'Tuyển sinh VinUni',
  reference: 'Tài liệu tham khảo',
  sourceLabel: 'Nguồn',
  sourceTypes: { official: 'Chính thức', 'profile-based': 'Hồ sơ', derived: 'Suy luận', generated: 'AI tạo' },
};

const enText = {
  language: 'en',
  noSources: 'No official source is attached to this answer. For important admission information, check the VinUni website.',
  sourcesTitle: 'Referenced sources',
  sourcesSubtitle: 'Use these to verify official information',
  sourceCount: 'sources',
  updated: 'Updated',
  openSource: 'Open source',
  verifyNote: 'AI summaries may be incomplete. Prioritize official pages when making decisions.',
  vinuniAdmissions: 'VinUni Admissions',
  reference: 'Reference material',
  sourceLabel: 'Source',
  sourceTypes: { official: 'Official', 'profile-based': 'Profile', derived: 'Derived', generated: 'Generated' },
};

export default SourceList;
