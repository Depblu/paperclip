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
    if (approvalUrl) window.open(approvalUrl, '_blank', 'noopener,noreferrer');
    startPolling(result.suggestedPollIntervalMs || 1000);
  } catch (e) { showMsg('启动授权失败: ' + e.message, false); }
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
    if (left <= 0) { el.textContent = '已过期'; clearInterval(countdownTimer); return; }
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
    } catch {}
  }, intervalMs);
}

function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

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

function reopenApproval() { if (approvalUrl) window.open(approvalUrl, '_blank', 'noopener,noreferrer'); }

async function cancelAuth() {
  stopPolling();
  clearInterval(countdownTimer);
  if (currentFlowId) { try { await api('POST', `/api/paperclip/auth/flows/${currentFlowId}/cancel`); } catch {} }
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
  } catch (e) { showMsg('撤销失败: ' + e.message, false); }
}

async function loadPaperclipCompanies() {
  try {
    const companies = await api('GET', '/api/paperclip/companies');
    const tb = document.getElementById('pc-companies');
    tb.innerHTML = '';
    if (!companies.length) {
      tb.innerHTML = '<tr><td colspan="4">无 Company</td></tr>';
      return;
    }
    for (const c of companies) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(c.id)}</td><td>${esc(c.name)}</td><td>${esc(c.issuePrefix || '-')}</td><td></td>`;
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-primary';
      btn.textContent = '配置';
      btn.addEventListener('click', () => startWizard(c.id, c.name));
      tr.lastElementChild.appendChild(btn);
      tb.appendChild(tr);
    }
  } catch (e) { showMsg('查询失败: ' + e.message, false); }
}

async function loadConfigCompanies() {
  try {
    const companies = await api('GET', '/api/config/companies');
    const tb = document.getElementById('cfg-companies');
    tb.innerHTML = '';
    if (!companies.length) {
      tb.innerHTML = '<tr><td colspan="4">未配置任何 Company</td></tr>';
      return;
    }
    for (const c of companies) {
      const tr = document.createElement('tr');
      const bindingLabel = c.feishuBinding
        ? (c.feishuBinding.mode === 'global' ? '全局应用' : '独立应用')
        : (c.hasFeishu ? '独立应用' : '未绑定');
      const badgeCls = c.feishuBindingValid ? 'badge-ok' : (c.feishuBinding ? 'badge-warn' : 'badge-no');
      tr.innerHTML = `<td>${esc(c.companyId)}</td><td>${esc(c.name || '-')}</td>
        <td><span class="badge ${badgeCls}">${esc(bindingLabel)}</span></td>
        <td></td>`;
      const td = tr.lastElementChild;
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-sm btn-primary';
      editBtn.textContent = '编辑';
      editBtn.addEventListener('click', () => startWizardEdit(c.companyId));
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', () => deleteCompany(c.companyId));
      td.appendChild(editBtn);
      td.appendChild(document.createTextNode(' '));
      td.appendChild(delBtn);
      tb.appendChild(tr);
    }
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

let APPROVAL_TYPE_META = {};
let APPROVAL_TYPE_META_FAILED = false;
let globalFeishuConfigured = false;

async function refreshGlobalFeishuStatus() {
  try {
    const s = await api('GET', '/api/feishu/global-status');
    globalFeishuConfigured = !!s.hasDefaultFeishuApp;
  } catch {
    globalFeishuConfigured = false;
  }
}

async function loadApprovalTypeMeta() {
  try {
    APPROVAL_TYPE_META = await api('GET', '/api/approval-type-meta');
    APPROVAL_TYPE_META_FAILED = false;
  } catch {
    APPROVAL_TYPE_META = {};
    APPROVAL_TYPE_META_FAILED = true;
  }
}

const WIZARD_STEPS = ['select', 'summary', 'feishu', 'approvers', 'routing'];
const WIZARD_LABELS = ['选择 Company', '摘要', '绑定飞书', '审批人', '路由'];

let wizStep = 0;
let wizCompanyId = '';
let wizCompanyName = '';
let wizSummary = null;
let wizApprovers = [];
let wizRouting = {};
let wizFeishuVerified = false;
let wizVerificationId = null;
let wizFeishuBinding = null;

function renderWizardSteps() {
  const el = document.getElementById('wizard-steps');
  el.innerHTML = WIZARD_LABELS.map((label, i) => {
    const cls = i === wizStep ? 'active' : (i < wizStep ? 'done' : '');
    return `<div class="wizard-step ${cls}">${i < wizStep ? '✓ ' : ''}${label}</div>`;
  }).join('');
  WIZARD_STEPS.forEach((s, i) => {
    document.getElementById('wiz-step-' + s).classList.toggle('active', i === wizStep);
  });
}

function startWizard(companyId, name) {
  wizCompanyId = companyId;
  wizCompanyName = name;
  wizApprovers = [];
  wizRouting = {};
  wizFeishuVerified = false;
  wizVerificationId = null;
  wizFeishuBinding = null;
  wizSummary = null;
  wizStep = 0;
  document.getElementById('wizard-title').textContent = 'Company 配置向导';
  document.getElementById('company-wizard').style.display = 'block';
  renderWizardSteps();
  loadWizardCompanyList();
}

async function startWizardEdit(companyId) {
  try {
    const companies = await api('GET', '/api/config/companies');
    const c = companies.find(x => x.companyId === companyId);
    if (!c) { showMsg('未找到', false); return; }
    wizCompanyId = companyId;
    wizCompanyName = c.name || companyId;
    wizApprovers = c.defaultApprovers || [];
    wizRouting = c.routing || {};
    wizFeishuVerified = c.hasFeishu;
    wizVerificationId = null;
    wizFeishuBinding = c.feishuBinding || null;
    wizSummary = null;
    wizStep = 1;
    document.getElementById('wizard-title').textContent = '编辑 Company: ' + wizCompanyName;
    document.getElementById('company-wizard').style.display = 'block';
    renderWizardSteps();
    await loadWizardSummary();
    await refreshGlobalFeishuStatus();
    renderFeishuBindingUI();
  } catch (e) { showMsg(e.message, false); }
}

async function loadWizardCompanyList() {
  try {
    const companies = await api('GET', '/api/paperclip/companies');
    const tb = document.getElementById('wiz-company-list');
    tb.innerHTML = '';
    if (!companies.length) {
      tb.innerHTML = '<tr><td colspan="3">无可用 Company</td></tr>';
      return;
    }
    for (const c of companies) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(c.id)}</td><td>${esc(c.name)}</td><td></td>`;
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-primary';
      btn.textContent = '选择';
      btn.addEventListener('click', () => selectWizardCompany(c.id, c.name));
      tr.lastElementChild.appendChild(btn);
      tb.appendChild(tr);
    }
  } catch (e) { showMsg('查询失败: ' + e.message, false); }
}

