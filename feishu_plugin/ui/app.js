const API = '';
let currentFlowId = null;
let pollTimer = null;
let approvalUrl = null;
let countdownTimer = null;

function showMsg(text, ok) {
  const el = document.getElementById('msg-area');
  el.innerHTML = `<div class="msg ${ok ? 'msg-ok' : 'msg-err'}">${esc(text)}</div>`;
  setTimeout(() => el.innerHTML = '', 5000);
}

function showRestartBanner() {
  document.getElementById('restart-banner').style.display = 'flex';
}

function dismissRestart() {
  document.getElementById('restart-banner').style.display = 'none';
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

async function refreshStatus() {
  try {
    const s = await api('GET', '/api/paperclip/auth/status');
    renderAuthStatus(s);
  } catch (e) {
    document.getElementById('auth-status-body').innerHTML = '<span style="color:#c00">状态查询失败: ' + esc(e.message) + '</span>';
  }
}

function renderAuthStatus(s) {
  const body = document.getElementById('auth-status-body');
  const actions = document.getElementById('auth-connected-actions');
  const form = document.getElementById('auth-form');
  const btnQuery = document.getElementById('btn-query-companies');

  if (s.mode === 'env') {
    document.getElementById('env-mode-notice').style.display = 'block';
    form.style.display = 'none';
    actions.style.display = 'none';
    body.innerHTML = '<span style="color:#0c5aa6">环境变量模式，由外部配置管理</span>';
    btnQuery.disabled = false;
    return;
  }

  document.getElementById('env-mode-notice').style.display = 'none';

  if (!s.connected || s.validity === 'missing') {
    body.innerHTML = validityLabel(s.validity);
    form.style.display = 'block';
    actions.style.display = 'none';
    btnQuery.disabled = true;
    return;
  }

  const userStr = s.user ? esc(s.user.name || s.user.email || s.user.id) : '-';
  const keyExp = s.key?.expiresAt ? new Date(s.key.expiresAt).toLocaleString() : '未知';
  const keyStatus = s.key?.expired ? '<span style="color:#c00">已过期</span>' : '<span style="color:#1a7a1a">有效</span>';

  body.innerHTML = `
    <div style="font-size:14px;line-height:2">
      <div>状态：<span class="badge badge-ok">已连接</span></div>
      <div>授权用户：${userStr}</div>
      <div>可访问 Company：${s.companyCount ?? '-'}</div>
      <div>Key 状态：${keyStatus}</div>
      <div>到期时间：${keyExp}</div>
      ${s.lastValidatedAt ? '<div style="color:#999;font-size:12px">上次验证：' + new Date(s.lastValidatedAt).toLocaleString() + '</div>' : ''}
    </div>`;

  form.style.display = 'none';
  actions.style.display = 'block';
  btnQuery.disabled = false;
}

function validityLabel(v) {
  const map = {
    missing: '未授权，请连接 Paperclip',
    expired: 'Key 已过期，请重新授权',
    revoked_or_invalid: 'Key 已失效或被撤销，请重新授权',
    unreachable: 'Paperclip 暂时不可达',
    unknown: '授权状态未知',
  };
  const color = (v === 'unreachable') ? '#856404' : '#c00';
  return `<span style="color:${color}">${map[v] || v}</span>`;
}

async function startAuth() {
  const url = document.getElementById('pc-url').value.trim();
  try {
    const result = await api('POST', '/api/paperclip/auth/start', { paperclipBaseUrl: url || undefined });
    currentFlowId = result.flowId;
    approvalUrl = result.approvalUrl;
    showPendingUI(result);
    if (approvalUrl) {
      window.open(approvalUrl, '_blank', 'noopener,noreferrer');
    }
    startPolling(result.suggestedPollIntervalMs || 1000);
  } catch (e) {
    showMsg('启动授权失败: ' + e.message, false);
  }
}

function showPendingUI(result) {
  document.getElementById('auth-form').style.display = 'none';
  document.getElementById('auth-pending').style.display = 'block';
  document.getElementById('auth-connected-actions').style.display = 'none';
  startCountdown(result.expiresAt);
}

function startCountdown(expiresAt) {
  clearInterval(countdownTimer);
  if (!expiresAt) return;
  const target = new Date(expiresAt).getTime();
  const el = document.getElementById('auth-countdown');
  countdownTimer = setInterval(() => {
    const left = target - Date.now();
    if (left <= 0) {
      el.textContent = '已过期';
      clearInterval(countdownTimer);
      return;
    }
    const s = Math.floor(left / 1000);
    el.textContent = `(${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})`;
  }, 1000);
}

function startPolling(intervalMs) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!currentFlowId) { stopPolling(); return; }
    try {
      const result = await api('GET', `/api/paperclip/auth/flows/${currentFlowId}`);
      handleFlowResult(result);
    } catch {
      // keep polling
    }
  }, intervalMs);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

