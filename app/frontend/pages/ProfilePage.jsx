import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import CVUpload from '../components/CVUpload/CVUpload';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const ProfilePage = () => {
  const navigate = useNavigate();
  const { userAvatar, updateUserAvatar } = useAuth();
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;
  const profileImageInputRef = useRef(null);
  const userEmail = localStorage.getItem('user_email');
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cvDocuments, setCvDocuments] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    gpa: '',
    ielts: '',
    majors: '',
    summary: '',
    career_goals: '',
    skills: '',
    education: '',
    experience: ''
  });

  const hasWizardAnswers = Boolean(
    (profile?.interests || []).length > 0 &&
    (profile?.strengths || []).length > 0 &&
    (profile?.dislikes || []).length > 0 &&
    profile?.work_style
  );

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const overview = await api.getProfileOverview();
      const data = overview.profile || {};
      setProfile(data);
      setFormData({
        full_name: data.full_name || '',
        phone: data.phone || '',
        gpa: data.gpa || '',
        ielts: (data.test_scores || {}).ielts || '',
        majors: (data.preferred_majors || []).join(', '),
        summary: data.summary || '',
        career_goals: data.career_goals || '',
        skills: (data.skills || []).join(', '),
        education: formatProfileList(data.education),
        experience: formatProfileList(data.experience)
      });
      setCvDocuments(overview.documents || []);
      setReadiness(overview.readiness || null);
    } catch (err) {
      toast.error('Không thể tải thông tin hồ sơ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateProfile(userEmail, {
        full_name: formData.full_name,
        phone: formData.phone,
        gpa: formData.gpa === '' ? null : parseFloat(formData.gpa),
        test_scores: { ielts: formData.ielts },
        preferred_majors: splitCsv(formData.majors),
        summary: formData.summary,
        career_goals: formData.career_goals,
        skills: splitCsv(formData.skills),
        education: splitLines(formData.education),
        experience: splitLines(formData.experience)
      });
      toast.success('Hồ sơ đã được cập nhật thành công.');
      setIsEditing(false);
      fetchProfile();
    } catch (err) {
      toast.error('Lỗi khi cập nhật hồ sơ.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy? Mọi thay đổi chưa lưu sẽ bị mất.')) return;
    setIsEditing(false);
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        gpa: profile.gpa || '',
        ielts: (profile.test_scores || {}).ielts || '',
        majors: (profile.preferred_majors || []).join(', '),
        summary: profile.summary || '',
        career_goals: profile.career_goals || '',
        skills: (profile.skills || []).join(', '),
        education: formatProfileList(profile.education),
        experience: formatProfileList(profile.experience)
      });
    }
  };

  const handleProfileImageUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(text.chooseImage);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(text.imageTooLarge);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateUserAvatar(reader.result);
      toast.success(text.imageUpdated);
    };
    reader.onerror = () => toast.error(text.imageReadError);
    reader.readAsDataURL(file);
  };

  const handleViewCV = async () => {
    try {
      const response = await api.downloadCV(userEmail);
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast.error('Không thể mở CV. Vui lòng tải lại file PDF.');
    }
  };

  const handleConfirmCV = async (documentId) => {
    try {
      await api.confirmCV(documentId);
      toast.success(text.cvActivated);
      fetchProfile();
    } catch (err) {
      toast.error(text.cvConfirmError);
    }
  };

  const handlePreviewCV = async (documentId) => {
    try {
      const data = await api.getCVMergePreview(documentId);
      setMergePreview(data.preview || null);
    } catch (err) {
      toast.error(text.cvPreviewError);
    }
  };

  const handleDeleteCV = async (documentId) => {
    if (!window.confirm(text.deleteCvConfirm)) return;
    try {
      await api.deleteCVDocument(documentId);
      toast.success(text.cvDeleted);
      fetchProfile();
    } catch (err) {
      toast.error(text.cvDeleteError);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-400 font-medium animate-pulse">Đang tải hồ sơ...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
      <header className="border-b-4 border-primary pb-4 mb-8">
        <h2 className="text-3xl font-black text-primary m-0 tracking-tight">Hồ sơ cá nhân</h2>
        <p className="text-slate-500 font-medium mt-1">Quản lý thông tin để Trợ lý AI có thể tư vấn hướng nghiệp chính xác nhất cho bạn.</p>
      </header>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5 shadow-sm">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center text-[#003466] text-3xl font-black border border-blue-100 shadow-sm overflow-hidden shrink-0">
            {userAvatar ? (
              <img src={userAvatar} alt="" className="h-full w-full object-cover" />
            ) : (
              (profile?.full_name || userEmail || 'U').charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-900">{text.profileImage}</p>
            <p className="text-xs text-slate-500 mt-1">{text.profileImageHelp}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => profileImageInputRef.current?.click()}
            className="px-5 py-3 bg-[#003466] text-white border border-[#003466] rounded-xl text-xs font-black uppercase tracking-widest shadow-sm shadow-blue-900/20 hover:bg-[#0b477f] active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">upload</span>
            {text.uploadProfileImage}
          </button>
          {userAvatar && (
            <button
              type="button"
              onClick={() => {
                updateUserAvatar('');
                toast.success(text.imageRemoved);
              }}
              className="px-5 py-3 bg-white text-slate-600 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all"
            >
              {text.remove}
            </button>
          )}
        </div>
        <input
          ref={profileImageInputRef}
          type="file"
          accept="image/*"
          onChange={handleProfileImageUpload}
          className="hidden"
        />
      </section>

      <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 mb-8 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 shadow-sm border border-blue-200">
          <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
        </div>
        <div>
          <p className="text-sm font-black text-blue-900">Dữ liệu được bảo mật</p>
          <p className="text-xs text-blue-700 font-medium">Thông tin của bạn chỉ được sử dụng cho mục đích tư vấn tuyển sinh tại VinUni.</p>
        </div>
      </div>

      <div className="bg-white border border-amber-200 rounded-2xl p-5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100">
            <span className="material-symbols-outlined text-2xl">route</span>
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">
              {hasWizardAnswers ? 'Wizard chọn ngành đã có dữ liệu' : 'Bạn chưa hoàn thành Wizard chọn ngành'}
            </p>
            <p className="text-xs text-slate-500 font-medium mt-1">
              {hasWizardAnswers
                ? 'Bạn có thể làm lại Wizard bất cứ lúc nào để thay đổi câu trả lời và cập nhật gợi ý ngành.'
                : 'Trả lời 4 bước ngắn để AI có đủ sở thích, thế mạnh và phong cách làm việc trước khi tư vấn ngành.'}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/wizard')}
          className="px-5 py-3 bg-[#003466] text-white border border-[#003466] rounded-xl text-xs font-black uppercase tracking-widest shadow-sm shadow-blue-900/20 hover:bg-[#0b477f] active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">psychology_alt</span>
          {hasWizardAnswers ? 'Làm lại Wizard' : 'Làm Wizard'}
        </button>
      </div>

      {readiness && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black text-slate-900">{text.profileReadiness}</p>
              <p className="text-xs text-slate-500 mt-1">
                {Math.round((readiness.completion_ratio || 0) * 100)}% {text.readinessSuffix}
              </p>
            </div>
            <div className="w-full md:w-64 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${Math.round((readiness.completion_ratio || 0) * 100)}%` }} />
            </div>
          </div>
          {(readiness.next_actions || []).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {readiness.next_actions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => {
                    if (action.id === 'open_wizard') navigate('/wizard');
                    if (action.id === 'edit_profile') setIsEditing(true);
                  }}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-700"
                >
                  {translateActionLabel(action.label, language)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-3xl shadow-xl shadow-blue-900/5 overflow-hidden">
        <div className="p-8 space-y-8">
          <section>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-50 pb-2">{text.profileSummary}</h3>
            <div className="space-y-6">
              <Field label={text.summary} editing={isEditing}>
                {isEditing ? (
                  <textarea className={`${inputClass} min-h-28 resize-y`} value={formData.summary} onChange={(e) => setFormData({ ...formData, summary: e.target.value })} placeholder={text.summaryPlaceholder} />
                ) : (
                  <DisplayBlock>{profile?.summary || text.notUpdated}</DisplayBlock>
                )}
              </Field>
              <Field label={text.careerGoals} editing={isEditing}>
                {isEditing ? (
                  <textarea className={`${inputClass} min-h-24 resize-y`} value={formData.career_goals} onChange={(e) => setFormData({ ...formData, career_goals: e.target.value })} placeholder={text.careerGoalsPlaceholder} />
                ) : (
                  <DisplayBlock>{profile?.career_goals || text.notUpdated}</DisplayBlock>
                )}
              </Field>
              <Field label={text.skills} editing={isEditing}>
                {isEditing ? (
                  <input className={inputClass} value={formData.skills} onChange={(e) => setFormData({ ...formData, skills: e.target.value })} placeholder="Python, Leadership, Research..." />
                ) : (
                  <TagList items={profile?.skills || []} empty={text.noSkills} />
                )}
              </Field>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-50 pb-2">{text.educationExperience}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label={text.education} editing={isEditing}>
                {isEditing ? (
                  <textarea className={`${inputClass} min-h-40 resize-y`} value={formData.education} onChange={(e) => setFormData({ ...formData, education: e.target.value })} placeholder={text.educationPlaceholder} />
                ) : (
                  <BulletList items={profile?.education || []} empty={text.noEducation} />
                )}
              </Field>
              <Field label={text.experience} editing={isEditing}>
                {isEditing ? (
                  <textarea className={`${inputClass} min-h-40 resize-y`} value={formData.experience} onChange={(e) => setFormData({ ...formData, experience: e.target.value })} placeholder={text.experiencePlaceholder} />
                ) : (
                  <BulletList items={profile?.experience || []} empty={text.noExperience} />
                )}
              </Field>
            </div>
          </section>
          <section>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-50 pb-2">Thông tin cơ bản</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="Họ và tên" editing={isEditing}>
                {isEditing ? (
                  <input className={inputClass} value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} placeholder="Nguyễn Văn A" />
                ) : (
                  <DisplayValue>{profile?.full_name || 'Chưa cập nhật'}</DisplayValue>
                )}
              </Field>
              <Field label="Email liên hệ">
                <DisplayValue muted>{userEmail}</DisplayValue>
              </Field>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-50 pb-2">Năng lực học thuật</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="GPA mục tiêu/hiện tại" editing={isEditing}>
                {isEditing ? (
                  <input type="number" step="0.1" className={inputClass} value={formData.gpa} onChange={(e) => setFormData({ ...formData, gpa: e.target.value })} placeholder="VD: 3.8" />
                ) : (
                  <DisplayValue icon="grade">{profile?.gpa || 'Chưa cập nhật'}</DisplayValue>
                )}
              </Field>
              <Field label="IELTS/TOEFL" editing={isEditing}>
                {isEditing ? (
                  <input className={inputClass} value={formData.ielts} onChange={(e) => setFormData({ ...formData, ielts: e.target.value })} placeholder="VD: IELTS 7.5" />
                ) : (
                  <DisplayValue icon="language">{(profile?.test_scores || {}).ielts || 'Chưa có'}</DisplayValue>
                )}
              </Field>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-50 pb-2">Nguyện vọng ngành học</h3>
            <Field label="Các ngành quan tâm" editing={isEditing}>
              {isEditing ? (
                <input className={inputClass} value={formData.majors} onChange={(e) => setFormData({ ...formData, majors: e.target.value })} placeholder="Ví dụ: cs, ba, ee..." />
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {(profile?.preferred_majors || []).length > 0 ? (
                    profile.preferred_majors.map((major) => (
                      <span key={major} className="px-4 py-1.5 bg-blue-900 text-white rounded-lg text-[11px] font-black uppercase tracking-wider shadow-sm">{major}</span>
                    ))
                  ) : (
                    <p className="text-slate-400 text-sm italic font-medium px-1">Chưa chọn ngành quan tâm</p>
                  )}
                </div>
              )}
            </Field>
          </section>

          <section>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-50 pb-2">CV của tôi</h3>
            <div className="flex flex-col gap-4">
              {profile?.cv_url ? (
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
                    <span className="material-symbols-outlined text-2xl">picture_as_pdf</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{profile.cv_filename || 'Hồ sơ năng lực (CV)'}</p>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">
                      {profile.cv_uploaded_at ? `Đã tải lên ${new Date(profile.cv_uploaded_at).toLocaleDateString('vi-VN')}` : 'Đã tải lên hệ thống'}
                    </p>
                  </div>
                  <button type="button" onClick={handleViewCV} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-black text-primary hover:bg-slate-100 transition-all shadow-sm flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">visibility</span>
                    Xem PDF
                  </button>
                </div>
              ) : (
                <p className="text-slate-400 text-sm italic font-medium px-1">Bạn chưa tải lên CV nào.</p>
              )}

              {isEditing && (
                <div className="p-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 hover:border-primary/30 transition-colors">
                  <CVUpload
                    onUploadSuccess={() => {
                      toast.success('CV đã được lưu vào hồ sơ.');
                      fetchProfile();
                    }}
                  />
                </div>
              )}

              {cvDocuments.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{text.uploadedCvVersions}</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {cvDocuments.map((doc) => (
                      <div key={doc.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{doc.filename}</p>
                          <p className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">
                            Version {doc.version} · {doc.created_at ? new Date(doc.created_at).toLocaleString() : '-'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.is_active && (
                            <span className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[10px] font-black uppercase">
                              {text.active}
                            </span>
                          )}
                          <button onClick={() => handleConfirmCV(doc.id)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-primary uppercase">
                            {text.confirm}
                          </button>
                          <button onClick={() => handlePreviewCV(doc.id)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-600 uppercase">
                            {text.previewMerge}
                          </button>
                          <button onClick={() => handleDeleteCV(doc.id)} className="px-3 py-2 bg-red-600 text-white rounded-lg text-[10px] font-black uppercase">
                            {text.delete}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-4">
          {isEditing ? (
            <>
              <button onClick={handleCancel} className="px-6 py-3 text-slate-500 text-sm font-black uppercase tracking-widest hover:text-slate-800 transition-colors">Hủy</button>
              <button onClick={handleSave} disabled={saving} className="px-8 py-3 bg-[#003466] text-white border border-[#003466] font-black text-sm uppercase tracking-widest rounded-xl shadow-md shadow-blue-900/20 hover:bg-[#0b477f] hover:shadow-lg active:scale-95 transition-all disabled:cursor-not-allowed disabled:bg-slate-200 disabled:border-slate-200 disabled:text-slate-500 disabled:shadow-none">
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </>
          ) : (
            <button onClick={() => setIsEditing(true)} className="px-8 py-3 bg-white border-2 border-primary text-primary font-black text-sm uppercase tracking-widest rounded-xl hover:bg-primary/5 active:scale-95 transition-all">
              Chỉnh sửa hồ sơ
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const inputClass = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all text-sm font-medium';

const viText = {
  chooseImage: 'Vui lòng chọn file hình ảnh.',
  imageTooLarge: 'Ảnh hồ sơ phải nhỏ hơn 2MB.',
  imageUpdated: 'Đã cập nhật ảnh hồ sơ.',
  imageReadError: 'Không thể đọc ảnh này.',
  imageRemoved: 'Đã xóa ảnh hồ sơ.',
  cvActivated: 'CV đã được chọn làm phiên bản đang sử dụng.',
  cvConfirmError: 'Không thể xác nhận CV.',
  cvPreviewError: 'Không thể xem trước phần gộp CV.',
  deleteCvConfirm: 'Bạn có chắc muốn xóa CV này?',
  cvDeleted: 'Đã xóa CV.',
  cvDeleteError: 'Không thể xóa CV.',
  profileImage: 'Ảnh hồ sơ',
  profileImageHelp: 'Tải ảnh vuông dưới 2MB. Ảnh cũng sẽ xuất hiện ở thanh trên.',
  uploadProfileImage: 'Tải ảnh hồ sơ',
  remove: 'Xóa',
  profileReadiness: 'Mức hoàn thiện hồ sơ',
  readinessSuffix: 'hoàn thiện để AI gợi ý tốt hơn.',
  profileSummary: 'Tóm tắt hồ sơ',
  summary: 'Tóm tắt',
  summaryPlaceholder: 'Tóm tắt ngắn về hồ sơ, lấy từ CV hoặc do bạn viết',
  notUpdated: 'Chưa cập nhật',
  careerGoals: 'Mục tiêu nghề nghiệp',
  careerGoalsPlaceholder: 'Mục tiêu nghề nghiệp, vai trò mong muốn hoặc định hướng học tập',
  skills: 'Kỹ năng',
  noSkills: 'Chưa có kỹ năng',
  educationExperience: 'Học vấn và kinh nghiệm',
  education: 'Học vấn',
  educationPlaceholder: 'Mỗi dòng là một mục học vấn',
  noEducation: 'Chưa có học vấn',
  experience: 'Kinh nghiệm',
  experiencePlaceholder: 'Mỗi dòng là một mục kinh nghiệm',
  noExperience: 'Chưa có kinh nghiệm',
  uploadedCvVersions: 'Các phiên bản CV đã tải lên',
  active: 'Đang dùng',
  confirm: 'Xác nhận',
  previewMerge: 'Xem gộp CV',
  delete: 'Xóa',
};

const enText = {
  chooseImage: 'Please choose an image file.',
  imageTooLarge: 'Profile image must be under 2MB.',
  imageUpdated: 'Profile image updated.',
  imageReadError: 'Could not read this image.',
  imageRemoved: 'Profile image removed.',
  cvActivated: 'CV selected as the active version.',
  cvConfirmError: 'Could not confirm CV.',
  cvPreviewError: 'Could not preview CV merge.',
  deleteCvConfirm: 'Delete this CV document?',
  cvDeleted: 'CV document deleted.',
  cvDeleteError: 'Could not delete CV.',
  profileImage: 'Profile image',
  profileImageHelp: 'Upload a square image under 2MB. It will also appear in the upper bar.',
  uploadProfileImage: 'Upload profile image',
  remove: 'Remove',
  profileReadiness: 'Profile readiness',
  readinessSuffix: 'complete for better AI recommendations.',
  profileSummary: 'Profile Summary',
  summary: 'Summary',
  summaryPlaceholder: 'Short profile summary extracted from CV or written by you',
  notUpdated: 'Not updated',
  careerGoals: 'Career goals',
  careerGoalsPlaceholder: 'Career goals, target roles, or study direction',
  skills: 'Skills',
  noSkills: 'No skills yet',
  educationExperience: 'Education & Experience',
  education: 'Education',
  educationPlaceholder: 'One education entry per line',
  noEducation: 'No education yet',
  experience: 'Experience',
  experiencePlaceholder: 'One experience entry per line',
  noExperience: 'No experience yet',
  uploadedCvVersions: 'Uploaded CV versions',
  active: 'Active',
  confirm: 'Confirm',
  previewMerge: 'Preview merge',
  delete: 'Delete',
};

const Field = ({ label, children }) => (
  <div className="flex flex-col gap-2">
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
    {children}
  </div>
);

const DisplayValue = ({ children, icon, muted = false }) => (
  <div className={`px-4 py-3 rounded-xl border border-transparent flex items-center gap-2 ${muted ? 'bg-slate-100/50 text-slate-500' : 'bg-slate-50/50 text-slate-900'}`}>
    {icon && <span className="material-symbols-outlined text-blue-600 text-[18px]">{icon}</span>}
    <p className="font-bold text-sm">{children}</p>
  </div>
);

const DisplayBlock = ({ children }) => (
  <div className="px-4 py-3 rounded-xl bg-slate-50/50 text-slate-700 border border-transparent text-sm leading-6 whitespace-pre-wrap">
    {children}
  </div>
);

const TagList = ({ items = [], empty }) => {
  if (!items.length) return <p className="text-slate-400 text-sm italic font-medium px-1">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {items.map((item) => (
        <span key={String(item)} className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-[11px] font-black">
          {String(item)}
        </span>
      ))}
    </div>
  );
};

const BulletList = ({ items = [], empty }) => {
  if (!items.length) return <p className="text-slate-400 text-sm italic font-medium px-1">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${String(item)}-${index}`} className="px-4 py-3 bg-slate-50/50 rounded-xl text-sm text-slate-700 leading-6">
          {typeof item === 'string' ? item : Object.values(item || {}).filter(Boolean).join(' - ')}
        </li>
      ))}
    </ul>
  );
};

const splitCsv = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);

const splitLines = (value) => value.split('\n').map((item) => item.trim()).filter(Boolean);

const formatProfileList = (value) => {
  if (!Array.isArray(value)) return '';
  return value.map((item) => (typeof item === 'string' ? item : Object.values(item || {}).filter(Boolean).join(' - '))).filter(Boolean).join('\n');
};

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('; ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const translateActionLabel = (label, language) => {
  const normalized = String(label || '').trim().toLowerCase();
  const dictionary = {
    'complete profile fields': { vi: 'Hoàn thiện thông tin hồ sơ', en: 'Complete profile fields' },
    'open wizard': { vi: 'Mở Wizard', en: 'Open Wizard' },
    'edit profile': { vi: 'Chỉnh sửa hồ sơ', en: 'Edit profile' },
    'upload cv': { vi: 'Tải CV lên', en: 'Upload CV' },
  };
  return dictionary[normalized]?.[language] || label;
};

export default ProfilePage;
