import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../../state/store';

const LeftPanel = () => {
  const { userId, setUserId, role, setRole } = useStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();
  const userMenuRef = useRef(null);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_role');
    localStorage.removeItem('chat_history');
    setUserId(null);
    if (setRole) setRole(null);
    navigate('/');
  };

  return (
    <aside className="hidden md:flex flex-col h-full w-64 border-r border-slate-200 bg-slate-50 flex-shrink-0 z-20">
      <div className="px-6 py-8">
        <h2 className="text-lg font-bold text-blue-900">Admissions Portal</h2>
        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mt-1">AI-Driven Success</p>
      </div>
      <div className="flex-1 flex flex-col gap-y-6 overflow-y-auto">
        <div className="px-2">
          <h3 className="px-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">System</h3>
          <nav className="flex flex-col gap-y-0.5">
            <Link to="/system/tokens" className="text-slate-500 px-4 py-2 mx-2 flex items-center gap-3 font-inter text-[13px] font-semibold hover:bg-slate-100 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-[20px]">generating_tokens</span>
              Token used
            </Link>
            <Link to="/system/database" className="text-slate-500 px-4 py-2 mx-2 flex items-center gap-3 font-inter text-[13px] font-semibold hover:bg-slate-100 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-[20px]">database</span>
              Database
            </Link>
            {(role === 'admin' || role === 'editor') && (
              <Link to="/staff" className="text-slate-500 px-4 py-2 mx-2 flex items-center gap-3 font-inter text-[13px] font-semibold hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-[20px]">assignment_ind</span>
                Staff Dashboard
              </Link>
            )}
            {role === 'admin' && (
              <Link to="/admin" className="text-slate-500 px-4 py-2 mx-2 flex items-center gap-3 font-inter text-[13px] font-semibold hover:bg-slate-100 rounded-lg transition-colors">
                <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
                Admin Dashboard
              </Link>
            )}
          </nav>
        </div>

        <div className="px-2">
          <h3 className="px-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">For users</h3>
          <nav className="flex flex-col gap-y-0.5">
            <Link to="/dashboard" className="text-slate-500 px-4 py-2 mx-2 flex items-center gap-3 font-inter text-[13px] font-semibold hover:bg-slate-100 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-[20px]">dashboard</span>
              Dashboard
            </Link>
            <Link to="/consultant" className="text-slate-500 px-4 py-2 mx-2 flex items-center gap-3 font-inter text-[13px] font-semibold hover:bg-slate-100 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-[20px]">smart_toy</span>
              AI Consultant
            </Link>
            <Link to="/wizard" className="text-slate-500 px-4 py-2 mx-2 flex items-center gap-3 font-inter text-[13px] font-semibold hover:bg-slate-100 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-[20px]">tune</span>
              Preferences Change
            </Link>
            <a href="#" className="text-slate-500 px-4 py-2 mx-2 flex items-center gap-3 font-inter text-[13px] font-semibold hover:bg-slate-100 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-[20px]">library_books</span>
              Resources
            </a>
          </nav>
        </div>
      </div>
      <div className="mt-auto p-4">
        <div className="bg-[#003466] text-white rounded-xl p-4 shadow-lg shadow-blue-900/10">
          <p className="text-xs font-semibold opacity-80 mb-2">Need human advice?</p>
          <button className="w-full py-2 bg-[#fed65b] text-[#745c00] text-[12px] font-bold rounded-lg active:scale-95 transition-transform">
            Schedule Expert Call
          </button>
        </div>
        <div className="mt-6 px-2 relative" ref={userMenuRef}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center text-blue-900 font-bold text-xs flex-shrink-0 hover:ring-2 hover:ring-blue-400 transition-all outline-none"
            >
              {(userId || 'G').substring(0, 2).toUpperCase()}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate" title={userId}>{userId || 'Guest'}</p>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                {role === 'admin' 
                  ? 'Admin User' 
                  : role === 'editor' 
                    ? 'Staff User' 
                    : role === 'user' 
                      ? 'Student User' 
                      : 'Guest User'}
              </p>
            </div>
          </div>

          {showUserMenu && (
            <div className="absolute bottom-full left-0 mb-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-2">
              <Link to="/profile" onClick={() => setShowUserMenu(false)} className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 font-medium">
                Profile
              </Link>
              <Link to="/pricing" onClick={() => setShowUserMenu(false)} className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 font-medium">
                Pricing
              </Link>
              <div className="h-px bg-slate-100 my-1"></div>
              <button
                onClick={handleSignOut}
                className="w-full text-left px-4 py-2 text-sm text-red-600 font-bold hover:bg-red-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default LeftPanel;