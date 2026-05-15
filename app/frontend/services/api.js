import axios from 'axios';
import { toast } from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const normalizeChatResponse = (data = {}) => {
  const recommendations = data.major || data.top3 || [];
  const sources = data.sources || data.references || [];

  return {
    ...data,
    response: data.response || data.answer || '',
    answer: data.answer || data.response || '',
    recommendations,
    major: recommendations,
    top3: recommendations,
    sources,
    references: sources,
    fallback: Boolean(data.fallback || ['fallback', 'rejected', 'escalated', 'error'].includes(data.status)),
    fallbackCard: data.fallback_card || data.fallbackCard || null,
    recoveryActions: data.recovery_actions || data.recoveryActions || [],
    decisionTrace: data.decision_trace || data.decisionTrace || null,
    suggestedResources: data.suggested_resources || data.suggestedResources || [],
    status: data.status || 'success',
    intent: data.intent || data.agent || null,
    sessionId: data.sessionId || data.session_id || null,
    sessionTitle: data.sessionTitle || data.session_title || null,
    traceId: data.trace_id || data.traceId || data.decision_trace?.trace_id || null,
    handoffStatus: data.handoff_status || data.handoffStatus || data.decision_trace?.handoff_status || null,
  };
};

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const clearAuthAndRedirect = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user_email');
  localStorage.removeItem('user_role');
  localStorage.removeItem('user_name');
  localStorage.removeItem('user_avatar');
  localStorage.removeItem('user_permissions');
  toast.error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
};

const streamJsonLines = async (url, onData) => {
  const response = await fetch(url, { headers: authHeaders() });
  if (response.status === 401) {
    clearAuthAndRedirect();
    throw new Error('Unauthorized');
  }
  if (response.status === 403) {
    toast.error('Bạn không có quyền thực hiện thao tác này.');
    throw new Error('Forbidden');
  }
  if (!response.ok) {
    throw new Error(`Stream request failed with status ${response.status}`);
  }
  if (!response.body) {
    throw new Error('Streaming is not supported by this browser.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = JSON.parse(line.substring(6));
      onData(payload);
    }
  }
};

// Interceptor to attach JWT token from localStorage to all requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const requestUrl = error.config?.url || '';

    if (status === 401 && !requestUrl.includes('/api/auth/')) {
      clearAuthAndRedirect();
    } else if (status === 403) {
      toast.error('Bạn không có quyền thực hiện thao tác này.');
    }

    return Promise.reject(error);
  }
);

