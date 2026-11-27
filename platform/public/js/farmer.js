/* 农户端工作台 · 数据装配与交互 */
'use strict';

/* ---------------- 常量 ---------------- */
const CHANNELS = ['朋友圈', '小红书', '详情页'];
const TYPE_KEYS = ['sow', 'fertilize', 'pesticide', 'irrigate', 'prune', 'harvest', 'process', 'store'];
const INTERVALS = [7, 14, 21, 30];
const VOICE_SAMPLE = '今天上午给 3 号梨园滴灌 40 分钟，用水约 12 吨，土壤湿度从 42% 升到 58%。';
const KEYWORDS = [['脆甜', 128], ['水分足', 96], ['个头均匀', 74], ['包装结实', 58], ['发货及时', 41], ['溯源码清晰', 37]];
const TITLE_HINT = {
  sow: '例如 定植梨苗 320 株',
  fertilize: '例如 施用腐熟羊粪 800kg/亩',
  pesticide: '例如 吡虫啉 20g/亩 兑水喷雾',
  irrigate: '例如 滴灌 40 分钟',
  prune: '例如 疏果与拉枝',
  harvest: '例如 头茬采收 3200kg',
  process: '例如 分选一级果 2600kg',
  store: '例如 入库冷库 C-03',
};
const METHOD_LABEL = { voice: '语音录入', photo: '拍照取证', scan: '扫码录入', manual: '手动录入' };

/* ---------------- 状态 ---------------- */
const copyMap = new Map();
let copySeq = 0;
let voiceRec = null;

const state = {
  farmerId: null,
  loading: true,
  errors: {},
  dashboard: null,
  batches: [],
  orders: [],
  product: null,
  trendMode: 'gmv',
  submitting: false,
  lastReceipt: null,
  form: {
    batchId: '',
    type: 'fertilize',
    title: '',
    detail: '',
    method: 'voice',
    regNo: '',
    interval: 21,
    at: '',
    photo: null,
    voiceText: '',
  },
  content: { productId: '', batchId: '', channel: '朋友圈', loading: false, data: null, error: '' },
};

/* ---------------- 小工具 ---------------- */
const el = (sel) => document.querySelector(sel);

function todayLabel() {
  const now = new Date();
  const week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()];
  return `${fmt.date(now)} ${week}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '凌晨好';
  if (h < 12) return '上午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function nowLocalInput() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function addDaysInput(days) {
  const d = addDays(new Date(), days);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function recordTypeLabel(type) {
  const d = DICT.record[type];
  return d ? d[0] : type || '农事';
}

function copyKey(text) {
  const key = 'cp' + (++copySeq);
  copyMap.set(key, String(text == null ? '' : text));
  return key;
}

function copyBtn(text, label) {
  const key = copyKey(text);
  const textLabel = label && label !== '复制' ? `<span>${esc(label)}</span>` : '';
  const aria = label ? (label.indexOf('复制') === 0 ? label : `复制${label}`) : '复制这段文字';
  return `<button class="btn btn--ghost btn--sm" type="button" data-action="copy" data-key="${key}" aria-label="${esc(aria)}">${icon('copy')}${textLabel}</button>`;
}

function errorBox(msg, scope) {
  return `<div class="callout callout--red">${icon('alert')}<div class="stack gap-75">
    <p class="body-5">${esc(msg || '请求失败，请稍后再试')}</p>
    <p class="body-6">服务暂时没有返回数据，已加载的内容不受影响，可以重试。</p>
    <div><button class="btn btn--secondary btn--sm" type="button" data-action="retry" data-scope="${esc(scope || 'all')}">${icon('refresh')}重试</button></div>
  </div></div>`;
}

function tableSkeleton(rows, cols) {
  return `<div class="table-wrap"><table class="table"><tbody>${Array.from({ length: rows || 2 }).map(() => `<tr>${Array.from({ length: cols || 6 }).map(() => '<td><div class="skeleton skeleton--text" style="width:80%"></div></td>').join('')}</tr>`).join('')}</tbody></table></div>`;
}

function scrollToSection(sel) {
  const node = el(sel);
  if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- 数据加载 ---------------- */
function resetForFarmer() {
  const firstBatch = state.batches[0];
  const firstProduct = (state.dashboard && state.dashboard.products && state.dashboard.products[0]) || null;
  if (state.form.photo && state.form.photo.url) URL.revokeObjectURL(state.form.photo.url);
  state.form = {
    batchId: firstBatch ? firstBatch.id : '',
    type: 'fertilize',
    title: '',
    detail: '',
    method: 'voice',
    regNo: '',
    interval: 21,
    at: nowLocalInput(),
    photo: null,
    voiceText: '',
  };
  state.lastReceipt = null;
  state.content = {
    productId: firstProduct ? firstProduct.id : '',
    batchId: firstBatch ? firstBatch.id : '',
    channel: '朋友圈',
    loading: false,
    data: null,
    error: '',
  };
}

async function loadAll() {
  const id = state.farmerId;
  state.loading = true;
  state.errors = {};
  renderHero();
  renderKpi();
  renderTodos();
  renderBatches();
  renderRecords();
  renderContentForm();
  renderContentResult();
  renderOrders();
  renderInsight();

  const [dashRes, batchRes, orderRes] = await Promise.allSettled([
    api('/api/farmer/me/dashboard'),
    api('/api/farmer/me/batches'),
    api('/api/orders'),
  ]);
  if (id !== state.farmerId) return;

  if (dashRes.status === 'fulfilled') {
    state.dashboard = dashRes.value;
  } else {
    state.dashboard = null;
    state.errors.dashboard = (dashRes.reason && dashRes.reason.message) || '概览数据加载失败';
  }

  if (batchRes.status === 'fulfilled') {
    state.batches = (batchRes.value && batchRes.value.items) || [];
  } else {
    state.batches = [];
    state.errors.batches = (batchRes.reason && batchRes.reason.message) || '批次数据加载失败';
  }

  if (orderRes.status === 'fulfilled') {
    state.orders = (orderRes.value && orderRes.value.items) || [];
  } else {
    state.orders = [];
    state.errors.orders = (orderRes.reason && orderRes.reason.message) || '订单数据加载失败';
  }

  state.product = null;
  const products = (state.dashboard && state.dashboard.products) || [];
  if (products[0]) {
    try {
      state.product = await api(`/api/products/${encodeURIComponent(products[0].id)}`);
    } catch (e) {
      state.product = null;
    }
  }
  if (id !== state.farmerId) return;

  resetForFarmer();
  state.loading = false;
  renderAll();

  const firstError = Object.keys(state.errors).map((k) => state.errors[k])[0];
  if (firstError) toast(firstError, 'error');
  if (state.content.productId) generateContent();
}

async function refreshBatches() {
  try {
    const res = await api('/api/farmer/me/batches');
    state.batches = (res && res.items) || [];
    delete state.errors.batches;
    renderBatches();
    return true;
  } catch (err) {
    toast((err && err.message) || '批次刷新失败', 'error');
    return false;
  }
}

async function refreshDashboardQuiet() {
  try {
    const dash = await api('/api/farmer/me/dashboard');
    state.dashboard = dash;
    delete state.errors.dashboard;
    renderHero();
    renderKpi();
    renderTodos();
  } catch (e) {
    /* 静默失败，界面保留旧数据 */
  }
}

function renderAll() {
  renderHero();
  renderKpi();
  renderTodos();
  renderBatches();
  renderRecords();
  renderContentForm();
  renderContentResult();
  renderOrders();
  renderInsight();
  observeReveal();
}

/* ---------------- 顶部身份卡 ---------------- */
function renderHero() {
  const host = el('#hero');
  if (!host) return;
  const f = (state.dashboard && state.dashboard.farmer) || { id: state.farmerId || '', name: '农户', org: '农户工作台', role: '' };
  const loaded = !!state.dashboard;
  const todos = (state.dashboard && state.dashboard.todos) || [];
  const recordTodo = todos.find((t) => t.key === 'records');
  const err = state.errors.dashboard;
  const meta = [todayLabel(), f.org, f.role, loaded && f.acreage ? `${f.acreage} 亩` : ''].filter(Boolean);
  const certs = loaded && Array.isArray(f.certs) ? f.certs.slice(0, 3) : [];
  const welcome = err
    ? '今日数据暂时没有同步'
    : recordTodo
      ? `今天有 ${fmt.int(recordTodo.count)} 条农事记录待补`
      : '今天的农事，记一条就多一分可信';

  host.innerHTML = `
    <div class="hero__main">
      <span class="eyebrow">农户工作台</span>
      <div class="row gap-200 mt-200">
        <span class="avatar avatar--lg">${esc(String(f.name || '农').slice(0, 1))}</span>
        <div class="stack gap-50">
          <h1 class="heading-3" id="hero-title">${esc(f.name || '农户')}，${greeting()}</h1>
          <p class="body-6 muted">${esc(meta.join(' · '))}</p>
        </div>
      </div>
      <div class="row wrap gap-75 mt-200">
        ${certs.map((c) => `<span class="badge badge--green">${icon('seal')}${esc(c)}</span>`).join('')}
        ${loaded
          ? `<span class="badge">${icon('pin')}${esc(f.region ? `${f.region.county}${f.region.village}` : '产地')}</span>`
          : `<span class="badge">${icon('refresh')}正在同步</span>`}
      </div>
    </div>
    <div class="hero__side">
      <p class="body-5">${esc(welcome)}</p>
      <p class="caption-2 muted">记录越完整，溯源码越有说服力</p>
      <div class="row gap-100 wrap">
        <button class="btn btn--primary btn--lg" type="button" data-action="scan-cta">${icon('scan')}扫一扫记录</button>
        <button class="btn btn--secondary" type="button" data-action="refresh">${icon('refresh')}刷新</button>
      </div>
    </div>
    <hr class="divider hero__rule">
    <div class="hero__switch">
      <span class="badge ${err ? 'badge--amber' : 'badge--green'}">${icon(err ? 'alert' : 'shield')}${err ? '数据待重试' : '实名与地块已核验'}</span>
    </div>`;
}

/* ---------------- KPI ---------------- */
function kpiCard(c) {
  return `<div class="card card--pad card--hover kpi">
    <div class="kpi__head"><span class="kpi__icon">${icon(c.icon)}</span><span class="caption-4 muted">${esc(c.label)}</span></div>
    <p class="stat__value">${esc(c.value)}</p>
    <p class="caption-2 muted">${esc(c.hint)}</p>
  </div>`;
}

function renderKpi() {
  const host = el('#kpi-body');
  if (!host) return;
  const updated = el('[data-updated]');
  if (state.loading) {
    host.innerHTML = `<div class="kpi-grid">${Array.from({ length: 4 }).map(() => `<div class="card card--pad kpi"><div class="skeleton skeleton--text" style="width:45%"></div><div class="skeleton skeleton--stat"></div><div class="skeleton skeleton--text" style="width:75%"></div></div>`).join('')}</div>`;
    if (updated) updated.textContent = '正在同步';
    return;
  }
  if (state.errors.dashboard || !state.dashboard) {
    host.innerHTML = errorBox(state.errors.dashboard || '概览数据不可用', 'dash');
    if (updated) updated.textContent = '同步失败';
    return;
  }
  const k = state.dashboard.kpis || {};
  const products = state.dashboard.products || [];
  const p0 = products[0];
  const orders = state.orders || [];
  const rating = Number(k.rating);
  const goodRate = Number.isFinite(rating) ? Math.round((rating / 5) * 1000) / 10 : null;
  const cards = [
    { icon: 'coins', label: '近 7 日成交额', value: fmt.money(k.gmv), hint: `日均 ${fmt.money(k.gmv / 7)}` },
    { icon: 'receipt', label: '订单数', value: `${fmt.int(k.orders)} 笔`, hint: `客单价 ${fmt.money(k.gmv / (k.orders || 1))} · 明细 ${fmt.int(k.sampleOrders != null ? k.sampleOrders : orders.length)} 笔` },
    { icon: 'users', label: '复购率', value: fmt.pct(k.repurchase), hint: '近 90 天重复购买用户占比' },
    { icon: 'star', label: '好评率', value: goodRate == null ? '—' : fmt.pct(goodRate), hint: `评分 ${rating} / 5${p0 ? ` · ${fmt.int(p0.ratingCount)} 条评价` : ''}` },
  ];
  const verified = state.batches.filter((b) => b.verified).length;
  const chainText = state.batches.length ? `${fmt.int(verified)} / ${fmt.int(state.batches.length)} 个批次通过` : '等待批次数据';
  host.innerHTML = `
    <div class="kpi-grid">${cards.map(kpiCard).join('')}</div>
    <div class="card card--soft card--pad mt-200">
      <div class="strip">
        <div class="strip__item"><span class="caption-2 muted">地头结算收入</span><span class="body-1">${fmt.money(k.income)}</span></div>
        <div class="strip__item"><span class="caption-2 muted">在管批次与记录</span><span class="body-1">${fmt.int(k.batches)} 个 · ${fmt.int(k.records)} 条</span></div>
        <div class="strip__item"><span class="caption-2 muted">链上校验</span><span class="body-1">${chainText}</span></div>
        <div class="strip__item"><span class="caption-2 muted">待处理预警</span><span class="body-1">${fmt.int(k.pending)} 条</span></div>
      </div>
    </div>`;
  if (updated) updated.textContent = `更新于 ${fmt.date(new Date(), true)}`;
}

/* ---------------- 待办 ---------------- */
function renderTodos() {
  const host = el('#todos-body');
  if (!host) return;
  if (state.loading) {
    host.innerHTML = `<div class="todo-grid">${skeletonCards(3, 'skeleton--card')}</div>`;
    return;
  }
  if (state.errors.dashboard || !state.dashboard) {
    host.innerHTML = errorBox(state.errors.dashboard || '待办数据不可用', 'dash');
    return;
  }
  const todos = state.dashboard.todos || [];
  if (!todos.length) {
    host.innerHTML = emptyState('今天没有待办', '农事记录与发货都已完成，可以去看经营数据', 'check');
    return;
  }
  host.innerHTML = `<div class="todo-grid">${todos.map((t) => {
    const count = Number(t.count) || 0;
    return `<div class="card card--pad todo ${count ? '' : 'todo--zero'}">
      <div class="row between gap-100">
        <span class="badge ${count ? 'badge--amber' : 'badge--green'}">${icon(count ? 'clock' : 'check')}${count ? '待处理' : '已完成'}</span>
        <span class="todo__num"><span class="stat__value stat__value--sm">${fmt.int(count)}</span><span class="caption-2 muted">条</span></span>
      </div>
      <div class="stack gap-50">
        <p class="title-2">${esc(t.title)}</p>
        <p class="body-6 muted">${esc(t.desc)}</p>
      </div>
      <div><button class="btn btn--secondary btn--sm" type="button" data-action="todo" data-key="${esc(t.key)}">去处理${icon('arrowRight')}</button></div>
    </div>`;
  }).join('')}</div>`;
}

/* ---------------- 批次与赋码 ---------------- */
function batchRow(b) {
  const last = b.lastRecord;
  const days = Number(b.daysToHarvest);
  const harvestHint = Number.isFinite(days) ? (days < 0 ? `已采收 ${fmt.int(Math.abs(days))} 天` : `距采收 ${fmt.int(days)} 天`) : '';
  const verify = b.verified
    ? '<span class="badge badge--green badge--dot">链上校验通过</span>'
    : '<span class="badge badge--amber badge--dot">待复核</span>';
  const height = last && last.height ? `区块 #${fmt.int(last.height)}` : '尚无区块';
  return `<tr data-batch-row="${b.id}">
    <td data-label="批次码"><div class="cell-strong"><span class="mono body-5">${esc(b.code)}</span><span class="caption-5 muted">${esc(b.product ? b.product.name : '')}</span></div></td>
    <td data-label="地块"><div class="cell-strong"><span class="body-5">${esc(b.plot)}</span><span class="caption-5 muted">${esc(b.area)} · ${fmt.int(b.qty)} ${esc(b.unit || 'kg')}</span></div></td>
    <td data-label="采收日"><div class="cell-strong"><span class="body-5">${fmt.date(b.harvestedAt)}</span><span class="caption-5 muted">${harvestHint}</span></div></td>
    <td data-label="记录数"><div class="cell-strong"><span class="body-5">${fmt.int(b.recordCount)} 条</span><span class="caption-5 muted">${last ? `${esc(recordTypeLabel(last.type))} · ${fmt.date(last.at)}` : '暂无记录'}</span></div></td>
    <td data-label="校验状态"><div class="cell-strong">${verify}<span class="caption-5 muted">${height}</span></div></td>
    <td data-label="操作"><div class="cell-actions">
      <button class="btn btn--secondary btn--sm" type="button" data-action="fill-record" data-batch="${b.id}">${icon('clipboard')}补记录</button>
      <a class="btn btn--ghost btn--sm" href="/trace.html?code=${encodeURIComponent(b.code)}" target="_blank" rel="noopener">${icon('shield')}看溯源</a>
      <button class="btn btn--ghost btn--sm" type="button" data-action="copy" data-copy="${esc(b.code)}">${icon('copy')}复制码</button>
    </div></td>
  </tr>`;
}

