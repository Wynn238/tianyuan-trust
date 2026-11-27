/* 溯源助农 · UI 套件：图标、请求、格式化、图表、导航、动效、反馈 */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------------- 图标（线性，24px，圆头） ---------------- */
const ICONS = {
  leaf: '<path d="M4.5 19.5C4.5 11.4 10.6 4.9 20 4c.9 9.4-5.6 15.5-13.7 15.5Z"/><path d="M4.5 19.5C8 16 11.4 12.6 15.5 9.4"/>',
  sprout: '<path d="M12 21v-8"/><path d="M12 13c0-4.4-3.1-7-7.5-7C4.5 10.4 7.6 13 12 13Z"/><path d="M12 13c0-4.9 3.4-7.8 8-7.8 0 5-3.4 7.8-8 7.8Z"/>',
  scan: '<path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3"/><path d="M4 12h16"/>',
  shield: '<path d="M12 3.2 19 6v5.6c0 4.3-2.9 7.4-7 8.8-4.1-1.4-7-4.5-7-8.8V6Z"/><path d="m9 12 2.2 2.2L15.4 10"/>',
  chat: '<path d="M20 15.5a2 2 0 0 1-2 2H8l-4 3v-13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/><path d="M8.5 10.5h7M8.5 13.5h4"/>',
  sparkle: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="m18.5 16 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/>',
  arrowRight: '<path d="M4.5 12h15"/><path d="m13.5 6 6 6-6 6"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  alert: '<path d="M12 4.5 21 20H3Z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
  thermometer: '<path d="M14 14.8V5.5a2 2 0 1 0-4 0v9.3a4 4 0 1 0 4 0Z"/><path d="M12 9v7"/>',
  truck: '<path d="M3 7h9v9H3z"/><path d="M12 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="16.5" cy="18" r="1.8"/>',
  box: '<path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2Z"/><path d="m4 7.2 8 4.2 8-4.2M12 11.4V21"/>',
  pin: '<path d="M12 21s6.5-5.6 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.4 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2.4"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M16 5.6a3.2 3.2 0 0 1 0 6.2M17.4 19.5a6 6 0 0 0-2.2-4.6"/>',
  store: '<path d="M4 9.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V9.5"/><path d="M3 9.5 5.2 4h13.6L21 9.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z"/><path d="M9.5 13.5h5"/>',
  chart: '<path d="M4 20h16"/><path d="M7 20v-6M12 20V7M17 20v-9"/>',
  trend: '<path d="m3.5 16.5 5.5-5.5 4 4 7.5-7.5"/><path d="M15.5 7.5h5v5"/>',
  file: '<path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5Z"/><path d="M13.5 3.5v5h5M8.5 12.5h7M8.5 16h5"/>',
  cpu: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><rect x="10" y="10" width="4" height="4" rx=".6"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>',
  database: '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  menu: '<path d="M4 7.5h16M4 12h16M4 16.5h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M4 8.5h3l1.5-2h7L17 8.5h3v11H4Z"/><circle cx="12" cy="13.5" r="3.2"/>',
  mic: '<rect x="9" y="3.5" width="6" height="10" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
  receipt: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2Z"/><path d="M9 8.5h6M9 12h6M9 15.5h3"/>',
  seal: '<path d="m12 3 2.3 1.6 2.8-.1 1 2.6 2.4 1.4-.6 2.7.6 2.7-2.4 1.4-1 2.6-2.8-.1L12 19.4l-2.3-1.6-2.8.1-1-2.6L3.5 13.8l.6-2.7-.6-2.7L5.9 7l1-2.6 2.8.1Z"/><path d="m9.2 11.6 2 2 3.6-3.8"/>',
  coins: '<ellipse cx="9" cy="7" rx="5.5" ry="2.6"/><path d="M3.5 7v4c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V7"/><path d="M9 13.6v3c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-4c0-1.2-1.8-2.2-4.2-2.5"/><ellipse cx="14.5" cy="12.6" rx="5.5" ry="2.6"/>',
  star: '<path d="m12 3.8 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4.1 5.8-.8Z"/>',
  filter: '<path d="M3.5 5.5h17l-6.5 8v6l-4 2v-8Z"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5L16.5 11"/><path d="M4.5 19.5h15"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 5.5H6A1.5 1.5 0 0 0 4.5 7v9.5"/>',
  external: '<path d="M13.5 4.5h6v6"/><path d="M19.5 4.5 11 13"/><path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5h5"/>',
  home: '<path d="m4 10.5 8-6.5 8 6.5V20H4Z"/><path d="M9.5 20v-5.5h5V20"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  bell: '<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 5 2 6.5 2 6.5h-15S6.5 15 6.5 10Z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/>',
  chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
  chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
  play: '<path d="M8 5.5v13l10-6.5Z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-9.6A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z"/>',
  bag: '<path d="M5 8h14l-1 12H6Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M6.5 14.5h3"/>',
  flask: '<path d="M9.5 3.5h5M10.5 3.5v6L5.8 18a1.8 1.8 0 0 0 1.6 2.6h9.2a1.8 1.8 0 0 0 1.6-2.6L13.5 9.5v-6"/><path d="M8 14h8"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5Z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  eye: '<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/>',
  eyeOff: '<path d="m3.5 3.5 17 17"/><path d="M10.6 6.4A9.7 9.7 0 0 1 12 6.3c6 0 9.5 5.7 9.5 5.7a17 17 0 0 1-3.1 3.7"/><path d="M6.3 7.6A17.6 17.6 0 0 0 2.5 12s3.5 5.7 9.5 5.7c1.2 0 2.3-.2 3.3-.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  quote: '<path d="M9 6.5C6.4 7.6 5 9.6 5 12v5.5h5V12H7.6c0-1.6.8-2.9 2.2-3.6Z"/><path d="M18 6.5c-2.6 1.1-4 3.1-4 5.5v5.5h5V12h-2.4c0-1.6.8-2.9 2.2-3.6Z"/>',
  droplet: '<path d="M12 3.5c3.2 3.6 5.5 6.4 5.5 9.2a5.5 5.5 0 0 1-11 0C6.5 9.9 8.8 7.1 12 3.5Z"/>',
  bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M9.5 8V6a2.5 2.5 0 0 1 5 0v2M7 12H3.5M20.5 12H17M6 17l-3 2M18 17l3 2M6 7 3.5 5M18 7l2.5-2"/>',
  scissors: '<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="M8.6 8.6 19 19M8.6 15.4 19 5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>',
  wave: '<path d="M3 12c2.2-4 4.2-4 6.3 0s4.1 4 6.3 0 4.1-4 5.4-2"/>',
  clipboard: '<rect x="6" y="4.5" width="12" height="16" rx="2"/><path d="M9.5 4.5V3h5v1.5M9 10h6M9 13.5h6M9 17h3"/>',
  scale: '<path d="M12 4v16M6 20h12"/><path d="M4 9h16"/><path d="M4 9 1.5 15h5Z"/><path d="M20 9l-2.5 6h5Z"/>',
  hand: '<path d="M8 12V5.5a1.6 1.6 0 0 1 3.2 0V11"/><path d="M11.2 11V4.6a1.6 1.6 0 0 1 3.2 0V11"/><path d="M14.4 11V6.2a1.6 1.6 0 0 1 3.2 0V13a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-2.5A1.7 1.7 0 0 1 6 9.9"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r=".8"/>',
};
function icon(name, cls = '') {
  const body = ICONS[name];
  if (!body) return '';
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/* ---------------- 请求 ---------------- */
async function api(path, { method = 'GET', body } = {}) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, opt);
  } catch (e) {
    throw new Error('无法连接服务，请确认本地服务已启动');
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (res.status === 401 && path.indexOf('/api/auth/') !== 0 && window.Auth) {
    window.Auth.handle401();
  }
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `请求失败（${res.status}）`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data && data.error && data.error.code;
    if (res.status === 403) toast('无权访问该功能', 'error');
    throw err;
  }
  return data;
}

