import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const ROLE_OPTIONS = ['admin', 'editor', 'user'];
const PERMISSION_OPTIONS = ['system:all', 'db:manage', 'tokens:view', 'profile:edit', 'match:run'];
const KNOWN_PROMPT_AGENTS = [
  { value: 'advisor', label: 'Advisor - general student chat' },
  { value: 'advisor_match', label: 'Advisor Match - Wizard Top 3 matching' },
  { value: 'crm', label: 'CRM - profile-aware student chat' },
  { value: 'rag', label: 'RAG - grounded admissions answers' },
  { value: 'router', label: 'Router - classify chat intent' },
  { value: 'judge_safety', label: 'Judge Safety - response safety gate' },
  { value: 'judge_gold', label: 'Judge Gold - golden-answer evaluation' }
];

const DatabaseManagementPage = () => {
  const [status, setStatus] = useState(null);
  const [users, setUsers] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [newUser, setNewUser] = useState({
    email: '',
    full_name: '',
    password: '',
    role: 'editor'
  });
  const [permissionDraft, setPermissionDraft] = useState({});
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptPreview, setPromptPreview] = useState(null);
  const [newPrompt, setNewPrompt] = useState({ agent_name: '', version: '', content: '' });
  const [comparePrompt, setComparePrompt] = useState({ agent_name: '', version_a: '', version_b: '', test_input: '' });
  const [compareResult, setCompareResult] = useState(null);
  const [ingestMode, setIngestMode] = useState('internal');
  const [ingestUrl, setIngestUrl] = useState('');
  const [externalSourceType, setExternalSourceType] = useState('official');
  const [forceOverwrite, setForceOverwrite] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestReport, setIngestReport] = useState(null);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) =>
      [user.email, user.user_id, user.full_name, user.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [search, users]);

  const promptAgentOptions = useMemo(() => {
    const known = KNOWN_PROMPT_AGENTS.map((agent) => agent.value);
    const existing = prompts.map((prompt) => prompt.agent_name).filter(Boolean);
    return Array.from(new Set([...known, ...existing])).map((agentName) => {
      const knownAgent = KNOWN_PROMPT_AGENTS.find((agent) => agent.value === agentName);
      return { value: agentName, label: knownAgent?.label || agentName };
    });
  }, [prompts]);

  const selectedAgentVersions = useMemo(() => (
    prompts
      .filter((prompt) => prompt.agent_name === comparePrompt.agent_name)
      .map((prompt) => prompt.version)
  ), [prompts, comparePrompt.agent_name]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dbStatus, userData, promptData, healthData] = await Promise.all([
        api.getDbStatus(),
        api.getAdminUsers(),
        api.getAdminPrompts(),
        api.getAdminSystemHealth()
      ]);
      setStatus(dbStatus);
      setUsers(userData.users || []);
      setPrompts(promptData.prompts || []);
      setHealth(healthData);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Không thể truy cập thông tin hệ thống.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateUser = async (roleOverride) => {
    if (!newUser.email || !newUser.password) {
      toast.error('Email và mật khẩu là bắt buộc.');
      return;
    }

    setSaving(true);
    try {
      await api.createAdminUser({ ...newUser, role: roleOverride || newUser.role });
      toast.success(`Đã thêm ${roleOverride || newUser.role}.`);
      setNewUser({ email: '', full_name: '', password: '', role: 'editor' });
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Không thể tạo user.');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (userId, role) => {
    try {
      await api.updateAdminUserRole(userId, role);
      toast.success(`Đã đổi role thành ${role}.`);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Không thể đổi role.');
    }
  };

  const handlePermission = async (userId, action, permission) => {
    if (!permission) {
      toast.error('Chọn permission trước.');
      return;
    }

    try {
      if (action === 'grant') {
        await api.grantAdminUserPermission(userId, permission);
        toast.success(`Đã grant ${permission}.`);
      } else {
        await api.revokeAdminUserPermission(userId, permission);
        toast.success(`Đã revoke ${permission}.`);
      }
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Không thể cập nhật permission.');
    }
  };

  const handleBlacklist = async (userId, blacklisted) => {
    try {
      await api.updateAdminUserBlacklist(userId, blacklisted);
      toast.success(blacklisted ? 'Đã blacklist user.' : 'Đã gỡ blacklist user.');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Không thể cập nhật blacklist.');
    }
  };

  const handleOpenCv = (userId) => {
    window.open(api.getAssetUrl(`/api/profile/${encodeURIComponent(userId)}/cv`), '_blank', 'noopener,noreferrer');
  };

  const fillPromptFromExisting = (agentName, version) => {
    const existing = prompts.find((prompt) => prompt.agent_name === agentName && prompt.version === version);
    if (existing) {
      setNewPrompt({ agent_name: existing.agent_name, version: existing.version, content: existing.content || '' });
    }
  };

  const handleCreatePrompt = async () => {
    if (!newPrompt.agent_name.trim() || !newPrompt.version.trim() || !newPrompt.content.trim()) {
      toast.error('Agent name, version, and prompt content are required.');
      return;
    }

    setSaving(true);
    try {
      await api.createAdminPrompt(newPrompt);
      toast.success('Prompt version saved.');
      setNewPrompt({ agent_name: '', version: '', content: '' });
      setPromptModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not save prompt version.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePrompt = async (prompt) => {
    const typed = window.prompt(
      `Deleting ${prompt.agent_name}/${prompt.version} is irreversible and may break active agents. Type the version name to confirm.`
    );
    if (typed !== prompt.version) {
      toast.error('Prompt deletion cancelled.');
      return;
    }

    try {
      await api.deleteAdminPrompt(prompt.agent_name, prompt.version);
      toast.success('Prompt version deleted.');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not delete prompt version.');
    }
  };

  const handleSelectPrompt = async (prompt) => {
    try {
      const result = await api.selectAdminPrompt({ agent_name: prompt.agent_name, version: prompt.version });
      toast.success(result.applied_targets?.length ? 'Prompt selected and applied.' : 'Prompt selected for database alias.');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not select prompt version.');
    }
  };

  const handleComparePrompts = async () => {
    if (!comparePrompt.agent_name.trim() || !comparePrompt.version_a.trim() || !comparePrompt.version_b.trim()) {
      toast.error('Agent name and both versions are required.');
      return;
    }

    try {
      const result = await api.compareAdminPrompts(comparePrompt);
      setCompareResult(result);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not compare prompt versions.');
    }
  };

  const handleRagIngest = async () => {
    if (ingestMode === 'external' && !ingestUrl.trim()) {
      toast.error('Enter a URL before crawling an external source.');
      return;
    }

    setIngesting(true);
    setIngestReport(null);
    try {
      const payload = {
        source_type: ingestMode,
        params: {
          force_overwrite: forceOverwrite,
          ...(ingestMode === 'external' ? {
            url: ingestUrl.trim(),
            source_type: externalSourceType,
          } : {})
        }
      };
      const result = await api.ingestRag(payload);
      setIngestReport(result.report || null);
      toast.success('RAG ingestion completed.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not run RAG ingestion.');
    } finally {
      setIngesting(false);
    }
  };

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <div className="p-8 h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="border-b-4 border-primary pb-4">
          <h1 className="text-3xl font-black text-primary tracking-tight">System / PostgreSQL Database</h1>
          <p className="text-slate-500 font-medium mt-1">Kiểm tra kết nối database và quản trị tài khoản hệ thống.</p>
        </header>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100">
            {error}
          </div>
        )}

        {status && (
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatusCard label="Trạng thái" value={status.status === 'connected' ? 'Đã kết nối' : 'Mất kết nối'} tone={status.status === 'connected' ? 'green' : 'red'} />
            <StatusCard label="Database" value={`${status.database} (${status.type})`} />
            <StatusCard label="Users" value={status.user_counts?.total || 0} />
            <StatusCard label="Blacklisted" value={status.user_counts?.blacklisted || 0} tone="red" />
          </section>
        )}

        {health?.badges?.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Operational health</h2>
                <p className="text-xs text-slate-500 mt-1">Backend badges for tokens, prompts, handoffs, database, and RAG ingest.</p>
              </div>
              <button onClick={loadData} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-primary">
                Refresh
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {health.badges.map((badge) => (
                <div key={badge.id} className="border border-slate-100 rounded-xl p-4 bg-slate-50">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{badge.label}</p>
                  <p className={`mt-1 text-sm font-black ${badge.status === 'warning' ? 'text-amber-600' : badge.status === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
                    {badge.status}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 truncate">{String(badge.detail ?? '-')}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Thêm Admin / Editor</h2>
            <p className="text-xs text-slate-500 mt-1">Tạo user trực tiếp trong PostgreSQL. Role có thể đổi lại trong bảng bên dưới.</p>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-5 gap-4">
            <input className={inputClass} placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            <input className={inputClass} placeholder="Tên hiển thị" value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} />
            <input className={inputClass} placeholder="Mật khẩu tạm thời" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            <select className={inputClass} value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
              {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
            <div className="flex gap-2">
              <button disabled={saving} onClick={() => handleCreateUser('admin')} className="flex-1 px-4 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50">Add admin</button>
              <button disabled={saving} onClick={() => handleCreateUser('editor')} className="flex-1 px-4 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50">Add editor</button>
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Users trong PostgreSQL</h2>
              <p className="text-xs text-slate-500 mt-1">Grant/revoke permission, đổi role, hoặc blacklist user.</p>
            </div>
            <div className="flex gap-2">
              <input className={`${inputClass} w-72`} placeholder="Tìm email, tên, role..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <button onClick={loadData} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-primary hover:bg-slate-50">Refresh</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Permissions</th>
                  <th className="px-6 py-4">Grant / Revoke</th>
                  <th className="px-6 py-4">CV</th>
                  <th className="px-6 py-4 text-right">Blacklist</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => {
                  const userId = user.email || user.user_id;
                  const selectedPermission = permissionDraft[userId] || PERMISSION_OPTIONS[0];

                  return (
                    <tr key={userId} className={user.blacklisted ? 'bg-red-50/40' : ''}>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-800">{user.email || user.user_id}</p>
                        <p className="text-xs text-slate-400">{user.full_name || 'No display name'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <select className={`${inputClass} min-w-28`} value={user.role || 'user'} onChange={(e) => handleRoleChange(userId, e.target.value)}>
                          {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {(user.permissions || []).length > 0 ? (
                            user.permissions.map((permission) => (
                              <span key={permission} className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold">{permission}</span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400 italic">No custom permissions</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2 min-w-[320px]">
                          <select className={inputClass} value={selectedPermission} onChange={(e) => setPermissionDraft({ ...permissionDraft, [userId]: e.target.value })}>
                            {PERMISSION_OPTIONS.map((permission) => <option key={permission} value={permission}>{permission}</option>)}
                          </select>
                          <button onClick={() => handlePermission(userId, 'grant', selectedPermission)} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase">Grant</button>
                          <button onClick={() => handlePermission(userId, 'revoke', selectedPermission)} className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase">Revoke</button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {user.cv_filename ? (
                          <button
                            onClick={() => handleOpenCv(userId)}
                            className="px-3 py-2 bg-white border border-slate-200 text-primary rounded-lg text-[10px] font-black uppercase hover:bg-slate-50"
                          >
                            View CV
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No CV</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleBlacklist(userId, !user.blacklisted)}
                          className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                            user.blacklisted
                              ? 'bg-white text-red-600 border border-red-200'
                              : 'bg-red-600 text-white border border-red-600'
                          }`}
                        >
                          {user.blacklisted ? 'Unblacklist' : 'Blacklist'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Prompt Configuration</h2>
              <p className="text-xs text-slate-500 mt-1">Version-controlled prompts for each backend agent.</p>
            </div>
            <button
              onClick={() => setPromptModalOpen(true)}
              className="px-4 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest"
            >
              New Prompt
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="px-6 py-4">Agent Name</th>
                  <th className="px-6 py-4">Version</th>
                  <th className="px-6 py-4">Created At</th>
                  <th className="px-6 py-4">Preview</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {prompts.length > 0 ? prompts.map((prompt) => (
                  <tr key={`${prompt.agent_name}-${prompt.version}`}>
                    <td className="px-6 py-4 font-bold text-slate-800">{prompt.agent_name}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold">
                        {prompt.version}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">{formatDate(prompt.created_at)}</td>
                    <td className="px-6 py-4 text-xs text-slate-500 max-w-md">
                      <button
                        type="button"
                        onClick={() => setPromptPreview(prompt)}
                        className="block w-full truncate text-left hover:text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/20 rounded"
                        title="Open full prompt preview"
                      >
                        {prompt.content || 'No content'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleSelectPrompt(prompt)}
                        className="mr-2 px-3 py-2 bg-primary text-white rounded-lg text-[10px] font-black uppercase"
                      >
                        Select
                      </button>
                      <button
                        onClick={() => handleDeletePrompt(prompt)}
                        className="px-3 py-2 bg-red-600 text-white rounded-lg text-[10px] font-black uppercase"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td className="px-6 py-8 text-center text-sm text-slate-400" colSpan={5}>
                      No prompt versions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Prompt Versioning</h2>
            <p className="text-xs text-slate-500 mt-1">Update prompt versions by number/name, compare rendered outputs, then select the version for use.</p>
          </div>
          <div className="p-6 space-y-5">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Add / Update Prompt</h3>
                  <p className="text-xs text-slate-500 mt-1">Choose an agent, enter a version number/name, then save the prompt content.</p>
                </div>
                <button
                  onClick={handleCreatePrompt}
                  disabled={saving}
                  className="px-4 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50"
                >
                  Save Prompt Version
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select
                  className={inputClass}
                  value={newPrompt.agent_name}
                  onChange={(e) => setNewPrompt({ ...newPrompt, agent_name: e.target.value })}
                >
                  <option value="">Choose agent</option>
                  {promptAgentOptions.map((agent) => (
                    <option key={agent.value} value={agent.value}>{agent.label}</option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  placeholder="Version number/name, e.g. 1 or v3"
                  value={newPrompt.version}
                  onChange={(e) => {
                    setNewPrompt({ ...newPrompt, version: e.target.value });
                    fillPromptFromExisting(newPrompt.agent_name, e.target.value);
                  }}
                />
                <select
                  className={inputClass}
                  value=""
                  onChange={(e) => {
                    if (e.target.value) fillPromptFromExisting(newPrompt.agent_name, e.target.value);
                  }}
                  disabled={!newPrompt.agent_name}
                >
                  <option value="">Load existing version</option>
                  {prompts.filter((prompt) => prompt.agent_name === newPrompt.agent_name).map((prompt) => (
                    <option key={prompt.version} value={prompt.version}>{prompt.version}</option>
                  ))}
                </select>
              </div>
              <textarea
                className={`${inputClass} w-full min-h-52 resize-y font-mono`}
                placeholder="Prompt content"
                value={newPrompt.content}
                onChange={(e) => setNewPrompt({ ...newPrompt, content: e.target.value })}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {KNOWN_PROMPT_AGENTS.map((agent) => (
                  <div key={agent.value} className="bg-white border border-slate-100 rounded-xl p-3">
                    <p className="text-xs font-black text-slate-800">{agent.value}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{agent.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                className={inputClass}
                value={comparePrompt.agent_name}
                onChange={(e) => setComparePrompt({ agent_name: e.target.value, version_a: '', version_b: '', test_input: comparePrompt.test_input })}
              >
                <option value="">Choose agent to compare</option>
                {promptAgentOptions.map((agent) => (
                  <option key={agent.value} value={agent.value}>{agent.label}</option>
                ))}
              </select>
              <select
                className={inputClass}
                value={comparePrompt.version_a}
                onChange={(e) => setComparePrompt({ ...comparePrompt, version_a: e.target.value })}
                disabled={!comparePrompt.agent_name}
              >
                <option value="">Version A</option>
                {selectedAgentVersions.map((version) => <option key={version} value={version}>{version}</option>)}
              </select>
              <select
                className={inputClass}
                value={comparePrompt.version_b}
                onChange={(e) => setComparePrompt({ ...comparePrompt, version_b: e.target.value })}
                disabled={!comparePrompt.agent_name}
              >
                <option value="">Version B</option>
                {selectedAgentVersions.map((version) => <option key={version} value={version}>{version}</option>)}
              </select>
              <button
                onClick={handleComparePrompts}
                className="px-4 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest"
              >
                Compare
              </button>
            </div>
            <textarea
              className={`${inputClass} w-full min-h-24 resize-y`}
              placeholder="Test input for comparing prompt output preview"
              value={comparePrompt.test_input}
              onChange={(e) => setComparePrompt({ ...comparePrompt, test_input: e.target.value })}
            />

            {compareResult && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PromptPreview title={`${compareResult.agent_name} / ${compareResult.version_a}`} value={compareResult.output_a} />
                <PromptPreview title={`${compareResult.agent_name} / ${compareResult.version_b}`} value={compareResult.output_b} />
                <div className="lg:col-span-2 bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs text-slate-600">
                  Same content: <strong>{compareResult.comparison?.same ? 'Yes' : 'No'}</strong>
                  <span className="mx-3">|</span>
                  Length A: <strong>{compareResult.comparison?.length_a}</strong>
                  <span className="mx-3">|</span>
                  Length B: <strong>{compareResult.comparison?.length_b}</strong>
                  <span className="mx-3">|</span>
                  Delta: <strong>{compareResult.comparison?.delta}</strong>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">RAG Ingestion Controls</h2>
            <p className="text-xs text-slate-500 mt-1">Choose the source to ingest instead of running a global sync.</p>
          </div>
          <div className="p-6 space-y-5">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                onClick={() => setIngestMode('internal')}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest ${ingestMode === 'internal' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
              >
                Internal
              </button>
              <button
                onClick={() => setIngestMode('external')}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest ${ingestMode === 'external' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
              >
                External
              </button>
            </div>

            {ingestMode === 'internal' ? (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                <p className="text-sm font-bold text-slate-800">Sync School Handbook (Local PDF)</p>
                <p className="text-xs text-slate-500 mt-1">Reads the configured local corpus folders and updates embeddings.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <input
                  className={`${inputClass} w-full`}
                  placeholder="https://vinuni.edu.vn/..."
                  value={ingestUrl}
                  onChange={(e) => setIngestUrl(e.target.value)}
                />
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Source verification</p>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${externalSourceType === 'official' ? 'border-emerald-200 bg-white shadow-sm' : 'border-slate-200 bg-slate-50'}`}>
                      <input
                        type="radio"
                        name="external-source-type"
                        value="official"
                        checked={externalSourceType === 'official'}
                        onChange={(e) => setExternalSourceType(e.target.value)}
                        className="mt-0.5 h-4 w-4 border-slate-300 text-emerald-600 focus:ring-emerald-200"
                      />
                      <span>
                        <span className="block text-sm font-black text-slate-800">Official</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">Use for VinUni-owned domains or verified university pages.</span>
                      </span>
                    </label>
                    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${externalSourceType === 'unofficial' ? 'border-amber-200 bg-white shadow-sm' : 'border-slate-200 bg-slate-50'}`}>
                      <input
                        type="radio"
                        name="external-source-type"
                        value="unofficial"
                        checked={externalSourceType === 'unofficial'}
                        onChange={(e) => setExternalSourceType(e.target.value)}
                        className="mt-0.5 h-4 w-4 border-slate-300 text-amber-600 focus:ring-amber-200"
                      />
                      <span>
                        <span className="block text-sm font-black text-slate-800">Unofficial</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">Use for third-party references that should not be treated as verified policy.</span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            <label className="flex items-center gap-3 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary/20"
                checked={forceOverwrite}
                onChange={(e) => setForceOverwrite(e.target.checked)}
              />
              Force Overwrite
            </label>

            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <button
                onClick={handleRagIngest}
                disabled={ingesting}
                className="w-fit px-5 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                {ingesting ? 'Running...' : ingestMode === 'internal' ? 'Sync School Handbook' : 'Crawl Web Source'}
              </button>
              {ingestReport && (
                <p className="text-xs text-slate-500">
                  Added {ingestReport.added || 0}, updated {ingestReport.updated || 0}, failed {ingestReport.failed_files?.length || 0}.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      {promptModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-800">New Prompt Version</h3>
                <p className="text-xs text-slate-500 mt-1">Saving an existing agent/version replaces that version content.</p>
              </div>
              <button onClick={() => setPromptModalOpen(false)} className="px-3 py-2 text-slate-500 hover:text-slate-800">
                Close
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <select className={inputClass} value={newPrompt.agent_name} onChange={(e) => setNewPrompt({ ...newPrompt, agent_name: e.target.value })}>
                  <option value="">Choose agent</option>
                  {promptAgentOptions.map((agent) => (
                    <option key={agent.value} value={agent.value}>{agent.label}</option>
                  ))}
                </select>
                <input className={inputClass} placeholder="Version, e.g. v3" value={newPrompt.version} onChange={(e) => setNewPrompt({ ...newPrompt, version: e.target.value })} />
              </div>
              <textarea
                className={`${inputClass} w-full min-h-64 resize-y`}
                placeholder="Prompt content"
                value={newPrompt.content}
                onChange={(e) => setNewPrompt({ ...newPrompt, content: e.target.value })}
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setPromptModalOpen(false)} className="px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50">
                  Cancel
                </button>
                <button disabled={saving} onClick={handleCreatePrompt} className="px-4 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50">
                  Save Prompt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {promptPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[88vh]">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-lg font-black text-slate-800">Prompt Preview</h3>
                <p className="text-xs text-slate-500 mt-1 truncate">
                  {promptPreview.agent_name} / {promptPreview.version} · {formatDate(promptPreview.created_at)}
                </p>
              </div>
              <button
                onClick={() => setPromptPreview(null)}
                className="px-3 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg text-sm font-bold"
              >
                Close
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-950 p-5 text-xs leading-6 text-slate-100 font-mono">
                {promptPreview.content || 'No prompt content.'}
              </pre>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => {
                  setNewPrompt({
                    agent_name: promptPreview.agent_name,
                    version: promptPreview.version,
                    content: promptPreview.content || ''
                  });
                  setPromptPreview(null);
                }}
                className="px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50"
              >
                Load for edit
              </button>
              <button
                onClick={() => setPromptPreview(null)}
                className="px-4 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const inputClass = 'px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/20';

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const StatusCard = ({ label, value, tone = 'slate' }) => {
  const toneClass = tone === 'green' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : 'text-slate-800';
  return (
    <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <p className={`text-lg font-black mt-1 ${toneClass}`}>{value}</p>
    </div>
  );
};

const PromptPreview = ({ title, value }) => (
  <div className="border border-slate-200 rounded-xl overflow-hidden">
    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 text-xs font-black uppercase tracking-widest text-slate-600">
      {title}
    </div>
    <pre className="p-4 text-xs text-slate-700 whitespace-pre-wrap max-h-80 overflow-y-auto font-mono">
      {value}
    </pre>
  </div>
);

export default DatabaseManagementPage;