function renderBatches() {
  const host = el('#batches-body');
  if (!host) return;
  const products = (state.dashboard && state.dashboard.products) || [];
  const selling = products.filter((p) => p.status === 'on');
  const batchBtn = document.querySelector('[data-action="new-batch"]');
  if (batchBtn) batchBtn.hidden = !selling.length;
  if (state.loading) {
    host.innerHTML = tableSkeleton(2, 6);
    return;
  }
  if (state.errors.batches) {
    host.innerHTML = errorBox(state.errors.batches, 'batches');
    return;
  }
  const strip = products.length
    ? `<div class="row wrap gap-75" style="margin-bottom:var(--s-200)">${products.map((p) => {
      const d = (DICT.product[p.status] || [p.status, 'neutral']);
      const edit = p.status === 'rejected'
        ? `<button class="btn btn--ghost btn--sm" type="button" data-action="edit-product" data-product="${esc(p.id)}">修改重提</button>`
        : '';
      return `<span class="row gap-50"><span class="badge badge--${d[1]}"${p.reviewNote ? ` title="${esc(p.reviewNote)}"` : ''}>${esc(p.name)} · ${esc(d[0])}</span>${edit}</span>`;
    }).join('')}</div>`
    : '';
  if (!state.batches.length) {
    if (!products.length) {
      host.innerHTML = emptyState('还没有商品', '先创建商品并提交平台审核，审核通过后才能建批次、赋溯源码', 'box', `<button class="btn btn--primary mt-200" type="button" data-action="new-product">${icon('plus')}新建商品</button>`);
      return;
    }
    if (!selling.length) {
      host.innerHTML = `${strip}${emptyState('商品审核中', '平台审核通过后，就可以为商品建批次、赋溯源码', 'clock', `<button class="btn btn--secondary mt-200" type="button" data-action="new-product">${icon('plus')}再建一个商品</button>`)}`;
      return;
    }
    host.innerHTML = `${strip}${emptyState('还没有批次', '新建批次并录入第一条农事记录后，系统会生成溯源码', 'box', `<button class="btn btn--primary mt-200" type="button" data-action="new-batch">${icon('plus')}新建批次</button>`)}`;
    return;
  }
  host.innerHTML = `${strip}<div class="table-wrap"><table class="table table--stack">
    <thead><tr><th scope="col">批次码</th><th scope="col">地块</th><th scope="col">采收日</th><th scope="col">记录数</th><th scope="col">校验状态</th><th scope="col">操作</th></tr></thead>
    <tbody>${state.batches.map(batchRow).join('')}</tbody>
  </table></div>`;
}