/* ---------------- 轻量行为事件 ---------------- */
function trackEvent(type, payload) {
  try {
    var sid = sessionStorage.getItem('ty_sid');
    if (!sid) {
      sid = (crypto.randomUUID && crypto.randomUUID()) || ('s' + Date.now() + Math.random().toString(16).slice(2));
      sessionStorage.setItem('ty_sid', sid);
    }
    var body = Object.assign({ type: type, sessionId: sid }, payload || {});
    fetch('/api/events', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(function () {});
  } catch (e) { /* 隐私模式忽略 */ }
}
window.trackEvent = trackEvent;

/* ---------------- 格式化 ---------------- */
const fmt = {
  money(n) { return '¥' + Number(n).toFixed(2); },
  int(n) { return Number(n).toLocaleString('zh-CN'); },
  date(iso, withTime) {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (x) => String(x).padStart(2, '0');
    const s = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return withTime ? `${s} ${p(d.getHours())}:${p(d.getMinutes())}` : s;
  },
  md(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  },
  rel(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.round(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return `${m} 分钟前`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} 小时前`;
    const d = Math.round(h / 24);
    if (d < 30) return `${d} 天前`;
    return fmt.date(iso);
  },
  pct(n, digits = 1) { return Number(n).toFixed(digits) + '%'; },
  temp(n) { return Number(n).toFixed(1) + '℃'; },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const qs = (k) => new URLSearchParams(location.search).get(k);

/* ---------------- 状态字典 ---------------- */
const DICT = {
  order: { paid: ['已支付', 'blue'], packing: ['打包中', 'amber'], shipping: ['冷链运输', 'blue'], delivered: ['已送达', 'green'], aftersale: ['售后中', 'red'], done: ['已完成', 'green'] },
  product: { pending: ['待审核', 'amber'], on: ['已上架', 'green'], rejected: ['已驳回', 'red'] },
  batch: { growing: ['生长中', 'amber'], harvested: ['已采收', 'blue'], listed: ['已上架', 'green'], shipped: ['已售罄', 'green'] },
  record: {
    sow: ['播种定植', 'sprout'], fertilize: ['施肥', 'droplet'], pesticide: ['用药', 'bug'],
    irrigate: ['灌溉', 'droplet'], prune: ['修剪整枝', 'scissors'], harvest: ['采收', 'sun'],
    process: ['分选加工', 'box'], store: ['仓储', 'database'], ship: ['冷链发运', 'truck'],
  },
  level: { high: ['高风险', 'red'], mid: ['关注', 'amber'], low: ['提示', 'neutral'] },
  application: { pending: ['待审核', 'amber'], approved: ['已通过', 'green'], rejected: ['已驳回', 'red'] },
};

/* ---------------- 反馈 ---------------- */
function toastHost() {
  let host = $('.toast-host');
  if (!host) { host = document.createElement('div'); host.className = 'toast-host'; document.body.appendChild(host); }
  return host;
}
function toast(message, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' toast--error' : ' toast--ok');
  el.innerHTML = icon(type === 'error' ? 'alert' : 'check') + `<span>${esc(message)}</span>`;
  toastHost().appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; }, 3200);
  setTimeout(() => el.remove(), 3700);
}

function modal({ title, body, actions = [], width, onClose, bare = false, className = '' }) {
  let host = $('.modal-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'modal-host';
    host.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"></div>';
    document.body.appendChild(host);
  }
  const box = $('.modal', host);
  const lastFocus = document.activeElement;
  box.className = 'modal' + (className ? ' ' + className : '');
  if (width) box.style.maxWidth = width; else box.style.maxWidth = '';
  box.innerHTML = bare ? body : `
    <div class="modal__head">
      <h2 class="heading-5" id="modal-title">${esc(title)}</h2>
      <button class="btn btn--icon btn--sm" data-close aria-label="关闭">${icon('x')}</button>
    </div>
    <div class="modal__body">${body}</div>
    ${actions.length ? `<div class="row gap-100 mt-400" style="justify-content:flex-end">${actions.map((a, i) => `<button class="btn ${a.variant || 'btn--secondary'}" data-act="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
  `;
  host.dataset.open = 'true';

  const focusables = () => Array.from(box.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((el) => el.offsetParent !== null || el === document.activeElement);

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    host.dataset.open = 'false';
    document.removeEventListener('keydown', onKey, true);
    if (typeof onClose === 'function') onClose();
    else if (lastFocus && typeof lastFocus.focus === 'function') setTimeout(() => lastFocus.focus(), 0);
  }

  const closeBtn = $('[data-close]', box);
  if (closeBtn) closeBtn.onclick = close;
  host.onclick = (e) => { if (e.target === host) close(); };
  $$('[data-act]', box).forEach((btn) => {
    btn.onclick = async () => {
      const a = actions[Number(btn.dataset.act)];
      if (a.onClick) { const keep = await a.onClick(box); if (keep === false) return; }
      close();
    };
  });
  document.addEventListener('keydown', onKey, true);
  // 若调用方没有主动聚焦，则聚焦第一个可交互元素
  setTimeout(() => {
    if (!box.contains(document.activeElement)) {
      const first = focusables()[0];
      if (first) first.focus();
    }
  }, 50);
  return { close, box };
}

function confirmDialog(title, desc, onOk, okLabel = '确认') {
  return modal({
    title,
    body: `<p class="body-3 muted">${esc(desc)}</p>`,
    actions: [{ label: '取消' }, { label: okLabel, variant: 'btn--primary', onClick: onOk }],
  });
}

/* ---------------- 骨架 / 空态 ---------------- */
function skeletonCards(n = 3, cls = 'skeleton--card') {
  return Array.from({ length: n }).map(() => `<div class="skeleton ${cls}"></div>`).join('');
}
function emptyState(title, desc, iconName = 'box', action = '') {
  return `<div class="empty">
    <div class="empty__icon">${icon(iconName)}</div>
    <div>
      <p class="body-1">${esc(title)}</p>
      <p class="body-6 muted mt-200">${esc(desc)}</p>
    </div>
    ${action}
  </div>`;
}
function loadingRows(n = 5) {
  return Array.from({ length: n }).map(() => `<tr>${Array.from({ length: 5 }).map(() => '<td><div class="skeleton skeleton--text" style="width:70%"></div></td>').join('')}</tr>`).join('');
}

/* ---------------- 图表（手绘 SVG） ---------------- */
function lineChart(labels, series, opt = {}) {
  const w = 720, h = opt.height || 220, pad = { t: 16, r: 12, b: 28, l: 40 };
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all) * 1.15 || 1;
  const min = 0;
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const x = (i) => pad.l + (labels.length === 1 ? iw / 2 : (i * iw) / (labels.length - 1));
  const y = (v) => pad.t + ih - ((v - min) / (max - min)) * ih;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((p) => {
    const gy = pad.t + ih - p * ih;
    return `<line x1="${pad.l}" y1="${gy}" x2="${w - pad.r}" y2="${gy}" stroke="var(--line)" stroke-dasharray="${p === 0 ? '0' : '3 4'}"/>
      <text x="${pad.l - 8}" y="${gy + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${Math.round(max * p)}</text>`;
  }).join('');
  const paths = series.map((s) => {
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = `${d} L${x(s.values.length - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z`;
    const dots = s.values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="var(--surface)" stroke="${s.color}" stroke-width="2"/>`).join('');
    return `${opt.area === false ? '' : `<path d="${area}" fill="${s.color}" opacity=".07"/>`}
      <path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linecap="round"/>${dots}`;
  }).join('');
  const xl = labels.map((l, i) => `<text x="${x(i)}" y="${h - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(l)}</text>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="趋势图">${grid}${paths}${xl}</svg>`;
}

function barChart(items, opt = {}) {
  const w = 720, h = opt.height || 220, pad = { t: 12, r: 8, b: 30, l: 40 };
  const max = Math.max(...items.map((i) => i.value)) * 1.2 || 1;
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const bw = Math.min(48, (iw / items.length) * 0.56);
  const bars = items.map((it, i) => {
    const cx = pad.l + (i + 0.5) * (iw / items.length);
    const bh = (it.value / max) * ih;
    return `<rect x="${cx - bw / 2}" y="${pad.t + ih - bh}" width="${bw}" height="${bh}" rx="6" fill="${it.color || 'var(--green-600)'}"/>
      <text x="${cx}" y="${pad.t + ih - bh - 8}" text-anchor="middle" font-size="11" fill="var(--ink-2)">${it.label2 || it.value}</text>
      <text x="${cx}" y="${h - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(it.label)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="分布图">${bars}</svg>`;
}

function donut(value, size = 120, label = '') {
  const r = 46, c = 2 * Math.PI * r, off = c * (1 - value / 100);
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--bg-alt)" stroke-width="10"/>
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--green-600)" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 60 60)"/>
    <text x="60" y="66" text-anchor="middle" font-size="22" font-weight="600" fill="var(--ink)">${value}%</text>
  </svg>`;
}

function sparkline(values, color = 'var(--green-600)') {
  const w = 120, h = 32, max = Math.max(...values), min = Math.min(...values);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 4) - 2}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`;
}

/* ---------------- 导航 ---------------- */
// 品牌名即首页；商城是首页内区块，首页不再重复放入导航。
const NAV_BASE = [
  { key: 'market', label: '产地商城', href: '/shop.html' },
  { key: 'trace', label: '溯源查询', href: '/trace.html' },
  { key: 'agent', label: '智能体', href: '/agent.html' },
];

function navUser() {
  try { return (window.Auth && Auth.getUser && Auth.getUser()) || null; } catch (e) { return null; }
}

/**
 * 导航按角色收敛：
 * - farmer.html：只留「返回首页 / 我的工作台」，不出现后台入口
 * - admin.html：只留后台子模块锚点 + 返回首页，不出现农事录入入口
 * - 其他页面：基础导航 + 与角色匹配的快捷入口（农户→工作台，admin→管理后台）
 */
function initNav(active) {
  const host = $('.nav-shell');
  if (!host) return;
  const user = navUser();
  const isFarmerPage = active === 'farmer';
  const isAdminPage = active === 'admin';

  let links;
  if (isFarmerPage) {
    links = [
      { key: 'home', label: '返回首页', href: '/', iconName: 'home' },
      { key: 'farmer', label: '我的工作台', href: '/farmer.html', iconName: 'sprout' },
    ];
  } else if (isAdminPage) {
    // 后台子页由 admin.js 的 admin-subnav 提供，顶部只保留返回首页，避免同一目的地两个入口。
    links = [
      { key: 'home', label: '返回首页', href: '/', iconName: 'home' },
    ];
  } else {
    links = NAV_BASE.filter((i) => !(active === 'home' && i.hideOnHome));
  }
  if (isAdminPage && window.Auth && Auth.hasPermission) {
    links = links.filter((i) => !i.perm || Auth.hasPermission(i.perm));
  }

  const roleEntry = (() => {
    if (isFarmerPage || isAdminPage) return '';
    if (user && user.role === 'farmer') return '<a class="btn btn--secondary btn--sm" href="/farmer.html">我的工作台</a>';
    if (user && user.role === 'admin') return '<a class="btn btn--secondary btn--sm" href="/admin.html">管理后台</a>';
    return '';
  })();

  const storefront = !(isFarmerPage || isAdminPage);
  const cartBtn = storefront
    ? `<a class="nav__cart" href="/cart.html" aria-label="购物车" data-cart-link>
         ${icon('bag')}<span class="nav__cart-count" data-cart-count hidden>0</span>
       </a>`
    : '';
  const farmerLink = storefront ? '<a class="nav__quiet" data-guest-only href="/farmer.html">农户入口</a>' : '';
  const mobileAccount = (() => {
    if (!user) return { label: '登录', href: '#', login: true };
    if (user.role === 'consumer') return { label: '个人中心', href: '/account.html' };
    if (user.role === 'farmer') return user.status === 'active'
      ? { label: '我的工作台', href: '/farmer.html' }
      : { label: '入驻审核中', href: '/farmer-apply.html' };
    return { label: '管理后台', href: '/admin.html' };
  })();
  const mobileLinks = storefront
    ? links.concat([{ label: '购物车', href: '/cart.html' }, mobileAccount]
        .concat(user ? [{ label: '退出登录', href: '#', logout: true }] : [])
        .concat([{ label: '农户入口', href: '/farmer.html' }]))
    : links.concat(user ? [{ label: '退出登录', href: '#', logout: true }] : []);

  host.innerHTML = `
    <nav class="nav" aria-label="主导航">
      <a class="nav__brand" href="/">
        <img class="nav__logo" src="/assets/brand/mark.png" alt="" width="480" height="364">
        <span>田源可信 · 溯源助农</span>
      </a>
      <div class="nav__links">
        ${links.map((i) => `<a class="nav__link" href="${i.href}" ${i.key === active ? 'aria-current="page"' : ''}>${i.iconName ? icon(i.iconName) : ''}${i.label}</a>`).join('')}
      </div>
      <div class="nav__actions">
        ${cartBtn}
        ${isFarmerPage || isAdminPage ? '' : `<div class="nav__auth" data-role-entry>${roleEntry}</div>`}
        <div class="nav__auth" data-auth-slot></div>
        ${farmerLink}
        <button class="nav__toggle" data-menu-toggle aria-label="打开菜单" aria-expanded="false">${icon('menu')}</button>
      </div>
    </nav>
    <div class="mobile-menu" data-mobile-menu>
      ${mobileLinks.map((i, idx) => `<a href="${i.href}" ${i.login ? 'data-mobile-login' : ''} ${i.logout ? 'data-mobile-logout' : ''} style="--i:${idx}">${i.label}</a>`).join('')}
    </div>`;
  const menu = $('[data-mobile-menu]', host);
  const toggle = $('[data-menu-toggle]', host);
  toggle.onclick = () => {
    const open = menu.dataset.open !== 'true';
    menu.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.innerHTML = icon(open ? 'x' : 'menu');
  };
  $$('a', menu).forEach((a) => (a.onclick = (e) => {
    if (a.hasAttribute('data-mobile-login')) {
      e.preventDefault();
      if (window.Auth) Auth.openLogin({});
    }
    if (a.hasAttribute('data-mobile-logout')) {
      e.preventDefault();
      if (window.Auth) Auth.logout();
    }
    menu.dataset.open = 'false';
    toggle.innerHTML = icon('menu');
    toggle.setAttribute('aria-expanded', 'false');
  }));
  // 登录状态与角色入口由 auth.js 渲染（未加载时静默跳过）
  if (window.Auth && window.Auth.renderNavAuth) window.Auth.renderNavAuth();
  refreshCartCount();
}

/** 购物车角标：与购物车接口保持一致，不把数量写死在前端 */
async function refreshCartCount() {
  const el = $('[data-cart-count]');
  if (!el) return;
  let guest = '';
  let token = '';
  try { guest = localStorage.getItem('ty_guest_id') || ''; token = localStorage.getItem('ty_token') || ''; } catch (e) {}
  if (!guest && !token) { el.hidden = true; return; }
  try {
    const headers = {};
    if (guest) headers['X-Guest-Id'] = guest;
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = await fetch('/api/cart', { headers });
    if (!r.ok) return;
    const d = await r.json();
    const n = (d.items || []).reduce((sum, i) => sum + i.qty, 0);
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = !n;
  } catch (e) {}
}
window.addEventListener('cart:changed', refreshCartCount);

/* ---------------- 动效 ---------------- */
let revealObserver;
function observeReveal(root = document) {
  if (!('IntersectionObserver' in window)) { $$('[data-reveal]', root).forEach((n) => n.classList.add('is-in')); return; }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); revealObserver.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  }
  $$('[data-reveal]', root).forEach((n) => { if (!n.classList.contains('is-in')) revealObserver.observe(n); });
}

function initWordReveal() {
  $$('[data-words]').forEach((node) => {
    const text = node.dataset.words.trim();
    node.innerHTML = text.split(/(\s+)/).filter((s) => s.trim()).map((w) => `<span class="tagline__word">${esc(w)}</span>`).join(' ');
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      $$('.tagline__word', node).forEach((w) => w.classList.add('is-lit'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('is-lit'); });
    }, { threshold: 0, rootMargin: '-18% 0px -42% 0px' });
    $$('.tagline__word', node).forEach((w) => io.observe(w));
  });
}