async function selectWizardCompany(id, name) {
  wizCompanyId = id;
  wizCompanyName = name;
  wizStep = 1;
  renderWizardSteps();
  await loadWizardSummary();
}

function formatCents(cents) {
  if (cents == null) return '-';
  const num = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Math.abs(cents) / 100);
  return (cents < 0 ? '-US$' : 'US$') + num;
}

async function loadWizardSummary() {
  const el = document.getElementById('wiz-summary-content');
  el.innerHTML = '<span style="color:#999">加载中...</span>';
  try {
    const d = await api('GET', '/api/paperclip/companies/' + encodeURIComponent(wizCompanyId));
    wizSummary = d;
    let budgetStr = '-';
    if (d.budget) {
      const b = d.budget;
      budgetStr = b.overBudgetCents > 0
        ? `月预算 ${formatCents(b.monthlyCents)} / 已用 ${formatCents(b.spentCents)} / <span style="color:#c00">超支 ${formatCents(b.overBudgetCents)}</span>`
        : `月预算 ${formatCents(b.monthlyCents)} / 已用 ${formatCents(b.spentCents)} / 剩余 ${formatCents(b.remainingCents)}`;
    }
    el.innerHTML = `
      <div><strong>名称：</strong>${esc(d.name)}</div>
      <div><strong>ID：</strong>${esc(d.id)}</div>
      <div><strong>Issue Prefix：</strong>${esc(d.issuePrefix || '-')}</div>
      <div><strong>描述：</strong>${esc(d.description || '-')}</div>
      <div><strong>状态：</strong>${esc(d.status || '-')}</div>
      <div><strong>预算：</strong>${budgetStr}</div>
      <div><strong>新 Agent 需 Board 审批：</strong>${d.requireBoardApprovalForNewAgents ? '是' : '否'}</div>
      <div><strong>创建时间：</strong>${d.createdAt ? new Date(d.createdAt).toLocaleString() : '-'}</div>
      <div><strong>更新时间：</strong>${d.updatedAt ? new Date(d.updatedAt).toLocaleString() : '-'}</div>`;
  } catch (e) {
    el.innerHTML = `<div><strong>名称：</strong>${esc(wizCompanyName)}</div>
      <div><strong>ID：</strong>${esc(wizCompanyId)}</div>
      <div style="color:#856404;margin-top:8px">详情加载失败: ${esc(e.message)}</div>`;
  }
}