/* ---------------- 农事记录 ---------------- */
function typeChips() {
  return TYPE_KEYS.map((k) => {
    const d = DICT.record[k];
    return `<button class="chip caption-1" type="button" data-action="type" data-type="${k}" aria-pressed="${state.form.type === k}">${icon(d[1])}${esc(d[0])}</button>`;
  }).join('');
}

function receiptHtml() {
  const r = state.lastReceipt;
  if (!r) return '';
  return `<div class="receipt mt-300">
    <span class="receipt__icon">${icon('link')}</span>
    <div class="stack gap-50">
      <p class="body-4">已上链，交易 <span class="mono hash">${esc(r.tx || '待生成')}</span></p>
      <p class="body-6 muted">${esc(r.title)} · 批次 ${esc(r.code)} · ${fmt.date(r.at, true)}${r.height ? ` · 区块高度 ${fmt.int(r.height)}` : ''}</p>
      <div class="row wrap gap-75 mt-100">
        <button class="btn btn--ghost btn--sm" type="button" data-action="copy" data-copy="${esc(r.tx || r.code)}">${icon('copy')}复制交易号</button>
        <a class="btn btn--ghost btn--sm" href="/trace.html?code=${encodeURIComponent(r.code)}" target="_blank" rel="noopener">${icon('external')}查看溯源</a>
      </div>
    </div>
  </div>`;
}

function chainCard() {
  const last = state.batches
    .filter((b) => b.lastRecord)
    .map((b) => Object.assign({}, b.lastRecord, { code: b.code }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
  return `<div class="card card--pad">
    <div class="row between gap-100"><h3 class="title-3">最近上链</h3><span class="badge badge--green">${icon('link')}哈希存证</span></div>
    ${last ? `<div class="stack gap-75 mt-200">
      <p class="body-4">${esc(last.title)}</p>
      <p class="body-6 muted">${esc(recordTypeLabel(last.type))} · 批次 ${esc(last.code)} · ${fmt.date(last.at, true)}</p>
      <p class="caption-2 mono hash">${esc(last.tx || '')}</p>
      <div class="row between gap-100">
        <span class="caption-2 muted">区块高度 ${fmt.int(last.height || 0)}</span>
        <a class="btn btn--ghost btn--sm" href="/trace.html?code=${encodeURIComponent(last.code)}" target="_blank" rel="noopener">${icon('external')}查看</a>
      </div>
    </div>` : '<p class="body-6 muted mt-200">这个农户还没有上链记录。</p>'}
  </div>`;
}

function tipsCard() {
  const items = [
    '语音适合边走边记，识别完成后补一句用量更完整。',
    '照片只在本页预览，提交时以文件名与拍摄时间作为凭证摘要。',
    '用药记录必须填写登记证号，系统按标签间隔期校验采收日。',
  ];
  return `<div class="card card--soft card--pad">
    <h3 class="title-3">录入提示</h3>
    <div class="side-tips mt-200">${items.map((t) => `<div class="side-tips__item">${icon('check')}<p class="body-6 muted">${esc(t)}</p></div>`).join('')}</div>
  </div>`;
}

function tabButton(key, label) {
  const on = state.form.method === key;
  return `<button type="button" role="tab" id="tab-${key}" aria-controls="panel-${key}" aria-selected="${on}" tabindex="${on ? 0 : -1}" data-action="tab" data-tab="${key}">${label}</button>`;
}

function renderRecords() {
  const host = el('#records-body');
  if (!host) return;
  if (state.loading) {
    host.innerHTML = `<div class="record-grid">${skeletonCards(1, 'skeleton--card')}${skeletonCards(1, 'skeleton--card')}</div>`;
    return;
  }
  if (state.errors.batches) {
    host.innerHTML = errorBox(state.errors.batches, 'batches');
    return;
  }
  if (!state.batches.length) {
    host.innerHTML = emptyState('先建一个批次', '农事记录要挂在批次上，建好批次后就能开始录入', 'sprout', `<button class="btn btn--primary mt-200" type="button" data-action="new-batch">${icon('plus')}新建批次</button>`);
    return;
  }
  const f = state.form;
  if (!state.batches.some((b) => b.id === f.batchId)) f.batchId = state.batches[0].id;
  const voiceHidden = f.method === 'voice' ? '' : 'hidden';
  const photoHidden = f.method === 'photo' ? '' : 'hidden';
  const scanHidden = f.method === 'scan' ? '' : 'hidden';

  host.innerHTML = `<div class="record-grid">
    <div class="card card--pad">
      <form id="record-form" novalidate>
        <div class="form-grid">
          <div class="field">
            <label class="field__label" for="f-batch">批次</label>
            <select class="select" id="f-batch">${state.batches.map((x) => `<option value="${x.id}" ${x.id === f.batchId ? 'selected' : ''}>${esc(x.code)} · ${esc(x.plot)}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label class="field__label" for="f-at">记录时间</label>
            <input class="input" id="f-at" type="datetime-local" value="${esc(f.at)}">
          </div>
        </div>

        <div class="field mt-200">
          <span class="field__label">记录类型</span>
          <div class="chips" role="group" aria-label="记录类型">${typeChips()}</div>
        </div>

        <div class="field mt-200">
          <label class="field__label" for="f-title">标题</label>
          <input class="input" id="f-title" maxlength="40" autocomplete="off" placeholder="${esc(TITLE_HINT[f.type] || '例如 滴灌 40 分钟')}" value="${esc(f.title)}">
        </div>

        <div class="field mt-200">
          <label class="field__label" for="f-detail">详情</label>
          <textarea class="textarea" id="f-detail" placeholder="写清做法、用量、天气或现场情况，越具体越经得起核对">${esc(f.detail)}</textarea>
        </div>

        <div id="pest-block"></div>

        <div class="tabs mt-300" role="tablist" aria-label="录入方式">
          ${tabButton('voice', '语音录入')}
          ${tabButton('photo', '拍照取证')}
          ${tabButton('scan', '扫码录入')}
        </div>

        <div class="tabpanel mt-200" id="panel-voice" role="tabpanel" aria-labelledby="tab-voice" ${voiceHidden}>
          <div class="voice">
            <div class="row between wrap gap-100">
              <p class="body-5">说一句现场情况，自动转成文字填进详情</p>
              <button class="btn btn--secondary btn--sm" type="button" data-action="voice" id="voice-btn">${icon('mic')}<span>开始说话</span></button>
            </div>
            <div class="voice__box body-6" id="voice-box"></div>
            <p class="caption-2 muted">识别语言为普通话，说完点停止，文字会写进详情。</p>
          </div>
        </div>

        <div class="tabpanel mt-200" id="panel-photo" role="tabpanel" aria-labelledby="tab-photo" ${photoHidden}>
          <div class="voice">
            <div class="photo-row">
              <label class="file-pick body-5" for="f-photo">${icon('camera')}选择照片<input type="file" id="f-photo" accept="image/*"></label>
              <div id="photo-slot"></div>
            </div>
            <p class="caption-2 muted">照片只在本地预览，不上传服务器，提交时记录文件名与拍摄时间作为凭证。</p>
          </div>
        </div>

        <div class="tabpanel mt-200" id="panel-scan" role="tabpanel" aria-labelledby="tab-scan" ${scanHidden}>
          <div class="voice">
            <div class="form-grid">
              <div class="field">
                <label class="field__label" for="f-reg">农药登记证号</label>
                <div class="scan-row">
                  <input class="input mono" id="f-reg" placeholder="例如 PD20181123" autocomplete="off" value="${esc(f.regNo)}">
                  <button class="btn btn--secondary" type="button" data-action="fake-scan">${icon('scan')}模拟扫码</button>
                </div>
                <span class="field__hint">扫农药瓶身二维码，自动带出登记证号与标签间隔期</span>
              </div>
              <div class="field">
                <label class="field__label" for="f-interval">安全间隔期</label>
                <select class="select" id="f-interval">${INTERVALS.map((n) => `<option value="${n}" ${Number(f.interval) === n ? 'selected' : ''}>${n} 天</option>`).join('')}</select>
                <span class="field__hint">以农药标签标注为准，果树一般 14 至 30 天</span>
              </div>
            </div>
          </div>
        </div>

        <div id="form-error"></div>

        <div class="row between wrap gap-100 mt-300">
          <p class="caption-2 muted" style="max-width:360px">记录写入后不可删除，只能追加更正，请核对操作人、用量与时间。</p>
          <button class="btn btn--primary" type="submit" id="record-submit">${icon('link')}提交并上链</button>
        </div>
      </form>
      <div id="receipt-slot">${receiptHtml()}</div>
    </div>
    <div class="stack gap-200">${chainCard()}${tipsCard()}</div>
  </div>`;

  renderPestBlock();
  renderPhotoPreview();
  renderVoiceBox();
}

function renderPestBlock() {
  const host = el('#pest-block');
  if (!host) return;
  host.innerHTML = state.form.type === 'pesticide' ? pestCallout() : '';
}

function pestCallout() {
  const f = state.form;
  const b = state.batches.find((x) => x.id === f.batchId);
  const n = Number(f.interval) || 21;
  const applied = f.at ? new Date(f.at) : new Date();
  const earliest = addDays(applied, n);
  const harvest = b ? new Date(b.harvestedAt) : null;
  const gap = harvest ? Math.round((harvest.getTime() - applied.getTime()) / 86400000) : null;
  const ok = harvest ? harvest.getTime() >= earliest.getTime() : false;
  let msg;
  if (!b) msg = '选择批次后自动校验采收日。';
  else if (!Number.isFinite(gap)) msg = '批次采收日缺失，请先补齐批次资料。';
  else if (gap < 0) msg = `记录时间晚于该批次采收日 ${fmt.int(Math.abs(gap))} 天，请确认是否应该记录下一个批次。`;
  else if (ok) msg = `该批次采收日为 ${fmt.date(harvest)}，距记录时间 ${fmt.int(gap)} 天，满足 ${n} 天间隔期。`;
  else msg = `该批次采收日为 ${fmt.date(harvest)}，距记录时间 ${fmt.int(gap)} 天，少于 ${n} 天间隔期。请核实用药时间，必要时暂缓该批次发货。`;
  return `<div class="callout ${ok ? '' : 'callout--amber'} mt-300">${icon(ok ? 'shield' : 'alert')}
    <div class="stack gap-50">
      <p class="body-5">安全间隔期与采收日校验</p>
      <p class="body-6">按记录时间 ${fmt.date(applied, true)} 与间隔期 ${n} 天推算，最早可采收 ${fmt.date(earliest)}。${msg}</p>
      ${ok ? '' : '<p class="body-6">间隔期不足的记录仍可提交，平台会在溯源页标注，并由合作社复核。</p>'}
    </div></div>`;
}

function renderPhotoPreview() {
  const host = el('#photo-slot');
  if (!host) return;
  const p = state.form.photo;
  if (!p) {
    host.innerHTML = '<p class="caption-2 muted">还没有选择照片</p>';
    return;
  }
  host.innerHTML = `<div class="photo-row">
    <img class="thumb" src="${p.url}" alt="现场照片预览：${esc(p.name)}">
    <div class="stack gap-50">
      <p class="body-6">${esc(p.name)}</p>
      <p class="caption-2 muted">仅本地预览，不上传服务器</p>
      <div><button class="btn btn--ghost btn--sm" type="button" data-action="photo-remove">${icon('x')}移除照片</button></div>
    </div>
  </div>`;
}

function renderVoiceBox() {
  const box = el('#voice-box');
  if (!box) return;
  const text = state.form.voiceText;
  box.classList.toggle('is-live', !!text);
  box.textContent = text || '还没有语音输入，识别结果会显示在这里。';
}

function setTab(tab) {
  if (!['voice', 'photo', 'scan'].includes(tab)) return;
  state.form.method = tab;
  document.querySelectorAll('[data-action="tab"]').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  ['voice', 'photo', 'scan'].forEach((k) => {
    const panel = el(`#panel-${k}`);
    if (panel) panel.hidden = k !== tab;
  });
}

