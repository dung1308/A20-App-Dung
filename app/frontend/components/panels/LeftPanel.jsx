import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Database,
  FileText,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Moon,
  ShieldCheck,
  Sun,
  User,
  Users,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

const LeftPanel = () => {
  const { role } = useAuth();
  const { language } = useLanguage();
  const location = useLocation();
  const text = language === 'vi' ? viText : enText;
  const [isOpen, setIsOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('sidebar-theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    localStorage.setItem('sidebar-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const isAdmin = role === 'admin';
  const isStaff = role === 'admin' || role === 'editor';

  const navItemClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
      isActive
        ? 'bg-blue-600 text-white shadow-md'
        : isDarkMode
          ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
          : 'text-slate-600 hover:bg-slate-100 hover:text-blue-600'
    }`;

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed top-3 left-3 z-[60] rounded-xl p-2.5 transition-all duration-300 md:hidden ${
          isDarkMode
            ? 'border border-slate-700 bg-slate-800 text-slate-200 shadow-lg'
            : 'border border-slate-200 bg-white text-slate-600 shadow-sm'
        }`}
        aria-label={text.toggleMenu}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col border-r font-sans transition-all duration-300 ease-in-out md:static ${
        isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
      } ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}>
        <div className="mb-4 flex items-center justify-between p-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-600 text-sm text-white">V</div>
            <h1 className={`text-xl font-bold tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              VinUni
            </h1>
          </div>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`rounded-lg p-2 transition-colors ${
              isDarkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-yellow-400' : 'text-slate-500 hover:bg-slate-100 hover:text-blue-600'
            }`}
            aria-label={text.toggleTheme}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-4">
          <div>
            <p className="mb-2 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500">{text.forStudents}</p>
            <div className="space-y-1">
              <NavLink to="/dashboard" className={navItemClass}><LayoutDashboard size={20} /><span>{text.dashboard}</span></NavLink>
              <NavLink to="/consultant" className={navItemClass}><MessageSquare size={20} /><span>{text.consultant}</span></NavLink>
              <NavLink to="/report" className={navItemClass}><FileText size={20} /><span>{text.report}</span></NavLink>
              <NavLink to="/profile" className={navItemClass}><User size={20} /><span>{text.profile}</span></NavLink>
              <NavLink to="/resources" className={navItemClass}><BookOpen size={20} /><span>{text.resources}</span></NavLink>
            </div>
          </div>

          {isStaff && (
            <div>
              <p className="mb-2 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500">{text.system}</p>
              <div className="space-y-1">
                <NavLink to="/staff" className={navItemClass}><Users size={20} /><span>{text.staff}</span></NavLink>
                {isAdmin && <NavLink to="/admin" className={navItemClass}><ShieldCheck size={20} /><span>{text.admin}</span></NavLink>}
                <NavLink to="/system/tokens" className={navItemClass}><BarChart3 size={20} /><span>{text.tokens}</span></NavLink>
                {isAdmin && <NavLink to="/system/database" className={navItemClass}><Database size={20} /><span>{text.database}</span></NavLink>}
              </div>
            </div>
          )}
        </nav>

        <div className={`mt-auto border-t p-4 ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className={`rounded-lg p-3 transition-colors ${isDarkMode ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
            <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">{text.accessRole}</p>
            <p className={`text-sm font-medium capitalize ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{role || text.student}</p>
          </div>
        </div>
      </aside>
    </>
  );
};

const viText = {
  toggleMenu: 'Mở menu',
  toggleTheme: 'Đổi giao diện',
  forStudents: 'Dành cho học sinh',
  dashboard: 'Bảng điều khiển',
  consultant: 'Tư vấn AI',
  report: 'Báo cáo',
  profile: 'Hồ sơ cá nhân',
  resources: 'Tài nguyên',
  system: 'Hệ thống',
  staff: 'Bảng tư vấn viên',
  admin: 'Bảng quản trị',
  tokens: 'Sử dụng Token',
  database: 'Quản trị dữ liệu',
  accessRole: 'Quyền truy cập:',
  student: 'Học sinh',
};

const enText = {
  toggleMenu: 'Toggle menu',
  toggleTheme: 'Toggle theme',
  forStudents: 'For students',
  dashboard: 'Dashboard',
  consultant: 'AI Consultant',
  report: 'Report',
  profile: 'Profile',
  resources: 'Resources',
  system: 'System',
  staff: 'Staff Board',
  admin: 'Admin Board',
  tokens: 'Token Usage',
  database: 'Data Management',
  accessRole: 'Access role:',
  student: 'Student',
};

export default LeftPanel;