function renderFeishuBindingUI() {
  const container = document.getElementById('wiz-feishu-binding');
  if (!container) return;
  const isGlobal = wizFeishuBinding?.mode === 'global';
  const isCompany = wizFeishuBinding?.mode === 'company';
  const globalDisabled = !globalFeishuConfigured;
  const globalStatus = globalFeishuConfigured
    ? '<span style="color:#1a7a1a;font-size:12px">（全局应用已配置）</span>'
    : '<span style="color:#c00;font-size:12px">（全局应用未配置）</span>';
  container.innerHTML = `
    <div style="margin-bottom:12px">
      <label style="display:block;margin-bottom:8px;font-weight:600">飞书应用</label>
      <label class="radio-option${globalDisabled ? ' disabled' : ''}">
        <input type="radio" name="feishu-binding" value="global" ${isGlobal ? 'checked' : ''} ${globalDisabled ? 'disabled' : ''}> 使用全局飞书应用 ${globalStatus}
      </label>
      <label class="radio-option">
        <input type="radio" name="feishu-binding" value="company" ${isCompany ? 'checked' : ''}> 使用此 Company 独立飞书应用
      </label>
      <label class="radio-option">
        <input type="radio" name="feishu-binding" value="none" ${!wizFeishuBinding ? 'checked' : ''}> 未绑定飞书应用
      </label>
    </div>`;
  container.querySelectorAll('input[name="feishu-binding"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const val = container.querySelector('input[name="feishu-binding"]:checked')?.value;
      if (val === 'global') wizFeishuBinding = { mode: 'global' };
      else if (val === 'company') wizFeishuBinding = { mode: 'company' };
      else wizFeishuBinding = null;
      toggleFeishuInputs();
    });
  });
  toggleFeishuInputs();
}

function toggleFeishuInputs() {
  const inputs = document.getElementById('wiz-feishu-inputs');
  if (!inputs) return;
  if (wizFeishuBinding?.mode === 'company') {
    inputs.style.display = 'block';
  } else {
    inputs.style.display = 'none';
  }
}

async function wizardNext() {
  if (wizStep === 1) {
    await refreshGlobalFeishuStatus();
    renderFeishuBindingUI();
  }
  if (wizStep === 2) {
    if (wizFeishuBinding?.mode === 'company' && !wizVerificationId) {
      showMsg('请先验证飞书应用后再继续', false);
      return;
    }
    loadApproverSuggestions();
  }
  if (wizStep === 3) {
    renderWizRouting();
  }
  if (wizStep < WIZARD_STEPS.length - 1) {
    wizStep++;
    renderWizardSteps();
  }
}

function wizardPrev() {
  if (wizStep > 0) { wizStep--; renderWizardSteps(); }
}

async function wizardSkipTo(stepName) {
  const idx = WIZARD_STEPS.indexOf(stepName);
  if (idx >= 0) {
    if (idx === 2) { await refreshGlobalFeishuStatus(); renderFeishuBindingUI(); }
    if (idx === 3) {
      if (wizFeishuBinding?.mode === 'company' && !wizVerificationId) {
        showMsg('请先验证飞书应用后再继续', false);
        return;
      }
      loadApproverSuggestions();
    }
    if (idx === 4) renderWizRouting();
    wizStep = idx;
    renderWizardSteps();
  }
}

async function hideWizard() {
  if (wizVerificationId) {
    try { await api('DELETE', '/api/feishu/verifications/' + encodeURIComponent(wizVerificationId)); } catch {}
    wizVerificationId = null;
  }
  document.getElementById('company-wizard').style.display = 'none';
}

