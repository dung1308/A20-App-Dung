import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useStore } from '../state/store';
import { useAuth } from '../context/AuthContext';
import MajorCard from '../components/Report/MajorCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ChatBox from '../components/Chat/ChatBox';
import api from '../services/api';

const reportStorageKey = (userId) => `latest_report_${userId}`;

const ReportPage = () => {
  const { matchResults, setMatchResults } = useStore();
  const { userId, isAuthenticated } = useAuth();
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    if (!matchResults && userId) {
      const saved = localStorage.getItem(reportStorageKey(userId));
      if (saved) {
        try {
          setMatchResults(JSON.parse(saved));
        } catch {
          localStorage.removeItem(reportStorageKey(userId));
        }
      }
    }
  }, [matchResults, setMatchResults, userId]);

  const topMajors = matchResults?.top3 || [];
  const reportStats = useMemo(() => {
    const verified = topMajors.filter((major) => major.verified_source || major.source_url).length;
    const avgScore = topMajors.length
      ? Math.round(topMajors.reduce((sum, major) => sum + Number(major.match_score || 0), 0) / topMajors.length)
      : 0;
    return { verified, avgScore };
  }, [topMajors]);

  const handleConsultationClick = async () => {
    try {
      await api.logConsultationClick('report');
      toast.success('Da ghi nhan nhu cau tu van. Chuyen vien se co du lieu de ho tro ban.');
    } catch (err) {
      toast.error('Khong the ghi nhan yeu cau tu van luc nay.');
    }
  };

  const handleRestart = () => {
    setMatchResults(null);
  };

  if (!isAuthenticated || !userId) {
    return (
      <div className="p-8 text-red-500 text-center">
        Ban can dang nhap de xem bao cao.
      </div>
    );
  }

  if (!matchResults) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="max-w-xl w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
          <LoadingSpinner size="lg" className="mb-4" timeoutMessage="Neu ban chua lam Wizard, hay bat dau khao sat de tao report." />
          <h1 className="text-2xl font-black text-primary">Chua co report</h1>
          <p className="text-slate-500 text-sm mt-2">
            Report duoc tao sau khi ban hoan thanh Wizard va, neu co, tai len CV PDF.
          </p>
          <Link
            to="/wizard"
            className="inline-flex mt-6 px-5 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest"
          >
            Bat dau Wizard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-50/50">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="bg-primary text-white p-8 rounded-2xl shadow-xl shadow-blue-900/10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-blue-100">VinUni Major Match</p>
              <h1 className="text-3xl font-black mt-2">Bao cao goi y nganh hoc</h1>
              <p className="text-blue-100 text-sm mt-3 max-w-3xl leading-6">
                {matchResults.disclaimer || 'Ket qua do AI phan tich dua tren cau tra loi Wizard va CV neu ban da tai len.'}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 min-w-full lg:min-w-[420px]">
              <SummaryCard label="Top majors" value={topMajors.length} />
              <SummaryCard label="Avg match" value={`${reportStats.avgScore}%`} />
              <SummaryCard label="Verified" value={`${reportStats.verified}/${topMajors.length || 0}`} />
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <main className="space-y-6">
            {matchResults.fallback && (
              <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl">
                <p className="text-amber-800 font-black">AI chua du tin hieu de ket luan chac chan.</p>
                <p className="text-amber-700 text-sm mt-1">
                  Hay bo sung Profile/CV hoac dang ky tu van de chuyen vien xem boi canh day du hon.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {topMajors.map((major) => (
                <MajorCard key={major.major_id || major.major_name} major={major} />
              ))}
            </div>

            <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              {!showChat ? (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Can lam ro them?</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Hoi AI ve diem match, dieu kien tuyen sinh, hoc bong, hoac lo trinh nghe nghiep cua tung nganh.
                    </p>
                  </div>
                  <button
                    className="px-5 py-3 bg-[#fed65b] text-[#745c00] rounded-xl text-xs font-black uppercase tracking-widest"
                    onClick={() => setShowChat(true)}
                  >
                    Hoi them cau hoi
                  </button>
                </div>
              ) : (
                <ChatBox userId={userId} />
              )}
            </section>
          </main>

          <aside className="space-y-4">
            <ActionCard
              title="Cap nhat Profile"
              body="Bo sung GPA, diem thi, nganh yeu thich va xem lai CV PDF da tai len."
              action="Mo Profile"
              href="/profile"
            />
            <ActionCard
              title="Lam lai Wizard"
              body="Dung khi ban muon thay doi cau tra loi hoac thu mot huong nganh khac."
              action="Chay lai Wizard"
              href="/wizard"
              onClick={handleRestart}
            />
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Tu van chuyen sau</h2>
              <p className="text-sm text-slate-500 mt-2 leading-6">
                Gui tin hieu cho staff neu ban can nguoi that kiem tra ho so va giai thich ket qua.
              </p>
              <button
                onClick={handleConsultationClick}
                className="mt-4 w-full px-4 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest"
              >
                Dang ky tu van
              </button>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value }) => (
  <div className="bg-white/10 border border-white/20 rounded-xl p-4">
    <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">{label}</p>
    <p className="text-2xl font-black mt-1">{value}</p>
  </div>
);

const ActionCard = ({ title, body, action, href, onClick }) => (
  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
    <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">{title}</h2>
    <p className="text-sm text-slate-500 mt-2 leading-6">{body}</p>
    <Link
      to={href}
      onClick={onClick}
      className="inline-flex mt-4 px-4 py-2.5 bg-white border border-slate-200 text-primary rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50"
    >
      {action}
    </Link>
  </div>
);

export default ReportPage;