function handleFlowResult(result) {
  if (result.status === 'pending') return;

  stopPolling();
  clearInterval(countdownTimer);
  document.getElementById('auth-pending').style.display = 'none';
  currentFlowId = null;

  if (result.status === 'approved') {
    showMsg('授权成功', true);
    if (result.restartRequired) showRestartBanner();
    refreshStatus();
    return;
  }

  document.getElementById('auth-form').style.display = 'block';
  if (result.status === 'cancelled') showMsg('授权已取消', false);
  else if (result.status === 'expired') showMsg('授权已过期', false);
  else showMsg('授权失败: ' + (result.error || '未知错误'), false);
}

function reopenApproval() {
  if (approvalUrl) window.open(approvalUrl, '_blank', 'noopener,noreferrer');
}

async function cancelAuth() {
  stopPolling();
  clearInterval(countdownTimer);
  if (currentFlowId) {
    try { await api('POST', `/api/paperclip/auth/flows/${currentFlowId}/cancel`); } catch {}
  }
  currentFlowId = null;
  document.getElementById('auth-pending').style.display = 'none';
  document.getElementById('auth-form').style.display = 'block';
  showMsg('已取消授权流程', true);
}

async function revokeAuth() {
  if (!confirm('确认撤销当前 Paperclip 授权？')) return;
  try {
    await api('POST', '/api/paperclip/auth/revoke');
    showMsg('已断开授权', true);
    refreshStatus();
  } catch (e) {
    showMsg('撤销失败: ' + e.message, false);
  }
}

async function loadPaperclipCompanies() {
  try {
    const companies = await api('GET', '/api/paperclip/companies');
    const tb = document.getElementById('pc-companies');
    tb.innerHTML = companies.map(c => `<tr>
      <td>${esc(c.id)}</td><td>${esc(c.name)}</td><td>${esc(c.issuePrefix || '-')}</td>
      <td><button class="btn btn-sm btn-primary" onclick="addCompanyFromPaperclip('${esc(c.id)}','${esc(c.name)}')">添加</button></td>
    </tr>`).join('');
    if (!companies.length) tb.innerHTML = '<tr><td colspan="4">无 Company</td></tr>';
  } catch (e) { showMsg('查询失败: ' + e.message, false); }
}

async function loadConfigCompanies() {
  try {
    const companies = await api('GET', '/api/config/companies');
    const tb = document.getElementById('cfg-companies');
    tb.innerHTML = companies.map(c => `<tr>
      <td>${esc(c.companyId)}</td><td>${esc(c.name || '-')}</td>
      <td><span class="badge ${c.hasFeishu ? 'badge-ok' : 'badge-no'}">${c.hasFeishu ? '已配置' : '未配置'}</span></td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="editCompany('${esc(c.companyId)}')">编辑</button>
        <button class="btn btn-sm btn-danger" onclick="deleteCompany('${esc(c.companyId)}')">删除</button>
      </td>
    </tr>`).join('');
    if (!companies.length) tb.innerHTML = '<tr><td colspan="4">未配置任何 Company</td></tr>';
  } catch (e) { showMsg(e.message, false); }
}

