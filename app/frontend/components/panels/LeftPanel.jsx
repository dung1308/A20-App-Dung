import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
    LayoutDashboard, 
    MessageSquare, 
    FileText, 
    User, 
    BookOpen,
    ShieldCheck, 
    Users,
    BarChart3,
    Database,
    Sun,
    Moon,
    Menu,
    X
} from 'lucide-react';

/**
 * LeftPanel Component
 * Persistent navigation sidebar with role-based access control (RBAC).
 */
const LeftPanel = () => {
    const { role } = useAuth();
    const location = useLocation();

    // State to handle mobile menu visibility
    const [isOpen, setIsOpen] = useState(false);

    // Khởi tạo theme từ localStorage hoặc mặc định là dark mode
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const saved = localStorage.getItem('sidebar-theme');
        return saved ? saved === 'dark' : true;
    });

    // Lưu lựa chọn theme vào localStorage khi thay đổi
    useEffect(() => {
        localStorage.setItem('sidebar-theme', isDarkMode ? 'dark' : 'light');
    }, [isDarkMode]);

    // Automatically close sidebar when navigation occurs on mobile
    useEffect(() => {
        setIsOpen(false);
    }, [location.pathname]);

    // Role-based flags consistent with App.jsx security wrappers
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
            {/* Mobile Menu Toggle Button */}
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed top-3 left-3 z-[60] md:hidden p-2.5 rounded-xl transition-all duration-300 ${
                    isDarkMode 
                        ? 'bg-slate-800 text-slate-200 border border-slate-700 shadow-lg' 
                        : 'bg-white text-slate-600 border border-slate-200 shadow-sm'
                }`}
                aria-label="Toggle Menu"
            >
                {isOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            {/* Mobile Backdrop Overlay */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300"
                    onClick={() => setIsOpen(false)}
                />
            )}

            <aside className={`fixed md:static inset-y-0 left-0 z-50 w-64 h-full border-r flex flex-col font-sans transition-all duration-300 ease-in-out ${
                isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            } ${
                isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
            }`}>
            <div className="p-6 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-sm text-white">V</div>
                    <h1 className={`text-xl font-bold tracking-tight transition-colors ${
                        isDarkMode ? 'text-white' : 'text-slate-900'
                    }`}>
                        VinUni
                    </h1>
                </div>
                <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className={`p-2 rounded-lg transition-colors ${
                        isDarkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-yellow-400' : 'text-slate-500 hover:bg-slate-100 hover:text-blue-600'
                    }`}
                >
                    {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                </button>
            </div>

            <nav className="flex-1 px-4 space-y-6 overflow-y-auto">
                {/* "For Users" Section */}
                <div>
                    <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Dành cho học sinh</p>
                    <div className="space-y-1">
                        <NavLink to="/dashboard" className={navItemClass}>
                            <LayoutDashboard size={20} />
                            <span>Bảng điều khiển</span>
                        </NavLink>
                        <NavLink to="/consultant" className={navItemClass}>
                            <MessageSquare size={20} />
                            <span>Tư vấn AI</span>
                        </NavLink>
                        <NavLink to="/report" className={navItemClass}>
                            <FileText size={20} />
                            <span>Báo cáo (Report)</span>
                        </NavLink>
                        <NavLink to="/profile" className={navItemClass}>
                            <User size={20} />
                            <span>Hồ sơ cá nhân</span>
                        </NavLink>
                        <NavLink to="/resources" className={navItemClass}>
                            <BookOpen size={20} />
                            <span>Tai nguyen</span>
                        </NavLink>
                    </div>
                </div>

                {/* "System" Section for Staff & Admin */}
                {isStaff && (
                    <div>
                        <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Hệ thống (System)</p>
                        <div className="space-y-1">
                            <NavLink to="/staff" className={navItemClass}>
                                <Users size={20} />
                                <span>Staff Board</span>
                            </NavLink>
                            
                            {isAdmin && (
                                <NavLink to="/admin" className={navItemClass}>
                                    <ShieldCheck size={20} />
                                    <span>Admin Board</span>
                                </NavLink>
                            )}

                            <NavLink to="/system/tokens" className={navItemClass}>
                                <BarChart3 size={20} />
                                <span>Sử dụng Token</span>
                            </NavLink>
                            {isAdmin && (
                                <NavLink to="/system/database" className={navItemClass}>
                                    <Database size={20} />
                                    <span>Quản trị dữ liệu</span>
                                </NavLink>
                            )}
                        </div>
                    </div>
                )}
            </nav>

            <div className={`p-4 border-t mt-auto ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                <div className={`rounded-lg p-3 transition-colors ${isDarkMode ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Quyền truy cập:</p>
                    <p className={`text-sm font-medium capitalize ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{role || 'Sinh viên'}</p>
                </div>
            </div>
            </aside>
        </>
    );
};

export default LeftPanel;
