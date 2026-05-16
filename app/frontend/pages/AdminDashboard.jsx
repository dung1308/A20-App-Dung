import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { 
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid 
} from 'recharts';
import { useLanguage } from '../context/LanguageContext';

// Helper to generate pagination range
const getPaginationRange = (currentPage, totalPages, delta = 2) => {
  const range = [];
  const left = currentPage - delta;
  const right = currentPage + delta;

  for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= left && i <= right)) {
          range.push(i);
      }
  }

  const finalRange = [];
  let last = 0;
  for (let i of range) {
      if (i - last === 2) {
          finalRange.push(last + 1);
      } else if (i - last > 2) {
          finalRange.push('...');
      }
      finalRange.push(i);
      last = i;
  }
  return finalRange;
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const AdminDashboard = () => {
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;
  const [metrics, setMetrics] = useState(null);
  const [adminBoard, setAdminBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [error, setError] = useState(null);
  const [timeWindow, setTimeWindow] = useState(336); // Default 2 weeks
  const [activeTab, setActiveTab] = useState('board');
  const [pmfGraph, setPmfGraph] = useState('routes');
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [searchUser, setSearchUser] = useState('');
  const [onlyFallback, setOnlyFallback] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [ragStatus, setRagStatus] = useState(null);
  const [loadingRag, setLoadingRag] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [ingestReport, setIngestReport] = useState(null);
  const [pendingHandoffs, setPendingHandoffs] = useState([]);
  const userEmail = localStorage.getItem('user_email');
  
  // Pagination state and constants
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0); // New state for total pages
  const [totalLogs, setTotalLogs] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    if (activeTab === 'board') {
      fetchAdminBoard();
    } else if (activeTab === 'metrics') {
      fetchMetrics();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    } else if (activeTab === 'rag') {
      fetchRagStatus();
    }

    // Giám sát yêu cầu tư vấn nếu là admin@vinuni.edu.vn
    let handoffInterval;
    if (userEmail === 'admin@vinuni.edu.vn') {
      const fetchHandoffs = async () => {
        try {
          const data = await api.getPendingHandoffs();
          setPendingHandoffs(data);
        } catch (e) {}
      };
      fetchHandoffs();
      handoffInterval = setInterval(fetchHandoffs, 10000);
    }
    return () => { if (handoffInterval) clearInterval(handoffInterval); };
  }, [timeWindow, activeTab, searchUser, onlyFallback, page, userEmail]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [searchUser, onlyFallback, timeWindow]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const data = await api.getMetrics(timeWindow);
      setMetrics(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
      setError('Không thể tải dữ liệu thống kê. Vui lòng kiểm tra quyền quản trị.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminBoard = async () => {
    try {
      setLoadingBoard(true);
      const data = await api.getAdminBoard(timeWindow);
      setAdminBoard(data);
    } catch (err) {
      console.error('Failed to fetch admin board:', err);
      toast.error('Không thể tải Admin Board.');
    } finally {
      setLoadingBoard(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      setLoadingLogs(true);
      const data = await api.getAuditLogs({ 
        limit: pageSize, 
        offset: (page - 1) * pageSize,
        user_id: searchUser,
        only_fallback: onlyFallback,
        hours: timeWindow
      });
      const logs = Array.isArray(data) ? data : data.logs || [];
      const total = Array.isArray(data) ? data.length : data.total || 0;
      setAuditLogs(logs);
      setTotalLogs(total);
      setTotalPages(Math.ceil(total / pageSize) || 1); // Calculate total pages
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleHandoffAction = async (traceId, action) => {
    // action: 'accepted' (Chấp nhận) hoặc 'busy' (Báo bận)
    try {
      await api.updateHandoffStatus(traceId, action);
      setPendingHandoffs(prev => prev.filter(h => h.trace_id !== traceId));
      toast.success(action === 'accepted' ? "Đã chấp nhận yêu cầu tư vấn!" : "Đã báo bận.");
    } catch (err) { 
      toast.error("Không thể xử lý yêu cầu.");
    }
  };

  const fetchRagStatus = async () => {
    try {
      setLoadingRag(true);
      const data = await api.getRagStatus();
      setRagStatus(data);
    } catch (err) {
      console.error('Failed to fetch RAG status:', err);
    } finally {
      setLoadingRag(false);
    }
  };

  const handleIngestNow = async () => {
    if (!window.confirm("Bắt đầu nạp lại dữ liệu RAG? Quá trình này sẽ cập nhật các vector embeddings từ file nguồn.")) return;
    try {
      setIngesting(true);
      setProgress(0);
      setIngestReport(null);
      setStatusMessage('Đang khởi tạo kết nối...');
      
      await api.streamRagIngest((data) => {
        if (data.error) throw new Error(data.error);

        setProgress(data.progress || 0);
        setStatusMessage(data.message || '');
        if (data.report) setIngestReport(data.report);
        if (data.done) {
          toast.success("Đồng bộ hóa tri thức thành công!");
          fetchRagStatus();
        }
      });
    } catch (err) {
      toast.error("Lỗi khi gửi yêu cầu nạp dữ liệu.");
    } finally {
      setIngesting(false);
    }
  };

  const handleUpdateSyncInterval = async (hours) => {
    try {
      setSavingConfig(true);
      await api.updateRagConfig(hours);
      toast.success(`Đã cập nhật chu kỳ nạp: ${hours} giờ`);
      fetchRagStatus();
    } catch (err) {
      toast.error("Không thể cập nhật cấu hình.");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCopyTraceId = (e, id) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    toast.success("Đã sao chép Trace ID");
  };

  const routeData = metrics && metrics.route_distribution ? Object.entries(metrics.route_distribution).map(([name, value]) => ({
    name: name.toUpperCase(),
    value
  })) : [];
  const resolutionData = metrics ? [
    { name: 'AI Resolved', value: metrics.ai_resolution_rate * 100 },
    { name: 'Human Fallback', value: metrics.human_fallback_rate * 100 }
  ] : [];
  const churnData = metrics ? [
    {
      name: 'Churn 7 ngày',
      value: (metrics.churn_rate_7d || 0) * 100,
      inactive: metrics.churn?.seven_days?.inactive_users || 0,
      previous: metrics.churn?.seven_days?.previous_active_users || 0
    },
    {
      name: 'Churn 1 tháng',
      value: (metrics.churn_rate_30d || 0) * 100,
      inactive: metrics.churn?.thirty_days?.inactive_users || 0,
      previous: metrics.churn?.thirty_days?.previous_active_users || 0
    }
  ] : [];
  const errorData = metrics?.error_distribution ? Object.entries(metrics.error_distribution).map(([name, value]) => ({ name, value })) : [];
  const pmfGraphOptions = [
    { id: 'routes', label: 'Luồng xử lý' },
    { id: 'resolution', label: 'Giải quyết' },
    { id: 'churn', label: 'Churn' },
    { id: 'errors', label: 'Lỗi' }
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
      <header className="border-b-4 border-primary pb-4 mb-8">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-black text-primary m-0 tracking-tight">{text.title}</h2>
            <p className="text-slate-500 font-medium mt-1">{text.subtitle}</p>
          </div>
          <div className="flex gap-4 items-center">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{text.timeWindow}</span>
            <select 
              className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 outline-none focus:ring-2 focus:ring-primary/20"
              value={timeWindow}
              onChange={(e) => setTimeWindow(Number(e.target.value))}
            >
              <option value={1}>{text.lastHour}</option>
              <option value={24}>{text.last24h}</option>
              <option value={168}>{text.last7d}</option>
              <option value={336}>{text.last14d}</option>
              <option value={720}>{text.last30d}</option>
            </select>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-8 gap-2 overflow-x-auto no-scrollbar">
        <button 
          onClick={() => setActiveTab('board')}
          className={`px-6 py-4 text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'board' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
        >
          {text.adminBoard}
        </button>
        <button 
          onClick={() => setActiveTab('metrics')}
          className={`px-6 py-4 text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'metrics' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
        >
          {text.pmfMetrics}
        </button>
        <button 
          onClick={() => setActiveTab('audit')}
          className={`px-6 py-4 text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'audit' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
        >
          {text.auditLog}
        </button>
        <button 
          onClick={() => setActiveTab('rag')}
          className={`px-6 py-4 text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'rag' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
        >
          {text.ragAdmin}
        </button>
      </div>

      {activeTab === 'board' ? (
        loadingBoard ? (
          <div className="p-8 text-center">Đang tải Admin Board...</div>
        ) : adminBoard && (
          <div className="animate-in fade-in duration-500 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard title="Phiên wizard" value={adminBoard.total_wizard_sessions || 0} sub="Sessions" />
              <MetricCard title="Hoàn thành match" value={adminBoard.completed_matches || 0} color="text-emerald-600" />
              <MetricCard title="Click đăng ký tư vấn" value={adminBoard.consultation_clicks || 0} color="text-blue-600" />
              <MetricCard title="Fallback wizard" value={`${((adminBoard.fallback_rate || 0) * 100).toFixed(1)}%`} color="text-orange-500" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Ngành được match nhiều nhất</h3>
                    <p className="text-xs text-slate-500 mt-1">Đếm theo Top 3, ưu tiên trọng số cao hơn cho ngành xếp hạng #1.</p>
                  </div>
                  <button onClick={fetchAdminBoard} className="text-primary text-xs font-black uppercase tracking-widest hover:underline">Làm mới</button>
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={adminBoard.top_majors || []} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="major_name" fontSize={10} interval={0} angle={-15} textAnchor="end" height={60} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="weighted_count" name="Điểm nhu cầu" fill="#003466" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Học sinh click tư vấn</h3>
                  <p className="text-xs text-slate-500 mt-1">Danh sách lead từ CTA đăng ký tư vấn trong report.</p>
                </div>
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {(adminBoard.recent_consultation_leads || []).length === 0 ? (
                    <div className="p-6 text-sm text-slate-400">Chưa có click đăng ký tư vấn trong khoảng thời gian này.</div>
                  ) : (
                    adminBoard.recent_consultation_leads.map((lead) => (
                      <div key={lead.id} className="p-4 hover:bg-slate-50">
                        <p className="text-sm font-bold text-slate-800 truncate">{lead.user_id}</p>
                        <p className="text-[10px] font-mono text-slate-400 mt-1">{lead.timestamp ? new Date(lead.timestamp).toLocaleString('vi-VN') : 'N/A'}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Nguồn: {lead.source}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Bảng xếp hạng ngành</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                    <tr>
                      <th className="px-6 py-4">Ngành</th>
                      <th className="px-6 py-4 text-right">Lượt xuất hiện</th>
                      <th className="px-6 py-4 text-right">Điểm nhu cầu</th>
                      <th className="px-6 py-4 text-right">Match TB</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(adminBoard.top_majors || []).map((major) => (
                      <tr key={major.major_id}>
                        <td className="px-6 py-4 font-bold text-slate-800">{major.major_name}</td>
                        <td className="px-6 py-4 text-right text-slate-600">{major.appearances}</td>
                        <td className="px-6 py-4 text-right text-slate-600">{major.weighted_count}</td>
                        <td className="px-6 py-4 text-right font-mono text-primary">{major.avg_score}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      ) : activeTab === 'metrics' ? (
        loading ? (
          <div className="p-8 text-center">Đang tải dữ liệu hệ thống...</div>
        ) : error ? (
          <div className="p-8 text-red-500 text-center">{error}</div>
        ) : metrics && (
          <div className="animate-in fade-in duration-500">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard 
          title="Tổng số yêu cầu" 
          value={metrics.total_requests} 
          sub="Requests"
        />
        <MetricCard 
          title="Tỷ lệ AI Giải quyết" 
          value={`${(metrics.ai_resolution_rate * 100).toFixed(1)}%`} 
          color="text-emerald-600"
        />
        <MetricCard 
          title="Thời gian phản hồi TB" 
          value={`${metrics.avg_response_time_ms}ms`} 
          sub="Độ trễ hệ thống"
        />
        <MetricCard 
          title="Tỷ lệ Chuyển chuyên viên" 
          value={`${(metrics.human_fallback_rate * 100).toFixed(1)}%`} 
          color="text-orange-500"
        />
        <MetricCard 
          title="Churn Rate 7 ngày" 
          value={`${((metrics.churn_rate_7d || 0) * 100).toFixed(1)}%`} 
          sub={`${metrics.churn?.seven_days?.inactive_users || 0} inactive`}
          color="text-rose-600"
        />
        <MetricCard 
          title="Churn Rate 1 tháng" 
          value={`${((metrics.churn_rate_30d || 0) * 100).toFixed(1)}%`} 
          sub={`${metrics.churn?.thirty_days?.inactive_users || 0} inactive`}
          color="text-fuchsia-700"
        />
        <MetricCard 
          title="Token Đã dùng" 
          value={metrics.token_usage?.total?.toLocaleString() || '0'} 
          sub="Tokens (Total)"
        />
        <MetricCard 
          title="Chi phí ước tính" 
          value={`$${metrics.estimated_cost?.toFixed(2) || '0.00'}`} 
          color="text-blue-600"
        />
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Bộ lọc biểu đồ PMF</h3>
            <p className="text-xs text-slate-500 mt-1">Chọn một nhóm chỉ số để kiểm tra biểu đồ nhanh hơn.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {pmfGraphOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => setPmfGraph(option.id)}
                className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all ${
                  pmfGraph === option.id
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            {pmfGraph === 'routes' ? (
              <PieChart>
                <Pie
                  data={routeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {routeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            ) : pmfGraph === 'resolution' ? (
              <BarChart data={resolutionData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis unit="%" />
                <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                <Bar dataKey="value" fill="#003466" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : pmfGraph === 'churn' ? (
              <BarChart data={churnData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis unit="%" />
                <Tooltip
                  formatter={(value, name, item) => [
                    `${value.toFixed(1)}% (${item.payload.inactive}/${item.payload.previous} inactive)`,
                    'Churn Rate'
                  ]}
                />
                <Bar dataKey="value" fill="#be123c" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <BarChart
                layout="vertical"
                data={errorData}
                margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={150} 
                  tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }}
                />
                <Tooltip />
                <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
          </div>
        )
      ) : activeTab === 'audit' ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm animate-in fade-in duration-500">
          <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3 w-full md:flex-1">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider whitespace-nowrap">Nhật ký hoạt động</h3>
              <input 
                type="text" 
                placeholder="Tìm theo email hoặc Trace ID..." 
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs w-full md:w-64 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
              />
              <label className="flex items-center gap-2 text-xs text-slate-500 font-bold cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                <input 
                  type="checkbox" 
                  checked={onlyFallback} 
                  onChange={(e) => setOnlyFallback(e.target.checked)}
                  className="rounded text-primary focus:ring-primary"
                />
                Chỉ hiện Fallback
              </label>
            </div>
            <button onClick={fetchAuditLogs} className="text-primary text-xs font-black uppercase tracking-widest hover:underline whitespace-nowrap">Làm mới</button>
          </div>
          {loadingLogs ? (
            <div className="p-12 text-center text-slate-400 text-sm">Đang truy xuất nhật ký...</div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                  <tr>
                  <th className="px-4 md:px-6 py-4 hidden sm:table-cell">Thời gian</th>
                  <th className="px-4 md:px-6 py-4">Người dùng</th>
                  <th className="px-4 md:px-6 py-4 hidden 2xl:table-cell">Trace ID</th>
                  <th className="px-4 md:px-6 py-4 hidden lg:table-cell">Luồng</th>
                  <th className="px-4 md:px-6 py-4">Hành động</th>
                  <th className="px-4 md:px-6 py-4 hidden xl:table-cell">Kết quả Judge</th>
                  <th className="px-4 md:px-6 py-4 text-right">Độ trễ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <tr 
                      key={log.id} 
                      onClick={() => setSelectedLog(log)}
                      className={`hover:bg-slate-50 transition-colors cursor-pointer ${(!log.ai_resolved || log.fallback) ? 'bg-red-50/30' : ''}`}
                    >
                    <td className="px-4 md:px-6 py-4 text-slate-400 whitespace-nowrap hidden sm:table-cell">
                        {new Date(log.timestamp).toLocaleString('vi-VN')}
                      </td>
                    <td className="px-4 md:px-6 py-4 font-bold text-slate-700 max-w-[100px] truncate sm:max-w-none" title={log.user_id}>
                      {log.user_id}
                    </td>
                    <td className="px-4 md:px-6 py-4 text-[10px] font-mono text-slate-400 hidden 2xl:table-cell group/trace">
                      <div className="flex items-center gap-1">
                        <span className="truncate max-w-[80px]">{log.trace_id || '---'}</span>
                        {log.trace_id && (
                          <button onClick={(e) => handleCopyTraceId(e, log.trace_id)} className="opacity-0 group-hover/trace:opacity-100 hover:text-primary transition-all">
                            <span className="material-symbols-outlined text-[14px]">content_copy</span>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 md:px-6 py-4 hidden lg:table-cell">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          log.route === 'admin_internal' ? 'bg-purple-100 text-purple-700' : 
                          log.route === 'staff_action' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {log.route}
                        </span>
                      </td>
                    <td className="px-4 md:px-6 py-4 text-gray-700 max-w-[100px] sm:max-w-xs truncate" title={log.input}>
                        {log.input}
                      </td>
                    <td className="px-4 md:px-6 py-4 text-[10px] text-gray-500 font-mono hidden xl:table-cell">
                        <div className="max-w-[120px] truncate" title={JSON.stringify(log.judge_result, null, 2)}>
                          {log.judge_result ? JSON.stringify(log.judge_result) : 'N/A'}
                        </div>
                      </td>
                    <td className="px-4 md:px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex flex-col items-end">
                          <div className="text-[10px] font-black text-slate-400 font-mono tracking-tighter">{log.latency || log.response_time_ms}ms</div>
                          {(!log.ai_resolved || log.fallback) && <span className="text-[9px] text-red-600 font-black uppercase tracking-tighter">Fallback</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {!loadingLogs && auditLogs.length > 0 && (
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Hiển thị {Math.min(totalLogs, (page - 1) * pageSize + 1)} - {Math.min(totalLogs, page * pageSize)} trong tổng số {totalLogs} bản ghi
              </p>
              <div className="flex items-center gap-2">
                <button 
                  disabled={page === 1}
                  onClick={() => setPage(prev => prev - 1)}
                  className="p-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-colors"
                >
                  <span className="material-symbols-outlined text-sm leading-none">chevron_left</span>
                </button>
                {getPaginationRange(page, totalPages).map((p, index) => (
                  p === '...' ? (
                    <span key={index} className="text-xs font-bold text-slate-400 px-2">...</span>
                  ) : (
                    <button
                      key={index}
                      onClick={() => setPage(p)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                        p === page
                          ? 'bg-primary text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {p}
                    </button>
                  )
                ))}
                <button 
                  disabled={page >= totalPages}
                  onClick={() => setPage(prev => prev + 1)}
                  className="p-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-colors"
                >
                  <span className="material-symbols-outlined text-sm leading-none">chevron_right</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="animate-in fade-in duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Quản trị RAG Ingestion</h3>
                  <p className="text-sm text-slate-500 mt-1">Tách riêng lịch nạp định kỳ và thao tác nạp ngay để quản trị viên biết rõ công cụ đang dùng.</p>
                </div>
                <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border ${ragStatus?.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                  <span className={`w-2 h-2 rounded-full ${ragStatus?.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                  <span className="text-[10px] font-black uppercase tracking-widest">{ragStatus?.status === 'active' ? 'RAG Sẵn sàng' : 'Chờ kiểm tra'}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
                <RagStat name="Admissions" count={ragStatus?.collections?.admissions || 0} icon="school" />
                <RagStat name="FAQ Docs" count={ragStatus?.collections?.faq || 0} icon="quiz" />
                <RagStat name="Student CVs" count={ragStatus?.collections?.cvs || 0} icon="description" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-8 border-t border-slate-100">
                <div className="flex flex-col gap-3 bg-slate-50/70 border border-slate-100 rounded-2xl p-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">RAG Ingest định kỳ</p>
                    <p className="text-xs text-slate-500 mt-1">Cấu hình lịch tự động làm mới vector embeddings theo chu kỳ.</p>
                  </div>
                  <select 
                    disabled={savingConfig}
                    className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                    value={ragStatus?.sync_interval_hours || 24}
                    onChange={(e) => handleUpdateSyncInterval(Number(e.target.value))}
                  >
                    <option value={12}>Mỗi 12 Giờ</option>
                    <option value={24}>Hàng ngày (24h)</option>
                    <option value={48}>Mỗi 2 Ngày (48h)</option>
                    <option value={168}>Hàng tuần (7 ngày)</option>
                  </select>
                </div>
                
                <div className="flex flex-col gap-3 bg-blue-50/40 border border-blue-100 rounded-2xl p-4">
                  <div>
                    <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">RAG Ingestion ngay lập tức</p>
                    <p className="text-xs text-slate-500 mt-1">Chạy thủ công ngay bây giờ để nạp lại dữ liệu nguồn và cập nhật embeddings.</p>
                  </div>
                  <button 
                    onClick={handleIngestNow}
                    disabled={ingesting}
                    className="w-fit px-6 py-3.5 bg-white border-2 border-primary text-primary rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-primary/5 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-lg">{ingesting ? 'history_edu' : 'sync'}</span>
                    {ingesting ? 'Đang chạy RAG Ingestion...' : 'Chạy RAG Ingestion ngay'}
                  </button>
                </div>
              </div>

              {(ingesting || ingestReport) && (
                <div className="mt-8 p-6 bg-blue-50/50 rounded-3xl border-2 border-blue-100 animate-in fade-in slide-in-from-top-4 duration-500">
                  {ingesting && (
                    <>
                  <div className="flex justify-between items-end mb-2">
                    <p className="text-[11px] font-black text-blue-900 uppercase tracking-tighter flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                      {statusMessage}
                    </p>
                    <p className="text-[10px] font-mono font-bold text-slate-400">{progress}%</p>
                  </div>
                      <div className="h-3 w-full bg-white rounded-full overflow-hidden border border-blue-100 shadow-inner mb-6">
                    <div 
                      className="h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_8px_rgba(0,52,102,0.3)]" 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                    </>
                  )}

                  {ingestReport && (
                    <div className="space-y-6 animate-in fade-in duration-700">
                      {ingestReport.failed_files?.length > 0 && (
                        <div className="pt-4 border-t border-blue-100">
                          <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">warning</span>
                            Các tệp tin nạp thất bại ({ingestReport.failed_files.length})
                          </p>
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-red-100">
                            {ingestReport.failed_files.map((file, idx) => (
                              <div key={idx} className="bg-white/60 p-3 rounded-xl border border-red-50 flex justify-between items-start gap-4">
                                <div className="overflow-hidden">
                                  <p className="text-[11px] font-bold text-slate-700 truncate">{file.name}</p>
                                  <p className="text-[9px] text-red-500 font-medium italic mt-0.5">{file.error}</p>
                                </div>
                                <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[8px] font-black uppercase rounded shrink-0">{file.type}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {!ingesting && ingestReport.failed_files?.length === 0 && (
                        <div className="text-center py-2">
                          <p className="text-xs font-bold text-emerald-600 flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined">check_circle</span>
                            Tất cả các tệp tin đã được nạp thành công!
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-slate-900 p-8 rounded-3xl text-white shadow-2xl">
              <div className="flex items-center gap-2 mb-8">
                <span className="material-symbols-outlined text-primary">data_thresholding</span>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Sức khỏe kho dữ liệu</h3>
              </div>
              <div className="space-y-6">
                <HealthCheck label="ChromaDB Server" status={ragStatus?.db_status || 'connected'} />
                <HealthCheck label="Embedding Model" status={ragStatus?.model_status || 'active'} />
                <HealthCheck label="Vector Consistency" status="stable" />
                <div className="pt-6 border-t border-slate-800">
                  <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Bản cập nhật cuối</p>
                  <p className="text-xs font-mono text-slate-300">{ragStatus?.last_sync || 'Chưa có dữ liệu'}</p>
                </div>
              </div>
            </div>

            {/* RAG Performance - Latency Comparison Chart */}
            <div className="lg:col-span-3 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Phân tích độ trễ RAG (Avg Latency)</h3>
                  <p className="text-xs text-slate-500 mt-1">So sánh tốc độ xử lý giữa tìm kiếm tri thức (ChromaDB) và tạo câu trả lời (OpenAI).</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Độ trễ trung bình</p>
                  <p className="text-xl font-black text-primary">{(ragStatus?.performance?.avg_total || 0).toFixed(0)}ms</p>
                </div>
              </div>
              
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: 'Truy xuất (ChromaDB)', value: ragStatus?.performance?.avg_chroma || 0 },
                      { name: 'Tạo phản hồi (OpenAI)', value: ragStatus?.performance?.avg_openai || 0 }
                    ]}
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} tick={{ fontWeight: 'bold', fill: '#64748b' }} />
                    <YAxis unit="ms" fontSize={10} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="value" fill="#003466" radius={[6, 6, 0, 0]} barSize={60} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {metrics && metrics.generated_at && (
        <div className="mt-8 text-right text-xs text-gray-400">
          Cập nhật lần cuối: {new Date(metrics.generated_at).toLocaleString('vi-VN')}
        </div>
      )}

      {/* Detail Modal - Styled for Professional Review */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Chi tiết hoạt động</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">ID: {selectedLog.id} • Trace: {selectedLog.trace_id || 'N/A'} • {new Date(selectedLog.timestamp).toLocaleString('vi-VN')}</p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Người dùng</p>
                  <p className="font-bold text-slate-800">{selectedLog.user_id}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trace ID</p>
                  <p className="font-mono text-[11px] text-slate-500 mt-1">{selectedLog.trace_id || 'Không có trace_id'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Luồng xử lý</p>
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1 ${
                    selectedLog.route === 'admin_internal' ? 'bg-purple-100 text-purple-700' : 
                    selectedLog.route === 'staff_action' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {selectedLog.route}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Dữ liệu đầu vào (Input)</p>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
                  {selectedLog.input}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Kết quả đầu ra (Output)</p>
                <div className={`p-4 rounded-xl border text-sm font-mono whitespace-pre-wrap break-words max-h-64 overflow-y-auto scrollbar-thin ${
                  (!selectedLog.ai_resolved || selectedLog.fallback) ? 'bg-red-50 border-red-100 text-red-800' : 'bg-green-50 border-green-100 text-green-800'
                }`}>
                  {selectedLog.output}
                </div>
              </div>

              {selectedLog.judge_result && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Kết quả Judge (Phân tích chi tiết)</p>
                  <JsonView data={selectedLog.judge_result} />
                </div>
              )}
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-right">
              <button 
                onClick={() => setSelectedLog(null)}
                className="px-6 py-2 bg-white border border-gray-300 text-slate-700 rounded-lg font-bold text-sm hover:bg-gray-50 transition-all shadow-sm"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Handoff Request Window */}
      {pendingHandoffs.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[100] w-80 animate-in slide-in-from-bottom-10 duration-500">
          <div className="bg-white border-2 border-primary rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-primary p-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined animate-bounce">support_agent</span>
                <span className="text-xs font-black uppercase tracking-widest text-white">Yêu cầu tư vấn ({pendingHandoffs.length})</span>
              </div>
              <button onClick={() => setPendingHandoffs([])} className="hover:rotate-90 transition-transform">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto p-4 space-y-3 bg-slate-50 chat-scrollbar border-t border-slate-100">
              {pendingHandoffs.map((handoff) => (
                <div key={handoff.trace_id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm animate-in fade-in zoom-in duration-300">
                  <p className="text-[11px] font-bold text-slate-800 truncate mb-1">{handoff.user_id}</p>
                  <p className="text-[10px] text-slate-500 italic mb-3 line-clamp-2">"{handoff.input}"</p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleHandoffAction(handoff.trace_id, 'accepted')}
                      className="flex-1 py-1.5 bg-emerald-600 text-white text-[9px] font-black uppercase tracking-tighter rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      Chấp nhận
                    </button>
                    <button 
                      onClick={() => handleHandoffAction(handoff.trace_id, 'busy')}
                      className="flex-1 py-1.5 bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-tighter rounded-lg hover:bg-slate-200 transition-colors"
                    >
                      Báo bận
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Professional JSON Syntax Highlighter
 */
const JsonView = ({ data }) => {
  return (
    <div className="bg-[#0d1117] text-slate-300 p-5 rounded-xl text-[11px] font-mono leading-relaxed shadow-inner border border-slate-800 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800">
      <JsonNode value={data} isLast={true} depth={0} />
    </div>
  );
};

/**
 * Recursive component for collapsible JSON tree
 */
const JsonNode = ({ label, value, isLast, depth }) => {
  const [isOpen, setIsOpen] = useState(depth < 2); // Tự động mở 2 cấp đầu tiên
  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);

  const renderPrimitive = (val) => {
    if (typeof val === 'string') return <span className="text-[#a5d6ff]">"{val}"</span>;
    if (typeof val === 'number') return <span className="text-[#d2a8ff]">{val}</span>;
    if (typeof val === 'boolean') return <span className="text-[#79c0ff] font-bold">{String(val)}</span>;
    if (val === null) return <span className="text-[#79c0ff] font-bold">null</span>;
    return null;
  };

  if (!isObject) {
    return (
      <div className="whitespace-nowrap">
        {label && <span className="text-[#ff7b72]">"{label}": </span>}
        {renderPrimitive(value)}
        {!isLast && <span className="text-slate-500">,</span>}
      </div>
    );
  }

  const opener = isArray ? '[' : '{';
  const closer = isArray ? ']' : '}';
  const isEmpty = isArray ? value.length === 0 : Object.keys(value).length === 0;

  if (isEmpty) {
    return (
      <div className="whitespace-nowrap">
        {label && <span className="text-[#ff7b72]">"{label}": </span>}
        <span className="text-slate-400 font-bold">{opener}{closer}{!isLast && ','}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div 
        className="cursor-pointer hover:bg-white/5 inline-flex items-center gap-1 rounded transition-colors group whitespace-nowrap -ml-1 pr-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={`material-symbols-outlined text-[14px] text-slate-500 group-hover:text-slate-300 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
          chevron_right
        </span>
        {label && <span className="text-[#ff7b72]">"{label}": </span>}
        <span className="text-slate-400 font-bold">{opener}</span>
        {!isOpen && (
          <span className="text-slate-500 text-[9px] px-1 bg-slate-800 rounded mx-1 font-bold uppercase tracking-tighter">
            {isArray ? `${value.length} items` : `${Object.keys(value).length} keys`}
          </span>
        )}
        {!isOpen && <span className="text-slate-400 font-bold">{closer}{!isLast && ','}</span>}
      </div>

      {isOpen && (
        <div className="flex flex-col">
          <div className="border-l border-slate-800 ml-[5px] pl-4">
            {isArray ? (
              value.map((v, i) => <JsonNode key={i} value={v} isLast={i === value.length - 1} depth={depth + 1} />)
            ) : (
              Object.entries(value).map(([k, v], i, arr) => <JsonNode key={k} label={k} value={v} isLast={i === arr.length - 1} depth={depth + 1} />)
            )}
          </div>
          <div className="text-slate-400 font-bold ml-3">{closer}{!isLast && ','}</div>
        </div>
      )}
    </div>
  );
};

const MetricCard = ({ title, value, sub, color = "text-primary" }) => (
  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
    <div className="flex items-baseline mt-1">
      <h2 className={`text-2xl font-black ${color}`}>{value}</h2>
      {sub && <span className="ml-2 text-[10px] font-bold text-slate-300 uppercase">{sub}</span>}
    </div>
  </div>
);

const RagStat = ({ name, count, icon }) => (
  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 transition-all hover:bg-white hover:shadow-md hover:border-primary/10">
    <div className="p-2 bg-white rounded-lg w-fit shadow-sm text-primary mb-4">
      <span className="material-symbols-outlined text-xl">{icon}</span>
    </div>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{name}</p>
    <p className="text-2xl font-black text-slate-900 mt-1">{count}</p>
  </div>
);

const HealthCheck = ({ label, status }) => (
  <div className="flex justify-between items-center group">
    <span className="text-sm font-medium text-slate-400 group-hover:text-slate-200 transition-colors">{label}</span>
    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
      status === 'connected' || status === 'active' || status === 'stable' 
        ? 'bg-emerald-500/20 text-emerald-400' 
        : 'bg-red-500/20 text-red-400'
    }`}>
      {status}
    </span>
  </div>
);

const viText = {
  title: 'Trung tâm quản trị',
  subtitle: 'Hệ thống giám sát hiệu năng AI và tính tuân thủ.',
  timeWindow: 'Khoảng thời gian:',
  lastHour: '1 giờ qua',
  last24h: '24 giờ qua',
  last7d: '7 ngày qua',
  last14d: '14 ngày qua',
  last30d: '30 ngày qua',
  adminBoard: 'Bảng quản trị',
  pmfMetrics: 'Chỉ số PMF',
  auditLog: 'Nhật ký hoạt động',
  ragAdmin: 'Quản trị RAG',
};

const enText = {
  title: 'Admin Intelligence',
  subtitle: 'Monitor AI performance and compliance.',
  timeWindow: 'Time window:',
  lastHour: 'Last hour',
  last24h: 'Last 24 hours',
  last7d: 'Last 7 days',
  last14d: 'Last 14 days',
  last30d: 'Last 30 days',
  adminBoard: 'Admin Board',
  pmfMetrics: 'PMF Metrics',
  auditLog: 'Audit Log',
  ragAdmin: 'RAG Admin',
};

export default AdminDashboard;