async function verifyFeishuApp() {
  const appId = document.getElementById('wiz-feishu-appid').value.trim();
  const appSecret = document.getElementById('wiz-feishu-secret').value.trim();
  const el = document.getElementById('wiz-verify-result');
  if (!appId || !appSecret) {
    el.innerHTML = '<div class="verify-result verify-fail">请输入 App ID 和 App Secret</div>';
    return;
  }
  if (wizVerificationId) {
    try { await api('DELETE', '/api/feishu/verifications/' + encodeURIComponent(wizVerificationId)); } catch {}
    wizVerificationId = null;
  }
  el.innerHTML = '<div class="verify-result" style="background:#f0f2f5">验证中...</div>';
  try {
    const r = await api('POST', '/api/feishu/verify', { appId, appSecret });
    if (r.valid) {
      wizFeishuVerified = true;
      wizVerificationId = r.verificationId || null;
      el.innerHTML = `<div class="verify-result verify-ok">
        <div>✓ 验证通过</div>
        <div>应用名称：${esc(r.appName || '-')}</div>
        <div>Bot：${esc(r.botName || r.botId || '-')}</div>
        <div>通讯录权限：${r.permissions?.contacts ? '<span style="color:#1a7a1a">已授权</span>' : '<span style="color:#856404">未授权（用户列表不可用）</span>'}</div>
      </div>`;
    } else {
      wizFeishuVerified = false;
      wizVerificationId = null;
      el.innerHTML = `<div class="verify-result verify-fail">✗ 验证失败：${esc(r.error || '未知错误')}</div>`;
    }
  } catch (e) {
    wizFeishuVerified = false;
    wizVerificationId = null;
    el.innerHTML = `<div class="verify-result verify-fail">验证请求失败：${esc(e.message)}</div>`;
  }
}

async function loadApproverSuggestions() {
  const el = document.getElementById('wiz-suggestions');
  const search = document.getElementById('wiz-approver-search');
  const mode = wizFeishuBinding?.mode;

  let url = '/api/approver-suggestions?companyId=' + encodeURIComponent(wizCompanyId);
  let blockedMsg = null;
  if (!mode) {
    blockedMsg = '未绑定飞书应用，无法加载推荐审批人。可返回上一步绑定飞书，或直接下一步跳过。';
  } else if (mode === 'company' && !wizVerificationId) {
    blockedMsg = '请先在上一步验证飞书应用，才能加载推荐审批人。';
  } else if (mode === 'global') {
    url += '&mode=global';
  } else {
    url += '&verificationId=' + encodeURIComponent(wizVerificationId);
  }

  if (blockedMsg) {
    el.innerHTML = `<div style="padding:12px;color:#856404">${esc(blockedMsg)}</div>`;
    if (search) { search.disabled = true; search.placeholder = '需先绑定并验证飞书应用'; search.value = ''; }
    const r = document.getElementById('wiz-user-results');
    if (r) { r.style.display = 'none'; r.innerHTML = ''; }
    renderWizApprovers();
    return;
  }
  if (search) { search.disabled = false; search.placeholder = '输入姓名或 Open ID...'; }

  el.innerHTML = '<div style="padding:12px;color:#999">加载推荐...</div>';
  try {
    const data = await api('GET', url);
    const suggestions = data.suggestions || [];

    let statusHtml = '';
    if (data.feishuDirectoryComplete === false) {
      const warn = (data.feishuDirectoryWarnings || []).join('；');
      statusHtml += `<div style="padding:8px 12px;color:#856404;background:#fff8e1;border-radius:4px;margin-bottom:8px">
        飞书组织目录不完整，以下为部分结果${warn ? '：' + esc(warn) : ''}</div>`;
    }
    if (!data.paperclipDirectoryAvailable) {
      statusHtml += `<div style="padding:8px 12px;color:#856404;background:#fff8e1;border-radius:4px;margin-bottom:8px">
        Paperclip 用户目录不可用：${esc(data.paperclipDirectoryError || '未知错误')}，无法进行用户匹配</div>`;
    }

    if (!suggestions.length) {
      el.innerHTML = statusHtml + '<div style="padding:12px;color:#999">无推荐用户（飞书应用未配置或通讯录为空）</div>';
      return;
    }

    const listHtml = suggestions.slice(0, 30).map((s, idx) => {
      const added = wizApprovers.some(a => a.openId === s.openId);
      let matchInfo = '';
      if (s.matchedPaperclipUser) {
        if (s.matchConfidence === 'high') {
          matchInfo = `<span class="badge badge-ok" style="margin-left:6px">Paperclip: ${esc(s.matchedPaperclipUser.name)} (邮箱匹配)</span>`;
        } else {
          matchInfo = `<span class="badge" style="margin-left:6px;background:#fff3cd;color:#856404">Paperclip: ${esc(s.matchedPaperclipUser.name)} (姓名匹配，低置信度)</span>`;
        }
      }
      return `<div class="suggestion-item" data-idx="${idx}">
        <span>${esc(s.name)}${matchInfo}</span>
        ${added ? '<span style="color:#1a7a1a;font-size:12px">已添加</span>' : '<button class="btn btn-sm btn-primary add-suggestion-btn">设为审批人</button>'}
      </div>`;
    }).join('');

    el.innerHTML = statusHtml + listHtml;

    el.querySelectorAll('.add-suggestion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.suggestion-item');
        const idx = parseInt(item.dataset.idx, 10);
        const s = suggestions[idx];
        if (s && !wizApprovers.some(a => a.openId === s.openId)) {
          wizApprovers.push({ openId: s.openId, name: s.name });
        }
        renderWizApprovers();
        loadApproverSuggestions();
      });
    });
  } catch (e) {
    el.innerHTML = `<div style="padding:12px;color:#856404">推荐加载失败: ${esc(e.message)}</div>`;
  }
  renderWizApprovers();
}