/* ---------------- 其他 ---------------- */
function copyText(text) {
  const done = () => toast('已复制到剪贴板');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallback());
  } else fallback();
  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch { toast('复制失败，请手动选择', 'error'); }
    ta.remove();
  }
}

function statusBadge(group, key) {
  const d = (DICT[group] || {})[key] || [key, 'neutral'];
  return `<span class="badge badge--${d[1]}">${esc(d[0])}</span>`;
}

function pctWidth(v, max) { return Math.max(2, Math.min(100, Math.round((v / (max || 100)) * 100))) + '%'; }

function debounce(fn, ms = 300) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function initFooter() {
  const f = $('[data-footer]');
  if (!f) return;
  f.className = 'footer';
  f.innerHTML = `
    <div class="container">
      <div class="footer__grid">
        <div class="stack gap-200">
          <div class="row gap-100"><img class="footer__logo" src="/assets/brand/mark-light.png" alt="" width="480" height="364"><span class="body-1">田源可信 · 溯源助农</span></div>
          <p class="body-6" style="color:#B9C5BA;max-width:320px">让可信的农产品自己说话。物联网采集、区块链存证、智能体服务，三件事拧成一条从田间到餐桌的证据链。</p>
          <div class="row gap-75">
            <span class="badge badge--green">${icon('shield')} 链上存证</span>
            <span class="badge badge--green">${icon('seal')} 承诺达标合格证</span>
          </div>
        </div>
        <div class="stack gap-100">
          <p class="caption-3" style="color:#8FA294">平台</p>
          <a class="body-6" href="/shop.html">产地商城</a>
          <a class="body-6" href="/trace.html">溯源查询</a>
          <a class="body-6" href="/agent.html">智能体</a>
        </div>
        <div class="stack gap-100">
          <p class="caption-3" style="color:#8FA294">参与</p>
          <a class="body-6" href="/farmer.html">农户入驻</a>
          <a class="body-6" href="/admin.html" data-admin-link hidden>运营后台</a>
          <a class="body-6" href="/#faq">常见问题</a>
        </div>
        <div class="stack gap-100">
          <p class="caption-3" style="color:#8FA294">说明</p>
          <a class="body-6" href="/#model">商业模式</a>
          <a class="body-6" href="/#proof">案例数据</a>
          <a class="body-6" href="/agent.html#how">智能体设计</a>
          <a class="body-6" href="/brand.html">品牌片</a>
        </div>
      </div>
      <div class="footer__bottom">
        <span>田源可信 · 产地直供与溯源档案平台</span>
        <span>照片：Wikimedia Commons（CC BY / CC BY-SA）</span>
        <span>© 2026 田源可信溯源助农平台 · 隐私政策 · 服务条款</span>
      </div>
    </div>`;
}

/* 初始化 */
document.addEventListener('DOMContentLoaded', () => {
  observeReveal();
  initWordReveal();
  initFooter();
  if (!/^\/(admin|farmer)/.test(location.pathname)) {
    trackEvent('page_view', { objectType: 'page', objectId: location.pathname });
  }
});
