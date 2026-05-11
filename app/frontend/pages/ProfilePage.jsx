import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

/**
 * Student Profile Page
 * Allows students to manage their own academic data and preferences.
 */
const ProfilePage = () => {
    const [profile, setProfile] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [formData, setFormData] = useState({
        full_name: '',
        phone: '',
        gpa: '',
        ielts: '',
        majors: ''
    });

    const userEmail = localStorage.getItem('user_email');
    const token = localStorage.getItem('token');

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        setLoading(true);
        try {
            const response = await fetch(`http://localhost:8000/api/profile/${userEmail}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setProfile(data);
                setFormData({
                    full_name: data.full_name || '',
                    phone: data.phone || '',
                    gpa: data.gpa || '',
                    ielts: (data.test_scores || {}).ielts || '',
                    majors: (data.preferred_majors || []).join(', ')
                });
            }
        } catch (err) {
            toast.error("Không thể tải thông tin hồ sơ.");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const response = await fetch(`http://localhost:8000/api/profile/${userEmail}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    full_name: formData.full_name,
                    phone: formData.phone,
                    gpa: parseFloat(formData.gpa),
                    test_scores: { ielts: formData.ielts },
                    preferred_majors: formData.majors.split(',').map(m => m.trim()).filter(m => m)
                })
            });

            if (response.ok) {
                toast.success("Hồ sơ đã được cập nhật thành công!");
                setIsEditing(false);
                fetchProfile();
            } else {
                throw new Error();
            }
        } catch (err) {
            toast.error("Lỗi khi cập nhật hồ sơ.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500">Đang tải hồ sơ...</div>;

    return (
        <div className="max-w-2xl mx-auto p-6">
            <header className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900">Hồ sơ cá nhân</h1>
                <p className="text-slate-500 text-sm">Quản lý thông tin để Trợ lý AI có thể tư vấn hướng nghiệp chính xác nhất cho bạn.</p>
            </header>

            {/* Trust Badge Section */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-8 flex items-center gap-3">
                <span className="material-symbols-outlined text-blue-600">verified_user</span>
                <div>
                    <p className="text-sm font-bold text-blue-900">Dữ liệu được bảo mật</p>
                    <p className="text-xs text-blue-700">Thông tin của bạn chỉ được sử dụng cho mục đích tư vấn tuyển sinh tại VinUni.</p>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6 space-y-6">
                    <section>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Thông tin cơ bản</h3>
                        <div className="grid grid-cols-1 gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-semibold text-slate-700">Họ và tên</label>
                                {isEditing ? (
                                    <input type="text" className="px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} />
                                ) : <p className="text-slate-900 font-medium">{profile.full_name || 'Chưa cập nhật'}</p>}
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-semibold text-slate-700">Email</label>
                                <p className="text-slate-500">{userEmail}</p>
                            </div>
                        </div>
                    </section>

                    <section className="pt-6 border-t border-slate-100">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Năng lực học thuật</h3>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-semibold text-slate-700">GPA Mục tiêu/Hiện tại</label>
                                {isEditing ? (
                                    <input type="number" step="0.1" className="px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={formData.gpa} onChange={e => setFormData({...formData, gpa: e.target.value})} />
                                ) : <p className="text-slate-900 font-medium">{profile.gpa || 'N/A'}</p>}
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-semibold text-slate-700">IELTS/TOEFL</label>
                                {isEditing ? (
                                    <input type="text" className="px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={formData.ielts} onChange={e => setFormData({...formData, ielts: e.target.value})} />
                                ) : <p className="text-slate-900 font-medium">{(profile.test_scores || {}).ielts || 'Chưa có'}</p>}
                            </div>
                        </div>
                    </section>

                    <section className="pt-6 border-t border-slate-100">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Nguyện vọng ngành học</h3>
                        <div className="flex flex-col gap-1">
                            {isEditing ? (
                                <input 
                                    type="text" 
                                    placeholder="Ví dụ: cs, ba, ee..."
                                    className="px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" 
                                    value={formData.majors} 
                                    onChange={e => setFormData({...formData, majors: e.target.value})} 
                                />
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {(profile.preferred_majors || []).length > 0 ? (
                                        profile.preferred_majors.map(m => (
                                            <span key={m} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold uppercase">{m}</span>
                                        ))
                                    ) : <p className="text-slate-400 text-sm italic">Chưa chọn ngành quan tâm</p>}
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                    {isEditing ? (
                        <>
                            <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-200 rounded-lg transition-colors">Hủy</button>
                            <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-[#003466] text-white font-bold rounded-lg hover:bg-blue-800 transition-all shadow-md">
                                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                            </button>
                        </>
                    ) : (
                        <button onClick={() => setIsEditing(true)} className="px-6 py-2 border-2 border-[#003466] text-[#003466] font-bold rounded-lg hover:bg-blue-50 transition-all">
                            Chỉnh sửa hồ sơ
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;