function addSuggestion(openId, name) {
  if (!wizApprovers.some(a => a.openId === openId)) {
    wizApprovers.push({ openId, name });
  }
  renderWizApprovers();
  loadApproverSuggestions();
}

function renderWizApprovers() {
  const el = document.getElementById('wiz-selected-approvers');
  el.innerHTML = '';
  if (!wizApprovers.length) {
    el.innerHTML = '<span style="color:#999;font-size:12px">未选择审批人</span>';
    return;
  }
  wizApprovers.forEach((a, i) => {
    const tag = document.createElement('span');
    tag.className = 'approver-tag';
    tag.textContent = a.name || a.openId;
    const remove = document.createElement('span');
    remove.className = 'remove';
    remove.textContent = '×';
    remove.addEventListener('click', () => { removeWizApprover(i); });
    tag.appendChild(document.createTextNode(' '));
    tag.appendChild(remove);
    el.appendChild(tag);
  });
}

function removeWizApprover(i) {
  wizApprovers.splice(i, 1);
  renderWizApprovers();
}

async function wizSearchUsers(keyword) {
  const el = document.getElementById('wiz-user-results');
  if (!keyword || keyword.length < 1) { el.style.display = 'none'; return; }
  const mode = wizFeishuBinding?.mode;
  if (!mode || (mode === 'company' && !wizVerificationId)) { el.style.display = 'none'; return; }
  try {
    let url = '/api/feishu/users?companyId=' + encodeURIComponent(wizCompanyId);
    if (mode === 'global') url += '&mode=global';
    else url += '&verificationId=' + encodeURIComponent(wizVerificationId);
    const users = await api('GET', url);
    const filtered = users.filter(u => u.name.toLowerCase().includes(keyword.toLowerCase()) || u.openId.includes(keyword));
    if (filtered.length) {
      el.innerHTML = '';
      filtered.slice(0, 20).forEach(u => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:13px';
        div.textContent = `${u.name} (${u.openId})`;
        div.addEventListener('click', () => {
          addSuggestion(u.openId, u.name);
          el.style.display = 'none';
        });
        el.appendChild(div);
      });
      el.style.display = 'block';
    } else { el.style.display = 'none'; }
  } catch { el.style.display = 'none'; }
}