function updateTypeChips() {
  document.querySelectorAll('[data-action="type"]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.type === state.form.type));
  });
  const title = el('#f-title');
  if (title) title.placeholder = TITLE_HINT[state.form.type] || '例如 滴灌 40 分钟';
}

function useVoiceSample(message) {
  const sample = VOICE_SAMPLE;
  state.form.voiceText = sample;
  state.form.detail = state.form.detail.trim() ? `${state.form.detail.trim()} ${sample}` : sample;
  const ta = el('#f-detail');
  if (ta) {
    ta.value = state.form.detail;
    ta.focus({ preventScroll: true });
  }
  const box = el('#voice-box');
  if (box) {
    box.classList.add('is-live');
    box.textContent = sample;
  }
  toast(message || '当前浏览器不支持语音，已填入示例');
}

function resetVoiceButton(btn) {
  if (!btn) return;
  delete btn.dataset.listening;
  btn.innerHTML = `${icon('mic')}<span>开始说话</span>`;
}

function startVoice(btn) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (voiceRec) {
    try { voiceRec.stop(); } catch (e) { /* 忽略重复停止 */ }
    return;
  }
  if (!SR) {
    useVoiceSample();
    return;
  }
  let rec;
  try {
    rec = new SR();
  } catch (e) {
    useVoiceSample();
    return;
  }
  rec.lang = 'zh-CN';
  rec.interimResults = true;
  rec.continuous = true;
  rec.onstart = () => {
    voiceRec = rec;
    if (btn) {
      btn.dataset.listening = '1';
      btn.innerHTML = `${icon('mic')}<span>停止说话</span><span class="voice-wave" aria-hidden="true"><i></i><i></i><i></i></span>`;
    }
    const box = el('#voice-box');
    if (box) {
      box.classList.add('is-live');
      box.textContent = '正在听，请说一句现场情况';
    }
  };
  rec.onresult = (ev) => {
    let finalText = '';
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (finalText) {
      state.form.voiceText = `${state.form.voiceText} ${finalText}`.trim();
      state.form.detail = `${state.form.detail} ${finalText}`.trim();
      const ta = el('#f-detail');
      if (ta) ta.value = state.form.detail;
    }
    const box = el('#voice-box');
    if (box) {
      box.classList.toggle('is-live', !!(state.form.voiceText || interim));
      box.textContent = `${state.form.voiceText} ${interim}`.trim() || '正在听，请说一句现场情况';
    }
  };
  rec.onerror = (ev) => {
    const code = ev && ev.error;
    voiceRec = null;
    resetVoiceButton(btn);
    if (code === 'aborted' || code === 'no-speech') {
      toast('没有识别到语音，请再说一次', 'error');
      return;
    }
    useVoiceSample('麦克风不可用，已填入示例');
  };
  rec.onend = () => {
    voiceRec = null;
    resetVoiceButton(btn);
  };
  try {
    rec.start();
  } catch (e) {
    voiceRec = null;
    resetVoiceButton(btn);
    useVoiceSample();
  }
}

function fakeScan() {
  const sample = 'PD20181123';
  state.form.regNo = sample;
  state.form.interval = 21;
  const input = el('#f-reg');
  if (input) {
    input.value = sample;
    input.classList.remove('input--error');
  }
  const sel = el('#f-interval');
  if (sel) sel.value = '21';
  renderPestBlock();
  toast('已识别登记证号 PD20181123，标签间隔期 21 天');
}

function showFormError(list) {
  const host = el('#form-error');
  if (!host) return;
  if (!list || !list.length) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = `<div class="callout callout--red mt-200">${icon('alert')}<div class="stack gap-50">${list.map((m) => `<p class="body-6">${esc(m)}</p>`).join('')}</div></div>`;
}

