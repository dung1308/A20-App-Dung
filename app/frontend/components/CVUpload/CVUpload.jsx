import React, { useState } from 'react';
import { useStore } from '../../state/store';
import api from '../../services/api';

const CVUpload = ({ onUploadSuccess }) => {
  const { setCVSignals, setCVText, setCVData, cvSignals } = useStore();
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const [reviewJson, setReviewJson] = useState('');

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf') {
      setErrorMsg('Vui lòng chọn file PDF.');
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
      setReviewJson(JSON.stringify(data.structured_data || {}, null, 2));
      setStatus('success');
      if (onUploadSuccess) onUploadSuccess(data);
    } catch (error) {
      console.error('CV Upload failed:', error);
      setStatus('error');
      setErrorMsg('Không thể xử lý CV. Vui lòng thử lại.');
    }
  };

  const handleRemove = () => {
    setCVSignals(null);
    setCVText('');
    setFile(null);
    setUploadResult(null);
    setReviewJson('');
    setStatus('idle');
  };

  const handleConfirm = async () => {
    if (!uploadResult?.cv_document_id) return;
    try {
      const structuredData = reviewJson ? JSON.parse(reviewJson) : uploadResult.structured_data;
      await api.confirmCV(uploadResult.cv_document_id, structuredData);
      setCVData(uploadResult.cv_text || '', uploadResult.cv_signals, uploadResult.cv_document_id, structuredData);
      setStatus('confirmed');
      if (onUploadSuccess) onUploadSuccess({ ...uploadResult, structured_data: structuredData });
    } catch (error) {
      setErrorMsg(error instanceof SyntaxError ? 'Structured CV JSON khong hop le.' : 'Khong the xac nhan CV vao Profile.');
    }
  };

  return (
    <div className="cv-upload-container bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
      <h3 className="text-lg font-bold text-blue-900 mb-1">Tải lên CV PDF</h3>
      <p className="text-sm text-slate-600 mb-1">CV sẽ được lưu để bạn xem lại trong Profile.</p>
      <p className="text-xs text-slate-500 mb-6 italic">Hệ thống phân tích kỹ năng và kinh nghiệm trong PDF để tối ưu gợi ý ngành.</p>

      <div className="upload-controls flex flex-col gap-4">
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileChange}
          disabled={status === 'uploading'}
          className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-900 file:text-white hover:file:bg-blue-800 transition-all cursor-pointer"
        />
        {!cvSignals ? (
          <button
            onClick={handleUpload}
            disabled={!file || status === 'uploading'}
            className="px-6 py-2.5 bg-[#fed65b] text-[#745c00] rounded-lg font-bold text-sm shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {status === 'uploading' ? 'Đang phân tích...' : 'Lưu và phân tích CV'}
          </button>
        ) : (
          <button onClick={handleRemove} className="px-6 py-2.5 border border-slate-300 text-slate-600 rounded-lg font-bold text-sm hover:bg-white transition-all">
            Gỡ khỏi phiên hiện tại
          </button>
        )}
      </div>

      {errorMsg && <p className="mt-3 text-xs text-red-600 font-medium">{errorMsg}</p>}
      {cvSignals && <p className="mt-3 text-xs text-green-700 font-medium">CV đang được sử dụng để tối ưu kết quả.</p>}
      {uploadResult?.structured_data && (
        <div className="mt-5 bg-white border border-blue-100 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-black text-blue-900">Review extracted CV data</p>
              <p className="text-xs text-slate-500">Edit this structured data before confirming it into Profile.</p>
            </div>
            <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded text-[10px] font-black uppercase">
              {uploadResult.parse_metadata?.method || 'fallback'}
            </span>
          </div>
          <textarea
            className="w-full min-h-56 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 outline-none focus:ring-2 focus:ring-blue-900/10"
            value={reviewJson}
            onChange={(event) => setReviewJson(event.target.value)}
          />
          <button
            onClick={handleConfirm}
            className="mt-3 px-4 py-2.5 bg-blue-900 text-white rounded-lg text-xs font-black uppercase tracking-widest disabled:opacity-50"
            disabled={status === 'confirmed'}
          >
            {status === 'confirmed' ? 'Confirmed in Profile' : 'Confirm into Profile'}
          </button>
        </div>
      )}
    </div>
  );
};

export default CVUpload;
