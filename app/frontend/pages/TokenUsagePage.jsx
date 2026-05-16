import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { useLanguage } from '../context/LanguageContext';

const PAGE_SIZE = 10;
const HOUR_OPTIONS = [
  { key: 'last24h', value: 24 },
  { key: 'last7d', value: 168 },
  { key: 'last30d', value: 720 },
  { key: 'last90d', value: 2160 }
];

const TokenUsagePage = () => {
  const { language } = useLanguage();
  const text = language === 'vi' ? viText : enText;
  const [filters, setFilters] = useState({ hours: 168, user_id: '', route: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const routes = useMemo(() => data?.routes?.map((item) => item.route).filter(Boolean) || [], [data]);
  const rows = data?.rows || [];
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const loadUsage = async () => {
    setLoading(true);
    try {
      const payload = await api.getTokenUsage({
        hours: filters.hours,
        user_id: filters.user_id || undefined,
        route: filters.route || undefined
      });
      setData(payload);
      setPage(1);
    } catch (err) {
      toast.error(err.response?.data?.detail || text.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !data) return <LoadingSpinner fullPage />;

  const totals = data?.totals || {};

  return (
    <div className="h-full overflow-y-auto bg-slate-50/50 p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="border-b-4 border-primary pb-4">
          <h1 className="text-3xl font-black tracking-tight text-primary">{text.title}</h1>
          <p className="mt-1 font-medium text-slate-500">{text.subtitle}</p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <select className={inputClass} value={filters.hours} onChange={(e) => setFilters({ ...filters, hours: Number(e.target.value) })}>
              {HOUR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{text[option.key]}</option>)}
            </select>
            <input className={inputClass} placeholder={text.userPlaceholder} value={filters.user_id} onChange={(e) => setFilters({ ...filters, user_id: e.target.value })} />
            <select className={inputClass} value={filters.route} onChange={(e) => setFilters({ ...filters, route: e.target.value })}>
              <option value="">{text.allRoutes}</option>
              {routes.map((route) => <option key={route} value={route}>{route}</option>)}
            </select>
            <button onClick={loadUsage} disabled={loading} className="rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">
              {text.apply}
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <MetricCard label={text.totalTokens} value={formatNumber(totals.total_tokens)} />
          <MetricCard label={text.promptTokens} value={formatNumber(totals.prompt_tokens)} />
          <MetricCard label={text.completionTokens} value={formatNumber(totals.completion_tokens)} />
          <MetricCard label={text.requests} value={formatNumber(totals.request_count)} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col justify-between gap-2 md:flex-row md:items-center">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">{text.graphTitle}</h2>
              <p className="mt-1 text-xs text-slate-500">{text.graphSubtitle}</p>
            </div>
            {data?.is_estimated && (
              <span className="rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
                {text.estimated}
              </span>
            )}
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.daily || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar yAxisId="left" dataKey="tokens" fill="#003466" radius={[4, 4, 0, 0]} name={text.tokens} />
                <Bar yAxisId="right" dataKey="requests" fill="#14b8a6" radius={[4, 4, 0, 0]} name={text.requests} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-6">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">{text.recentRecords}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-6 py-4">{text.time}</th>
                  <th className="px-6 py-4">{text.user}</th>
                  <th className="px-6 py-4">{text.route}</th>
                  <th className="px-6 py-4">{text.prompt}</th>
                  <th className="px-6 py-4">{text.completion}</th>
                  <th className="px-6 py-4">{text.total}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-6 py-4 text-xs text-slate-500">{formatDate(row.timestamp, language)}</td>
                    <td className="px-6 py-4 font-bold text-slate-700">{row.user_id}</td>
                    <td className="px-6 py-4"><span className="rounded border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{row.route}</span></td>
                    <td className="px-6 py-4">{formatNumber(row.prompt_tokens)}</td>
                    <td className="px-6 py-4">{formatNumber(row.completion_tokens)}</td>
                    <td className="px-6 py-4 font-black text-primary">{formatNumber(row.total_tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalItems={rows.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </section>
      </div>
    </div>
  );
};

const viText = {
  title: 'Sử dụng Token',
  subtitle: 'Lọc lượng token theo người dùng, tuyến API và thời gian để theo dõi tần suất sử dụng.',
  loadError: 'Không thể tải dữ liệu sử dụng token.',
  last24h: '24 giờ qua',
  last7d: '7 ngày qua',
  last30d: '30 ngày qua',
  last90d: '90 ngày qua',
  userPlaceholder: 'Lọc theo email người dùng',
  allRoutes: 'Tất cả tuyến API',
  apply: 'Áp dụng',
  totalTokens: 'Tổng token',
  promptTokens: 'Token đầu vào',
  completionTokens: 'Token đầu ra',
  requests: 'Lượt gọi',
  graphTitle: 'Biểu đồ tần suất',
  graphSubtitle: 'Số lượt gọi hằng ngày và token ước tính theo bộ lọc đã chọn.',
  estimated: 'Ước tính từ nhật ký',
  tokens: 'Token',
  recentRecords: 'Bản ghi token gần đây',
  time: 'Thời gian',
  user: 'Người dùng',
  route: 'Tuyến API',
  prompt: 'Đầu vào',
  completion: 'Đầu ra',
  total: 'Tổng',
};

const enText = {
  title: 'Token Usage',
  subtitle: 'Filter token usage by user, API route, and time window to monitor request frequency.',
  loadError: 'Could not load token usage.',
  last24h: 'Last 24 hours',
  last7d: 'Last 7 days',
  last30d: 'Last 30 days',
  last90d: 'Last 90 days',
  userPlaceholder: 'Filter by user email',
  allRoutes: 'All API routes',
  apply: 'Apply',
  totalTokens: 'Total tokens',
  promptTokens: 'Prompt tokens',
  completionTokens: 'Completion tokens',
  requests: 'Requests',
  graphTitle: 'Frequency Graph',
  graphSubtitle: 'Daily request count and estimated tokens for the selected filter.',
  estimated: 'Estimated from audit logs',
  tokens: 'Tokens',
  recentRecords: 'Recent Token Records',
  time: 'Time',
  user: 'User',
  route: 'Route',
  prompt: 'Prompt',
  completion: 'Completion',
  total: 'Total',
};

const inputClass = 'px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/20';

const formatNumber = (value = 0) => Number(value || 0).toLocaleString();

const formatDate = (value, language) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US');
};

const MetricCard = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
  </div>
);

export default TokenUsagePage;
