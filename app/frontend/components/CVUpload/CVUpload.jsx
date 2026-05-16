import React, { useState } from 'react';
import { useStore } from '../../state/store';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../services/api';

const CVUpload = ({ onUploadSuccess }) => {
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;
  const { setCVSignals, setCVText, setCVData, cvSignals } = useStore();
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadResult, setUploadResult] = useState(null);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf') {
      setErrorMsg(text.pdfOnly);
      setFile(null);
      return;
    }

    setErrorMsg('');
    setFile(selectedFile);
    setStatus('idle');
  };

  const handleUpload = async () => {
    if (!file) return;

    setStatus('uploading');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const data = await api.uploadCV(formData);
      setCVSignals(data.cv_signals);
      setCVText(data.cv_text || '');
      setCVData(data.cv_text || '', data.cv_signals, data.cv_document_id, data.structured_data || null);
      setUploadResult(data);
      setStatus('success');
      if (onUploadSuccess) onUploadSuccess(data);
    } catch (error) {
      console.error('CV Upload failed:', error);
      setStatus('error');
      setErrorMsg(text.processError);
    }
  };

  const handleRemove = () => {
    setCVSignals(null);
    setCVText('');
    setFile(null);
    setUploadResult(null);
    setStatus('idle');
  };

  const handleConfirm = async () => {
    if (!uploadResult?.cv_document_id) return;
    try {
      const structuredData = uploadResult.structured_data || {};
      await api.confirmCV(uploadResult.cv_document_id, structuredData);
      setCVData(uploadResult.cv_text || '', uploadResult.cv_signals, uploadResult.cv_document_id, structuredData);
      setStatus('confirmed');
      if (onUploadSuccess) onUploadSuccess({ ...uploadResult, structured_data: structuredData });
    } catch (error) {
      setErrorMsg(text.confirmError);
    }
  };

  return (
    <div className="cv-upload-container rounded-2xl border border-blue-100 bg-blue-50/50 p-6">
      <h3 className="mb-1 text-lg font-bold text-blue-900">{text.title}</h3>
      <p className="mb-1 text-sm text-slate-600">{text.savedToProfile}</p>
      <p className="mb-6 text-xs italic text-slate-500">{text.analysisHelp}</p>

      <div className="upload-controls flex flex-col gap-4">
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileChange}
          disabled={status === 'uploading'}
          className="block w-full cursor-pointer text-sm text-slate-500 transition-all file:mr-4 file:rounded-full file:border-0 file:bg-blue-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-800"
        />
        {!cvSignals ? (
          <button
            onClick={handleUpload}
            disabled={!file || status === 'uploading'}
            className="rounded-lg bg-[#fed65b] px-6 py-2.5 text-sm font-bold text-[#745c00] shadow-sm transition-all hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'uploading' ? text.analyzing : text.saveAndAnalyze}
          </button>
        ) : (
          <button onClick={handleRemove} className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50">
            {text.removeCurrent}
          </button>
        )}
      </div>

      {errorMsg && <p className="mt-3 text-xs font-medium text-red-600">{errorMsg}</p>}
      {cvSignals && <p className="mt-3 text-xs font-medium text-green-700">{text.cvInUse}</p>}

      {uploadResult?.structured_data && (
        <div className="mt-5 rounded-xl border border-blue-100 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-blue-900">{text.reviewTitle}</p>
              <p className="text-xs text-slate-500">{text.reviewBody}</p>
            </div>
            <span className="rounded border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase text-amber-700">
              {methodLabel(uploadResult.parse_metadata?.method, language)}
            </span>
          </div>

          <FriendlyCvSummary data={uploadResult.structured_data} text={text} />

          <button
            onClick={handleConfirm}
            className="mt-3 rounded-lg bg-blue-900 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
            disabled={status === 'confirmed'}
          >
            {status === 'confirmed' ? text.confirmed : text.confirm}
          </button>
        </div>
      )}
    </div>
  );
};

