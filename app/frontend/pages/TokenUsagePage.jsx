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

const HOUR_OPTIONS = [
  { label: '24h', value: 24 },
  { label: '7 days', value: 168 },
  { label: '30 days', value: 720 },
  { label: '90 days', value: 2160 }
];

const TokenUsagePage = () => {
  const [filters, setFilters] = useState({ hours: 168, user_id: '', route: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const routes = useMemo(() => data?.routes?.map((item) => item.route).filter(Boolean) || [], [data]);

  const loadUsage = async () => {
    setLoading(true);
    try {
      const payload = await api.getTokenUsage({
        hours: filters.hours,
        user_id: filters.user_id || undefined,
        route: filters.route || undefined
      });
      setData(payload);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not load token usage.');
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
    <div className="p-8 h-full overflow-y-auto bg-slate-50/50">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="border-b-4 border-primary pb-4">
          <h1 className="text-3xl font-black text-primary tracking-tight">System / Tokens</h1>
          <p className="text-slate-500 font-medium mt-1">
            Filter token usage by user, route, and time window, then inspect request frequency.
          </p>
        </header>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <select
              className={inputClass}
              value={filters.hours}
              onChange={(e) => setFilters({ ...filters, hours: Number(e.target.value) })}
            >
              {HOUR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input
              className={inputClass}
              placeholder="Filter by user email"
              value={filters.user_id}
              onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
            />
            <select
              className={inputClass}
              value={filters.route}
              onChange={(e) => setFilters({ ...filters, route: e.target.value })}
            >
              <option value="">All routes</option>
              {routes.map((route) => (
                <option key={route} value={route}>{route}</option>
              ))}
            </select>
            <button
              onClick={loadUsage}
              disabled={loading}
              className="px-4 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50"
            >
              Apply Filter
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard label="Total tokens" value={formatNumber(totals.total_tokens)} />
          <MetricCard label="Prompt tokens" value={formatNumber(totals.prompt_tokens)} />
          <MetricCard label="Completion tokens" value={formatNumber(totals.completion_tokens)} />
          <MetricCard label="Requests" value={formatNumber(totals.request_count)} />
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-5">
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Frequency Graph</h2>
              <p className="text-xs text-slate-500 mt-1">Daily request count and estimated tokens for the selected filter.</p>
            </div>
            {data?.is_estimated && (
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-3 py-1">
                Estimated from audit logs
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
                <Bar yAxisId="left" dataKey="tokens" fill="#003466" radius={[4, 4, 0, 0]} name="Tokens" />
                <Bar yAxisId="right" dataKey="requests" fill="#14b8a6" radius={[4, 4, 0, 0]} name="Requests" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Recent Token Records</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="px-6 py-4">Time</th>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Route</th>
                  <th className="px-6 py-4">Prompt</th>
                  <th className="px-6 py-4">Completion</th>
                  <th className="px-6 py-4">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.rows || []).map((row) => (
                  <tr key={row.id}>
                    <td className="px-6 py-4 text-xs text-slate-500">{formatDate(row.timestamp)}</td>
                    <td className="px-6 py-4 font-bold text-slate-700">{row.user_id}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold">
                        {row.route}
                      </span>
                    </td>
                    <td className="px-6 py-4">{formatNumber(row.prompt_tokens)}</td>
                    <td className="px-6 py-4">{formatNumber(row.completion_tokens)}</td>
                    <td className="px-6 py-4 font-black text-primary">{formatNumber(row.total_tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

const inputClass = 'px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/20';

const formatNumber = (value = 0) => Number(value || 0).toLocaleString();

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const MetricCard = ({ label, value }) => (
  <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
    <p className="text-2xl font-black text-slate-900 mt-2">{value}</p>
  </div>
);

export default TokenUsagePage;
