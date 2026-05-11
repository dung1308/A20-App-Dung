import React, { useState, useEffect } from 'react';
import { 
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, 
    BarChart, Bar, XAxis, YAxis, CartesianGrid 
} from 'recharts';

const COLORS = ['#003366', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

/**
 * Admissions Staff Dashboard Component
 * Allows staff to view human handoff summaries for students who need assistance.
 * Now includes PMF Metrics overview for system monitoring.
 */
const StaffDashboard = () => {
    const [targetUser, setTargetUser] = useState('');
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Metrics State
    const [metrics, setMetrics] = useState(null);
    const [loadingMetrics, setLoadingMetrics] = useState(false);

    // Audit & Filter State
    const [activeTab, setActiveTab] = useState('metrics'); // 'metrics' or 'audit'
    const [auditLogs, setAuditLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [onlyFallback, setOnlyFallback] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);

    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState({ gpa: '', ielts: '', majors: '' });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (activeTab === 'metrics') {
            fetchMetrics();
        } else {
            fetchAuditLogs();
        }
    }, [activeTab, searchQuery, onlyFallback]);

    const fetchMetrics = async () => {
        setLoadingMetrics(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:8000/api/metrics?hours=168`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setMetrics(data);
            }
        } catch (err) {
            console.error("Failed to fetch metrics", err);
        } finally {
            setLoadingMetrics(false);
        }
    };

    const fetchAuditLogs = async () => {
        setLoadingLogs(true);
        try {
            const token = localStorage.getItem('token');
            const queryParams = new URLSearchParams({ 
                limit: 20, 
                user_id: searchQuery,
                only_fallback: onlyFallback 
            }).toString();
            const response = await fetch(`http://localhost:8000/api/admin/audit-logs?${queryParams}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setAuditLogs(data);
            }
        } catch (err) { console.error(err); } finally { setLoadingLogs(false); }
    };

    const handleSearch = async (e, userIdOverride = null) => {
        if (e) e.preventDefault();
        const userToSearch = userIdOverride || targetUser;
        if (!userToSearch) return;

        setLoading(true);
        setError(null);
        setSummary(null);

        try {
            // Retrieve JWT token from storage (assuming standard login flow)
            const token = localStorage.getItem('token'); 
            const response = await fetch(`http://localhost:8000/api/handoff-summary?user_id=${userToSearch}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 404) {
                throw new Error("Không tìm thấy tóm tắt bàn giao cho học sinh này.");
            }
            if (response.status === 403) {
                throw new Error("Bạn không có quyền truy cập. Yêu cầu tài khoản Editor hoặc Admin.");
            }
            if (!response.ok) {
                throw new Error("Đã xảy ra lỗi khi lấy dữ liệu từ máy chủ.");
            }

            const data = await response.json();
            setSummary(data.handoff_summary);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const routeData = metrics && metrics.route_distribution ? 
        Object.entries(metrics.route_distribution).map(([name, value]) => ({
            name: name.toUpperCase(),
            value
        })) : [];

    return (
        <div style={styles.page}>
            <header style={styles.header}>
                <h2 style={{ color: '#003366', margin: 0 }}>Cổng Nhân Viên Tư Vấn Tuyển Sinh</h2>
                <p style={{ color: '#666' }}>Tra cứu bối cảnh học sinh trước khi thực hiện tư vấn trực tiếp.</p>
            </header>

            {/* Tab Navigation */}
            <div style={{ display: 'flex', borderBottom: '1px solid #ddd', marginBottom: '25px' }}>
                <button 
                    onClick={() => setActiveTab('metrics')}
                    style={{ ...styles.tabButton, ...(activeTab === 'metrics' ? styles.activeTab : {}) }}>
                    Hiệu suất AI
                </button>
                <button 
                    onClick={() => setActiveTab('audit')}
                    style={{ ...styles.tabButton, ...(activeTab === 'audit' ? styles.activeTab : {}) }}>
                    Nhật ký & Fallback
                </button>
            </div>

            {activeTab === 'metrics' ? (
            <section style={styles.metricsSection}>
                <h3 style={styles.sectionTitle}>Chỉ số Hiệu quả Hệ thống (7 ngày qua)</h3>
                {loadingMetrics ? (
                    <p>Đang tải dữ liệu hệ thống...</p>
                ) : metrics && metrics.total_requests > 0 ? (
                    <div style={styles.chartGrid}>
                        <div style={styles.chartCard}>
                            <p style={styles.chartTitle}>Phân bổ Luồng xử lý</p>
                            <div style={{ height: 200 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={routeData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" nameKey="name" label>
                                            {routeData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div style={styles.chartCard}>
                            <p style={styles.chartTitle}>Hiệu suất Giải quyết (Resolution %)</p>
                            <div style={{ height: 200 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={[
                                        { name: 'AI Resolved', value: metrics.ai_resolution_rate * 100 },
                                        { name: 'Human Fallback', value: metrics.human_fallback_rate * 100 }
                                    ]}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" fontSize={12} />
                                        <YAxis unit="%" fontSize={12} />
                                        <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                                        <Bar dataKey="value" fill="#003366" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                ) : metrics && metrics.total_requests === 0 ? (
                    <div style={{ padding: '20px', backgroundColor: '#fff', borderRadius: '8px', border: '1px dashed #ccc', textAlign: 'center', color: '#666' }}>
                        <p className="text-sm">Chưa có dữ liệu tương tác trong 7 ngày qua để hiển thị biểu đồ.</p>
                    </div>
                ) : (
                    <p style={{ fontSize: '12px', color: '#999' }}>Chỉ Admin mới có quyền xem thông số hệ thống.</p>
                )}
            </section>
            ) : (
                <section style={styles.metricsSection}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h3 style={styles.sectionTitle}>Nhật ký hoạt động gần đây</h3>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input 
                                type="text" 
                                placeholder="Tìm email..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ padding: '5px 10px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '13px' }}
                            />
                            <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={onlyFallback} onChange={(e) => setOnlyFallback(e.target.checked)} />
                                Chỉ hiện Fallback
                            </label>
                        </div>
                    </div>
                    <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #eee', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead style={{ backgroundColor: '#f8f9fa', textAlign: 'left' }}>
                                <tr>
                                    <th style={styles.th}>Thời gian</th>
                                    <th style={styles.th}>Học sinh</th>
                                    <th style={styles.th}>Luồng</th>
                                    <th style={styles.th}>Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {auditLogs.map(log => (
                                    <tr key={log.id} 
                                        onClick={() => { setTargetUser(log.user_id); handleSearch(null, log.user_id); }}
                                        style={{ borderTop: '1px solid #eee', cursor: 'pointer', backgroundColor: log.fallback ? '#fff5f5' : 'transparent' }}>
                                        <td style={styles.td}>{new Date(log.timestamp).toLocaleTimeString()}</td>
                                        <td style={styles.td}><b>{log.user_id}</b></td>
                                        <td style={styles.td}><span style={{...styles.routeBadge, backgroundColor: log.fallback ? '#ff4d4f' : '#1890ff'}}>{log.route}</span></td>
                                        <td style={styles.td}>{log.input.substring(0, 30)}...</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            <section style={styles.searchSection}>
                <h3 style={styles.sectionTitle}>Tra cứu Học sinh</h3>
                <form onSubmit={handleSearch} style={styles.form}>
                    <input 
                        type="email" 
                        placeholder="Nhập email học sinh (vd: student@gmail.com)..." 
                        value={targetUser}
                        onChange={(e) => setTargetUser(e.target.value)}
                        style={styles.input}
                        required
                    />
                    <button type="submit" style={styles.button} disabled={loading}>
                        {loading ? 'Đang tải...' : 'Xem Tóm Tắt Handoff'}
                    </button>
                </form>
            </section>

            {error && <div style={styles.error}>{error}</div>}

            {summary && (
                <div style={styles.summaryCard}>
                    <div style={styles.cardHeader}>
                        <h3 style={{ margin: 0 }}>Hồ sơ & Bối cảnh: {targetUser}</h3>
                        <span style={styles.badge}>AI Generated Handoff</span>
                    </div>
                    <div style={styles.cardBody}>
                        <pre style={styles.pre}>{summary}</pre>
                    </div>
                    <div style={styles.cardFooter}>
                        <button 
                            onClick={() => window.location.href = `mailto:${targetUser}`}
                            style={styles.actionButton}
                        >
                            Gửi Email Phản Hồi
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const styles = {
    page: { maxWidth: '900px', margin: '40px auto', padding: '0 20px', fontFamily: 'Arial, sans-serif' },
    header: { borderBottom: '3px solid #003366', paddingBottom: '10px', marginBottom: '30px' },
    searchSection: { marginBottom: '30px', backgroundColor: '#f0f4f8', padding: '20px', borderRadius: '8px' },
    form: { display: 'flex', gap: '10px' },
    input: { flex: 1, padding: '12px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '16px' },
    button: { padding: '12px 24px', backgroundColor: '#003366', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
    error: { padding: '15px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px', marginBottom: '20px', borderLeft: '5px solid #c62828' },
    summaryCard: { backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', border: '1px solid #e0e0e0', overflow: 'hidden' },
    cardHeader: { padding: '20px', backgroundColor: '#f8f9fa', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    cardBody: { padding: '20px', maxHeight: '500px', overflowY: 'auto' },
    cardFooter: { padding: '20px', backgroundColor: '#f8f9fa', borderTop: '1px solid #e0e0e0', textAlign: 'right' },
    badge: { fontSize: '11px', padding: '4px 8px', backgroundColor: '#e3f2fd', color: '#1976d2', borderRadius: '4px', fontWeight: 'bold', textTransform: 'uppercase' },
    pre: { whiteSpace: 'pre-wrap', margin: 0, fontSize: '15px', color: '#333', lineHeight: '1.6', fontFamily: 'monospace' },
    actionButton: { padding: '10px 20px', backgroundColor: '#2e7d32', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
    metricsSection: { marginBottom: '30px', borderBottom: '1px solid #eee', paddingBottom: '20px' },
    sectionTitle: { fontSize: '16px', fontWeight: 'bold', color: '#333', marginBottom: '15px', textTransform: 'uppercase', letterSpacing: '0.5px' },
    chartGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
    chartCard: { backgroundColor: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #e0e0e0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
    chartTitle: { fontSize: '13px', fontWeight: 'bold', color: '#666', marginBottom: '10px', textAlign: 'center' },
    tabButton: { padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', color: '#666' },
    activeTab: { color: '#003366', borderBottom: '2px solid #003366' },
    th: { padding: '12px', color: '#666', fontWeight: 'bold' },
    td: { padding: '12px' },
    routeBadge: { padding: '2px 6px', borderRadius: '4px', color: '#fff', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' },
    editForm: { display: 'flex', flexDirection: 'column', gap: '10px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontSize: '13px', fontWeight: 'bold', color: '#555' },
    inputSmall: { padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px', width: '150px' },
    saveButton: { padding: '10px 20px', backgroundColor: '#003366', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
    cancelButton: { padding: '10px 20px', backgroundColor: '#f0f0f0', color: '#333', border: 'none', borderRadius: '4px', cursor: 'pointer' },
    secondaryButton: { padding: '10px 20px', backgroundColor: 'white', color: '#003366', border: '1px solid #003366', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginRight: '10px' }
};

export default StaffDashboard;