function addCompanyFromPaperclip(id, name) {
  document.getElementById('edit-company-id').value = id;
  document.getElementById('edit-name').value = name;
  document.getElementById('edit-feishu-appid').value = '';
  document.getElementById('edit-feishu-secret').value = '';
  document.getElementById('editor-title').textContent = '添加 Company: ' + name;
  renderApprovers([]);
  renderRouting({});
  document.getElementById('company-editor').style.display = 'block';
}

async function editCompany(id) {
  try {
    const companies = await api('GET', '/api/config/companies');
    const c = companies.find(x => x.companyId === id);
    if (!c) { showMsg('未找到', false); return; }
    document.getElementById('edit-company-id').value = c.companyId;
    document.getElementById('edit-name').value = c.name || '';
    document.getElementById('edit-feishu-appid').value = '';
    document.getElementById('edit-feishu-secret').value = '';
    document.getElementById('editor-title').textContent = '编辑 Company: ' + (c.name || c.companyId);
    renderApprovers(c.defaultApprovers || []);
    renderRouting(c.routing || {});
    document.getElementById('company-editor').style.display = 'block';
  } catch (e) { showMsg(e.message, false); }
}

async function deleteCompany(id) {
  if (!confirm(`确认删除 Company ${id}？`)) return;
  try {
    const r = await api('DELETE', '/api/config/companies/' + encodeURIComponent(id));
    if (r.restartRequired) showRestartBanner();
    showMsg('已删除', true);
    loadConfigCompanies();
  } catch (e) { showMsg(e.message, false); }
}

function hideEditor() {
  document.getElementById('company-editor').style.display = 'none';
}

let currentApprovers = [];
let currentRouting = {};

const ROUTING_TYPES = ['hire_agent', 'approve_ceo_strategy', 'request_board_approval', 'budget_override_required'];

function renderApprovers(approvers) {
  currentApprovers = approvers || [];
  const el = document.getElementById('default-approvers');
  el.innerHTML = currentApprovers.map((a, i) =>
    `<span class="approver-tag">${esc(a.name || a.openId)} <span class="remove" onclick="removeApprover(${i})">×</span></span>`
  ).join('') || '<span style="color:#999;font-size:12px">未配置默认审批人</span>';
}

function removeApprover(i) {
  currentApprovers.splice(i, 1);
  renderApprovers(currentApprovers);
}

function renderRouting(routing) {
  currentRouting = routing || {};
  const el = document.getElementById('routing-editor');
  el.innerHTML = ROUTING_TYPES.map(type => {
    const r = currentRouting[type];
    const approvers = r ? r.approvers : [];
    const tags = approvers.map((a, i) =>
      `<span class="approver-tag">${esc(a.name || a.openId)} <span class="remove" onclick="removeRoutingApprover('${type}',${i})">×</span></span>`
    ).join('');
    return `<div style="margin-bottom:12px">
      <label>${esc(type)}</label>
      <div>${tags || '<span style="color:#999;font-size:12px">使用默认审批人</span>'}</div>
      <div class="routing-row">
        <input id="route-input-${type}" placeholder="输入 openId 或从用户列表选择" style="flex:1">
        <input id="route-name-${type}" placeholder="姓名" style="width:120px">
        <button class="btn btn-sm btn-primary" onclick="addRoutingApprover('${type}')">添加</button>
      </div>
    </div>`;
  }).join('');
}

function removeRoutingApprover(type, i) {
  if (currentRouting[type]) {
    currentRouting[type].approvers.splice(i, 1);
    if (!currentRouting[type].approvers.length) delete currentRouting[type];
  }
  renderRouting(currentRouting);
}