function renderWizRouting() {
  const el = document.getElementById('wiz-routing-editor');
  if (APPROVAL_TYPE_META_FAILED) {
    el.innerHTML = '<div style="padding:12px;color:#c00">审批类型元数据加载失败，无法配置路由</div>';
    return;
  }
  const types = Object.keys(APPROVAL_TYPE_META);
  el.innerHTML = types.map(type => {
    const meta = APPROVAL_TYPE_META[type];
    const r = wizRouting[type];
    const approvers = r ? r.approvers : [];
    const hintColor = meta.canFeishu ? '#1a7a1a' : '#856404';
    return `<div style="margin-bottom:14px;padding:10px;border:1px solid #eee;border-radius:6px" data-type="${esc(type)}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div><strong>${esc(meta.label)}</strong> <span style="font-size:11px;color:#999">(${esc(type)})</span></div>
        <button class="btn btn-sm test-card-btn" title="向该类型的审批人发送一张测试卡片，验证飞书连通性">测试</button>
      </div>
      <div class="type-hint" style="color:${hintColor}">${esc(meta.hint)}</div>
      <div class="routing-tags" style="margin-top:6px"></div>
      <div class="routing-row" style="margin-top:6px">
        <input class="wiz-route-input" placeholder="openId 或从用户列表选择" style="flex:1;margin-bottom:0">
        <input class="wiz-route-name" placeholder="姓名" style="width:100px;margin-bottom:0">
        <button class="btn btn-sm btn-primary add-routing-btn">添加</button>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('[data-type]').forEach(container => {
    const type = container.dataset.type;
    renderRoutingTags(container, type);
    container.querySelector('.add-routing-btn').addEventListener('click', () => {
      const openId = container.querySelector('.wiz-route-input').value.trim();
      const name = container.querySelector('.wiz-route-name').value.trim();
      if (!openId) return;
      if (!wizRouting[type]) wizRouting[type] = { approvers: [] };
      wizRouting[type].approvers.push({ openId, name: name || openId });
      renderRoutingTags(container, type);
      container.querySelector('.wiz-route-input').value = '';
      container.querySelector('.wiz-route-name').value = '';
    });
    const testBtn = container.querySelector('.test-card-btn');
    if (testBtn) testBtn.addEventListener('click', () => wizTestCard(type, testBtn));
  });
}

function renderRoutingTags(container, type) {
  const tagsEl = container.querySelector('.routing-tags');
  tagsEl.innerHTML = '';
  const r = wizRouting[type];
  const approvers = r ? r.approvers : [];
  if (!approvers.length) {
    tagsEl.innerHTML = '<span style="color:#999;font-size:12px">使用默认审批人</span>';
    return;
  }
  approvers.forEach((a, i) => {
    const tag = document.createElement('span');
    tag.className = 'approver-tag';
    tag.textContent = a.name || a.openId;
    const remove = document.createElement('span');
    remove.className = 'remove';
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      wizRouting[type].approvers.splice(i, 1);
      if (!wizRouting[type].approvers.length) delete wizRouting[type];
      renderRoutingTags(container, type);
    });
    tag.appendChild(document.createTextNode(' '));
    tag.appendChild(remove);
    tagsEl.appendChild(tag);
  });
}

async function wizTestCard(type, btn) {
  const routed = wizRouting[type] && wizRouting[type].approvers;
  const list = (routed && routed.length) ? routed : wizApprovers;
  if (!list.length) { showMsg('该类型未配置审批人，无法测试', false); return; }
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '发送中…';
  try {
    const r = await api('POST', '/api/feishu/test-card', {
      companyId: wizCompanyId,
      type,
      approvers: list,
      verificationId: wizVerificationId || undefined,
      mode: wizFeishuBinding?.mode,
    });
    if (r.failed && r.failed.length) {
      const detail = r.failed.map(f => `${f.name || f.openId}: ${f.error}`).join('; ');
      showMsg(`已发送 ${r.sent.length} 张，失败 ${r.failed.length} 张 — ${detail}`, false);
    } else {
      showMsg(`测试卡片已发送 ${r.sent.length} 张，请到飞书确认收到`, true);
    }
  } catch (e) { showMsg('测试发送失败: ' + e.message, false); }
  finally { btn.disabled = false; btn.textContent = orig; }
}

function applyDefaultToAll() {
  if (!wizApprovers.length) { showMsg('请先设置默认审批人', false); return; }
  for (const type of Object.keys(APPROVAL_TYPE_META)) {
    if (!wizRouting[type]) {
      wizRouting[type] = { approvers: [...wizApprovers] };
    }
  }
  renderWizRouting();
  showMsg('已将默认审批人应用为所有类型的显式覆盖', true);
}

async function wizardSave() {
  try {
    const body = { companyId: wizCompanyId, name: wizCompanyName, defaultApprovers: wizApprovers, routing: wizRouting };
    if (wizFeishuBinding) body.feishuBinding = wizFeishuBinding;
    if (wizFeishuBinding?.mode === 'company' && wizVerificationId) {
      body.feishuVerificationId = wizVerificationId;
    }
    const r = await api('POST', '/api/config/companies', body);
    if (r.restartRequired) showRestartBanner();
    showMsg('Company 已保存', true);
    hideWizard();
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
    globalFeishuConfigured = !!s.hasDefaultFeishuApp;
    const appidInput = document.getElementById('g-feishu-appid');
    appidInput.value = '';
    appidInput.placeholder = s.hasDefaultFeishuApp
      ? `已配置${s.defaultFeishuAppIdDisplay ? '（' + s.defaultFeishuAppIdDisplay + '）' : ''}，留空不修改`
      : 'cli_...';
    document.getElementById('g-feishu-secret').placeholder = s.hasDefaultFeishuApp ? '已配置（留空不修改）' : '';
  } catch {}
}

loadApprovalTypeMeta();
loadGlobal();
loadConfigCompanies();
refreshStatus();
