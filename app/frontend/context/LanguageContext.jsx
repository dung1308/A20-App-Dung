import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const LanguageContext = createContext(null);

const LABELS = {
  en: {
    accountMenu: 'Account menu',
    profile: 'Profile',
    signOut: 'Sign out',
    languageToggleTitle: 'Switch language',
    appTitle: 'VinUni Admission',
    paginationPrevious: 'Previous',
    paginationNext: 'Next',
    paginationPage: 'Page',
    paginationOf: 'of',
    paginationShowing: 'Showing',
    paginationRows: 'rows',
  },
  vi: {
    accountMenu: 'Menu tài khoản',
    profile: 'Hồ sơ',
    signOut: 'Đăng xuất',
    languageToggleTitle: 'Đổi ngôn ngữ',
    appTitle: 'Tuyển sinh VinUni',
    paginationPrevious: 'Trước',
    paginationNext: 'Sau',
    paginationPage: 'Trang',
    paginationOf: 'trên',
    paginationShowing: 'Đang hiển thị',
    paginationRows: 'dòng',
  },
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => localStorage.getItem('ui_language') || 'vi');

  useEffect(() => {
    localStorage.setItem('ui_language', language);
    document.documentElement.lang = language === 'vi' ? 'vi' : 'en';
  }, [language]);

  const value = useMemo(() => ({
    language,
    isVietnamese: language === 'vi',
    setLanguage,
    toggleLanguage: () => setLanguage((current) => (current === 'vi' ? 'en' : 'vi')),
    t: (key) => LABELS[language]?.[key] || LABELS.en[key] || key,
  }), [language]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