function addRoutingApprover(type) {
  const openId = document.getElementById('route-input-' + type).value.trim();
  const name = document.getElementById('route-name-' + type).value.trim();
  if (!openId) return;
  if (!currentRouting[type]) currentRouting[type] = { approvers: [] };
  currentRouting[type].approvers.push({ openId, name: name || openId });
  renderRouting(currentRouting);
}

async function searchUsers(keyword) {
  const el = document.getElementById('user-search-results');
  if (!keyword || keyword.length < 1) { el.style.display = 'none'; return; }
  try {
    const companyId = document.getElementById('edit-company-id').value;
    const users = await api('GET', `/api/feishu/users?companyId=${encodeURIComponent(companyId)}`);
    const filtered = users.filter(u =>
      u.name.toLowerCase().includes(keyword.toLowerCase()) || u.openId.includes(keyword)
    );
    if (filtered.length) {
      el.innerHTML = filtered.slice(0, 20).map(u =>
        `<div onclick="selectUser('${esc(u.openId)}','${esc(u.name)}')">${esc(u.name)} (${esc(u.openId)})</div>`
      ).join('');
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  } catch { el.style.display = 'none'; }
}

function selectUser(openId, name) {
  if (!currentApprovers.some(a => a.openId === openId)) {
    currentApprovers.push({ openId, name });
    renderApprovers(currentApprovers);
  }
  document.getElementById('user-search-results').style.display = 'none';
  document.getElementById('approver-search').value = '';
}

async function saveCompany() {
  try {
    const companyId = document.getElementById('edit-company-id').value;
    const name = document.getElementById('edit-name').value.trim();
    const feishuAppId = document.getElementById('edit-feishu-appid').value.trim();
    const feishuSecret = document.getElementById('edit-feishu-secret').value.trim();
    const body = { companyId, name, defaultApprovers: currentApprovers, routing: currentRouting };
    if (feishuAppId && feishuSecret) body.feishu = { appId: feishuAppId, appSecret: feishuSecret };
    const r = await api('POST', '/api/config/companies', body);
    if (r.restartRequired) showRestartBanner();
    showMsg('Company 已保存', true);
    hideEditor();
    loadConfigCompanies();
  } catch (e) { showMsg(e.message, false); }
}

async function saveGlobal() {
  try {
    const bridge = {
      paperclipPublicUrl: document.getElementById('g-public-url').value.trim(),
      pollIntervalMs: Number(document.getElementById('g-poll').value) || 5000,
      reconciliationIntervalMs: Number(document.getElementById('g-recon').value) || 60000,
      adminPort: Number(document.getElementById('g-port').value) || 9090,
    };
    const r1 = await api('PUT', '/api/config/bridge', bridge);
    if (r1.restartRequired) showRestartBanner();
    const appId = document.getElementById('g-feishu-appid').value.trim();
    const appSecret = document.getElementById('g-feishu-secret').value.trim();
    if (appId && appSecret) {
      const r2 = await api('PUT', '/api/config/secrets', { defaultFeishuAppId: appId, defaultFeishuAppSecret: appSecret });
      if (r2.restartRequired) showRestartBanner();
    }
    showMsg('全局设置已保存', true);
  } catch (e) { showMsg(e.message, false); }
}

async function loadGlobal() {
  try {
    const g = await api('GET', '/api/config/bridge');
    document.getElementById('pc-url').value = g.paperclipBaseUrl || '';
    document.getElementById('g-public-url').value = g.paperclipPublicUrl || '';
    document.getElementById('g-poll').value = g.pollIntervalMs || 5000;
    document.getElementById('g-recon').value = g.reconciliationIntervalMs || 60000;
    document.getElementById('g-port').value = g.adminPort || 9090;
    const s = await api('GET', '/api/config/secrets');
    document.getElementById('g-feishu-appid').value = s.defaultFeishuAppId || '';
    document.getElementById('g-feishu-secret').placeholder = s.defaultFeishuAppSecret ? '已配置（留空不修改）' : '';
  } catch {}
}

loadGlobal();
loadConfigCompanies();
refreshStatus();
