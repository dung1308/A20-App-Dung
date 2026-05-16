import React from 'react';
import { useLanguage } from '../context/LanguageContext';

const Pagination = ({ page, totalItems, pageSize, onPageChange }) => {
  const { t } = useLanguage();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <p className="font-bold">
        {t('paginationShowing')} {start}-{end} / {totalItems} {t('paginationRows')}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-black uppercase tracking-widest text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('paginationPrevious')}
        </button>
        <span className="px-2 font-bold">
          {t('paginationPage')} {safePage} {t('paginationOf')} {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-black uppercase tracking-widest text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('paginationNext')}
        </button>
      </div>
    </div>
  );
};

export default Pagination;