const FriendlyCvSummary = ({ data, text }) => {
  const entries = [
    { label: text.name, value: data.full_name || data.name },
    { label: text.education, value: data.education },
    { label: text.experience, value: data.experience },
    { label: text.skills, value: data.skills },
    { label: text.goals, value: data.career_goals || data.goals },
  ].filter((item) => hasValue(item.value));

  if (entries.length === 0) {
    return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">{text.noExtractedData}</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{entry.label}</p>
          <div className="mt-2 text-sm leading-6 text-slate-700">{renderValue(entry.value)}</div>
        </div>
      ))}
    </div>
  );
};

const hasValue = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
};

const renderValue = (value) => {
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-2">
        {value.slice(0, 8).map((item, index) => (
          <span key={`${String(item)}-${index}`} className="rounded border border-blue-100 bg-white px-2 py-1 text-xs font-bold text-blue-700">
            {typeof item === 'string' ? item : Object.values(item || {}).filter(Boolean).join(' - ')}
          </span>
        ))}
      </div>
    );
  }
  if (value && typeof value === 'object') {
    return Object.values(value).filter(Boolean).join(' - ');
  }
  return String(value);
};

const methodLabel = (method, language) => {
  if (language === 'vi') {
    if (method === 'fallback') return 'Phân tích dự phòng';
    if (method) return 'Phân tích tự động';
    return 'Đã phân tích';
  }
  return method === 'fallback' ? 'Fallback parser' : method || 'Parsed';
};

const viText = {
  title: 'Tải lên CV PDF',
  savedToProfile: 'CV sẽ được lưu để bạn xem lại trong hồ sơ.',
  analysisHelp: 'Hệ thống phân tích kỹ năng và kinh nghiệm trong PDF để tối ưu gợi ý ngành.',
  pdfOnly: 'Vui lòng chọn file PDF.',
  processError: 'Không thể xử lý CV. Vui lòng thử lại.',
  confirmError: 'Không thể xác nhận CV vào hồ sơ.',
  analyzing: 'Đang phân tích...',
  saveAndAnalyze: 'Lưu và phân tích CV',
  removeCurrent: 'Gỡ khỏi phiên hiện tại',
  cvInUse: 'CV đang được sử dụng để tối ưu kết quả.',
  reviewTitle: 'Thông tin CV đã nhận diện',
  reviewBody: 'Kiểm tra nhanh các thông tin chính trước khi lưu vào hồ sơ.',
  confirmed: 'Đã lưu vào hồ sơ',
  confirm: 'Xác nhận vào hồ sơ',
  name: 'Họ tên',
  education: 'Học vấn',
  experience: 'Kinh nghiệm',
  skills: 'Kỹ năng',
  goals: 'Mục tiêu',
  noExtractedData: 'Chưa nhận diện được thông tin có cấu trúc. Bạn vẫn có thể tiếp tục Wizard.',
};

const enText = {
  title: 'Upload PDF CV',
  savedToProfile: 'The CV will be saved so you can review it in your profile.',
  analysisHelp: 'The system analyzes skills and experience in the PDF to improve major recommendations.',
  pdfOnly: 'Please choose a PDF file.',
  processError: 'Could not process the CV. Please try again.',
  confirmError: 'Could not confirm the CV into your profile.',
  analyzing: 'Analyzing...',
  saveAndAnalyze: 'Save and analyze CV',
  removeCurrent: 'Remove from current session',
  cvInUse: 'CV is being used to improve results.',
  reviewTitle: 'Extracted CV information',
  reviewBody: 'Quickly review the main information before saving it to your profile.',
  confirmed: 'Confirmed in Profile',
  confirm: 'Confirm into Profile',
  name: 'Name',
  education: 'Education',
  experience: 'Experience',
  skills: 'Skills',
  goals: 'Goals',
  noExtractedData: 'No structured information was extracted yet. You can still continue the Wizard.',
};

export default CVUpload;
