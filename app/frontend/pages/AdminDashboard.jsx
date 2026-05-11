import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { 
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid 
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const AdminDashboard = () => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeWindow, setTimeWindow] = useState(336); // Default 2 weeks
  const [activeTab, setActiveTab] = useState('metrics'); // 'metrics' or 'audit'
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [searchUser, setSearchUser] = useState('');
  const [onlyFallback, setOnlyFallback] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    if (activeTab === 'metrics') {
      fetchMetrics();
    } else {
      fetchAuditLogs();
    }
  }, [timeWindow, activeTab, searchUser, onlyFallback]);

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

  const fetchAuditLogs = async () => {
    try {
      setLoadingLogs(true);
      const token = localStorage.getItem('token');
      const queryParams = new URLSearchParams({ 
        limit: 50, 
        user_id: searchUser,
        only_fallback: onlyFallback 
      }).toString();
      const response = await fetch(`http://localhost:8000/api/admin/audit-logs?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const routeData = metrics && metrics.route_distribution ? Object.entries(metrics.route_distribution).map(([name, value]) => ({
    name: name.toUpperCase(),
    value
  })) : [];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Bảng điều khiển Quản trị (PMF Metrics)</h1>
        
        <div className="flex gap-4">
          <select 
            className="bg-white border border-gray-300 rounded-md px-4 py-2 text-sm"
            value={timeWindow}
            onChange={(e) => setTimeWindow(Number(e.target.value))}
            disabled={activeTab === 'audit'}
          >
            <option value={24}>24 Giờ qua</option>
            <option value={168}>7 Ngày qua</option>
            <option value={336}>14 Ngày qua</option>
            <option value={720}>30 Ngày qua</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-8">
        <button 
          onClick={() => setActiveTab('metrics')}
          className={`px-6 py-3 font-semibold text-sm transition-colors ${activeTab === 'metrics' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Chỉ số PMF
        </button>
        <button 
          onClick={() => setActiveTab('audit')}
          className={`px-6 py-3 font-semibold text-sm transition-colors ${activeTab === 'audit' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Nhật ký Hoạt động (Audit)
        </button>
      </div>

      {activeTab === 'metrics' ? (
        loading ? (
          <div className="p-8 text-center">Đang tải dữ liệu hệ thống...</div>
        ) : error ? (
          <div className="p-8 text-red-500 text-center">{error}</div>
        ) : metrics && (
          <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard 
          title="Tổng số yêu cầu" 
          value={metrics.total_requests} 
          sub="Lượt tương tác"
        />
        <MetricCard 
          title="Tỷ lệ AI Giải quyết" 
          value={`${(metrics.ai_resolution_rate * 100).toFixed(1)}%`} 
          color="text-green-600"
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Route Distribution Chart */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold mb-4">Phân bổ Luồng xử lý (Intent Routing)</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
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
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance Overview */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold mb-4">Hiệu suất Giải quyết (Resolution)</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: 'AI Resolved', value: metrics.ai_resolution_rate * 100 },
                  { name: 'Human Fallback', value: metrics.human_fallback_rate * 100 }
                ]}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis unit="%" />
                <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                <Bar dataKey="value" fill="#8884d8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
          </>
        )
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <div className="flex items-center gap-4 flex-1">
              <h3 className="text-lg font-semibold whitespace-nowrap">Nhật ký hoạt động</h3>
              <input 
                type="text" 
                placeholder="Tìm theo email học sinh..." 
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-64 focus:ring-2 focus:ring-blue-500 outline-none"
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-100 transition-colors">
                <input 
                  type="checkbox" 
                  checked={onlyFallback} 
                  onChange={(e) => setOnlyFallback(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                Chỉ hiện lỗi/fallback
              </label>
            </div>
            <button onClick={fetchAuditLogs} className="text-blue-600 text-sm font-bold hover:underline">Làm mới</button>
          </div>
          {loadingLogs ? (
            <div className="p-12 text-center text-gray-500">Đang truy xuất nhật ký...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-[11px]">
                  <tr>
                    <th className="px-6 py-4">Thời gian</th>
                    <th className="px-6 py-4">Người dùng</th>
                    <th className="px-6 py-4">Luồng</th>
                    <th className="px-6 py-4">Hành động</th>
                    <th className="px-6 py-4">Kết quả Judge</th>
                    <th className="px-6 py-4 text-right">Trạng thái / Độ trễ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {auditLogs.map((log) => (
                    <tr 
                      key={log.id} 
                      onClick={() => setSelectedLog(log)}
                      className={`hover:bg-gray-100 transition-colors cursor-pointer ${(!log.ai_resolved || log.fallback) ? 'bg-red-50/50' : ''}`}
                    >
                      <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-6 py-4 font-semibold text-blue-900">{log.user_id}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                          log.route === 'admin_internal' ? 'bg-purple-100 text-purple-700' : 
                          log.route === 'staff_action' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {log.route}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-700 max-w-xs truncate" title={log.input}>
                        {log.input}
                      </td>
                      <td className="px-6 py-4 text-[10px] text-gray-500 font-mono">
                        <div className="max-w-[150px] truncate" title={JSON.stringify(log.judge_result, null, 2)}>
                          {log.judge_result ? JSON.stringify(log.judge_result) : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex flex-col items-end">
                          <div className="font-medium text-gray-900">{log.output.substring(0, 20)}</div>
                          {(!log.ai_resolved || log.fallback) && <span className="text-[10px] text-red-600 font-bold uppercase">Fallback</span>}
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono">{log.latency}ms</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {metrics && metrics.generated_at && (
        <div className="mt-8 text-right text-xs text-gray-400">
          Cập nhật lần cuối: {new Date(metrics.generated_at).toLocaleString('vi-VN')}
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Chi tiết hoạt động</h3>
                <p className="text-xs text-gray-500 mt-1">ID: {selectedLog.id} • {new Date(selectedLog.timestamp).toLocaleString('vi-VN')}</p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Người dùng</p>
                  <p className="font-semibold text-blue-900">{selectedLog.user_id}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Luồng xử lý</p>
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1 ${
                    selectedLog.route === 'admin_internal' ? 'bg-purple-100 text-purple-700' : 
                    selectedLog.route === 'staff_action' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {selectedLog.route}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-gray-400 uppercase mb-2">Dữ liệu đầu vào (Input)</p>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                  {selectedLog.input}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-gray-400 uppercase mb-2">Kết quả đầu ra (Output)</p>
                <div className={`p-4 rounded-xl border text-sm font-mono whitespace-pre-wrap break-words max-h-64 overflow-y-auto ${
                  (!selectedLog.ai_resolved || selectedLog.fallback) ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'
                }`}>
                  {selectedLog.output}
                </div>
              </div>

              {selectedLog.judge_result && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase mb-2">Kết quả Judge (JSON)</p>
                  <pre className="bg-slate-900 text-green-400 p-4 rounded-xl text-xs overflow-x-auto font-mono">
                    {JSON.stringify(selectedLog.judge_result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-gray-50 border-t border-gray-100 text-right">
              <button 
                onClick={() => setSelectedLog(null)}
                className="px-6 py-2 bg-white border border-gray-300 rounded-lg font-bold text-sm hover:bg-gray-50 transition-all shadow-sm"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MetricCard = ({ title, value, sub, color = "text-blue-600" }) => (
  <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
    <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">{title}</p>
    <div className="flex items-baseline mt-2">
      <h2 className={`text-3xl font-bold ${color}`}>{value}</h2>
      {sub && <span className="ml-2 text-sm text-gray-400">{sub}</span>}
    </div>
  </div>
);

export default AdminDashboard;