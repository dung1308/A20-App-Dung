import React, { useState, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const LoginPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const { login, signup, loginWithGoogle, error, setError, loading } = useAuth();
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isLogin) {
        const data = await login(email, password);
      } else {
        await signup(fullName, email, password);
        setIsLogin(true);
      }
    } catch (err) { /* Lỗi đã được hook xử lý và lưu vào state error */ }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const data = await loginWithGoogle(credentialResponse.credential);
    } catch (err) { /* Error handled by hook */ }
  };

  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

  useEffect(() => {
    // Kiểm tra nếu thiếu Client ID để cảnh báo sớm cho dev
    if (!GOOGLE_CLIENT_ID) {
      console.error("LỖI: VITE_GOOGLE_CLIENT_ID chưa được cấu hình trong file .env");
    }
  }, [GOOGLE_CLIENT_ID]);

  return (
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center p-4 font-inter">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 w-full max-w-[440px] shadow-sm">
          <header className="text-center mb-8">
            <h2 className="text-[30px] font-bold text-[#003466] mb-2 leading-tight">
              {isLogin ? 'Chào mừng trở lại' : 'Tạo tài khoản'}
            </h2>
            <p className="text-base text-[#424750] leading-relaxed">
              {isLogin 
                ? 'Vui lòng đăng nhập để tiếp tục hành trình cùng AI Mentor.' 
                : 'Bắt đầu quá trình xét tuyển chuyên nghiệp ngay hôm nay.'}
            </p>
          </header>

          {error && (
            <div className="bg-error-container text-error p-3 rounded-lg text-sm mb-6 flex items-center gap-2 border border-error/20">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span className="flex-1">
                {typeof error === 'string' ? error : JSON.stringify(error)}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-[#0d1c2e]">Họ và tên</label>
                <input 
                  type="text" 
                  value={fullName} 
                  onChange={(e) => setFullName(e.target.value)} 
                  className="w-full px-4 py-3 bg-[#F1F5F9] border border-[#737781] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003466]/10 focus:border-[#003466] transition-all" 
                  placeholder="Nguyễn Văn A"
                  required 
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-[#0d1c2e]">Email</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                className="w-full px-4 py-3 bg-[#F1F5F9] border border-[#737781] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003466]/10 focus:border-[#003466] transition-all" 
                placeholder="student@vinuni.edu.vn"
                required 
              />
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-[#0d1c2e]">Mật khẩu</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                className="w-full px-4 py-3 bg-[#F1F5F9] border border-[#737781] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003466]/10 focus:border-[#003466] transition-all" 
                required 
              />
              {!isLogin && (
                <p className="text-[11px] text-[#64748b] leading-relaxed italic">
                  Mật khẩu cần ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt (VD: @, #, $, ...).
                </p>
              )}
            </div>
            
            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-3.5 bg-[#003466] text-white rounded-lg font-bold hover:bg-[#1a4b84] transition-all shadow-md active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" color="white" />
                  <span>Đang xử lý...</span>
                </>
              ) : (
                isLogin ? 'Đăng nhập' : 'Đăng ký'
              )}
            </button>
          </form>

          {isLogin && (
            <>
              <div className="my-8 text-center relative">
                <hr className="border-0 border-t border-[#E2E8F0]" />
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-4 text-sm text-[#9ca3af] font-medium">Hoặc</span>
              </div>

              <div className="flex justify-center">
                {GOOGLE_CLIENT_ID ? (
                  <GoogleLogin
                      onSuccess={handleGoogleSuccess}
                      onError={() => setError('Đăng nhập Google thất bại')}
                      useOneTap
                      shape="pill"
                      theme="outline"
                    />
                ) : (
                  <div className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100 italic">
                    Đăng nhập bằng Google hiện đang bảo trì (Thiếu Client ID).
                  </div>
                )}
              </div>
            </>
          )}

          <div className="mt-8 text-center text-sm text-[#424750]">
            {isLogin ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}
            <button 
              onClick={() => setIsLogin(!isLogin)}
              className="ml-1 text-[#003466] font-bold hover:underline"
            >
              {isLogin ? 'Đăng ký ngay' : 'Đăng nhập'}
            </button>
          </div>
          {isLogin && (
            <div className="mt-3 text-center text-xs text-[#64748b]">
              <Link to="/admin-signup" className="font-semibold text-[#003466] hover:underline">
                Create an admin account
              </Link>
            </div>
          )}
        </div>
      </div>
  );
};

export default LoginPage;