async function submitRecord() {
  if (state.submitting) return;
  const f = state.form;
  const batch = state.batches.find((b) => b.id === f.batchId);
  const errors = [];
  if (!batch) errors.push('请选择一个批次。');
  if (!f.title.trim()) errors.push('请填写记录标题。');
  if (!f.detail.trim()) errors.push('请填写记录详情。');
  if (f.type === 'pesticide' && !f.regNo.trim()) errors.push('用药记录需要填写农药登记证号。');
  showFormError(errors);
  const titleInput = el('#f-title');
  const detailInput = el('#f-detail');
  if (titleInput) titleInput.classList.toggle('input--error', !f.title.trim());
  if (detailInput) detailInput.classList.toggle('input--error', !f.detail.trim());
  if (errors.length) {
    const first = !f.title.trim() ? titleInput : !f.detail.trim() ? detailInput : null;
    if (first) first.focus({ preventScroll: true });
    return;
  }

  const evidence = [];
  if (f.photo) evidence.push({ label: '现场照片', value: `${f.photo.name}（本地预览）` });
  if (f.regNo.trim()) evidence.push({ label: '农药登记证号', value: f.regNo.trim() });
  if (f.type === 'pesticide') evidence.push({ label: '安全间隔期', value: `${f.interval} 天` });
  if (f.voiceText) evidence.push({ label: '语音转写', value: f.voiceText.slice(0, 80) });
  evidence.push({ label: '录入方式', value: METHOD_LABEL[f.method] || '手动录入' });

  state.submitting = true;
  const btn = el('#record-submit');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `${icon('link')}正在上链`;
  }

  try {
    const at = f.at ? new Date(f.at) : new Date();
    const res = await api('/api/farmer/me/records', {
      method: 'POST',
      body: {
        batchId: batch.id,
        type: f.type,
        title: f.title.trim(),
        detail: f.detail.trim(),
        method: f.method,
        at: Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString(),
        evidence,
      },
    });
    const rec = (res && res.record) || {};
    state.lastReceipt = {
      tx: rec.tx || '',
      title: rec.title || f.title.trim(),
      at: rec.at || new Date().toISOString(),
      height: rec.height || 0,
      code: batch.code,
    };
    toast(rec.tx ? `已上链，交易 ${rec.tx}` : '记录已提交并写入批次档案');
    if (f.photo && f.photo.url) URL.revokeObjectURL(f.photo.url);
    state.form = {
      batchId: batch.id,
      type: f.type,
      title: '',
      detail: '',
      method: f.method,
      regNo: '',
      interval: f.interval,
      at: nowLocalInput(),
      photo: null,
      voiceText: '',
    };
    state.submitting = false;
    renderRecords();
    await refreshBatches();
    refreshDashboardQuiet();
  } catch (err) {
    state.submitting = false;
    const message = (err && err.message) || '提交失败，请稍后再试';
    showFormError([message]);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${icon('link')}提交并上链`;
    }
    toast(message, 'error');
  }
}

/* ---------------- AI 文案 ---------------- */
function renderContentForm() {
  const host = el('#content-form');
  if (!host) return;
  if (state.loading) {
    host.innerHTML = `<div class="card card--pad"><div class="skeleton skeleton--stat"></div><div class="skeleton skeleton--text" style="width:60%"></div></div>`;
    return;
  }
  const products = (state.dashboard && state.dashboard.products) || [];
  if (!products.length) {
    host.innerHTML = emptyState('没有可用的商品', '商品通过审核后才能生成文案', 'box');
    return;
  }
  let p = products.find((x) => x.id === state.content.productId);
  if (!p) {
    p = products[0];
    state.content.productId = p.id;
  }
  const batches = state.batches.filter((b) => b.productId === p.id);
  if (!batches.some((b) => b.id === state.content.batchId)) {
    state.content.batchId = batches[0] ? batches[0].id : '';
  }
  host.innerHTML = `<div class="card card--pad">
    <div class="row gap-200">
      <div class="ai-art">${productArt(p.art, { size: 80 })}</div>
      <div class="stack gap-50" style="min-width:0">
        <p class="title-3">${esc(p.name)}</p>
        <p class="caption-2 muted">${esc(p.category)} · ${esc(p.unit)} · ${esc(p.grade)}</p>
        <p class="caption-2 muted">${esc(p.spec || '')}</p>
      </div>
    </div>
    <div class="field mt-300">
      <label class="field__label" for="c-product">商品</label>
      <select class="select" id="c-product">${products.map((x) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
    </div>
    <div class="field mt-200">
      <label class="field__label" for="c-batch">批次</label>
      <select class="select" id="c-batch" ${batches.length ? '' : 'disabled'}>${batches.length ? batches.map((b) => `<option value="${b.id}" ${b.id === state.content.batchId ? 'selected' : ''}>${esc(b.code)} · ${esc(b.plot)}</option>`).join('') : '<option>暂无批次</option>'}</select>
    </div>
    <div class="field mt-200">
      <span class="field__label">发布渠道</span>
      <div class="segmented segmented--block" role="group" aria-label="发布渠道">
        ${CHANNELS.map((c) => `<button type="button" data-action="channel" data-channel="${esc(c)}" aria-pressed="${state.content.channel === c}">${esc(c)}</button>`).join('')}
      </div>
    </div>
    <button class="btn btn--primary btn--block mt-300" type="button" data-action="generate" ${state.content.loading ? 'disabled' : ''}>${icon('sparkle')}${state.content.loading ? '正在生成' : '生成文案'}</button>
    <p class="caption-2 muted mt-200">同一批次可切换渠道分别生成，生成结果可以逐条复制。</p>
  </div>`;
}

function renderContentResult() {
  const host = el('#content-result');
  if (!host) return;
  if (state.content.loading) {
    host.innerHTML = `<div class="card card--pad">
      <div class="skeleton skeleton--title"></div>
      <div class="skeleton skeleton--text"></div>
      <div class="skeleton skeleton--text" style="width:80%"></div>
      <div class="skeleton skeleton--stat mt-300"></div>
      <div class="skeleton skeleton--text"></div>
      <div class="skeleton skeleton--text" style="width:70%"></div>
      <div class="skeleton skeleton--stat mt-300"></div>
      <div class="skeleton skeleton--text"></div>
    </div>`;
    return;
  }
  if (state.content.error) {
    host.innerHTML = errorBox(state.content.error, 'content');
    return;
  }
  const d = state.content.data;
  if (!d) {
    host.innerHTML = emptyState('还没有生成文案', '选好商品、批次与渠道后点生成，标题、卖点、详情与 45 秒脚本会一起出来', 'sparkle');
    return;
  }
  const points = Array.isArray(d.points) ? d.points : [];
  const detail = Array.isArray(d.detail) ? d.detail : [];
  const script = Array.isArray(d.script) ? d.script : [];
  const hashtags = Array.isArray(d.hashtags) ? d.hashtags : [];
  const full = [
    d.title || '',
    '',
    '卖点',
    ...points.map((x) => `· ${x}`),
    '',
    ...detail.map((x) => `${x.h}\n${x.p}`),
    '',
    '45 秒脚本',
    ...script,
    '',
    hashtags.join(' '),
  ].join('\n');

  host.innerHTML = `<div class="card card--pad">
    <div class="row between wrap gap-100">
      <div class="row wrap gap-75"><span class="badge badge--blue">${icon('sparkle')}内容智能体</span><span class="badge">${esc((d.meta && d.meta.channel) || state.content.channel)}</span></div>
      ${copyBtn(full, '复制全文')}
    </div>

    <div class="ai-block mt-300">
      <div class="ai-block__head"><span class="caption-3 muted">标题</span>${copyBtn(d.title, '复制')}</div>
      <h3 class="title-2">${esc(d.title)}</h3>
    </div>

    <hr class="divider mt-300">

    <div class="ai-block mt-300">
      <div class="ai-block__head"><span class="caption-3 muted">卖点</span>${copyBtn(points.join('\n'), '复制')}</div>
      <ul class="stack gap-75">${points.map((x) => `<li class="point"><span class="point__tick">${icon('check')}</span><span class="body-6">${esc(x)}</span></li>`).join('')}</ul>
    </div>

    <hr class="divider mt-300">

    <div class="ai-block mt-300">
      <div class="ai-block__head"><span class="caption-3 muted">详情段落</span>${copyBtn(detail.map((x) => `${x.h}\n${x.p}`).join('\n\n'), '复制')}</div>
      <div class="stack gap-200">${detail.map((x) => `<div class="stack gap-50"><p class="body-4">${esc(x.h)}</p><p class="body-6 muted">${esc(x.p)}</p></div>`).join('')}</div>
    </div>

    <hr class="divider mt-300">

    <div class="ai-block mt-300">
      <div class="ai-block__head"><span class="caption-3 muted">45 秒脚本</span>${copyBtn(script.join('\n'), '复制')}</div>
      <ol class="script">${script.map((x, i) => `<li><span class="script__no caption-2">${String(i + 1).padStart(2, '0')}</span><span class="body-6">${esc(x)}</span></li>`).join('')}</ol>
    </div>

    <hr class="divider mt-300">

    <div class="ai-block mt-300">
      <div class="ai-block__head"><span class="caption-3 muted">话题标签</span>${copyBtn(hashtags.join(' '), '复制')}</div>
      <div class="chips">${hashtags.map((t) => `<button class="tag-btn caption-1" type="button" data-action="copy" data-key="${copyKey(t)}" aria-label="复制标签 ${esc(t)}">${esc(t)}</button>`).join('')}</div>
    </div>

    <div class="callout mt-300">${icon('shield')}<div class="stack gap-50">
      <p class="body-5">合规说明</p>
      <p class="body-6">${esc(d.compliance || '内容由智能体辅助生成，发布前请核对数据与承诺。')}</p>
      <p class="body-6">AI 辅助生成，农户已确认；不使用绝对化用语，不做功效承诺。</p>
    </div></div>
  </div>`;
}

async function generateContent() {
  const c = state.content;
  if (c.loading) return;
  if (!c.productId) {
    toast('请先选择商品', 'error');
    return;
  }
  c.loading = true;
  c.error = '';
  renderContentForm();
  renderContentResult();
  try {
    const data = await api('/api/agent/content', {
      method: 'POST',
      body: { productId: c.productId, batchId: c.batchId || undefined, channel: c.channel },
    });
    c.data = data;
  } catch (err) {
    c.data = null;
    c.error = (err && err.message) || '文案生成失败，请稍后再试';
  } finally {
    c.loading = false;
    renderContentForm();
    renderContentResult();
  }
}

/* ---------------- 订单与结算 ---------------- */
function orderRow(o) {
  const canShip = ['paid', 'packing'].includes(o.status);
  const product = o.product || {};
  const batch = o.batch || {};
  const shipBtn = canShip
    ? `<button class="btn btn--primary btn--sm" type="button" data-action="ship" data-order="${o.id}">${icon('truck')}发货</button>`
    : '<button class="btn btn--secondary btn--sm" type="button" disabled title="订单已出库">已发货</button>';
  return `<tr>
    <td data-label="订单号"><div class="cell-strong"><span class="mono body-5">${esc(o.no)}</span><span class="caption-5 muted">${esc(batch.code || '')}</span></div></td>
    <td data-label="商品"><div class="cell-strong"><span class="body-5">${esc(product.name || '')}</span><span class="caption-5 muted">${fmt.int(o.qty)} × ${fmt.money(o.unitPrice)}</span></div></td>
    <td data-label="金额" class="num"><span class="body-5">${fmt.money(o.amount)}</span></td>
    <td data-label="状态">${statusBadge('order', o.status)}</td>
    <td data-label="时间"><div class="cell-strong"><span class="body-6">${fmt.date(o.createdAt)}</span><span class="caption-5 muted">${fmt.rel(o.createdAt)}</span></div></td>
    <td data-label="操作"><div class="cell-actions">${shipBtn}<button class="btn btn--ghost btn--sm" type="button" data-action="logistics" data-order="${o.id}">${icon('truck')}查看物流</button></div></td>
  </tr>`;
}

function settlementCard() {
  const k = (state.dashboard && state.dashboard.kpis) || {};
  const income = Number(k.income) || 0;
  const feeRate = 1.5;
  const fee = (income * feeRate) / 100;
  const stdFee = (income * 3) / 100;
  const payout = income - fee;
  const breakdown = (state.product && state.product.priceBreakdown) || [];
  const price = state.product ? Number(state.product.price) || 0 : 0;
  return `<div class="card card--pad">
    <div class="row between gap-100"><h3 class="title-2">结算</h3><span class="badge badge--green">首年 1.5%</span></div>
    <div class="mt-300">
      <span class="caption-1 muted">可结算金额（T+1）</span>
      <p class="stat__value">${fmt.money(payout)}</p>
      <p class="caption-2 muted">已扣除平台服务费 ${fmt.money(fee)}</p>
    </div>
    <div class="mt-200">
      <div class="kv"><span class="kv__k">地头结算收入</span><span class="kv__v">${fmt.money(income)}</span></div>
      <div class="kv"><span class="kv__k">平台服务费（首年 1.5%）</span><span class="kv__v">${fmt.money(fee)}</span></div>
      <div class="kv"><span class="kv__k">标准费率 3% 参考</span><span class="kv__v">${fmt.money(stdFee)}</span></div>
      <div class="kv"><span class="kv__k">本次打款</span><span class="kv__v">${fmt.money(payout)}</span></div>
    </div>
    <div class="callout mt-300">${icon('clock')}<div class="stack gap-50">
      <p class="body-5">T+1 结算规则</p>
      <p class="body-6">买家签收且 7 天售后期结束后，次 1 个工作日打款到合作社账户，合作社按成员交售量二次分账。发生售后时先冻结争议金额，结案后随下一期结算。</p>
    </div></div>
    ${breakdown.length ? `<hr class="divider mt-300">
    <div class="mt-300">
      <p class="caption-3">分账说明（单件 ${fmt.money(price)} 拆解）</p>
      <div class="mt-100">${breakdown.map((x) => `<div class="kv"><span class="kv__k">${esc(x.label)}</span><span class="kv__v">${fmt.money(x.amount)}</span></div>`).join('')}</div>
      <p class="caption-2 muted mt-200">检测、赋码、冷链成本在结算单中逐项列明，农户可核对每一笔扣费。</p>
    </div>` : ''}
  </div>`;
}

function renderOrders() {
  const host = el('#orders-body');
  if (!host) return;
  if (state.loading) {
    host.innerHTML = `<div class="orders-grid">
      <div class="card card--pad">${tableSkeleton(2, 5)}</div>
      <div class="card card--pad"><div class="skeleton skeleton--stat"></div><div class="skeleton skeleton--text"></div><div class="skeleton skeleton--text" style="width:80%"></div></div>
    </div>`;
    return;
  }
  if (state.errors.orders) {
    host.innerHTML = errorBox(state.errors.orders, 'orders');
    return;
  }
  const orders = state.orders;
  const table = orders.length
    ? `<div class="card card--flush">
        <div class="card-head"><div class="row between wrap gap-100"><h3 class="title-2">订单</h3><span class="caption-2 muted">共 ${fmt.int(orders.length)} 笔</span></div></div>
        <hr class="divider">
        <div class="table-wrap flush-table"><table class="table table--stack">
          <thead><tr><th scope="col">订单号</th><th scope="col">商品</th><th scope="col">金额</th><th scope="col">状态</th><th scope="col">时间</th><th scope="col">操作</th></tr></thead>
          <tbody>${orders.map(orderRow).join('')}</tbody>
        </table></div>
      </div>`
    : `<div class="card card--pad">${emptyState('还没有订单', '买家下单后会出现在这里，发货与物流都在这里处理', 'bag')}</div>`;
  host.innerHTML = `<div class="orders-grid">${table}${settlementCard()}</div>`;
}

function openShipModal(order) {
  const body = `<div class="stack gap-200">
    <div class="callout">${icon('info')}<div><p class="body-5">订单 ${esc(order.no)} 已付款</p><p class="body-6">付款后需在 24 小时内出库，冷链订单优先安排当日揽收。</p></div></div>
    <div class="field">
      <label class="field__label" for="ship-carrier">承运商</label>
      <select class="select" id="ship-carrier"><option>顺丰冷运</option><option>京东冷链</option><option>中通冷链</option></select>
    </div>
    <div class="field">
      <label class="field__label" for="ship-time">预计揽收时间</label>
      <input class="input" id="ship-time" type="datetime-local" value="${esc(nowLocalInput())}">
    </div>
    <p class="caption-2 muted">确认后运单号自动回填，买家可在订单页查看冷链温度曲线。</p>
  </div>`;
  modal({
    title: '发货',
    body,
    actions: [
      { label: '取消' },
      { label: '确认发货', variant: 'btn--primary', onClick: () => { toast(`订单 ${order.no} 已提交发货，等待快递揽收`); return true; } },
    ],
  });
}

function openLogisticsModal(order) {
  const s = order.shipment;
  if (!s) {
    modal({ title: '物流轨迹', body: emptyState('暂无物流信息', '订单还没有生成运单，发货后会出现冷链轨迹', 'truck'), actions: [{ label: '关闭' }] });
    return;
  }
  const checkpoints = Array.isArray(s.checkpoints) ? s.checkpoints : [];
  const warnCount = checkpoints.filter((c) => c.status === 'warn').length;
  const body = `<div class="stack gap-200">
    <div class="row between wrap gap-100">
      <div class="stack gap-25"><p class="title-3">${esc(s.carrier)}</p><p class="caption-2 mono">${esc(s.waybill)}</p></div>
      <div>${copyBtn(s.waybill, '复制单号')}</div>
    </div>
    <div class="row wrap gap-75">
      <span class="badge">${icon('pin')}${esc(s.from)} 至 ${esc(s.to)}</span>
      <span class="badge badge--green">${icon('clock')}承诺 ${fmt.date(s.promisedAt)}</span>
      ${s.deliveredAt ? `<span class="badge badge--green">${icon('check')}签收 ${fmt.date(s.deliveredAt)}</span>` : ''}
    </div>
    ${warnCount ? `<div class="callout callout--amber">${icon('thermometer')}<div><p class="body-5">有 ${fmt.int(warnCount)} 个节点超出温区</p><p class="body-6">系统已通知发货方复检，买家可在订单页发起售后。</p></div></div>` : ''}
    <div class="timeline mt-200">${checkpoints.map((c) => `<div class="timeline__item">
      <div class="timeline__rail"><span class="timeline__dot ${c.status === 'ok' ? 'timeline__dot--done' : c.status === 'warn' ? 'timeline__dot--warn' : ''}">${icon(c.status === 'ok' ? 'check' : 'thermometer')}</span></div>
      <div class="timeline__body">
        <div class="timeline__meta"><span class="body-5">${esc(c.place)}</span>${c.status === 'warn' ? '<span class="badge badge--amber">超温</span>' : ''}</div>
        <p class="caption-2 muted">${fmt.date(c.at, true)} · ${fmt.temp(c.temp)}</p>
      </div>
    </div>`).join('')}</div>
  </div>`;
  modal({ title: '物流轨迹', body, actions: [{ label: '关闭' }] });
}

/* ---------------- 经营看板 ---------------- */
function categoryCard() {
  const map = new Map();
  state.batches.forEach((b) => {
    const key = (b.product && b.product.category) || '其他';
    map.set(key, (map.get(key) || 0) + (Number(b.qty) || 0));
  });
  const total = Array.from(map.values()).reduce((s, v) => s + v, 0) || 1;
  const rows = Array.from(map.entries())
    .map(([name, qty]) => ({ name, qty, pct: Math.round((qty / total) * 1000) / 10 }))
    .sort((a, b) => b.qty - a.qty);
  const top = rows[0];
  const sorted = state.batches.slice().sort((a, b) => Number(b.qty) - Number(a.qty));
  const maxQty = Math.max.apply(null, state.batches.map((b) => Number(b.qty) || 0).concat([1]));
  return `<div class="card card--pad">
    <div class="row between gap-100"><h3 class="title-2">品类占比</h3><span class="caption-2 muted">按出货重量</span></div>
    ${rows.length ? `<div class="row gap-300 mt-300" style="align-items:center;flex-wrap:wrap">
      ${donut(Math.round(top.pct), 104, '品类占比')}
      <div class="stack gap-100" style="flex:1;min-width:0">
        ${rows.map((r) => `<div class="legend-row">
          <div class="legend-row__top"><span class="body-5">${esc(r.name)}</span><span class="caption-1 muted">${fmt.pct(r.pct)}</span></div>
          <div class="meter"><div class="meter__fill" style="width:${r.pct}%"></div></div>
          <span class="caption-5 muted">${fmt.int(r.qty)} kg</span>
        </div>`).join('')}
      </div>
    </div>` : '<p class="body-6 muted mt-200">暂无批次数据。</p>'}
    <hr class="divider mt-300">
    <p class="caption-3 mt-300">批次出货重量</p>
    <div class="stack gap-100 mt-200">
      ${sorted.map((b) => `<div class="legend-row">
        <div class="legend-row__top"><span class="caption-1 mono">${esc(b.code)}</span><span class="caption-2 muted">${fmt.int(b.qty)} ${esc(b.unit || 'kg')}</span></div>
        <div class="meter"><div class="meter__fill" style="width:${Math.max(2, Math.round(((Number(b.qty) || 0) / maxQty) * 100))}%"></div></div>
      </div>`).join('')}
    </div>
  </div>`;
}

function keywordCard() {
  const k = (state.dashboard && state.dashboard.kpis) || {};
  const rating = Number(k.rating);
  const goodRate = Number.isFinite(rating) ? Math.round((rating / 5) * 1000) / 10 : null;
  const realTags = [];
  (state.orders || []).forEach((o) => {
    if (o.review && Array.isArray(o.review.tags)) {
      o.review.tags.forEach((t) => { if (!realTags.includes(t)) realTags.push(t); });
    }
  });
  const ordered = realTags.map((t) => KEYWORDS.find((x) => x[0] === t) || [t, 1]);
  const list = ordered.concat(KEYWORDS.filter((x) => !realTags.includes(x[0]))).slice(0, 6);
  const revOrder = (state.orders || []).find((o) => o.review);
  const rev = revOrder ? revOrder.review : null;
  return `<div class="card card--pad">
    <div class="row between gap-100"><h3 class="title-2">评价关键词</h3><span class="badge badge--green">好评率 ${goodRate == null ? '—' : fmt.pct(goodRate)}</span></div>
    <div class="chips mt-200">${list.map(([w, c]) => `<span class="kw"><span class="caption-1">${esc(w)}</span><span class="caption-3 muted">${fmt.int(c)}</span></span>`).join('')}</div>
    ${rev ? `<hr class="divider mt-300"><div class="mt-300">
      <p class="body-6">${'“'}${esc(rev.text)}${'”'}</p>
      <p class="caption-2 muted mt-100">${esc(rev.user || '匿名买家')} · ${fmt.date(rev.at)} · 评分 ${rev.rating} / 5</p>
    </div>` : ''}
    <p class="caption-2 muted mt-200">关键词来自近 90 天已签收订单的评价，按出现次数排序。</p>
  </div>`;
}

function renderInsight() {
  const host = el('#insight-body');
  if (!host) return;
  if (state.loading) {
    host.innerHTML = `<div class="insight-grid">${skeletonCards(1, 'skeleton--card')}<div class="stack gap-200">${skeletonCards(2, 'skeleton--card')}</div></div>`;
    return;
  }
  if (state.errors.dashboard || !state.dashboard) {
    host.innerHTML = errorBox(state.errors.dashboard || '看板数据不可用', 'dash');
    return;
  }
  const trend = state.dashboard.trend || [];
  if (!trend.length) {
    host.innerHTML = emptyState('暂无趋势数据', '有订单或扫码数据后，这里会显示近 7 日走势', 'chart');
    return;
  }
  const mode = state.trendMode;
  const isOrders = mode === 'orders';
  const labels = trend.map((x) => x.label);
  const chart = isOrders
    ? barChart(trend.map((x) => ({ label: x.label, value: x.orders })), { height: 240 })
    : lineChart(labels, [{ values: trend.map((x) => x.gmv), color: 'var(--green-600)' }], { height: 240 });
  const sum = trend.reduce((s, x) => s + (isOrders ? x.orders : x.gmv), 0);
  const peak = trend.reduce((m, x) => ((isOrders ? x.orders : x.gmv) > (isOrders ? m.orders : m.gmv) ? x : m), trend[0]);
  const stats = isOrders
    ? [['7 日订单合计', `${fmt.int(sum)} 单`], ['日均订单', `${fmt.int(Math.round(sum / trend.length))} 单`], ['最高单日', `${peak.label} · ${fmt.int(peak.orders)} 单`]]
    : [['7 日成交合计', fmt.money(sum)], ['日均成交', fmt.money(sum / trend.length)], ['最高单日', `${peak.label} · ${fmt.money(peak.gmv)}`]];
  host.innerHTML = `<div class="insight-grid">
    <div class="card card--pad">
      <div class="row between wrap gap-100">
        <div><h3 class="title-2">近 7 日经营趋势</h3><p class="caption-2 muted">按自然日汇总，含退款扣减</p></div>
        <div class="segmented" role="group" aria-label="趋势口径">
          <button type="button" data-action="trend" data-mode="gmv" aria-pressed="${!isOrders}">成交额</button>
          <button type="button" data-action="trend" data-mode="orders" aria-pressed="${isOrders}">订单量</button>
        </div>
      </div>
      <div class="chart">${chart}</div>
      <div class="grid grid--3 mt-300">${stats.map((s) => `<div class="stack gap-25"><span class="caption-2 muted">${esc(s[0])}</span><span class="body-4">${esc(s[1])}</span></div>`).join('')}</div>
    </div>
    <div class="stack gap-200">${categoryCard()}${keywordCard()}</div>
  </div>`;
}

/* ---------------- 新建批次 ---------------- */
function openBatchModal() {
  const products = ((state.dashboard && state.dashboard.products) || []).filter((p) => p.status === 'on');
  if (!products.length) {
    toast('没有已上架商品，先新建商品并通过平台审核', 'error');
    return;
  }
  const today = fmt.date(new Date());
  const body = `<div class="stack gap-200">
    <div class="field">
      <label class="field__label" for="nb-product">商品</label>
      <select class="select" id="nb-product">${products.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label" for="nb-plot">地块</label>
        <input class="input" id="nb-plot" autocomplete="off" placeholder="例如 良梨镇 6 号梨园">
      </div>
      <div class="field">
        <label class="field__label" for="nb-area">面积</label>
        <input class="input" id="nb-area" autocomplete="off" placeholder="例如 8 亩">
      </div>
      <div class="field">
        <label class="field__label" for="nb-harvest">预计采收</label>
        <input class="input" id="nb-harvest" type="date" min="${today}" value="${addDaysInput(30)}">
      </div>
      <div class="field">
        <label class="field__label" for="nb-qty">预计数量（kg）</label>
        <input class="input" id="nb-qty" type="number" min="1" step="10" placeholder="例如 1800">
      </div>
    </div>
    <div id="nb-error"></div>
    <p class="caption-2 muted">提交后生成溯源码，地块与采收日写进批次档案，后续可以继续补充农事记录。</p>
  </div>`;
  const dialog = modal({
    title: '新建批次',
    body,
    actions: [
      { label: '取消' },
      {
        label: '创建批次',
        variant: 'btn--primary',
        onClick: async (box) => {
          const productId = box.querySelector('#nb-product').value;
          const plotEl = box.querySelector('#nb-plot');
          const areaEl = box.querySelector('#nb-area');
          const harvestEl = box.querySelector('#nb-harvest');
          const qtyEl = box.querySelector('#nb-qty');
          const errHost = box.querySelector('#nb-error');
          const plot = plotEl.value.trim();
          const area = areaEl.value.trim();
          const harvestAt = harvestEl.value;
          const qty = Number(qtyEl.value);
          const problems = [];
          [plotEl, areaEl, harvestEl, qtyEl].forEach((n) => n.classList.remove('input--error'));
          if (!plot) { problems.push('请填写地块名称。'); plotEl.classList.add('input--error'); }
          if (!area) { problems.push('请填写地块面积。'); areaEl.classList.add('input--error'); }
          if (!harvestAt) { problems.push('请选择预计采收日期。'); harvestEl.classList.add('input--error'); }
          if (!qty || qty <= 0) { problems.push('请填写预计数量。'); qtyEl.classList.add('input--error'); }
          if (problems.length) {
            if (errHost) errHost.innerHTML = `<div class="callout callout--red">${icon('alert')}<div class="stack gap-50">${problems.map((p) => `<p class="body-6">${esc(p)}</p>`).join('')}</div></div>`;
            return false;
          }
          try {
            const res = await api('/api/farmer/me/batches', {
              method: 'POST',
              body: {
                productId,
                plot,
                area,
                qty,
                harvestAt: new Date(`${harvestAt}T00:00:00`).toISOString(),
              },
            });
            const batch = (res && res.batch) || {};
            toast(`批次已创建，新溯源码 ${batch.code || ''}`);
            await refreshBatches();
            const row = document.querySelector(`[data-batch-row="${batch.id}"]`);
            if (row) {
              row.classList.add('is-new');
              setTimeout(() => row.classList.remove('is-new'), 8000);
              row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return true;
          } catch (err) {
            if (errHost) errHost.innerHTML = `<div class="callout callout--red">${icon('alert')}<p class="body-6">${esc((err && err.message) || '创建失败，请稍后再试')}</p></div>`;
            return false;
          }
        },
      },
    ],
  });
  const plot = dialog && dialog.box ? dialog.box.querySelector('#nb-plot') : null;
  if (plot) setTimeout(() => plot.focus({ preventScroll: true }), 60);
}

/* ---------------- 新建商品 ---------------- */
function openProductModal(product) {
  const categories = ['水果', '粮油', '肉禽蛋', '滋补'];
  const arts = [
    ['pear', '梨'], ['apple', '苹果'], ['orange', '橙'], ['strawberry', '草莓'],
    ['rice', '大米'], ['banana', '香蕉'], ['beef', '牛肉'], ['lamb', '羊肉'], ['goji', '枸杞'],
  ];
  const editing = !!product;
  const val = (key, fallback = '') => (product && product[key] != null ? String(product[key]) : fallback);
  const opt = (key, value) => (val(key) === value ? ' selected' : '');
  const body = `<div class="stack gap-200">
    <div class="field">
      <label class="field__label" for="np-name">商品名称</label>
      <input class="input" id="np-name" autocomplete="off" placeholder="例如 良梨镇 6 号梨园 · 头茬酥梨" maxlength="40" value="${esc(val('name'))}">
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label" for="np-category">品类</label>
        <select class="select" id="np-category">${categories.map((c) => `<option value="${c}"${opt('category', c)}>${c}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label class="field__label" for="np-price">售价（元）</label>
        <input class="input" id="np-price" type="number" min="0.01" max="99999" step="0.01" placeholder="例如 39.90" value="${esc(val('price'))}">
      </div>
      <div class="field">
        <label class="field__label" for="np-unit">规格</label>
        <input class="input" id="np-unit" autocomplete="off" placeholder="例如 5 斤装" value="${esc(val('unit', '5 斤装'))}" maxlength="20">
      </div>
      <div class="field">
        <label class="field__label" for="np-grade">等级</label>
        <select class="select" id="np-grade"><option${opt('grade', '一级')}>一级</option><option${opt('grade', '特级')}>特级</option><option${opt('grade', '二级')}>二级</option></select>
      </div>
      <div class="field">
        <label class="field__label" for="np-art">商品主图</label>
        <select class="select" id="np-art">${arts.map((a) => `<option value="${a[0]}"${opt('art', a[0])}>${a[1]}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label class="field__label" for="np-geo">产地</label>
        <input class="input" id="np-geo" autocomplete="off" placeholder="例如 砀山县良梨镇" maxlength="40" value="${esc(val('geo'))}">
      </div>
    </div>
    <div class="field">
      <label class="field__label" for="np-spec">详细规格</label>
      <input class="input" id="np-spec" autocomplete="off" placeholder="例如 单果 250g–300g · 12 枚" maxlength="60" value="${esc(val('spec'))}">
    </div>
    <div class="field">
      <label class="field__label" for="np-summary">商品简介</label>
      <textarea class="input" id="np-summary" rows="3" maxlength="200" placeholder="写清楚产地、采摘时间、口感或检测情况，审核通过后展示在商品详情">${esc(val('summary'))}</textarea>
    </div>
    <div id="np-error"></div>
    <p class="caption-2 muted">${editing ? '修改后重新进入“待审核”，平台重新审核通过后才会显示新内容。' : '提交后商品进入“待审核”，平台审核通过前不会出现在商城，也不能建批次。'}</p>
  </div>`;
  const dialog = modal({
    title: editing ? '修改商品并重新提交' : '新建商品',
    body,
    actions: [
      { label: '取消' },
      {
        label: editing ? '重新提交' : '提交审核',
        variant: 'btn--primary',
        onClick: async (box) => {
          const nameEl = box.querySelector('#np-name');
          const priceEl = box.querySelector('#np-price');
          const summaryEl = box.querySelector('#np-summary');
          const errHost = box.querySelector('#np-error');
          const name = nameEl.value.trim();
          const price = Number(priceEl.value);
          const summary = summaryEl.value.trim();
          const problems = [];
          [nameEl, priceEl, summaryEl].forEach((n) => n.classList.remove('input--error'));
          if (name.length < 2) { problems.push('商品名称至少 2 个字。'); nameEl.classList.add('input--error'); }
          if (!Number.isFinite(price) || price <= 0) { problems.push('请填写有效售价。'); priceEl.classList.add('input--error'); }
          if (!summary) { problems.push('请填写商品简介。'); summaryEl.classList.add('input--error'); }
          if (problems.length) {
            if (errHost) errHost.innerHTML = `<div class="callout callout--red">${icon('alert')}<div class="stack gap-50">${problems.map((p) => `<p class="body-6">${esc(p)}</p>`).join('')}</div></div>`;
            return false;
          }
          try {
            const res = await api(editing
              ? `/api/farmer/me/products/${product.id}`
              : '/api/farmer/me/products', {
              method: editing ? 'PATCH' : 'POST',
              body: {
                name,
                category: box.querySelector('#np-category').value,
                price,
                unit: box.querySelector('#np-unit').value.trim(),
                spec: box.querySelector('#np-spec').value.trim(),
                grade: box.querySelector('#np-grade').value,
                art: box.querySelector('#np-art').value,
                geo: box.querySelector('#np-geo').value.trim(),
                summary,
              },
            });
            const saved = (res && res.product) || {};
            toast(saved.name ? `「${saved.name}」${editing ? '已重新提交审核' : '已提交审核'}` : (editing ? '已重新提交审核' : '商品已提交审核'));
            await loadAll();
            return true;
          } catch (err) {
            if (errHost) errHost.innerHTML = `<div class="callout callout--red">${icon('alert')}<p class="body-6">${esc((err && err.message) || '提交失败，请稍后再试')}</p></div>`;
            return false;
          }
        },
      },
    ],
  });
  const name = dialog && dialog.box ? dialog.box.querySelector('#np-name') : null;
  if (name) setTimeout(() => name.focus({ preventScroll: true }), 60);
}

/* ---------------- 交互 ---------------- */
function focusRecordField(selector) {
  if (!selector) return;
  setTimeout(() => {
    const node = el(selector);
    if (node) node.focus({ preventScroll: true });
  }, 360);
}

async function handleAction(action, target) {
  if (action === 'refresh' || action === 'retry') {
    if (action === 'retry' && target.dataset.scope === 'content') {
      await generateContent();
      return;
    }
    if (action === 'refresh') toast('正在同步最新数据');
    await loadAll();
    return;
  }
  if (action === 'scan-cta') {
    setFarmerTab('batches');
    if (state.batches.length) setTab('scan');
    scrollToSection('#records');
    focusRecordField(state.batches.length ? '#f-reg' : null);
    return;
  }
  if (action === 'todo') {
    const key = target.dataset.key;
    const map = { records: '#records', packing: '#orders', audit: '#batches' };
    const sel = map[key] || '#records';
    if (key === 'packing') {
      setFarmerTab('orders');
    } else {
      setFarmerTab('batches');
      if (key === 'records' && state.batches.length) setTab('voice');
    }
    scrollToSection(sel);
    if (key === 'records') focusRecordField('#f-title');
    return;
  }
  if (action === 'new-product') {
    openProductModal();
    return;
  }
  if (action === 'edit-product') {
    const p = ((state.dashboard && state.dashboard.products) || []).find((x) => x.id === target.dataset.product);
    if (p) openProductModal(p);
    return;
  }
  if (action === 'new-batch') {
    openBatchModal();
    return;
  }
  if (action === 'fill-record') {
    const id = target.dataset.batch;
    if (id) {
      state.form.batchId = id;
      const sel = el('#f-batch');
      if (sel) sel.value = id;
      renderPestBlock();
    }
    scrollToSection('#records');
    focusRecordField('#f-title');
    return;
  }
  if (action === 'copy') {
    const text = target.dataset.key ? copyMap.get(target.dataset.key) : target.dataset.copy;
    if (text) copyText(text);
    return;
  }
  if (action === 'type') {
    state.form.type = target.dataset.type;
    updateTypeChips();
    renderPestBlock();
    return;
  }
  if (action === 'tab') {
    setTab(target.dataset.tab);
    return;
  }
  if (action === 'voice') {
    startVoice(target);
    return;
  }
  if (action === 'photo-remove') {
    if (state.form.photo && state.form.photo.url) URL.revokeObjectURL(state.form.photo.url);
    state.form.photo = null;
    const input = el('#f-photo');
    if (input) input.value = '';
    renderPhotoPreview();
    return;
  }
  if (action === 'fake-scan') {
    fakeScan();
    return;
  }
  if (action === 'generate') {
    await generateContent();
    return;
  }
  if (action === 'channel') {
    const ch = target.dataset.channel;
    if (!ch || ch === state.content.channel) return;
    state.content.channel = ch;
    state.content.data = null;
    state.content.error = '';
    renderContentForm();
    renderContentResult();
    return;
  }
  if (action === 'trend') {
    const mode = target.dataset.mode;
    if (!mode || mode === state.trendMode) return;
    state.trendMode = mode;
    renderInsight();
    return;
  }
  if (action === 'ship') {
    const order = state.orders.find((o) => o.id === target.dataset.order);
    if (order) openShipModal(order);
    return;
  }
  if (action === 'logistics') {
    const order = state.orders.find((o) => o.id === target.dataset.order);
    if (order) openLogisticsModal(order);
  }
}

document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  Promise.resolve(handleAction(target.dataset.action, target)).catch((err) => {
    toast((err && err.message) || '操作没有完成，请稍后再试', 'error');
  });
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'f-title') state.form.title = t.value;
  else if (t.id === 'f-detail') state.form.detail = t.value;
  else if (t.id === 'f-reg') {
    state.form.regNo = t.value;
    renderPestBlock();
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'f-batch') {
    state.form.batchId = t.value;
    renderPestBlock();
  } else if (t.id === 'f-at') {
    state.form.at = t.value;
    renderPestBlock();
  } else if (t.id === 'f-interval') {
    state.form.interval = Number(t.value);
    renderPestBlock();
  } else if (t.id === 'f-photo') {
    const file = t.files && t.files[0];
    if (!file) return;
    if (!String(file.type).startsWith('image/')) {
      toast('请选择图片文件', 'error');
      t.value = '';
      return;
    }
    if (state.form.photo && state.form.photo.url) URL.revokeObjectURL(state.form.photo.url);
    state.form.photo = { url: URL.createObjectURL(file), name: file.name, size: file.size };
    renderPhotoPreview();
    toast('照片已加入本地预览');
  } else if (t.id === 'c-product') {
    state.content.productId = t.value;
    state.content.batchId = '';
    state.content.data = null;
    state.content.error = '';
    renderContentForm();
    renderContentResult();
  } else if (t.id === 'c-batch') {
    state.content.batchId = t.value;
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'record-form') return;
  e.preventDefault();
  submitRecord().catch((err) => {
    toast((err && err.message) || '提交失败，请稍后再试', 'error');
  });
});



async function loadNotices() {
  const host = document.getElementById('notices-list');
  const card = document.getElementById('notices');
  if (!host || !card) return;
  try {
    const data = await api('/api/notifications?limit=10');
    const items = (data && data.items) || [];
    if (!items.length) { card.hidden = true; return; }
    card.hidden = false;
    host.innerHTML = items.map((n) => `<button class="notice-row" type="button" data-notice="${esc(n.id)}" data-link="${esc(n.link || '')}" aria-label="${esc(n.title)}">
      <span class="notice-dot ${n.read ? '' : 'is-unread'}"></span>
      <span><strong>${esc(n.title)}</strong><span class="caption-2 muted">${esc(n.body || '')}</span></span>
    </button>`).join('');
    host.querySelectorAll('[data-notice]').forEach((b) => {
      b.onclick = async () => {
        await api('/api/notifications/' + encodeURIComponent(b.dataset.notice) + '/read', { method: 'POST' });
        if (b.dataset.link && b.dataset.link !== location.pathname) location.href = b.dataset.link;
        else loadNotices();
      };
    });
  } catch (e) { /* 无消息不影响工作台 */ }
}

/* ---------------- 四组页签 ---------------- */
const FARMER_TABS = {
  today: ['notices', 'kpi', 'todos'],
  batches: ['batches', 'records'],
  orders: ['orders'],
  business: ['content', 'insight'],
};

function setFarmerTab(name) {
  const active = FARMER_TABS[name] ? name : 'today';
  document.querySelectorAll('[data-farmer-tabs] [data-tab]').forEach((btn) => {
    btn.setAttribute('aria-selected', String(btn.dataset.tab === active));
  });
  const visible = new Set(FARMER_TABS[active]);
  ['notices', 'kpi', 'todos', 'batches', 'records', 'orders', 'content', 'insight'].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.hidden = !visible.has(id);
  });
}

function initFarmerTabs() {
  const host = document.querySelector('[data-farmer-tabs]');
  if (!host) return;
  const readAll = document.getElementById('notices-read-all');
  if (readAll) readAll.onclick = async () => { try { await api('/api/notifications/read-all', { method: 'POST' }); loadNotices(); } catch (e) { /* ignore */ } };
  const kpi = document.getElementById('kpi');
  const todos = document.getElementById('todos');
  if (kpi && todos && kpi.parentNode === todos.parentNode) kpi.parentNode.insertBefore(todos, kpi);
  host.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    setFarmerTab(btn.dataset.tab);
  });
  setFarmerTab('today');
}

/* ---------------- 启动 ---------------- */
function init() {
  try { initNav('farmer'); } catch (e) { /* 导航由 app.js 兜底 */ }
  initFarmerTabs();
  // 登录角色为农户时，只保留当前农户的入口（跨农户访问会被服务端 403）
  // TODO: 接入正式鉴权后由服务端下发可访问的农户列表
  const me = window.Auth && Auth.getUser ? Auth.getUser() : null;
  if (me && me.role === 'farmer' && me.farmerId) state.farmerId = me.farmerId;
  document.querySelectorAll('[data-icon]').forEach((node) => {
    node.innerHTML = icon(node.dataset.icon);
    node.removeAttribute('data-icon');
  });
  loadAll().catch((err) => {
    state.loading = false;
    state.errors.dashboard = (err && err.message) || '数据加载失败';
    renderAll();
    toast(state.errors.dashboard, 'error');
  });
  observeReveal();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
