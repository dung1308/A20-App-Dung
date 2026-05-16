import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, User } from 'lucide-react';
import LeftPanel from '../components/panels/LeftPanel';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const AuthenticatedLayout = () => {
  const navigate = useNavigate();
  const { userId, userName, userAvatar, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const userEmail = userId || localStorage.getItem('user_email') || 'User';
  const displayName = userName || userEmail;
  const initial = (displayName || userEmail).charAt(0).toUpperCase();

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsAccountMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const openProfile = () => {
    setIsAccountMenuOpen(false);
    navigate('/profile');
  };

  return (
    <div className="authenticated-layout flex h-screen w-full overflow-hidden bg-slate-50 font-inter">
      <LeftPanel />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 pl-16 pr-4 md:px-8 flex items-center justify-between bg-white border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-black text-[#003466] hidden md:block">{t('appTitle')}</h1>
          </div>

          <div ref={menuRef} className="relative flex items-center gap-3">
            <button
              type="button"
              onClick={toggleLanguage}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-widest text-[#003466] shadow-sm hover:bg-slate-50"
              title={t('languageToggleTitle')}
              aria-label={t('languageToggleTitle')}
            >
              {language === 'vi' ? 'Eng' : 'Việt'}
            </button>
            <button
              type="button"
              onClick={() => setIsAccountMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-full px-1.5 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#003466]/20 transition-colors"
              aria-haspopup="menu"
              aria-expanded={isAccountMenuOpen}
              title={t('accountMenu')}
            >
              <span className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-[#003466] font-bold text-sm border border-blue-100 shadow-sm overflow-hidden">
                {userAvatar ? (
                  <img src={userAvatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  initial
                )}
              </span>
              <ChevronDown
                size={16}
                className={`hidden sm:block text-slate-500 transition-transform ${isAccountMenuOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {isAccountMenuOpen && (
              <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl" role="menu">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="truncate text-sm font-black text-slate-900">{displayName}</p>
                  <p className="truncate text-xs text-slate-500">{userEmail}</p>
                </div>

                <button
                  type="button"
                  onClick={openProfile}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
                  role="menuitem"
                >
                  <User size={17} aria-hidden="true" />
                  <span>{t('profile')}</span>
                </button>

                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm font-bold text-red-600 hover:bg-red-50"
                  role="menuitem"
                >
                  <LogOut size={17} aria-hidden="true" />
                  <span>{t('signOut')}</span>
                </button>
              </div>
            )}

          </div>
        </header>

        <main className="flex-1 flex flex-col min-h-0 overflow-y-auto overflow-x-hidden relative [-webkit-overflow-scrolling:touch]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AuthenticatedLayout;