const api = {
  // Authentication Endpoints
  login: (credentials) => apiClient.post('/api/auth/login', credentials).then(res => res.data),
  signup: (userData) => apiClient.post('/api/auth/signup', userData).then(res => res.data),
  adminSignup: (userData) => apiClient.post('/api/auth/admin-signup', userData).then(res => res.data),
  googleLogin: (token) => apiClient.post('/api/auth/google', { token }).then(res => res.data),

  // Chat and Session Management
  postChat: (payload, options = {}) => 
    apiClient.post('/api/chat', payload, options).then(res => normalizeChatResponse(res.data)),
  
  getSessions: (userId) => 
    apiClient.get(`/api/chat/sessions/${userId}`).then(res => res.data),
  
  getSessionMessages: (sessionId) => 
    apiClient.get(`/api/chat/sessions/${sessionId}/messages`).then(res => res.data),
  
  renameSession: (sessionId, title) => 
    apiClient.patch(`/api/chat/sessions/${sessionId}/rename`, { title }).then(res => res.data),
  
  deleteSession: (sessionId) => 
    apiClient.delete(`/api/chat/sessions/${sessionId}`).then(res => res.data),

  deleteChatMessage: (messageId) =>
    apiClient.delete(`/api/chat/messages/${messageId}`).then(res => res.data),
  
  downloadHistory: (sessionId) => 
    apiClient.get(`/api/chat/sessions/${sessionId}/download`, { responseType: 'blob' }),

  downloadSessionHistory: (sessionId) => 
    apiClient.get(`/api/chat/sessions/${sessionId}/download`, { responseType: 'blob' }),

  // Wizard and Profile Endpoints
  runMatch: (payload) => apiClient.post('/api/match', payload).then(res => res.data),
  
  getProfile: (userId) => apiClient.get(`/api/profile/${userId}`).then(res => res.data),
  
  updateProfile: (userId, data) => 
    apiClient.post(`/api/profile/${userId}`, data).then(res => res.data),
  
  uploadCV: (formData) => 
    apiClient.post('/api/upload-cv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data),

  downloadCV: (userId) => 
    apiClient.get(`/api/profile/${userId}/cv`, { responseType: 'blob' }),

  getCVDocuments: () =>
    apiClient.get('/api/profile/me/cv-documents').then(res => res.data),

  confirmCV: (documentId, structuredData) =>
    apiClient.post(`/api/profile/me/cv-documents/${documentId}/confirm`, { structured_data: structuredData }).then(res => res.data),

  deleteCVDocument: (documentId) =>
    apiClient.delete(`/api/profile/me/cv-documents/${documentId}`).then(res => res.data),

  getProfileReadiness: () =>
    apiClient.get('/api/profile/me/readiness').then(res => res.data),

  getCVMergePreview: (documentId) =>
    apiClient.get(`/api/profile/me/cv-documents/${documentId}/merge-preview`).then(res => res.data),

  getContextualResources: (params = {}) =>
    apiClient.get('/api/resources/contextual', { params }).then(res => res.data),

  getHandoffStatus: () =>
    apiClient.get('/api/handoff-status').then(res => res.data),

  requestHandoff: (payload = {}) =>
    apiClient.post('/api/handoff-request', payload).then(res => normalizeChatResponse(res.data)),

  getHandoffMessages: (traceId) =>
    apiClient.get(`/api/handoff/${encodeURIComponent(traceId)}/messages`).then(res => res.data),

  sendHandoffMessage: (traceId, message) =>
    apiClient.post(`/api/handoff/${encodeURIComponent(traceId)}/messages`, { message }).then(res => res.data),

  // Metrics and Human Handoff (PMF Scorecard Support)
  /**
   * Fetch system-wide PMF metrics (AI resolution rate, latency, etc.)
   * @param {number} hours - Lookback window in hours (default 336 / 2 weeks)
   */
  getMetrics: (hours = 336) => 
    apiClient.get('/api/metrics', { params: { hours } }).then(res => res.data),

  /**
   * Fetch a concise handoff summary for a student to assist a human advisor.
   * @param {string} userId - The unique identifier/email of the student.
   */
  getHandoffSummary: (userId) => 
    apiClient.get('/api/handoff-summary', { params: { user_id: userId } }).then(res => res.data),

  // Admin and Staff Operations
  getAuditLogs: (params = {}) =>
    apiClient.get('/api/admin/audit-logs', { params }).then(res => res.data),

  getAdminBoard: (hours = 336) =>
    apiClient.get('/api/admin/board', { params: { hours } }).then(res => res.data),

  getPendingHandoffs: () =>
    apiClient.get('/api/admin/pending-handoffs').then(res => res.data),

  updateHandoffStatus: (traceId, status) =>
    apiClient.post(`/api/admin/handoff/${traceId}`, { status }).then(res => res.data),

  sendHandoffReply: (traceId, message) =>
    apiClient.post(`/api/admin/handoff/${traceId}/message`, { message }).then(res => res.data),

  logEmailSent: (userId) =>
    apiClient.post('/api/audit/email-sent', { user_id: userId }).then(res => res.data),

  logConsultationClick: (source = 'report') =>
    apiClient.post('/api/audit/consultation-click', { source }).then(res => res.data),

  // Database & System Health
  getDbStatus: () => apiClient.get('/api/system/db-status').then(res => res.data),
  getTokenUsage: (params = {}) =>
    apiClient.get('/api/system/token-usage', { params }).then(res => res.data),
  getAdminSystemHealth: () => apiClient.get('/api/admin/system/health').then(res => res.data),
  seedAdminTable: (target, version = 'v2') =>
    apiClient.post(`/api/admin/seed/${encodeURIComponent(target)}`, null, { params: { version } }).then(res => res.data),
  getAdminUsers: () => apiClient.get('/api/admin/users').then(res => res.data),
  createAdminUser: (payload) => apiClient.post('/api/admin/users', payload).then(res => res.data),
  updateAdminUserRole: (userId, role) =>
    apiClient.patch(`/api/admin/users/${encodeURIComponent(userId)}/role`, { role }).then(res => res.data),
  grantAdminUserPermission: (userId, permission) =>
    apiClient.post(`/api/admin/users/${encodeURIComponent(userId)}/permissions/grant`, { permission }).then(res => res.data),
  revokeAdminUserPermission: (userId, permission) =>
    apiClient.post(`/api/admin/users/${encodeURIComponent(userId)}/permissions/revoke`, { permission }).then(res => res.data),
  updateAdminUserBlacklist: (userId, blacklisted) =>
    apiClient.patch(`/api/admin/users/${encodeURIComponent(userId)}/blacklist`, { blacklisted }).then(res => res.data),
  getAdminPrompts: () => apiClient.get('/api/admin/prompts').then(res => res.data),
  createAdminPrompt: (payload) => apiClient.post('/api/admin/prompts', payload).then(res => res.data),
  compareAdminPrompts: (payload) => apiClient.post('/api/admin/prompts/compare', payload).then(res => res.data),
  selectAdminPrompt: (payload) => apiClient.post('/api/admin/prompts/select', payload).then(res => res.data),
  deleteAdminPrompt: (agentName, version) =>
    apiClient.delete(`/api/admin/prompts/${encodeURIComponent(agentName)}/${encodeURIComponent(version)}`).then(res => res.data),

  // RAG Admin
  getRagStatus: () => apiClient.get('/api/admin/rag/status').then(res => res.data),

  updateRagConfig: (intervalHours) =>
    apiClient.post('/api/admin/rag/config', { interval_hours: intervalHours }).then(res => res.data),
  ingestRag: (payload) => apiClient.post('/api/admin/rag/ingest', payload).then(res => res.data),

  getRagIngestStreamUrl: () => `${API_BASE_URL}/api/admin/rag/ingest/stream`,

  streamRagIngest: (onData) => streamJsonLines(`${API_BASE_URL}/api/admin/rag/ingest/stream`, onData),

  getAssetUrl: (path) => {
    if (!path) return '';
    return path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  },

  /**
   * Generic POST method to support components using direct endpoint calls.
   */
  post: (url, data, config) => apiClient.post(url, data, config),
};

export default api;
