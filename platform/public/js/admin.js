/* 运营与监管台 · 页面逻辑（依赖 assets/app.js 提供的工具函数） */
(() => {
  'use strict';

  const state = {
    loading: true,
    error: '',
    asOf: '',
    ov: null,
    ledger: [],
    ledgerTotal: 0,
    alerts: [],
    filter: 'all',
    audit: [],
    geos: [],
    orders: [],
    applications: [],
    staff: [],
    roles: [],
    auditlog: [],
    customers: [],
    settlement: { items: [], summary: null },
    roleMatrix: [],
    permissionCatalog: [],
    consumerProfiles: [],
    farmerProfiles: [],
    approvals: [],
    tickets: [],
    recStats: null,
    consumerSnapshot: null,
    farmerSnapshot: null,
    llm: { enabled: false, configured: false, effective: false, model: '', baseUrl: '', temperature: 0.2, keyMask: '' },
    settingsLoaded: false,
    formDirty: false,
    tamper: false,
  };

  const CAT_COLORS = ['var(--green-600)', 'var(--green-500)', 'var(--amber-600)', 'var(--green-700)'];

  const $id = (id) => document.getElementById(id);

  /* ---------------- 小工具 ---------------- */

  function moneyShort(v) {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 10000) return `¥${fmt.int((n / 10000).toFixed(1))}万`;
    return fmt.money(n);
  }

  function levelBadge(level) {
    const d = (typeof DICT !== 'undefined' && DICT.level && DICT.level[level]) || ['提示', 'neutral'];
    const cls = d[1] === 'red' ? 'badge--red' : d[1] === 'amber' ? 'badge--amber' : '';
    return `<span class="badge ${cls} badge--dot">${esc(d[0])}</span>`;
  }

  function recordLabel(type) {
    if (typeof DICT !== 'undefined' && DICT.record && DICT.record[type]) return DICT.record[type][0];
    return type || '记录';
  }

  function skeletonRow(cols, rows = 5) {
    return Array.from({ length: rows }).map(() => `<tr>${Array.from({ length: cols }).map(() => '<td><div class="skeleton skeleton--text" style="width:70%"></div></td>').join('')}</tr>`).join('');
  }

  function hydrateIcons(root = document) {
    $$('[data-icon]', root).forEach((n) => {
      if (!n.dataset.iconDone) {
        n.innerHTML = icon(n.dataset.icon);
        n.dataset.iconDone = '1';
      }
    });
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    initNav('admin');
    hydrateIcons();
    applyPermissions();
    bindEvents();
    window.addEventListener('resize', debounce(() => { renderTrend(); renderCategory(); }, 200));
  }

  function hasPerm(perm) {
    return !!(window.Auth && Auth.hasPermission && Auth.hasPermission(perm));
  }

  function applyPermissions() {
    const sections = [
      ['sec-kpi', 'admin.overview'], ['sec-trend', 'admin.overview'], ['sec-mix', 'admin.overview'],
      ['sec-alert', 'alert.resolve'], ['sec-apps', 'farmer.review'], ['sec-audit', 'product.review'],
      ['sec-ledger', 'ledger.view'], ['sec-geo', 'geos.view'], ['sec-settings', 'settings.llm'],
      ['sec-orders', 'order.view'],
    ];
    for (const [id, perm] of sections) {
      const head = document.getElementById(id);
      const section = head ? head.closest('section') : null;
      if (section && !hasPerm(perm)) section.hidden = true;
    }
    const tamper = document.getElementById('tamper-bar');
    if (tamper && !hasPerm('demo.tamper')) tamper.hidden = true;
    const settingsLink = document.querySelector('.admin-links a[href="#sec-settings"]');
    if (settingsLink && !hasPerm('settings.llm')) settingsLink.hidden = true;
    document.querySelectorAll('.admin-links a[data-perm]').forEach((a) => {
      if (!hasPerm(a.dataset.perm)) a.hidden = true;
    });
  }

  /* ---------------- 后台左侧菜单 / 独立子页 ---------------- */
  const ADMIN_VIEWS = [
    { key: 'overview', label: '总览', icon: 'chart', group: '概览', perm: 'admin.overview', sections: ['sec-kpi', 'sec-trend', 'sec-mix'], load: loadOverview },
    { key: 'orders', label: '订单', icon: 'receipt', group: '经营', perm: 'order.view', sections: ['sec-orders'], load: loadOrders },
    { key: 'customers', label: '客服 360', icon: 'chat', group: '经营', perm: 'cs.view', sections: ['sec-customers'], load: loadCustomers },
    { key: 'tickets', label: '客服工单', icon: 'chat', group: '经营', perm: 'cs.view', sections: ['sec-tickets'], load: loadTickets },
    { key: 'consumer-profiles', label: '消费者画像', icon: 'users', group: '经营', perm: 'cs.view', sections: ['sec-consumer-profiles'], load: loadConsumerProfiles },
    { key: 'farmer-profiles', label: '农户画像', icon: 'sprout', group: '经营', perm: 'farmer.review', sections: ['sec-farmer-profiles'], load: loadFarmerProfiles },
    { key: 'approvals', label: '审批历史', icon: 'clipboard', group: '经营', perm: 'farmer.review', sections: ['sec-approvals'], load: loadApprovals },
    { key: 'products', label: '商品审核', icon: 'box', group: '经营', perm: 'product.review', sections: ['sec-audit'], load: loadProducts },
    { key: 'farmers', label: '农户审核', icon: 'users', group: '经营', perm: 'farmer.review', sections: ['sec-apps'], load: loadFarmers },
    { key: 'alerts', label: '预警', icon: 'bell', group: '风险', perm: 'alert.resolve', sections: ['sec-alert'], load: loadAlerts },
    { key: 'ledger', label: '链账本', icon: 'database', group: '风险', perm: 'ledger.view', sections: ['sec-ledger'], load: loadLedger },
    { key: 'geos', label: '地标', icon: 'pin', group: '风险', perm: 'geos.view', sections: ['sec-geo'], load: loadGeos },
    { key: 'settlement', label: '分账与对账', icon: 'coins', group: '财务', perm: 'settlement.view', sections: ['sec-settlement'], load: loadSettlement },
    { key: 'staff', label: '账号与角色', icon: 'shield', group: '系统', perm: 'staff.manage', sections: ['sec-staff'], load: loadStaff },
    { key: 'roles', label: '角色权限', icon: 'lock', group: '系统', perm: 'role.manage', sections: ['sec-roles'], load: loadRoles },
    { key: 'auditlog', label: '审计日志', icon: 'file', group: '系统', perm: 'audit.view', sections: ['sec-auditlog'], load: loadAuditLog },
    { key: 'settings', label: '大模型设置', icon: 'settings', group: '系统', perm: 'settings.llm', sections: ['sec-settings'], load: loadSettings },
  ];
  let currentView = 'overview';

  function allowedViews() {
    return ADMIN_VIEWS.filter((v) => hasPerm(v.perm));
  }

  function setView(key, push) {
    const view = ADMIN_VIEWS.find((v) => v.key === key && hasPerm(v.perm)) || allowedViews()[0];
    if (!view) return;
    currentView = view.key;
    const all = new Set(ADMIN_VIEWS.flatMap((v) => v.sections));
    for (const id of all) {
      const head = document.getElementById(id);
      const section = head ? head.closest('section') : null;
      if (section) section.hidden = !view.sections.includes(id);
    }
    document.querySelectorAll('[data-admin-view]').forEach((btn) => {
      btn.setAttribute('aria-current', String(btn.dataset.adminView === view.key));
    });
    updateAdminHead(view);
    const hash = '#/' + view.key;
    if (push && location.hash !== hash) history.pushState(null, '', hash);
    else if (!push && location.hash !== hash) history.replaceState(null, '', hash);
    loadView();
  }

  async function loadView() {
    const view = ADMIN_VIEWS.find((v) => v.key === currentView) || allowedViews()[0];
    if (!view || !hasPerm(view.perm)) return;
    state.loading = true;
    state.error = '';
    renderAll();
    try {
      await view.load();
      state.asOf = new Date().toISOString();
    } catch (err) {
      state.error = (err && err.message) || '数据加载失败';
      toast(state.error, 'error');
    } finally {
      state.loading = false;
      renderAll();
    }
  }

  function updateAdminHead(view) {
    const me = window.Auth && Auth.getUser ? Auth.getUser() : null;
    const role = me && me.staffRole;
    const roleTitle = {
      super_admin: '运营与监管台', auditor: '审核工作台', qa: '质检与溯源',
      cs: '客服工作台', finance: '财务工作台', origin_ops: '产地运营', sys_admin: '系统管理',
    }[role] || '运营与监管台';
    const desc = {
      overview: role === 'cs' ? '客户订单、售后与客户概览。' : role === 'finance' ? '成交、分账与对账口径。' : '盯住成交、预警与链账本，把每一批货的去向留在证据里。',
      orders: '全部订单与售后状态；按时间倒序。',
      customers: '客户订单、消费与售后概览；手机号已脱敏。',
      products: '缺材料的商品不能上架，通过后自动进入商城。',
      farmers: '农户入驻申请；通过后生成农户编号并激活账号。',
      alerts: '按等级处置风险预警，处置说明会写入审计。',
      ledger: '哈希链按 prevHash 串联；可查看篡改演示。',
      geos: '已登记的农产品地理标志与授权额度。',
      settlement: '按成交额 3% 演示平台服务费；仅财务角色可看。',
      staff: '员工角色与状态；权限由服务端校验。',
      roles: '角色定义与权限点；可编辑角色权限，员工在账号与角色中分配。',
      auditlog: '敏感操作按时间倒序；哈希链可校验。',
      settings: '兼容 OpenAI 接口；Key 加密存储，只回显掩码。',
      'consumer-profiles': '规则画像：只统计有 userId 的订单；未授权不生成偏好标签。',
      'farmer-profiles': '规则画像：商品、批次、记录、订单、预警实时计算。',
      approvals: '农户入驻与商品审核的已处理记录。',
      tickets: '消费者提交的售后/咨询工单；处理结果会通知用户。',
    }[view.key] || '';
    const h1 = document.querySelector('.admin-head h1');
    const p = document.querySelector('.admin-head__title > p.body-6');
    const eyebrow = document.querySelector('.admin-head .eyebrow');
    if (h1) h1.textContent = view.key === 'overview' ? roleTitle : view.label;
    if (p && desc) p.textContent = desc;
    if (eyebrow) eyebrow.textContent = `${roleTitle} · ${view.group}`;
    const llm = document.getElementById('llm-state');
    if (llm) llm.hidden = !hasPerm('settings.llm');
  }

  function initAdminShell() {
    document.body.classList.add('page-admin');
    if (!document.querySelector('.vf-rail')) {
      const views = allowedViews();
      const groupOrder = ['概览', '经营', '风险', '财务', '系统'];
      const groups = groupOrder.map((name) => {
        const items = views.filter((v) => v.group === name);
        if (!items.length) return '';
        return `<p class="vf-rail__label">${name}</p>` + items.map((v) => `
          <button class="vf-rail__item" type="button" data-admin-view="${v.key}">
            ${icon(v.icon)}<span>${v.label}</span>
          </button>`).join('');
      }).join('');
      const rail = document.createElement('aside');
      rail.className = 'vf-rail';
      rail.setAttribute('aria-label', '后台导航');
      rail.innerHTML = `
        <a class="vf-rail__brand" href="/" aria-label="返回田源可信首页">
          <span class="vf-rail__mark">${icon('leaf')}</span>
          <span class="vf-rail__word"><span class="vf-rail__name">田源可信</span><span class="vf-rail__sub">Store Admin</span></span>
        </a>
        <nav class="vf-rail__nav">${groups}</nav>
        <div class="vf-rail__foot">
          <a href="/">${icon('home')}<span>返回首页</span></a>
          <button type="button" id="vf-collapse">${icon('chevronRight')}<span>收起菜单</span></button>
          <a class="vf-rail__credit" href="https://vibefather.ai/t/e-commerce-admin-dashboard" target="_blank" rel="noopener">Built with a VibeFather template</a>
        </div>
        <button class="vf-rail__collapse" type="button" id="vf-collapse-rail" aria-label="收起菜单">${icon('chevronRight')}</button>`;
      document.body.insertBefore(rail, document.body.firstChild);
      rail.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-admin-view]');
        if (btn) { setView(btn.dataset.adminView, true); return; }
        if (e.target.closest('#vf-collapse') || e.target.closest('#vf-collapse-rail')) {
          document.body.classList.toggle('vf-collapsed');
          try { localStorage.setItem('ty_admin_rail', document.body.classList.contains('vf-collapsed') ? '1' : '0'); } catch (err) { /* ignore */ }
        }
      });
      try { if (localStorage.getItem('ty_admin_rail') === '1') document.body.classList.add('vf-collapsed'); } catch (e) { /* ignore */ }
    }
    const me = window.Auth && Auth.getUser ? Auth.getUser() : null;
    if (me && me.staffRole === 'origin_ops' && me.scope) {
      const head = document.querySelector('.admin-head');
      if (head && !document.querySelector('.vf-scope-note')) {
        const note = document.createElement('p');
        note.className = 'vf-scope-note';
        note.textContent = `数据范围：${me.scope} · 总览、商品、农户、订单均按产地范围计算。`;
        head.insertAdjacentElement('afterend', note);
      }
    }
    window.addEventListener('hashchange', () => {
      const m = /^#\/?(.+)$/.exec(location.hash);
      if (m) setView(m[1], false);
    });
    const m = /^#\/?(.+)$/.exec(location.hash);
    const staffRole = window.Auth && Auth.getUser && Auth.getUser() ? Auth.getUser().staffRole : '';
    const landing = staffRole === 'cs' ? 'customers' : staffRole === 'finance' ? 'settlement' : 'overview';
    setView(m ? m[1] : landing, false);
  }

  function bindEvents() {
    $id('refresh-btn').addEventListener('click', () => load());

    $id('alert-filter').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      state.filter = btn.dataset.filter;
      renderAlerts();
    });

    $id('alert-list').addEventListener('click', (e) => {
      const resolve = e.target.closest('[data-resolve]');
      if (resolve) { openResolve(resolve.dataset.resolve); return; }
      if (e.target.closest('[data-reset-filter]')) { state.filter = 'all'; renderAlerts(); }
    });

    $id('audit-list').addEventListener('click', (e) => {
      const ok = e.target.closest('[data-approve]');
      if (ok) {
        const p = state.audit.find((x) => x.id === ok.dataset.approve);
        if (p) reviewProduct(p, 'approve', '', ok);
        return;
      }
      const no = e.target.closest('[data-reject]');
      if (no) openReject(no.dataset.reject);
    });

    $id('tamper-bar').addEventListener('click', (e) => {
      const sw = e.target.closest('[data-tamper]');
      if (!sw) return;
      toggleTamper(sw.getAttribute('aria-checked') !== 'true');
    });

    $id('ledger-body').addEventListener('click', (e) => {
      const copy = e.target.closest('[data-copy]');
      if (copy) copyText(copy.dataset.copy);
    });

    $id('llm-form').addEventListener('submit', saveSettings);
    $id('llm-form').addEventListener('input', (e) => {
      state.formDirty = true;
      if (e.target.classList) e.target.classList.remove('input--error');
    });
    $id('llm-enabled').addEventListener('click', () => {
      const sw = $id('llm-enabled');
      sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true'));
      state.formDirty = true;
    });
    $id('test-llm').addEventListener('click', testLLM);
    $id('page-error').addEventListener('click', (e) => {
      if (e.target.closest('[data-retry]')) load();
    });

    const apps = $id('apps-list');
    if (apps) {
      apps.addEventListener('click', (e) => {
        const ok = e.target.closest('[data-app-approve]');
        if (ok) { reviewApplication(ok.dataset.appApprove, 'approve', '', ok); return; }
        const no = e.target.closest('[data-app-reject]');
        if (no) openApplicationReject(no.dataset.appReject);
      });
    }
    const staffBody = $id('staff-body');
    if (staffBody) {
      staffBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-staff-save]');
        if (btn) saveStaff(btn.dataset.staffSave, btn);
      });
    }
    const auditRefresh = $id('auditlog-refresh');
    if (auditRefresh) auditRefresh.addEventListener('click', () => { if (hasPerm('audit.view')) loadAuditLog().then(() => { state.loading = false; renderAll(); }); });
    const snapConsumer = $id('consumer-profile-snapshot');
    if (snapConsumer) snapConsumer.addEventListener('click', () => snapshotProfiles('consumers', snapConsumer));
    const snapFarmer = $id('farmer-profile-snapshot');
    if (snapFarmer) snapFarmer.addEventListener('click', () => snapshotProfiles('farmers', snapFarmer));
  }

  async function snapshotProfiles(kind, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }
    try {
      const res = await fetch('/api/admin/profiles/snapshot', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d.error && d.error.message) || '生成失败');
      toast(d.message || '快照已生成');
      if (kind === 'consumers') await loadConsumerProfiles(); else await loadFarmerProfiles();
      renderAll();
    } catch (e) { toast(e.message || '生成失败', 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '生成快照'; } }
  }

  /* ---------------- 取数 ---------------- */

  async function loadOverview() {
    const [ov, meta] = await Promise.all([
      api('/api/admin/overview?slim=1'),
      api('/api/meta'),
    ]);
    applyOverview(ov);
    const demo = meta && meta.demo && meta.demo.tamper;
    state.tamper = !!(demo && demo.batchId);
  }

  async function loadOrders() {
    const res = await api('/api/admin/orders');
    state.orders = (res && res.items) || [];
    state.ov = state.ov || {};
  }

  async function loadProducts() {
    const res = await api('/api/admin/products');
    state.audit = (res && res.items) || [];
    state.ov = state.ov || {};
  }

  async function loadFarmers() {
    const res = await api('/api/admin/applications');
    state.applications = (res && res.items) || [];
    state.ov = state.ov || {};
  }

  async function loadAlerts() {
    const res = await api('/api/admin/alerts');
    state.alerts = (res && res.items) || [];
    state.ov = state.ov || {};
  }

  async function loadLedger() {
    const [res, meta] = await Promise.all([
      api('/api/admin/ledger?limit=50'),
      api('/api/meta'),
    ]);
    state.ledger = (res && res.items) || [];
    state.ledgerTotal = (res && res.total) || 0;
    const demo = meta && meta.demo && meta.demo.tamper;
    state.tamper = !!(demo && demo.batchId);
    state.ov = state.ov || {};
  }

  async function loadGeos() {
    const res = await api('/api/admin/geos');
    state.geos = (res && res.items) || [];
    state.ov = state.ov || {};
  }

  async function loadStaff() {
    const res = await api('/api/admin/staff');
    state.staff = (res && res.items) || [];
    state.roles = (res && res.roles) || [];
    state.ov = state.ov || {};
  }

  async function loadAuditLog() {
    const res = await api('/api/admin/audit?limit=100');
    state.auditlog = (res && res.items) || [];
    state.ov = state.ov || {};
  }

  async function loadCustomers() {
    const res = await api('/api/admin/customers');
    state.customers = (res && res.items) || [];
    state.ov = state.ov || {};
  }

  async function loadSettlement() {
    const res = await api('/api/admin/settlement');
    state.settlement = { items: (res && res.items) || [], summary: (res && res.summary) || null };
    state.ov = state.ov || {};
  }

  async function loadRoles() {
    const res = await api('/api/admin/roles');
    state.roleMatrix = (res && res.roles) || [];
    state.permissionCatalog = (res && res.permissions) || [];
    state.ov = state.ov || {};
  }

  async function loadConsumerProfiles() {
    const [res, stats, snap] = await Promise.all([
      api('/api/admin/profiles/consumers'),
      api('/api/admin/recommendations/stats'),
      api('/api/admin/profiles/snapshot?kind=consumers'),
    ]);
    state.consumerProfiles = (res && res.items) || [];
    state.recStats = stats || null;
    state.consumerSnapshot = (snap && snap.snapshot) || null;
    state.ov = state.ov || {};
  }

  async function loadFarmerProfiles() {
    const [res, snap] = await Promise.all([
      api('/api/admin/profiles/farmers'),
      api('/api/admin/profiles/snapshot?kind=farmers'),
    ]);
    state.farmerProfiles = (res && res.items) || [];
    state.farmerSnapshot = (snap && snap.snapshot) || null;
    state.ov = state.ov || {};
  }

  async function loadApprovals() {
    const res = await api('/api/admin/approvals');
    state.approvals = (res && res.items) || [];
    state.ov = state.ov || {};
  }

  async function loadTickets() {
    const res = await api('/api/support/tickets');
    state.tickets = (res && res.items) || [];
    state.ov = state.ov || {};
  }

  async function loadSettings() {
    const res = await api('/api/settings');
    applySettings(res);
    state.ov = state.ov || {};
  }

  async function load() { return loadView(); }

  async function silentRefresh() { return loadView(); }

  function applyOverview(ov) {
    state.ov = ov;
    state.alerts = ((ov && ov.alerts) || []).slice();
    state.audit = ((ov && ov.audit) || []).slice();
    state.geos = (ov && ov.geos) || [];
    state.orders = (ov && ov.recentOrders) || [];
    if (!state.settingsLoaded && ov && ov.llm) {
      state.llm.effective = !!ov.llm.enabled;
      if (!state.llm.model) state.llm.model = ov.llm.model || '';
    }
  }

  function applySettings(res) {
    const l = (res && res.llm) || {};
    state.llm = {
      enabled: !!l.enabled,
      configured: !!l.configured,
      effective: !!(l.enabled && l.configured),
      keyMask: l.keyMask || '',
      model: l.model || '',
      baseUrl: l.baseUrl || '',
      temperature: typeof l.temperature === 'number' ? l.temperature : 0.2,
    };
    if (!state.formDirty) fillSettingsForm();
  }

  /* ---------------- 渲染入口 ---------------- */

  function renderAll() {
    renderHeader();
    renderKpis();
    renderTrend();
    renderCategory();
    renderRegion();
    renderAlerts();
    renderAudit();
    renderLedger();
    renderGeos();
    renderOrders();
    renderApplications();
    renderStaff();
    renderAuditLog();
    renderCustomers();
    renderSettlement();
    renderRoles();
    renderConsumerProfiles();
    renderFarmerProfiles();
    renderApprovals();
    renderTickets();
    renderRecStats();
    renderSettingsStatus();
    hydrateIcons();
  }

  function renderHeader() {
    const btn = $id('refresh-btn');
    btn.disabled = state.loading;
    $id('refresh-label').textContent = state.loading ? '刷新中' : '刷新数据';
    $id('asof').textContent = state.asOf ? `数据截至 ${fmt.date(state.asOf, true)}` : '数据截至 —';

    const err = $id('page-error');
    if (state.error) {
      err.hidden = false;
      err.innerHTML = `<div class="callout callout--red">${icon('alert')}
        <div class="stack gap-50">
          <span class="body-5">数据加载失败</span>
          <span class="caption-2">${esc(state.error)}</span>
          <span class="mt-200"><button class="btn btn--secondary btn--sm" type="button" data-retry>重新加载</button></span>
        </div>
      </div>`;
    } else {
      err.hidden = true;
      err.innerHTML = '';
    }
  }

  /* ---------------- KPI ---------------- */

  /**
   * KPI 数字滚动：仅在支持动效且元素进入视口后执行，总时长 450ms。
   * 只处理纯数字指标（金额/百分比保持原样），避免无意义跳动。
   */
  function animateKpiNumbers(root) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.querySelectorAll('[data-count]').forEach((el) => {
      const target = Number(el.dataset.count) || 0;
      if (reduce || target <= 0 || target > 100000) return;
      const dur = 450;
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt.int(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = fmt.int(target);
      };
      el.textContent = '0';
      requestAnimationFrame(step);
    });
  }

  function renderKpis() {
    const grid = $id('kpi-grid');
    const strip = $id('mini-strip');

    if (state.loading && !state.ov) {
      grid.innerHTML = Array.from({ length: 6 }).map(() => '<div class="skeleton kpi-skel"></div>').join('');
      strip.innerHTML = Array.from({ length: 4 }).map(() => `<div class="mini">
        <span class="skeleton skeleton--text" style="width:50%"></span>
        <span class="skeleton skeleton--text" style="width:70%"></span>
      </div>`).join('');
      return;
    }

    if (!state.ov) {
      grid.innerHTML = `<div class="callout callout--red" style="grid-column:1 / -1">${icon('alert')}<span class="body-6">经营指标暂不可用，请重新加载</span></div>`;
      strip.innerHTML = '';
      return;
    }

    const k = state.ov.kpis || {};
    const highOpen = state.alerts.filter((a) => a.status === 'open' && a.level === 'high').length;
    const lastLedger = state.ledger[0];

    const cards = [
      { icon: 'coins', label: '近 30 日成交额', value: moneyShort(k.gmv || 0), note: '按在售商品月销折算' },
      { icon: 'receipt', label: '订单', value: fmt.int(k.orders || 0), num: Number(k.orders) || 0, note: '近 30 日下单' },
      { icon: 'users', label: '农户', value: fmt.int(k.farmers || 0), num: Number(k.farmers) || 0, note: `覆盖 ${fmt.int(k.households || 0)} 户家庭` },
      { icon: 'box', label: '批次', value: fmt.int(k.batches || 0), num: Number(k.batches) || 0, note: `在链记录 ${fmt.int(k.records || 0)} 条` },
      { icon: 'link', label: '链高度', value: fmt.int(k.chainHeight || 0), num: Number(k.chainHeight) || 0, note: lastLedger ? `最新写入 ${fmt.rel(lastLedger.at)}` : '等待首条写入' },
      { icon: 'bell', label: '待处置预警', value: fmt.int(k.openAlerts || 0), num: Number(k.openAlerts) || 0, note: highOpen ? `高风险 ${fmt.int(highOpen)} 条待处理` : '暂无高风险待处理', alert: true },
    ];

    grid.innerHTML = cards.map((c) => `<article class="card kpi${c.alert ? ' kpi--alert' : ''}">
      <div class="kpi__top">
        <span class="kpi__icon">${icon(c.icon)}</span>
        <span class="caption-4 muted kpi__label">${esc(c.label)}</span>
      </div>
      <p class="stat__value stat__value--sm mono"${typeof c.num === 'number' ? ` data-count="${c.num}"` : ''}>${esc(c.value)}</p>
      <p class="caption-5 muted">${esc(c.note)}</p>
    </article>`).join('');

    animateKpiNumbers(grid);
    const chainOk = Number(k.chainOk) || 0;
    const chainTotal = Number(k.chainTotal) || 0;
    const mini = [
      { label: '溯源覆盖率', value: fmt.pct(k.traceCoverage || 0) },
      { label: '平均客单价', value: fmt.money(k.avgOrder || 0) },
      { label: '复购率', value: fmt.pct(k.repurchase || 0) },
      { label: '链校验通过', value: `${fmt.int(chainOk)}/${fmt.int(chainTotal)}`, ok: chainTotal > 0 && chainOk === chainTotal },
    ];
    strip.innerHTML = mini.map((m) => `<div class="mini">
      <span class="caption-4 muted">${esc(m.label)}</span>
      <span class="mini__value">
        <span class="stat__value stat__value--sm mono">${esc(m.value)}</span>
        ${m.ok ? `<span class="badge badge--green">${icon('shield')}通过</span>` : ''}
      </span>
    </div>`).join('');
  }

  /* ---------------- 趋势与分布 ---------------- */

  function compactNum(v) {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 10000) return `${fmt.int((n / 10000).toFixed(1))}万`;
    return fmt.int(Math.round(n));
  }

  function trendChartSvg(trend, width) {
    const w = Math.max(260, Math.round(width || 720));
    const h = w < 460 ? 200 : 240;
    const pad = { t: 18, r: 12, b: 30, l: 44 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const values = trend.map((d) => Number(d.gmv) || 0);
    const max = (Math.max.apply(null, values) || 1) * 1.12;
    const x = (i) => pad.l + (trend.length <= 1 ? iw / 2 : (i * iw) / (trend.length - 1));
    const y = (v) => pad.t + ih - (v / max) * ih;
    const grid = [0, 0.25, 0.5, 0.75, 1].map((p) => {
      const gy = pad.t + ih - p * ih;
      return `<line x1="${pad.l}" y1="${gy.toFixed(1)}" x2="${w - pad.r}" y2="${gy.toFixed(1)}" stroke="var(--line)" stroke-dasharray="${p === 0 ? '0' : '3 4'}"/>
        <text x="${pad.l - 8}" y="${(gy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--muted)">${compactNum(max * p)}</text>`;
    }).join('');
    const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = `${line} L${x(values.length - 1).toFixed(1)},${pad.t + ih} L${x(0).toFixed(1)},${pad.t + ih} Z`;
    const dots = values.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="var(--surface)" stroke="var(--green-600)" stroke-width="2"/>`).join('');
    const step = w < 460 ? Math.ceil(trend.length / 6) : 1;
    const labels = trend.map((d, i) => (i % step === 0 || i === trend.length - 1
      ? `<text x="${x(i).toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(d.label)}</text>`
      : '')).join('');

    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="14 日成交额折线">${grid}
      <path d="${area}" fill="var(--green-600)" opacity=".07"/>
      <path d="${line}" fill="none" stroke="var(--green-600)" stroke-width="2.2" stroke-linecap="round"/>
      ${dots}${labels}</svg>`;
  }

  function mixChartSvg(items, width) {
    const w = Math.max(260, Math.round(width || 520));
    const h = w < 420 ? 190 : 220;
    const pad = { t: 34, r: 8, b: 28, l: 8 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const max = (Math.max.apply(null, items.map((i) => i.value)) || 1) * 1.16;
    const slot = iw / items.length;
    const bw = Math.min(52, slot * 0.5);
    const bars = items.map((it, i) => {
      const cx = pad.l + slot * (i + 0.5);
      const bh = Math.max(2, (it.value / max) * ih);
      const top = pad.t + ih - bh;
      return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="6" fill="${it.color || 'var(--green-600)'}"/>
        <text x="${cx.toFixed(1)}" y="${(top - 8).toFixed(1)}" text-anchor="middle" font-size="11" fill="var(--ink-2)">${esc(it.label2 || '')}</text>
        <text x="${cx.toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(it.label)}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="品类成交额分布">${bars}</svg>`;
  }

  function renderTrend() {
    const host = $id('trend-chart');
    const stats = $id('trend-stats');

    if (state.loading && !state.ov) {
      host.innerHTML = '<div class="skeleton chart-skel"></div>';
      stats.innerHTML = '';
      return;
    }

    const trend = (state.ov && state.ov.trend) || [];
    if (!trend.length) {
      host.innerHTML = emptyState('暂无成交数据', '接入订单后这里会显示 14 日成交走势', 'chart');
      stats.innerHTML = '';
      return;
    }

    host.innerHTML = trendChartSvg(trend, host.clientWidth);
    const values = trend.map((d) => d.gmv);
    const total = values.reduce((a, b) => a + b, 0);
    const peak = Math.max.apply(null, values);
    const peakItem = trend[values.indexOf(peak)];
    stats.innerHTML = [
      { label: '14 日合计', value: moneyShort(total) },
      { label: '日均', value: moneyShort(total / values.length) },
      { label: `峰值 ${peakItem.label}`, value: moneyShort(peak) },
    ].map((s) => `<div class="trend-stat">
      <span class="caption-4 muted">${esc(s.label)}</span>
      <span class="title-1 mono">${esc(s.value)}</span>
    </div>`).join('');
  }

  function renderCategory() {
    const host = $id('category-chart');
    const totalEl = $id('category-total');

    if (state.loading && !state.ov) {
      host.innerHTML = '<div class="skeleton chart-skel"></div>';
      totalEl.textContent = '汇总中';
      return;
    }

    const mix = (((state.ov && state.ov.categoryMix) || []).slice()).sort((a, b) => b.value - a.value);
    if (!mix.length) {
      host.innerHTML = emptyState('暂无品类数据', '商品上架后这里会显示品类结构', 'grid');
      totalEl.textContent = '';
      return;
    }

    const total = mix.reduce((s, m) => s + m.value, 0);
    totalEl.textContent = `合计 ${moneyShort(total)}`;
    host.innerHTML = mixChartSvg(mix.map((m, i) => ({
      label: m.label,
      value: m.value,
      label2: moneyShort(m.value),
      color: CAT_COLORS[i % CAT_COLORS.length],
    })), host.clientWidth);
  }

  function renderRegion() {
    const host = $id('region-list');
    const note = $id('region-note');

    if (state.loading && !state.ov) {
      host.innerHTML = Array.from({ length: 5 }).map(() => `<div class="region">
        <div class="skeleton skeleton--text" style="width:50%"></div>
        <div class="skeleton" style="height:6px;border-radius:var(--r-full)"></div>
      </div>`).join('');
      note.textContent = '';
      return;
    }

    const mix = (state.ov && state.ov.regionMix) || [];
    if (!mix.length) {
      host.innerHTML = emptyState('暂无产地数据', '农户入驻并上架后会显示产地结构', 'pin');
      note.textContent = '';
      return;
    }

    const total = mix.reduce((s, m) => s + m.value, 0);
    const top = mix.slice(0, 6);
    const rest = mix.slice(6);

    host.innerHTML = top.map((m) => {
      const pct = total ? (m.value / total) * 100 : 0;
      return `<div class="region">
        <div class="region__head">
          <span class="body-5 region__name">${esc(m.label)}</span>
          <span class="caption-1 mono muted nowrap">${esc(moneyShort(m.value))} · ${fmt.pct(pct)}</span>
        </div>
        <div class="meter"><div class="meter__fill" style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></div></div>
      </div>`;
    }).join('');

    const restSum = rest.reduce((s, m) => s + m.value, 0);
    note.textContent = rest.length ? `另有 ${fmt.int(rest.length)} 个产区合计 ${moneyShort(restSum)}` : '';
  }

  /* ---------------- 预警处置 ---------------- */

  function renderAlerts() {
    const host = $id('alert-list');
    const counts = {
      all: state.alerts.length,
      high: state.alerts.filter((a) => a.level === 'high').length,
      mid: state.alerts.filter((a) => a.level === 'mid').length,
      low: state.alerts.filter((a) => a.level === 'low').length,
    };
    $$('#alert-filter [data-filter]').forEach((btn) => {
      const key = btn.dataset.filter;
      btn.setAttribute('aria-pressed', String(state.filter === key));
      const num = btn.querySelector('.filter-count');
      if (num) num.textContent = fmt.int(counts[key] || 0);
    });

    if (state.loading && !state.ov) {
      host.innerHTML = '<div class="skeleton alert-skel"></div><div class="skeleton alert-skel"></div>';
      return;
    }

    if (!state.alerts.length) {
      host.innerHTML = emptyState('暂无监管预警', '链校验与扫码监控运行正常，新预警会出现在这里', 'shield');
      return;
    }

    const items = state.alerts.filter((a) => state.filter === 'all' || a.level === state.filter);
    if (!items.length) {
      host.innerHTML = emptyState('该等级下没有预警', '切换筛选查看其他等级的待处置事项', 'filter',
        '<button class="btn btn--secondary btn--sm" type="button" data-reset-filter>查看全部预警</button>');
      return;
    }

    host.innerHTML = items.map(alertCard).join('');
  }

  function alertCard(a) {
    const done = a.status === 'resolved';
    return `<article class="card alert-card alert-card--${esc(a.level)}${done ? ' alert-card--done' : ' alert-card--open'}" data-id="${esc(a.id)}">
      <div class="alert-card__head">
        <div class="alert-card__meta">
          ${levelBadge(a.level)}
          <span class="tag">${esc(a.type)}</span>
        </div>
        ${done
          ? '<span class="badge badge--green">已处置</span>'
          : `<span class="caption-5 muted">${esc(fmt.rel(a.at))}</span>`}
      </div>
      <h3 class="title-3 alert-card__title">${esc(a.title)}</h3>
      <p class="body-6 muted">${esc(a.detail)}</p>
      ${done && a.resolveNote ? `<p class="caption-2 ink-2">处置说明：${esc(a.resolveNote)}</p>` : ''}
      <div class="alert-card__foot">
        <span class="caption-5 muted mono">${esc(a.batchId ? `批次 ${a.batchId}` : '无关联批次')} · ${esc(fmt.date(a.at, true))}</span>
        ${done ? '' : `<button class="btn btn--secondary btn--sm" type="button" data-resolve="${esc(a.id)}">${icon('hand')}处置</button>`}
      </div>
    </article>`;
  }

  function openResolve(id) {
    const a = state.alerts.find((x) => x.id === id);
    if (!a) return;
    const m = modal({
      title: '处置预警',
      body: `<div class="stack gap-300">
        <div class="stack gap-75">
          <div class="row gap-75 wrap">
            ${levelBadge(a.level)}
            <span class="tag">${esc(a.type)}</span>
            <span class="caption-5 muted">${esc(fmt.date(a.at, true))}</span>
          </div>
          <p class="title-3">${esc(a.title)}</p>
          <p class="body-6 muted">${esc(a.detail)}</p>
        </div>
        <div class="field">
          <label class="field__label" for="resolve-note">处置说明</label>
          <textarea class="textarea" id="resolve-note" placeholder="写清怎么处理的，例如：已联系经销商复核标签，并向该单用户补发一份"></textarea>
          <span class="field__hint" id="resolve-hint">说明会写入预警记录，后续复盘可查</span>
        </div>
      </div>`,
      actions: [
        { label: '取消' },
        {
          label: '确认处置',
          variant: 'btn--primary',
          onClick: async (box) => {
            const ta = box.querySelector('#resolve-note');
            const hint = box.querySelector('#resolve-hint');
            const note = ta.value.trim();
            if (note.length < 4) {
              ta.classList.add('input--error');
              hint.textContent = '请填写至少 4 个字的处置说明';
              hint.style.color = 'var(--red-700)';
              ta.focus();
              return false;
            }
            try {
              const res = await api(`/api/admin/alerts/${encodeURIComponent(a.id)}/resolve`, { method: 'POST', body: { note } });
              a.status = 'resolved';
              a.resolveNote = (res && res.alert && res.alert.resolveNote) || note;
              a.resolvedAt = (res && res.alert && res.alert.resolvedAt) || new Date().toISOString();
              if (state.ov && state.ov.kpis) {
                state.ov.kpis.openAlerts = Math.max(0, (state.ov.kpis.openAlerts || 0) - 1);
              }
              renderAlerts();
              renderKpis();
              toast('预警已处置');
              return true;
            } catch (err) {
              toast((err && err.message) || '处置失败，请稍后重试', 'error');
              return false;
            }
          },
        },
      ],
    });
    setTimeout(() => {
      const ta = m.box.querySelector('#resolve-note');
      if (ta) ta.focus();
    }, 30);
  }

  /* ---------------- 商品审核 ---------------- */

  function renderAudit() {
    const host = $id('audit-list');
    const meta = $id('audit-meta');

    if (state.loading && !state.ov) {
      host.innerHTML = '<div class="skeleton audit-skel"></div>';
      meta.textContent = '同步中';
      return;
    }

    meta.textContent = state.audit.length ? `待审 ${fmt.int(state.audit.length)} 件` : '全部处理完毕';

    if (!state.audit.length) {
      host.innerHTML = emptyState('没有待审商品', '新提交的商品会出现在这里，材料齐全才能上架', 'clipboard');
      return;
    }

    host.innerHTML = state.audit.map(auditCard).join('');
  }

  function auditCard(p) {
    const farmer = p.farmer || {};
    const region = farmer.region
      ? [farmer.region.province, farmer.region.city, farmer.region.county].filter(Boolean).join(' ')
      : '';
    const missing = (p.highlights || [])
      .filter((h) => typeof h === 'string' && h.indexOf('待补') === 0)
      .map((h) => h.replace(/^待补[：:]\s*/, ''));

    return `<article class="card audit-card" data-id="${esc(p.id)}">
      <div class="audit-card__art">${productArt(p.art || 'pear', { size: 96 })}</div>
      <div class="audit-card__main">
        <div class="row gap-75 wrap">
          <h3 class="title-2">${esc(p.name)}</h3>
          <span class="badge badge--amber">待审核</span>
          ${p.geoIndication && p.geo ? `<span class="badge badge--green">${icon('seal')}${esc(p.geo)}</span>` : ''}
        </div>
        <p class="caption-2 muted">${esc(farmer.name || '待补充农户')}${farmer.org ? ' · ' + esc(farmer.org) : ''}${region ? ' · ' + esc(region) : ''}</p>
        <p class="body-6 ink-2">${esc(p.summary || '')}</p>
        <div class="audit-card__miss">
          <span class="caption-4 muted">缺少材料</span>
          ${missing.length
            ? missing.map((m) => `<span class="badge badge--amber">${icon('alert')}${esc(m)}</span>`).join('')
            : '<span class="badge">未标注</span>'}
        </div>
      </div>
      <div class="audit-card__side">
        <div class="audit-card__price">
          <span class="heading-6">${fmt.money(p.price)}</span>
          <span class="caption-5 muted">${esc(p.unit || '')} · 提交于 ${esc(fmt.rel(p.createdAt))}</span>
        </div>
        <div class="row gap-75 wrap">
          <button class="btn btn--secondary btn--sm" type="button" data-reject="${esc(p.id)}">驳回</button>
          <button class="btn btn--primary btn--sm" type="button" data-approve="${esc(p.id)}">通过上架</button>
        </div>
      </div>
    </article>`;
  }

  async function reviewProduct(p, action, reason, btn) {
    if (btn) btn.disabled = true;
    try {
      await api(`/api/admin/products/${encodeURIComponent(p.id)}/review`, { method: 'POST', body: { action, reason: reason || '' } });
      state.audit = state.audit.filter((x) => x.id !== p.id);
      renderAudit();
      toast(action === 'approve' ? `${p.name} 已通过审核并上架` : `${p.name} 已驳回，原因已通知农户`);
    } catch (err) {
      if (btn) btn.disabled = false;
      toast((err && err.message) || '审核操作失败', 'error');
    }
  }

  function openReject(id) {
    const p = state.audit.find((x) => x.id === id);
    if (!p) return;
    const m = modal({
      title: '驳回商品',
      body: `<div class="stack gap-300">
        <p class="body-6 muted">驳回后商品不会上架，原因会记录在商品档案里，农户补齐材料后可再次提交审核。</p>
        <div class="field">
          <label class="field__label" for="reject-reason">驳回原因</label>
          <textarea class="textarea" id="reject-reason" placeholder="例如：缺少农残检测报告与承诺达标合格证，请补齐后重新提交"></textarea>
          <span class="field__hint" id="reject-hint">写清缺哪份材料，农户才好补</span>
        </div>
      </div>`,
      actions: [
        { label: '取消' },
        {
          label: '确认驳回',
          variant: 'btn--danger',
          onClick: async (box) => {
            const ta = box.querySelector('#reject-reason');
            const hint = box.querySelector('#reject-hint');
            const reason = ta.value.trim();
            if (reason.length < 4) {
              ta.classList.add('input--error');
              hint.textContent = '请填写至少 4 个字的驳回原因';
              hint.style.color = 'var(--red-700)';
              ta.focus();
              return false;
            }
            await reviewProduct(p, 'reject', reason);
            return true;
          },
        },
      ],
    });
    setTimeout(() => {
      const ta = m.box.querySelector('#reject-reason');
      if (ta) ta.focus();
    }, 30);
  }

  /* ---------------- 链账本 ---------------- */

  function renderLedger() {
    const badge = $id('chain-badge');
    const k = state.ov && state.ov.kpis;
    if (k) {
      const okAll = k.chainTotal > 0 && k.chainOk === k.chainTotal;
      badge.className = 'badge ' + (okAll ? 'badge--green' : 'badge--red');
      badge.innerHTML = `${icon('shield')}<span>链校验通过 ${fmt.int(k.chainOk)}/${fmt.int(k.chainTotal)}</span>`;
    } else {
      badge.className = 'badge';
      badge.innerHTML = `${icon('shield')}<span>链校验通过 —</span>`;
    }

    renderTamperBar();

    const meta = $id('ledger-meta');
    meta.textContent = state.ledger.length
      ? `显示最近 ${fmt.int(state.ledger.length)} 条，共 ${fmt.int(state.ledgerTotal)} 条`
      : '哈希链按 prevHash 依次串联';

    const body = $id('ledger-body');
    if (state.loading && !state.ov) {
      body.innerHTML = skeletonRow(6, 8);
      return;
    }
    if (!state.ledger.length) {
      body.innerHTML = `<tr><td colspan="6">${emptyState('账本暂无区块', '农户写入第一条农事记录后会自动上链', 'database')}</td></tr>`;
      return;
    }

    body.innerHTML = state.ledger.map((l) => {
      const hash = String(l.tx || l.hash || '').slice(0, 12);
      return `<tr>
        <td data-label="高度"><span class="mono body-5">#${fmt.int(l.height)}</span></td>
        <td data-label="批次"><span class="badge">${esc(l.batchId)}</span></td>
        <td data-label="记录"><span class="rec">
          <span class="body-5">${esc(recordLabel(l.type))}</span>
          <span class="caption-5 muted mono">${esc(l.recordId)}</span>
        </span></td>
        <td data-label="写入方"><span class="body-6">${esc(l.writer || '系统')}</span></td>
        <td data-label="时间"><span class="caption-2 muted nowrap">${esc(fmt.date(l.at, true))}</span></td>
        <td data-label="交易哈希"><span class="hash-cell">
          <span class="mono caption-1">${esc(hash)}</span>
          <button class="copy-btn" type="button" data-copy="${esc(l.tx || l.hash || '')}" aria-label="复制交易哈希" title="复制完整交易哈希">${icon('copy')}</button>
        </span></td>
      </tr>`;
    }).join('');
  }

  function renderTamperBar() {
    const bar = $id('tamper-bar');
    const on = state.tamper;
    bar.dataset.on = String(on);
    bar.innerHTML = `<div class="tamper-bar__text">
      <div class="row gap-75 wrap">
        <span class="badge badge--amber">${icon('bug')}篡改演示</span>
        <span class="body-5">${on ? '已模拟篡改第 3 条记录' : '改动批次 B01 的第 3 条农事记录'}</span>
      </div>
      <p class="caption-5${on ? '' : ' muted'}">${on
        ? '已模拟篡改第 3 条记录，请到溯源页 TY-2026-0912-DS 查看校验失败；关闭开关即恢复原文。'
        : '启用后请到溯源页 TY-2026-0912-DS 查看校验失败，关闭即恢复原文。仅用于课堂演示。'}</p>
    </div>
    <div class="tamper-bar__toggle">
      <span class="caption-5${on ? '' : ' muted'}">${on ? '演示进行中' : '当前未开启'}</span>
      <button class="switch" type="button" role="switch" aria-checked="${on}" aria-label="篡改演示开关" data-tamper></button>
    </div>`;
  }

  function toggleTamper(next) {
    if (!next) { applyTamper(false); return; }
    modal({
      title: '开启篡改演示',
      body: `<div class="stack gap-200">
        <p class="body-3">开关会改动本地演示数据：把批次 B01 的第 3 条记录内容替换掉，让哈希链校验失败。仅用于课堂演示，关闭后恢复原文。</p>
        <div class="callout callout--amber">${icon('alert')}<span>启用后请到溯源页 TY-2026-0912-DS 查看校验失败。</span></div>
      </div>`,
      actions: [
        { label: '取消' },
        { label: '确认开启', variant: 'btn--danger', onClick: () => applyTamper(true) },
      ],
    });
  }

  async function applyTamper(on) {
    const sw = $id('tamper-bar').querySelector('[data-tamper]');
    if (sw) sw.disabled = true;
    try {
      const res = await api('/api/admin/demo/tamper', { method: 'POST', body: { batchId: 'B01', on } });
      state.tamper = !!(res && res.demo && res.demo.tamper && res.demo.tamper.batchId);
      await silentRefresh();
      toast(on
        ? '已模拟篡改第 3 条记录，请到溯源页 TY-2026-0912-DS 查看校验失败'
        : '已恢复原始记录，链校验重新通过');
    } catch (err) {
      if (sw) sw.disabled = false;
      toast((err && err.message) || '篡改演示开关操作失败', 'error');
    }
  }

  /* ---------------- 地标库与订单 ---------------- */

  function renderGeos() {
    const body = $id('geos-body');
    const meta = $id('geos-meta');

    if (state.loading && !state.ov) {
      body.innerHTML = skeletonRow(5, 5);
      meta.textContent = '同步中';
      return;
    }

    meta.textContent = state.geos.length ? `共 ${fmt.int(state.geos.length)} 件地标产品` : '';
    if (!state.geos.length) {
      body.innerHTML = `<tr><td colspan="5">${emptyState('暂无地理标志登记', '登记信息会随入驻资料同步到这里', 'seal')}</td></tr>`;
      return;
    }

    body.innerHTML = state.geos.map((g) => `<tr>
      <td data-label="名称"><span class="row gap-75"><span class="geo-dot" aria-hidden="true"></span><span class="title-4">${esc(g.name)}</span></span></td>
      <td data-label="登记号"><span class="mono caption-1 muted">${esc(g.code)}</span></td>
      <td data-label="持有人"><span class="body-6">${esc(g.holder)}</span></td>
      <td data-label="产区"><span class="body-6 muted">${esc(g.region)}</span></td>
      <td data-label="授权量"><span class="body-6">${esc(g.quota)}</span></td>
    </tr>`).join('');
  }

  function renderOrders() {
    const body = $id('orders-body');
    const meta = $id('orders-meta');

    if (state.loading && !state.ov) {
      body.innerHTML = skeletonRow(5, 5);
      meta.textContent = '同步中';
      return;
    }

    meta.textContent = state.orders.length ? `共 ${fmt.int(state.orders.length)} 笔` : '';
    if (!state.orders.length) {
      body.innerHTML = `<tr><td colspan="5">${emptyState('暂无订单', '消费者下单后会实时出现在这里', 'receipt')}</td></tr>`;
      return;
    }

    body.innerHTML = state.orders.map((o) => `<tr>
      <td data-label="订单号"><span class="mono body-5">${esc(o.no)}</span></td>
      <td data-label="商品"><span class="body-6">${esc((o.product && o.product.name) || o.productName || o.productId)}</span></td>
      <td data-label="金额" class="num"><span class="body-5">${fmt.money(o.amount)}</span></td>
      <td data-label="状态">${statusBadge('order', o.status)}</td>
      <td data-label="时间"><span class="caption-2 muted nowrap">${esc(fmt.date(o.createdAt, true))}</span></td>
    </tr>`).join('');
  }


  /* ---------------- 农户入驻审核 ---------------- */
  function renderApplications() {
    const host = $id('apps-list');
    const count = $id('apps-count');
    if (!host) return;
    if (state.loading && !state.ov) {
      host.innerHTML = '<div class="skeleton skeleton--card" style="height:96px"></div>';
      if (count) count.textContent = '同步中';
      return;
    }
    const items = state.applications || [];
    if (count) count.textContent = items.length ? `${items.length} 待审` : '0 待审';
    if (!items.length) {
      host.innerHTML = emptyState('暂无待审农户', '农户提交入驻申请后会出现在这里', 'users');
      return;
    }
    host.innerHTML = items.map((a) => `<article class="card card--pad" data-app="${esc(a.id)}">
      <div class="row between wrap gap-100">
        <div>
          <p class="body-5">${esc(a.orgName || a.name || '农户')} · ${esc(a.orgType || '家庭农场')}</p>
          <p class="caption-2 muted">${esc(a.region || '')} · ${esc(a.mainCategory || '')} · 联系人 ${esc(a.contact || '')}</p>
        </div>
        <span class="badge badge--amber">待审核</span>
      </div>
      <p class="body-6 muted mt-200">${esc(a.description || a.desc || '暂无经营说明')}</p>
      <div class="row gap-100 mt-200">
        <button class="btn btn--primary btn--sm" type="button" data-app-approve="${esc(a.id)}">通过并开通</button>
        <button class="btn btn--secondary btn--sm" type="button" data-app-reject="${esc(a.id)}">驳回</button>
      </div>
    </article>`).join('');
  }

  function openApplicationReject(id) {
    modal({
      title: '驳回农户申请',
      body: '<label class="field"><span class="field__label">驳回原因</span><textarea class="textarea" name="reason" placeholder="说明缺少的材料，申请人可修改后重提"></textarea></label>',
      actions: [
        { label: '取消' },
        { label: '确认驳回', variant: 'btn--danger', onClick: (box) => reviewApplication(id, 'reject', (box.querySelector('[name=reason]') || {}).value || '', null) },
      ],
    });
  }

  async function reviewApplication(id, action, reason, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '处理中…'; }
    try {
      const res = await fetch('/api/admin/applications/' + encodeURIComponent(id) + '/review', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error && data.error.message) || '审核失败');
      toast(data.message || '已处理');
      await loadFarmers();
    } catch (err) {
      toast((err && err.message) || '审核失败', 'error');
      if (btn) { btn.disabled = false; btn.textContent = action === 'approve' ? '通过并开通' : '驳回'; }
    }
  }

  /* ---------------- 账号与角色 ---------------- */
  function renderStaff() {
    const body = $id('staff-body');
    const meta = $id('staff-meta');
    const note = $id('staff-roles-note');
    if (!body) return;
    if (state.loading && !state.ov) {
      body.innerHTML = skeletonRow(5, 6);
      if (meta) meta.textContent = '同步中';
      return;
    }
    if (meta) meta.textContent = state.staff.length ? `共 ${state.staff.length} 个员工` : '';
    if (note) note.textContent = state.roles.map((r) => `${r.name}：${r.desc}`).join(' · ');
    if (!state.staff.length) {
      body.innerHTML = `<tr><td colspan="6">${emptyState('暂无员工账号', '由系统管理员开通员工账号', 'users')}</td></tr>`;
      return;
    }
    body.innerHTML = state.staff.map((u) => `<tr>
      <td data-label="员工"><span class="body-6">${esc(u.name || u.nickname || '—')}</span></td>
      <td data-label="工号"><span class="mono caption-2">${esc(u.employeeNo || '—')}</span></td>
      <td data-label="手机号"><span class="mono caption-2">${esc(u.phone || '—')}</span></td>
      <td data-label="角色"><select class="vf-staff-role" data-staff-role="${esc(u.id)}">${state.roles.map((r) => `<option value="${esc(r.code)}" ${r.code === u.staffRole ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></td>
      <td data-label="状态"><select class="vf-staff-status" data-staff-status="${esc(u.id)}">
        <option value="active" ${u.status === 'active' ? 'selected' : ''}>在职</option>
        <option value="disabled" ${u.status === 'disabled' ? 'selected' : ''}>停用</option>
        <option value="left" ${u.status === 'left' ? 'selected' : ''}>离职</option>
      </select></td>
      <td data-label="操作"><button class="btn btn--secondary vf-staff-save" type="button" data-staff-save="${esc(u.id)}">保存</button></td>
    </tr>`).join('');
  }

  async function saveStaff(id, btn) {
    const roleEl = document.querySelector(`[data-staff-role="${id}"]`);
    const statusEl = document.querySelector(`[data-staff-status="${id}"]`);
    if (!roleEl || !statusEl) return;
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    try {
      const res = await fetch('/api/admin/staff/' + encodeURIComponent(id), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffRole: roleEl.value, status: statusEl.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error && data.error.message) || '保存失败');
      toast('员工信息已更新');
      await loadStaff();
    } catch (err) {
      toast((err && err.message) || '保存失败', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '保存'; }
    }
  }



  function renderRoles() {
    const body = $id('roles-body');
    const meta = $id('roles-meta');
    if (!body) return;
    if (state.loading && !state.ov) { body.innerHTML = skeletonRow(5, 3); return; }
    if (meta) meta.textContent = state.roleMatrix.length ? `共 ${state.roleMatrix.length} 个角色` : '';
    if (!state.roleMatrix.length) {
      body.innerHTML = `<tr><td colspan="4">${emptyState('暂无角色', '角色由服务端初始化', 'lock')}</td></tr>`;
      return;
    }
    body.innerHTML = state.roleMatrix.map((r) => `<tr>
      <td data-label="角色"><span class="body-6">${esc(r.name)}</span><br><span class="mono caption-5 muted">${esc(r.code)}</span></td>
      <td data-label="说明"><span class="caption-2 muted">${esc(r.desc)}</span></td>
      <td data-label="权限点"><span class="row wrap gap-50">${(r.permissions || []).map((p) => `<span class="badge">${esc(p)}</span>`).join('')}</span></td>
      <td data-label="操作"><button class="btn btn--secondary btn--sm" type="button" data-role-edit="${esc(r.code)}">编辑</button></td>
    </tr>`).join('');
    body.querySelectorAll('[data-role-edit]').forEach((btn) => {
      btn.onclick = () => openRoleEditor(btn.dataset.roleEdit);
    });
  }

  function openRoleEditor(code) {
    const role = state.roleMatrix.find((r) => r.code === code);
    if (!role) return;
    const current = new Set(role.permissions || []);
    const body = `<div class="stack gap-100" style="max-height:52vh;overflow:auto">${state.permissionCatalog.map((p) => `
      <label class="row gap-100" style="align-items:flex-start;padding:6px 0">
        <input type="checkbox" data-perm="${esc(p.code)}" ${current.has(p.code) ? 'checked' : ''} style="margin-top:3px;accent-color:var(--green-700)">
        <span><strong class="body-6">${esc(p.code)}</strong><br><span class="caption-5 muted">${esc(p.type)} · ${esc(p.desc)}</span></span>
      </label>`).join('')}</div>`;
    modal({
      title: '编辑角色权限 · ' + role.name,
      body,
      width: '560px',
      actions: [
        { label: '取消' },
        { label: '保存权限', variant: 'btn--primary', onClick: async (box) => {
          const perms = Array.from(box.querySelectorAll('[data-perm]:checked')).map((x) => x.dataset.perm);
          const res = await fetch('/api/admin/roles/' + encodeURIComponent(code), {
            method: 'PATCH', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissions: perms }),
          });
          const d = await res.json().catch(() => ({}));
          if (!res.ok) { toast((d.error && d.error.message) || '保存失败', 'error'); return false; }
          toast('角色权限已更新');
          await loadRoles();
          return true;
        } },
      ],
    });
  }


  function renderRecStats() {
    const host = $id('rec-stats');
    if (!host) return;
    const s = state.recStats || { impressions: 0, clicks: 0, addCart: 0, checkout: 0, ctr: 0, checkoutRate: 0 };
    host.innerHTML = [
      ['推荐曝光', fmt.int(s.impressions), 'rec_impression'],
      ['推荐点击', fmt.int(s.clicks), `CTR ${s.ctr}%`],
      ['点击加购', fmt.int(s.addCart), 'add_cart'],
      ['点击后下单', fmt.int(s.checkout), `CVR ${s.checkoutRate}%`],
    ].map(([label, value, note]) => `<div class="kpi"><div class="kpi__head"><span class="caption-4 muted">${label}</span></div><p class="stat__value" style="font-size:22px">${value}</p><p class="caption-5 muted">${note}</p></div>`).join('');
    const at = $id('consumer-profile-snapshot-at');
    if (at) at.textContent = state.consumerSnapshot ? `快照 ${fmt.date(state.consumerSnapshot.createdAt, true)}` : '尚无快照';
    const fat = $id('farmer-profile-snapshot-at');
    if (fat) fat.textContent = state.farmerSnapshot ? `快照 ${fmt.date(state.farmerSnapshot.createdAt, true)}` : '尚无快照';
  }

  function renderConsumerProfiles() {
    const body = $id('consumer-profiles-body');
    const meta = $id('consumer-profiles-meta');
    const note = $id('consumer-profiles-note');
    if (!body) return;
    if (state.loading && !state.ov) { body.innerHTML = skeletonRow(4, 6); return; }
    if (meta) meta.textContent = state.consumerProfiles.length ? `共 ${state.consumerProfiles.length} 位` : '';
    if (note) note.textContent = '只统计有 userId 的订单；历史上 7 笔订单没有用户归属，不纳入样本。';
    if (!state.consumerProfiles.length) {
      body.innerHTML = `<tr><td colspan="6">${emptyState('暂无消费者画像', '有订单或授权后才生成', 'users')}</td></tr>`;
      return;
    }
    body.innerHTML = state.consumerProfiles.map((p) => `<tr>
      <td data-label="客户"><span class="body-6">${esc(p.name)}</span><br><span class="mono caption-5 muted">${esc(p.phone)}</span></td>
      <td data-label="样本"><span class="caption-2">${p.sample.orders} 单 · ${p.sample.reviews} 评${p.consent ? ` · ${p.behavior.events} 事件` : ''}</span></td>
      <td data-label="累计消费" class="num"><span class="mono">${fmt.money(p.spend)}</span></td>
      <td data-label="最近购买"><span class="caption-2 muted">${p.lastOrderAt ? esc(fmt.date(p.lastOrderAt)) : '—'}${p.recencyDays != null ? ` · ${p.recencyDays} 天前` : ''}</span></td>
      <td data-label="画像同意"><span class="badge ${p.consent ? 'badge--green' : 'badge--amber'}">${p.consent ? '已授权' : p.consentStatus === 'denied' ? '已拒绝' : '未授权'}</span></td>
      <td data-label="标签"><span class="row wrap gap-50">${p.tags.length ? p.tags.map((t) => `<span class="badge">${esc(t)}</span>`).join('') : '<span class="caption-5 muted">未生成偏好标签</span>'}</span></td>
    </tr>`).join('');
  }

  function renderFarmerProfiles() {
    const body = $id('farmer-profiles-body');
    const meta = $id('farmer-profiles-meta');
    const note = $id('farmer-profiles-note');
    if (!body) return;
    if (state.loading && !state.ov) { body.innerHTML = skeletonRow(4, 6); return; }
    if (meta) meta.textContent = state.farmerProfiles.length ? `共 ${state.farmerProfiles.length} 户` : '';
    if (note) note.textContent = '档案完整度 = 有农事记录的批次数 / 总批次数；样本量显示在商品/批次/记录列。';
    if (!state.farmerProfiles.length) {
      body.innerHTML = `<tr><td colspan="6">${emptyState('暂无农户画像', '农户有商品或批次后生成', 'sprout')}</td></tr>`;
      return;
    }
    body.innerHTML = state.farmerProfiles.map((p) => {
      const region = p.region ? [p.region.province, p.region.county].filter(Boolean).join(' · ') : '—';
      return `<tr>
        <td data-label="农户"><span class="body-6">${esc(p.name)}</span><br><span class="caption-5 muted">${esc(p.org || '')}</span></td>
        <td data-label="产地"><span class="caption-2 muted">${esc(region)}</span></td>
        <td data-label="商品/批次/记录" class="num"><span class="mono">${p.products} / ${p.batches} / ${p.records}</span></td>
        <td data-label="档案完整" class="num"><span class="mono">${p.completeness}%</span></td>
        <td data-label="预警" class="num"><span class="mono">${p.alerts}${p.highAlerts ? ` · 高 ${p.highAlerts}` : ''}</span></td>
        <td data-label="标签"><span class="row wrap gap-50">${p.tags.map((t) => `<span class="badge">${esc(t)}</span>`).join('')}</span></td>
      </tr>`;
    }).join('');
  }


  function renderApprovals() {
    const body = $id('approvals-body');
    const meta = $id('approvals-meta');
    if (!body) return;
    if (state.loading && !state.ov) { body.innerHTML = skeletonRow(5, 6); return; }
    if (meta) meta.textContent = state.approvals.length ? `共 ${state.approvals.length} 条` : '';
    if (!state.approvals.length) {
      body.innerHTML = `<tr><td colspan="6">${emptyState('暂无审批历史', '审核处理后出现在这里', 'clipboard')}</td></tr>`;
      return;
    }
    const label = { farmer: '农户入驻', product: '商品审核' };
    const status = { pending: '待审核', approved: '已通过', rejected: '已驳回', on: '已上架', off: '已下架' };
    body.innerHTML = state.approvals.map((r) => `<tr>
      <td data-label="类型"><span class="badge">${label[r.type] || r.type}</span></td>
      <td data-label="名称"><span class="body-6">${esc(r.name)}</span></td>
      <td data-label="结果"><span class="badge ${r.status === 'rejected' ? 'badge--amber' : 'badge--green'}">${status[r.status] || r.status}</span></td>
      <td data-label="审核人"><span class="body-6">${esc(r.reviewer || '—')}</span></td>
      <td data-label="时间"><span class="caption-2 muted">${esc(fmt.date(r.at, true))}</span></td>
      <td data-label="原因/备注"><span class="caption-2 muted">${esc(r.reason || '—')}</span></td>
    </tr>`).join('');
  }


  function renderTickets() {
    const body = $id('tickets-body');
    const meta = $id('tickets-meta');
    if (!body) return;
    if (state.loading && !state.ov) { body.innerHTML = skeletonRow(4, 6); return; }
    if (meta) meta.textContent = state.tickets.length ? `共 ${state.tickets.length} 条` : '';
    if (!state.tickets.length) {
      body.innerHTML = `<tr><td colspan="6">${emptyState('暂无工单', '消费者提交后会出现在这里', 'chat')}</td></tr>`;
      return;
    }
    const statusLabel = { open: '待处理', in_progress: '处理中', resolved: '已解决' };
    body.innerHTML = state.tickets.map((t) => `<tr>
      <td data-label="工单"><span class="mono caption-2">${esc(t.id)}</span><br><span class="body-6">${esc(t.subject)}</span></td>
      <td data-label="客户/订单"><span class="mono caption-2">${esc(t.user_id)}</span>${t.order_id ? `<br><span class="caption-5 muted">${esc(t.order_id)}</span>` : ''}</td>
      <td data-label="类型"><span class="badge">${esc(t.type)}</span></td>
      <td data-label="状态"><span class="badge ${t.status === 'resolved' ? 'badge--green' : 'badge--amber'}">${statusLabel[t.status] || t.status}</span></td>
      <td data-label="提交时间"><span class="caption-2 muted">${esc(fmt.date(t.created_at, true))}</span></td>
      <td data-label="操作">${t.status === 'resolved' ? '<span class="caption-5 muted">已解决</span>' : `<button class="btn btn--secondary btn--sm" type="button" data-ticket-resolve="${esc(t.id)}">解决</button>`}</td>
    </tr>`).join('');
    body.querySelectorAll('[data-ticket-resolve]').forEach((btn) => {
      btn.onclick = () => {
        modal({
          title: '处理客服工单',
          body: '<label class="field"><span class="field__label">处理结果</span><textarea class="textarea" name="resolution" placeholder="说明怎么处理，用户会在通知里看到"></textarea></label>',
          actions: [
            { label: '取消' },
            { label: '标记已解决', variant: 'btn--primary', onClick: async (box) => {
              const res = await fetch('/api/support/tickets/' + encodeURIComponent(btn.dataset.ticketResolve), {
                method: 'PATCH', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'resolved', resolution: (box.querySelector('[name=resolution]') || {}).value || '已处理' }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) { toast((data.error && data.error.message) || '更新失败', 'error'); return false; }
              toast('工单已解决');
              await loadTickets();
              return true;
            } },
          ],
        });
      };
    });
  }

  /* ---------------- 客服 360 / 分账对账 ---------------- */
  function renderCustomers() {
    const body = $id('customers-body');
    const meta = $id('customers-meta');
    if (!body) return;
    if (state.loading && !state.ov) { body.innerHTML = skeletonRow(5, 6); if (meta) meta.textContent = '同步中'; return; }
    if (meta) meta.textContent = state.customers.length ? `共 ${state.customers.length} 位客户` : '';
    if (!state.customers.length) {
      body.innerHTML = `<tr><td colspan="6">${emptyState('暂无客户', '消费者注册后会出现在这里', 'users')}</td></tr>`;
      return;
    }
    body.innerHTML = state.customers.map((c) => `<tr>
      <td data-label="客户"><span class="body-6">${esc(c.name)}</span></td>
      <td data-label="手机号"><span class="mono caption-2">${esc(c.phone)}</span></td>
      <td data-label="订单" class="num"><span class="mono">${fmt.int(c.orders)}</span></td>
      <td data-label="消费" class="num"><span class="mono">${fmt.money(c.spend)}</span></td>
      <td data-label="售后" class="num"><span class="mono">${fmt.int(c.aftersales)}</span></td>
      <td data-label="最近下单"><span class="caption-2 muted">${c.lastOrder ? esc(fmt.date(c.lastOrder, true)) : '—'}</span></td>
    </tr>`).join('');
  }

  function renderSettlement() {
    const body = $id('settlement-body');
    const meta = $id('settlement-meta');
    const summary = $id('settlement-summary');
    if (!body) return;
    if (state.loading && !state.ov) { body.innerHTML = skeletonRow(5, 7); if (summary) summary.innerHTML = ''; return; }
    const data = state.settlement || { items: [], summary: null };
    if (meta) meta.textContent = data.items.length ? `共 ${data.items.length} 笔成交` : '';
    if (summary) {
      const s = data.summary || { gmv: 0, fee: 0, payable: 0, count: 0 };
      summary.innerHTML = [
        ['成交额', fmt.money(s.gmv), '订单合计'],
        ['平台服务费', fmt.money(s.fee), '按 3% 演示'],
        ['农户应付', fmt.money(s.payable), '成交额 − 平台费'],
        ['对账笔数', fmt.int(s.count), '当前订单库'],
      ].map(([label, value, note]) => `<div class="kpi"><div class="kpi__head"><span class="caption-4 muted">${label}</span></div><p class="stat__value" style="font-size:22px">${value}</p><p class="caption-5 muted">${note}</p></div>`).join('');
    }
    if (!data.items.length) {
      body.innerHTML = `<tr><td colspan="8">${emptyState('暂无成交', '消费者付款后会出现在这里', 'coins')}</td></tr>`;
      return;
    }
    body.innerHTML = data.items.map((r) => `<tr>
      <td data-label="订单"><span class="mono caption-2">${esc(r.no)}</span></td>
      <td data-label="商品"><span class="body-6">${esc(r.productName || '—')}</span></td>
      <td data-label="农户"><span class="body-6">${esc(r.farmerName || '—')}</span></td>
      <td data-label="成交额" class="num"><span class="mono">${fmt.money(r.amount)}</span></td>
      <td data-label="平台费" class="num"><span class="mono">${fmt.money(r.fee)}</span></td>
      <td data-label="应付" class="num"><span class="mono">${fmt.money(r.payable)}</span></td>
      <td data-label="状态">${statusBadge('order', r.status)}</td>
      <td data-label="结算">${r.settlementStatus === 'paid' ? `<span class="badge badge--green">已结算</span><br><span class="caption-5 muted">${esc(fmt.date(r.paidAt, true))}</span>` : `<button class="btn btn--secondary btn--sm" type="button" data-settle="${esc(r.id)}">标记已结</button>`}</td>
    </tr>`).join('');
    body.querySelectorAll('[data-settle]').forEach((btn) => {
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          const res = await fetch('/api/admin/settlement/' + encodeURIComponent(btn.dataset.settle) + '/pay', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: '财务确认结算' }),
          });
          const d = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error((d.error && d.error.message) || '结算失败');
          toast(d.message || '已结算');
          await loadSettlement();
        } catch (e) { toast(e.message || '结算失败', 'error'); btn.disabled = false; }
      };
    });
  }

  /* ---------------- 审计日志 ---------------- */
  function renderAuditLog() {
    const body = $id('auditlog-body');
    if (!body) return;
    if (state.loading && !state.ov) {
      body.innerHTML = skeletonRow(5, 6);
      return;
    }
    if (!state.auditlog.length) {
      body.innerHTML = `<tr><td colspan="6">${emptyState('暂无审计记录', '敏感操作发生后会写入这里', 'file')}</td></tr>`;
      return;
    }
    const labels = {
      'product.review': '商品审核', 'farmer.review': '农户审核', 'alert.resolve': '预警处置',
      'settings.llm': '大模型设置', 'demo.tamper': '篡改演示', 'staff.update': '员工变更',
    };
    body.innerHTML = state.auditlog.map((r) => `<tr>
      <td data-label="时间"><span class="caption-2 muted nowrap">${esc(fmt.date(r.at, true))}</span></td>
      <td data-label="操作人"><span class="mono caption-2">${esc(r.actor_id || '—')}</span></td>
      <td data-label="动作"><span class="badge">${esc(labels[r.action] || r.action)}</span></td>
      <td data-label="对象"><span class="caption-2">${esc((r.object_type || '') + (r.object_id ? ' · ' + r.object_id : ''))}</span></td>
      <td data-label="IP"><span class="mono caption-2">${esc(r.ip || '—')}</span></td>
      <td data-label="哈希"><span class="mono caption-2">${esc((r.hash || '').slice(0, 12))}</span></td>
    </tr>`).join('');
  }

  /* ---------------- 大模型设置 ---------------- */

  function renderSettingsStatus() {
    const on = !!state.llm.effective;
    const head = $id('llm-state');
    head.className = 'badge badge--dot' + (on ? ' badge--green' : '');
    head.textContent = on ? '大模型已启用' : '大模型未启用';
    head.title = on ? `模型 ${state.llm.model || '—'}` : '在下方大模型设置中启用并保存 API Key';

    const st = $id('settings-status');
    st.className = 'badge badge--dot' + (on ? ' badge--green' : '');
    st.textContent = on ? '已启用' : (state.llm.configured ? '已配置未启用' : '未启用');
  }

  function fillSettingsForm() {
    const s = state.llm;
    $id('llm-enabled').setAttribute('aria-checked', String(s.enabled));
    $id('llm-model').value = s.model || '';
    $id('llm-base').value = s.baseUrl || '';
    $id('llm-temp').value = String(s.temperature);
    $id('llm-key').value = '';
    $id('llm-key').placeholder = s.configured ? '已保存 Key，留空表示不修改' : '粘贴 API Key';
    $id('llm-key-hint').textContent = s.configured
      ? `当前已保存 ${s.keyMask}，留空表示不修改；Key 仅保存在本地 data/db.json`
      : 'Key 仅保存在本地 data/db.json，不上传到其他服务';
    ['llm-model-hint', 'llm-base-hint', 'llm-temp-hint', 'llm-key-hint'].forEach((id) => {
      $id(id).style.color = '';
    });
  }

  function markFieldError(id, msg) {
    const input = $id(id);
    if (input) {
      input.classList.add('input--error');
      input.focus();
    }
    const hints = { 'llm-model': 'llm-model-hint', 'llm-base': 'llm-base-hint', 'llm-temp': 'llm-temp-hint', 'llm-key': 'llm-key-hint' };
    const hint = $id(hints[id] || '');
    if (hint) {
      hint.textContent = msg;
      hint.style.color = 'var(--red-700)';
    }
  }

  async function persistSettings() {
    const payload = {
      enabled: $id('llm-enabled').getAttribute('aria-checked') === 'true',
      baseUrl: $id('llm-base').value.trim(),
      model: $id('llm-model').value.trim(),
      temperature: Number($id('llm-temp').value),
    };
    const key = $id('llm-key').value.trim();

    if (!payload.model) { markFieldError('llm-model', '请填写模型名'); return false; }
    if (payload.baseUrl && !/^https?:\/\//i.test(payload.baseUrl)) { markFieldError('llm-base', 'Base URL 需以 http 或 https 开头'); return false; }
    if (!Number.isFinite(payload.temperature) || payload.temperature < 0 || payload.temperature > 1) {
      markFieldError('llm-temp', '温度需在 0 到 1 之间');
      return false;
    }
    if (key) payload.apiKey = key;
    if (payload.enabled && !key && !state.llm.configured) {
      markFieldError('llm-key', '启用前请先填写 API Key');
      return false;
    }

    try {
      await api('/api/settings', { method: 'POST', body: payload });
      const fresh = await api('/api/settings');
      state.formDirty = false;
      $id('llm-key').value = '';
      applySettings(fresh);
      renderSettingsStatus();
      return true;
    } catch (err) {
      toast((err && err.message) || '设置保存失败', 'error');
      return false;
    }
  }

  async function saveSettings(e) {
    if (e) e.preventDefault();
    const btn = $id('save-settings');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '保存中';
    const ok = await persistSettings();
    btn.disabled = false;
    btn.textContent = label;
    if (ok) toast('设置已保存');
  }

  async function testLLM() {
    const btn = $id('test-llm');
    const out = $id('test-result');
    btn.disabled = true;
    out.innerHTML = '<span class="caption-2 muted">正在保存配置并调用一次问答…</span>';
    const saved = await persistSettings();
    if (!saved) {
      out.innerHTML = '<span class="caption-2 muted">配置未保存，请先修正表单</span>';
      btn.disabled = false;
      return;
    }
    try {
      const res = await api('/api/agent/ask', { method: 'POST', body: { question: '你是谁' } });
      const hit = res && res.engine === 'llm';
      out.innerHTML = `<span class="badge badge--dot ${hit ? 'badge--green' : 'badge--amber'}">${hit ? '大模型已接通' : '回退本地引擎'}</span>
        <span class="caption-2 muted">engine ${esc((res && res.engine) || 'local')} · ${fmt.int((res && res.elapsed) || 0)} ms</span>`;
      toast(hit ? '大模型已接通' : '回退本地引擎，检查 Key 与 Base URL', hit ? 'ok' : 'error');
    } catch (err) {
      out.innerHTML = `<span class="badge badge--dot badge--amber">回退本地引擎</span>
        <span class="caption-2 muted">${esc((err && err.message) || '调用失败')}</span>`;
      toast((err && err.message) || '测试连接失败', 'error');
    } finally {
      btn.disabled = false;
    }
  }
  function startAdmin() { init(); initAdminShell(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startAdmin);
  else startAdmin();
})();
