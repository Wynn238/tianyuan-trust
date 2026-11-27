/* 溯源码查询页 · 数据装配与交互（只依赖 app.js / art.js 的全局能力） */
'use strict';

/* ---------------- 常量 ---------------- */
const EXAMPLES = ['TY-2026-0912-DS', 'TY-2026-1008-WC', 'TY-2026-1120-DD'];
const SUGGESTS = ['打过几次药', '检测报告里农残合格吗', '冷链温度正常吗'];
const LEVEL_RANK = { base: 0, advanced: 1, deep: 2 };
const LEVEL_NOTE = {
  base: '基础视角：产地、采收与检测结论，扫一眼就能看懂。',
  advanced: '进阶视角：再加农事记录时间线、用药间隔期核算与检测明细。',
  deep: '深度视角：再看 IoT 采集证据、冷链温度曲线与链上存证明细。',
};
const METHOD = {
  iot: { label: 'IoT 自动采集', icon: 'cpu', cls: 'badge--green' },
  scan: { label: '扫码', icon: 'scan', cls: '' },
  voice: { label: '语音', icon: 'mic', cls: '' },
  manual: { label: '人工', icon: 'hand', cls: '' },
  api: { label: '第三方系统', icon: 'link', cls: 'badge--blue' },
};

const state = { code: '', data: null, level: 'advanced', busy: false, loading: false, expanded: true };

/* ---------------- 小工具 ---------------- */
const el = (id) => document.getElementById(id);
const shortHash = (h) => (h ? String(h).slice(0, 12) + '…' + String(h).slice(-4) : '—');
const pad2 = (n) => String(n).padStart(2, '0');

function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function methodBadge(m) {
  const d = METHOD[m] || { label: m || '未标注', icon: 'file', cls: '' };
  return `<span class="badge ${d.cls}">${icon(d.icon)}${esc(d.label)}</span>`;
}

function metaItem(k, v, sub, mono, wide) {
  return `<div class="meta${wide ? ' meta--wide' : ''}">
    <p class="caption-4 muted">${esc(k)}</p>
    <p class="body-5 meta__v${mono ? ' mono' : ''}">${esc(v)}</p>
    ${sub ? `<p class="caption-5 muted">${esc(sub)}</p>` : ''}
  </div>`;
}

function statItem(label, value, sub) {
  return `<div class="stat">
    <p class="stat__value stat__value--sm mono">${esc(value)}</p>
    <p class="stat__label">${esc(label)}</p>
    ${sub ? `<p class="caption-5 muted">${esc(sub)}</p>` : ''}
  </div>`;
}

/* ---------------- 启动 ---------------- */
initNav('trace');
bindStatic();
observeReveal();

const initialCode = (qs('code') || '').trim();
if (initialCode) {
  el('codeInput').value = initialCode;
  loadTrace(initialCode, { scroll: false });
} else {
  renderGuide();
  loadHot();
}

/* ---------------- 静态绑定 ---------------- */
function bindStatic() {
  const form = el('searchForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitSearch();
  });

  $$('[data-example]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.example;
      el('codeInput').value = code;
      loadTrace(code, { scroll: true });
    });
  });

  el('codeInput').addEventListener('input', () => {
    if (!el('searchError').hidden) clearError();
  });

  const result = el('result');
  result.addEventListener('click', onResultClick);
  result.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'aiForm') {
      e.preventDefault();
      submitAsk();
    }
  });
}

function submitSearch() {
  const input = el('codeInput');
  const code = String(input.value || '').trim();
  if (!code) {
    showError('请先输入溯源码，或点下方示例码');
    input.focus();
    return;
  }
  loadTrace(code, { scroll: true });
}

function onResultClick(e) {
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;

  const copyBtn = target.closest('[data-copy]');
  if (copyBtn) { copyText(copyBtn.dataset.copy); return; }

  const recHead = target.closest('[data-toggle-rec]');
  if (recHead) { toggleRecord(recHead); return; }

  const levelBtn = target.closest('[data-level]');
  if (levelBtn) { setLevel(levelBtn.dataset.level); return; }

  const allBtn = target.closest('[data-toggle-all]');
  if (allBtn) { setAllRecords(!state.expanded); return; }

  const askBtn = target.closest('[data-ask]');
  if (askBtn) { askAI(askBtn.dataset.ask); return; }

  const retryBtn = target.closest('[data-retry]');
  if (retryBtn) { askAI(retryBtn.dataset.retry); return; }

  const codeLink = target.closest('[data-code]');
  if (codeLink) {
    e.preventDefault();
    el('codeInput').value = codeLink.dataset.code;
    loadTrace(codeLink.dataset.code, { scroll: true });
  }
}

/* ---------------- 查询 ---------------- */
async function loadTrace(code, opt = {}) {
  if (state.loading) return;
  state.loading = true;
  clearError();
  showSkeleton();

  try {
    const data = await api('/api/trace/' + encodeURIComponent(code));
    state.data = data;
    state.code = data.batch.code;
    state.expanded = true;
    document.body.classList.add('is-result');
    history.replaceState(null, '', '?code=' + encodeURIComponent(data.batch.code));
    document.title = data.batch.code + ' · 溯源码查询 · 田源可信';
    el('codeInput').value = data.batch.code;
    renderResult(data);
    if (window.Journey3D) window.Journey3D.mount(data);
    setLevel(state.level);
    observeReveal(el('result'));
    if (opt.scroll) el('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    state.data = null;
    if (window.Journey3D) window.Journey3D.dispose();
    showError(err && err.message ? err.message : '溯源码不存在，请核对字母与数字');
    renderGuide();
    loadHot();
  } finally {
    state.loading = false;
    el('result').removeAttribute('aria-busy');
  }
}

function showError(msg) {
  const text = /不存在/.test(String(msg)) ? '溯源码不存在，请核对字母与数字' : String(msg);
  const box = el('searchError');
  box.innerHTML = `<div class="callout callout--red" role="alert">
    ${icon('alert')}
    <div>
      <p class="body-5">${esc(text)}</p>
      <p class="caption-2" style="margin-top:var(--s-25)">可点下方示例码直接查看，也可以核对箱贴上的字母与数字。</p>
    </div>
  </div>`;
  box.hidden = false;
  el('codeInput').classList.add('input--error');
  el('codeInput').setAttribute('aria-invalid', 'true');
  toast(text, 'error');
}

function clearError() {
  const box = el('searchError');
  if (!box) return;
  box.hidden = true;
  box.innerHTML = '';
  el('codeInput').classList.remove('input--error');
  el('codeInput').removeAttribute('aria-invalid');
}

/* ---------------- 骨架屏 ---------------- */
function showSkeleton() {
  const line = (w) => `<div class="skeleton skeleton--text" style="width:${w}"></div>`;
  el('result').setAttribute('aria-busy', 'true');
  el('result').innerHTML = `
    <div class="result-bar card" aria-hidden="true">
      <div class="skeleton skeleton--text" style="width:160px"></div>
      <div class="skeleton skeleton--text" style="width:96px"></div>
    </div>
    <div class="trace-layout">
      <div class="trace-main" aria-hidden="true">
        <div class="card card--pad-lg">
          <div class="sk-summary">
            <div class="skeleton sk-art"></div>
            <div class="stack gap-100">
              <div class="skeleton skeleton--title"></div>
              ${line('40%')}${line('86%')}${line('70%')}${line('76%')}
            </div>
          </div>
        </div>
        <div class="card card--pad">
          <div class="skeleton skeleton--title mb-200"></div>
          ${line('100%')}${line('92%')}${line('64%')}
        </div>
        <div class="card card--pad">
          <div class="skeleton skeleton--title mb-200"></div>
          ${line('100%')}${line('88%')}${line('96%')}${line('72%')}
        </div>
      </div>
      <div class="trace-rail" aria-hidden="true">
        <div class="card card--pad">
          <div class="skeleton skeleton--title mb-200"></div>
          ${line('100%')}${line('100%')}${line('84%')}${line('92%')}
          <div class="skeleton skeleton--text mt-300" style="width:100%"></div>
        </div>
      </div>
    </div>`;
}

/* ---------------- 引导态 ---------------- */
function renderGuide() {
  document.title = '溯源码查询 · 田源可信';
  document.body.classList.remove('is-result');
  el('result').innerHTML = `
    <div class="guide">
      <section class="card card--pad-lg" data-reveal>
        <p class="eyebrow">还没有查询</p>
        <h2 class="heading-4 mt-200" style="max-width:680px">一物一码，查的是一整条来路</h2>
        <p class="body-3 muted mt-200" style="max-width:640px">箱贴上的码对应一个采收批次，不是单独一颗果子。输入码以后，能看到这块地、这一季的农事、这份检测报告和这趟冷链，记录按时间排在一条哈希链上。</p>
        <div class="steps mt-500">
          <div class="step">
            <span class="step__idx caption-3">1</span>
            <p class="title-3">扫码或输码</p>
            <p class="body-6 muted">箱贴二维码指向本页，地址栏自动带上批次码，手输也可以。</p>
          </div>
          <div class="step">
            <span class="step__idx caption-3">2</span>
            <p class="title-3">看四类记录</p>
            <p class="body-6 muted">产地、农事、检测、冷链按时间排开，每条都带操作人与上传方式。</p>
          </div>
          <div class="step">
            <span class="step__idx caption-3">3</span>
            <p class="title-3">核对链上哈希</p>
            <p class="body-6 muted">每条记录都有交易哈希与区块高度，改一条就会对不上。</p>
          </div>
        </div>
        <div class="callout mt-500">
          ${icon('info')}
          <p class="body-6">手边没有箱子也能看：点下面的热门批次，直接打开一整批的真实记录。</p>
        </div>
      </section>

      <section class="mt-500" data-reveal>
        <div class="sec-head">
          <h2 class="heading-6">热门批次</h2>
          <span class="caption-2 muted">按扫码次数排</span>
        </div>
        <div class="grid grid--3 mt-200" id="hotList">
          ${skeletonCards(3, 'sk-hot')}
        </div>
      </section>
    </div>`;
  observeReveal(el('result'));
}

async function loadHot() {
  const host = el('hotList');
  if (!host) return;
  try {
    const res = await api('/api/products?traceOnly=1');
    const map = new Map((res.items || []).map((p) => [p.code, p]));
    const picks = EXAMPLES.map((code) => map.get(code)).filter(Boolean);
    if (!picks.length) throw new Error('没有可展示的批次');
    host.innerHTML = picks.map(hotCard).join('');
  } catch (e) {
    host.innerHTML = EXAMPLES.map((code) => `
      <a class="card card--hover hot" href="?code=${encodeURIComponent(code)}" data-code="${esc(code)}">
        <span class="hot__art hot__art--plain">${icon('box')}</span>
        <span class="hot__body">
          <span class="title-3">示例批次</span>
          <span class="caption-4 muted">点开查看完整记录</span>
          <span class="hot__code mono caption-5">${esc(code)}</span>
        </span>
        <span class="hot__go">${icon('arrowRight')}</span>
      </a>`).join('');
  }
  observeReveal(host);
}

function hotCard(p) {
  return `<a class="card card--hover hot" href="?code=${encodeURIComponent(p.code)}" data-code="${esc(p.code)}">
    <span class="hot__art">${productArt(p.art || 'pear', { size: 96 })}</span>
    <span class="hot__body">
      <span class="title-3">${esc(p.name)}</span>
      <span class="caption-4 muted">${esc(p.farmer.region.county)} · ${esc(p.farmer.name)}</span>
      <span class="hot__code mono caption-5">${esc(p.code)}</span>
    </span>
    <span class="hot__go">${icon('arrowRight')}</span>
  </a>`;
}

/* ---------------- 结果 ---------------- */
function renderResult(d) {
  const recs = d.records || [];
  const localHost = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const base = localHost && d.qrBase ? d.qrBase : location.origin;
  const scanUrl = `${base}/t?c=${encodeURIComponent(d.batch.code)}`;
  const ok = !(d.verify && d.verify.ok === false);

  el('result').innerHTML = `
    <div class="result-bar card" data-reveal>
      <div class="row wrap gap-100" style="min-width:0">
        <span class="caption-4 muted">当前溯源</span>
        <span class="mono body-5">${esc(d.batch.code)}</span>
        ${ok
          ? `<span class="badge badge--green">${icon('shield')} 链上已校验</span>`
          : `<span class="badge badge--red">${icon('alert')} 校验未通过</span>`}
        <span class="badge">${recs.length} 条记录</span>
      </div>
      <div class="row gap-75">
        <a class="btn btn--sm btn--ghost rail-jump" href="#aiPanel">${icon('sparkle')} AI 答疑</a>
        <button type="button" class="btn btn--sm btn--secondary" data-toggle-all aria-pressed="true">
          <span class="rec__chev">${icon('chevronDown')}</span> 折叠全部
        </button>
      </div>
    </div>

    ${journeyCard(d)}

    <div class="trace-layout">
      <div class="trace-main">
        ${summaryCard(d)}
        ${verifyBlock(d)}
        ${qrCard(d, scanUrl)}
        ${levelCard(d)}
        ${baseCard(d)}
        ${intervalCard(d)}
        ${timelineCard(d)}
        ${reportCard(d)}
        ${coldCard(d)}
        ${iotCard(d)}
        ${chainCard(d)}
        ${storyCard(d)}
        ${priceCard(d)}
        ${relatedCard(d)}
      </div>
      <aside class="trace-rail" aria-label="智能体答疑">
        ${aiCard(d)}
      </aside>
    </div>`;
}

/* 摘要卡 */
function summaryCard(d) {
  const p = d.product;
  const f = d.farmer;
  const b = d.batch;
  const geo = d.geo;
  const addr = [f.region.province, f.region.city, f.region.county, f.region.village].filter(Boolean).join(' ');

  return `<section class="card card--pad-lg" data-reveal>
    <div class="summary">
      <div class="summary__art">${productArt(p.art || 'pear', { size: 200 })}</div>
      <div class="summary__body">
        <div class="row wrap gap-75">
          <span class="badge badge--green">${esc(b.grade || p.grade || '')}</span>
          <span class="badge">${esc(p.category || '')}</span>
          ${p.greenFood ? '<span class="badge">绿色食品</span>' : ''}
          ${p.organic ? '<span class="badge">有机认证</span>' : ''}
          ${p.geoIndication && geo ? `<span class="badge badge--amber">${icon('seal')} 地理标志</span>` : ''}
          ${b.status ? statusBadge('batch', b.status) : ''}
        </div>
        <h2 class="heading-5 mt-200">${esc(p.name)}</h2>
        <div class="codebar mt-200">
          <span class="caption-4 muted">批次码</span>
          <code class="codebar__code mono caption-1">${esc(b.code)}</code>
          <button type="button" class="btn btn--sm btn--secondary" data-copy="${esc(b.code)}">${icon('copy')} 复制</button>
        </div>
        <div class="meta-grid mt-300">
          ${metaItem('产地', addr, `${b.plot} · 面积 ${b.area || '—'}`, false, true)}
          ${metaItem('生产者', f.name, f.org)}
          ${metaItem('采收日期', fmt.date(b.harvestedAt), `${fmt.int(b.qty)} ${b.unit} · ${b.grade}`)}
          ${geo ? metaItem('地理标志', geo.name, geo.code) : metaItem('规格', p.spec, p.unit)}
          ${metaItem('扫码次数', `${fmt.int(d.scanCount)} 次`, '含重复扫码')}
        </div>
        ${p.summary ? `<p class="body-6 muted mt-300">${esc(p.summary)}</p>` : ''}
      </div>
    </div>
  </section>`;
}

/* 校验徽标 */
function verifyBlock(d) {
  const v = d.verify || { ok: true, total: (d.records || []).length };
  const recs = d.records || [];
  const last = recs.reduce((m, r) => Math.max(m, Number(r.height) || 0), 0);

  if (v.ok !== false) {
    return `<div class="callout verify" data-reveal role="status">
      ${icon('shield')}
      <div class="verify__body">
        <p class="body-1">链上校验通过 · 共 ${v.total} 条记录</p>
        <p class="caption-2 muted">${v.total} 条记录逐条重算一致，哈希首尾相接，最新写入区块 #${last}。任何一条被改动，这里会立刻报出位置。</p>
      </div>
      <span class="stamp">已核验</span>
    </div>`;
  }

  const idx = Number(v.tamperedIndex) >= 0 ? Number(v.tamperedIndex) + 1 : 1;
  return `<div class="callout callout--red verify" data-reveal role="alert">
    ${icon('alert')}
    <div class="verify__body">
      <p class="body-1">第 ${idx} 条记录与链上哈希不一致</p>
      <p class="caption-2">该条内容在写入哈希链之后被改动，重算结果与存储哈希不同，其余记录仍能对上。演示数据篡改，可在运营后台关闭。</p>
    </div>
    <span class="stamp stamp--red">校验未通过</span>
  </div>`;
}

/* 二维码 */
function journeyCard(d) {
  return `<section class="card card--pad-lg journey-card" data-journey>
    <div class="sec-head">
      <div class="sec-head__title">${icon('route')}<h2 class="heading-6">一箱货的旅程</h2></div>
      <span class="badge">3D 演示</span>
    </div>
    <p class="caption-2 muted mt-100">从地块到餐桌的四个节点。拖动可旋转，点击节点查看对应记录；手机与减弱动态环境显示静态全景。</p>
    <div class="journey">
      <div class="journey__stage">
        <canvas class="journey__gl" aria-label="一箱砀山酥梨从梨园到餐桌的低多边形 3D 沙盘"></canvas>
        <div class="journey__loading" role="status">正在搭建 3D 沙盘…</div>
        <img class="journey__fallback" src="/assets/photos/journey-fallback.jpg" alt="一箱砀山酥梨从梨园到餐桌的 3D 沙盘静态图" hidden>
      </div>
      <aside class="journey__side">
        <div class="journey__tools">
          <span>拖动旋转 · 点击站点</span>
          <button class="journey__all" type="button" data-journey-reset>看全景</button>
        </div>
        <div class="journey__steps" data-journey-steps></div>
        <div class="journey__detail" data-journey-detail></div>
      </aside>
    </div>
  </section>`;
}

function qrCard(d, url) {
  return `<section class="card card--pad" data-reveal>
    <div class="sec-head">
      <div class="sec-head__title">${icon('qr')}<h2 class="heading-6">箱贴二维码</h2></div>
      <span class="badge">一箱一码</span>
    </div>
    <div class="qr-block mt-200">
      <img class="qr-img" src="/api/qr?data=${encodeURIComponent(url)}&size=180" width="180" height="180" alt="批次 ${esc(d.batch.code)} 的溯源二维码">
      <div class="qr-meta">
        <p class="caption-4 muted">手机扫这个码，或把链接发给自己</p>
        <p class="qr-link mono caption-5">${esc(url)}</p>
        <div class="row wrap gap-75 mt-100">
          <button type="button" class="btn btn--sm btn--secondary" data-copy="${esc(url)}">${icon('copy')} 复制溯源链接</button>
        </div>
        <p class="caption-2 muted">一箱一码，扫码即达本页</p>
        ${/localhost|127\.0\.0\.1/.test(url) ? '<p class="caption-5 muted">本机演示地址，手机扫码需与服务在同一网络</p>' : ''}
      </div>
    </div>
  </section>`;
}

/* 分级 tabs */
function levelCard(d) {
  return `<section class="card card--pad" data-reveal>
    <div class="sec-head">
      <div class="sec-head__title">${icon('eye')}<h2 class="heading-6">分级查看</h2></div>
      <div class="segmented" role="group" aria-label="展示深度">
        <button type="button" data-level="base" aria-pressed="false">基础</button>
        <button type="button" data-level="advanced" aria-pressed="true">进阶</button>
        <button type="button" data-level="deep" aria-pressed="false">深度</button>
      </div>
    </div>
    <p class="caption-2 muted mt-100" id="levelNote">${esc(LEVEL_NOTE[state.level])}</p>
    <div class="callout mt-200" id="levelHint" hidden></div>
  </section>`;
}

/* 基础信息 */
function baseCard(d) {
  const f = d.farmer;
  const b = d.batch;
  const test = (d.tests || [])[0];
  const addr = [f.region.province, f.region.city, f.region.county, f.region.village].filter(Boolean).join(' ');
  const conclusion = !test
    ? '检测报告待上传'
    : /间隔期|预警/.test(test.conclusion || '')
      ? '合格，另有间隔期预警'
      : (test.items || []).every((i) => i.pass !== false)
        ? '所检项目合格'
        : '存在不合格项';

  return `<section class="card card--pad" data-reveal>
    <div class="sec-head">
      <div class="sec-head__title">${icon('pin')}<h2 class="heading-6">基础信息</h2></div>
    </div>
    <div class="meta-grid mt-200">
      ${metaItem('产地明细', addr, `${b.plot} · 面积 ${b.area || '—'}`)}
      ${metaItem('采收与产量', fmt.date(b.harvestedAt), `${fmt.int(b.qty)} ${b.unit} · ${b.grade || '未分级'}`)}
      ${metaItem('检测结论', conclusion, test ? `${test.reportNo} · ${fmt.date(test.at)}` : '')}
      ${d.geo ? metaItem('地理标志授权', d.geo.name, `${d.geo.code} · ${d.geo.holder}`) : metaItem('种植方式', p2str(d.product), '')}
    </div>
    ${test ? `<div class="callout ${/间隔期|预警/.test(test.conclusion || '') ? 'callout--amber' : ''} mt-200">${icon(/间隔期|预警/.test(test.conclusion || '') ? 'alert' : 'check')}<p class="body-6">${esc(test.conclusion)}</p></div>` : ''}
  </section>`;
}

function p2str(p) {
  const tags = [];
  if (p.greenFood) tags.push('绿色食品');
  if (p.organic) tags.push('有机');
  return tags.length ? tags.join(' · ') : '常规种植';
}

/* 用药间隔期核算 */
function intervalAudit(records) {
  const harvest = records.find((r) => r.type === 'harvest');
  const uses = records.filter((r) => r.type === 'pesticide');
  if (!harvest || !uses.length) return { rows: [], harvest: harvest || null };
  const rows = uses.map((r) => {
    const days = Math.round((new Date(harvest.at) - new Date(r.at)) / 86400000);
    const ev = (r.evidence || []).find((e) => /间隔期/.test(e.label));
    const need = ev ? parseInt(String(ev.value).replace(/[^\d]/g, ''), 10) : NaN;
    const ok = Number.isFinite(need) ? days >= need : null;
    return { r, days, need: Number.isFinite(need) ? need : null, ok, margin: Number.isFinite(need) ? days - need : null };
  });
  return { rows, harvest };
}

function intervalCard(d) {
  const recs = d.records || [];
  const audit = intervalAudit(recs);
  const bad = audit.rows.filter((x) => x.ok === false);
  const unknown = audit.rows.filter((x) => x.ok === null);
  const headBadge = !audit.rows.length
    ? '<span class="badge">无用药记录</span>'
    : bad.length
      ? `<span class="badge badge--red">${icon('alert')} ${bad.length} 次间隔期不足</span>`
      : unknown.length
        ? `<span class="badge badge--amber">${unknown.length} 次待核</span>`
        : `<span class="badge badge--green">${icon('check')} 均满足间隔期</span>`;

  const rows = audit.rows.map((x) => {
    const badge = x.ok === true
      ? '<span class="badge badge--green">满足</span>'
      : x.ok === false
        ? `<span class="badge badge--red">不足 ${Math.abs(x.margin)} 天</span>`
        : '<span class="badge badge--amber">未标注</span>';
    return `<tr>
      <td data-label="用药日期"><span class="mono">${fmt.date(x.r.at)}</span></td>
      <td data-label="事项"><span class="body-5">${esc(x.r.title)}</span></td>
      <td data-label="安全间隔期"><span class="mono">${x.need === null ? '—' : x.need + ' 天'}</span></td>
      <td data-label="距采收" class="num"><span class="mono">${x.days} 天</span></td>
      <td data-label="核算结论">${badge}</td>
    </tr>`;
  }).join('');

  const margin = audit.rows.filter((x) => x.ok === true).reduce((m, x) => Math.min(m, x.margin), Infinity);

  return `<section class="card card--pad" data-min="advanced" data-reveal>
    <div class="sec-head">
      <div class="sec-head__title">${icon('scale')}<h2 class="heading-6">用药间隔期核算</h2></div>
      ${headBadge}
    </div>
    <p class="caption-2 muted mt-100">按农药标签的安全间隔期，核算每次用药距采收的天数；不足会标红，并触发平台预警。</p>
    ${audit.rows.length
      ? `<div class="table-wrap mt-200">
          <table class="table table--stack">
            <thead><tr><th>用药日期</th><th>事项</th><th>安全间隔期</th><th class="num">距采收</th><th>核算结论</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`
      : `<div class="mt-200">${emptyState('本批次没有用药记录', '未使用农药的批次不会跳过核算，这里会明确写“无用药记录”。', 'bug', '')}</div>`}
    ${bad.length
      ? `<div class="callout callout--amber mt-200">${icon('alert')}<p class="body-6">最近一次用药距采收 ${bad[0].days} 天，低于标签要求的 ${bad[0].need} 天。平台已触发预警，建议暂缓发货并复检。</p></div>`
      : margin !== Infinity && audit.rows.length
        ? `<div class="callout mt-200">${icon('check')}<p class="body-6">每次用药距采收都满足标签要求，最短的一次留了 ${margin} 天余量。</p></div>`
        : ''}
  </section>`;
}

/* 时间线 */
function timelineCard(d) {
  const recs = d.records || [];
  return `<section class="card card--pad" data-min="advanced" data-reveal>
    <div class="sec-head">
      <div class="sec-head__title">${icon('clock')}<h2 class="heading-6">农事记录</h2><span class="badge">${recs.length} 条</span></div>
      <span class="caption-2 muted">按时间排序 · 全部写入哈希链</span>
    </div>
    ${recs.length
      ? `<ol class="timeline mt-300">${recs.map((r, i) => recItem(r, i)).join('')}</ol>`
      : `<div class="mt-200">${emptyState('本批次还没有农事记录', '农户在田间上传记录后，会实时写入哈希链。', 'clock', '')}</div>`}
  </section>`;
}

function recItem(r, i) {
  const meta = DICT.record[r.type] || [r.type || '记录', 'box'];
  return `<li class="timeline__item" style="--i:${i || 0}">
    <div class="timeline__rail">
      <span class="timeline__dot timeline__dot--done" title="${esc(meta[0])}">${icon(meta[1])}</span>
    </div>
    <div class="timeline__body">
      <div class="rec">
        <button type="button" class="rec__head" data-toggle-rec aria-expanded="true">
          <span class="rec__top">
            <span class="rec__title body-1">${esc(r.title)}</span>
            <span class="rec__chev">${icon('chevronDown')}</span>
          </span>
          <span class="row wrap gap-75">
            ${methodBadge(r.method)}
            <span class="caption-5 muted">${esc(r.operator || '未署名')}</span>
            <span class="caption-5 mono muted">${fmt.date(r.at, true)}</span>
          </span>
        </button>
        <div class="rec__detail">
          <p class="body-6">${esc(r.detail)}</p>
          ${(r.evidence || []).length
            ? `<div class="rec__ev">${r.evidence.map((e) => `<span class="ev"><span class="ev__k caption-5 muted">${esc(e.label)}</span><span class="ev__v body-5 mono">${esc(e.value)}</span></span>`).join('')}</div>`
            : ''}
          <div class="rec__chain">
            <span class="caption-5 muted">链上交易</span>
            <code class="rec__hash mono caption-5">${esc(r.tx)}</code>
            <button type="button" class="btn btn--sm btn--ghost" data-copy="${esc(r.tx)}">${icon('copy')} 复制</button>
            <span class="caption-5 muted rec__more" data-min="deep">区块 #${r.height} · 数据哈希 ${shortHash(r.hash)}</span>
          </div>
        </div>
      </div>
    </div>
  </li>`;
}

/* 检测报告 */
function reportCard(d) {
  const t = (d.tests || [])[0];
  if (!t) {
    return `<section class="card card--pad" data-min="advanced" data-reveal>
      <div class="sec-head">
        <div class="sec-head__title">${icon('flask')}<h2 class="heading-6">检测报告</h2></div>
        <span class="badge badge--amber">待上传</span>
      </div>
      <div class="mt-200">${emptyState('本批次还没有检测报告', '检测机构出具报告后会上传到批次，报告号与结论随码可查。', 'flask', '')}</div>
    </section>`;
  }

  const warn = /间隔期不足|预警/.test(t.conclusion || '');
  const allPass = (t.items || []).every((i) => i.pass !== false);

  const rows = (t.items || []).map((it) => {
    const ratio = Number(it.ratio);
    const val = Number.isFinite(ratio) ? Math.max(0, ratio) : 0;
    const cls = val >= 100 ? 'meter--red' : val >= 70 ? 'meter--amber' : '';
    const width = Math.max(2, Math.min(100, Math.round(val))) + '%';
    const noDetect = String(it.value) === '未检出';
    return `<tr>
      <td data-label="检测项"><span class="body-5">${esc(it.name)}</span>${it.pass === false ? ' <span class="badge badge--red">不合格</span>' : ''}</td>
      <td data-label="检测值"><span class="mono">${esc(it.value)}</span> <span class="caption-5 muted">${esc(it.unit || '')}</span>${noDetect ? '<div class="caption-5 muted">低于检出限</div>' : ''}</td>
      <td data-label="限量"><span class="mono">${esc(it.limit)}</span> <span class="caption-5 muted">${esc(it.unit || '')}</span></td>
      <td data-label="占限值比">
        <div class="ratio">
          <div class="meter ${cls}"><div class="meter__fill" style="width:${width}"></div></div>
          <span class="caption-5 mono">${Number.isFinite(ratio) ? ratio : 0}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `<section class="card card--pad" data-min="advanced" data-reveal>
    <div class="sec-head">
      <div class="sec-head__title">${icon('flask')}<h2 class="heading-6">检测报告</h2></div>
      ${warn
        ? `<span class="badge badge--amber">${icon('alert')} 有预警</span>`
        : allPass
          ? `<span class="badge badge--green">${icon('check')} 全部合格</span>`
          : '<span class="badge badge--red">存在不合格项</span>'}
    </div>
    <div class="meta-grid mt-200">
      ${metaItem('报告号', t.reportNo, '', true)}
      ${metaItem('检测机构', t.lab)}
      ${metaItem('检测日期', fmt.date(t.at))}
      ${metaItem('检测项', `${(t.items || []).length} 项`, '含农残与重金属')}
    </div>
    <div class="callout ${warn ? 'callout--amber' : ''} mt-200">
      ${icon(warn ? 'alert' : 'check')}
      <p class="body-6">${esc(t.conclusion)}</p>
    </div>
    <div class="table-wrap mt-200">
      <table class="table table--stack">
        <thead><tr><th>检测项</th><th>检测值</th><th>限量</th><th>占限值比</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="caption-5 muted mt-100">未检出=低于方法检出限，不等于零。占比为检测值除以限量值，≥70% 标琥珀，≥100% 标红。</p>
  </section>`;
}

/* 冷链 */
function coldCard(d) {
  const s = d.shipment;
  if (!s) {
    return `<section class="card card--pad" data-min="advanced" data-reveal>
      <div class="sec-head">
        <div class="sec-head__title">${icon('truck')}<h2 class="heading-6">冷链轨迹</h2></div>
        <span class="badge">暂无运单</span>
      </div>
      <div class="mt-200">${emptyState('本批次还没有运单', '付款发货后生成运单，节点温度随车逐条上传，超过 8℃ 会标红。', 'truck', '')}</div>
    </section>`;
  }

  const cps = s.checkpoints || [];
  const temps = cps.map((c) => Number(c.temp)).filter((n) => Number.isFinite(n));
  const over = cps.filter((c) => Number(c.temp) > 8).length;
  const max = temps.length ? Math.max(...temps) : null;
  const min = temps.length ? Math.min(...temps) : null;
  const chartable = temps.length > 1 && min >= 0;

  const nodes = cps.map((c) => {
    const hot = Number(c.temp) > 8;
    return `<div class="cp">
      <span class="cp__time caption-5 mono muted">${fmt.date(c.at, true)}</span>
      <span class="cp__place body-6">${esc(c.place)}</span>
      <span class="badge ${hot ? 'badge--red' : ''} cp__temp">${icon('thermometer')} ${fmt.temp(c.temp)}</span>
    </div>`;
  }).join('');

  return `<section class="card card--pad" data-min="advanced" data-reveal>
    <div class="sec-head">
      <div class="sec-head__title">${icon('truck')}<h2 class="heading-6">冷链轨迹</h2></div>
      ${over ? `<span class="badge badge--red">${icon('alert')} ${over} 个节点超 8℃</span>` : '<span class="badge badge--green">温度正常</span>'}
    </div>
    <div class="meta-grid mt-200">
      ${metaItem('承运商', s.carrier || '未填写')}
      ${metaItem('运单号', s.waybill || '未填写', '', true)}
      ${metaItem('起讫', `${s.from || '—'} 至 ${s.to || '—'}`)}
      ${metaItem('承诺时效', fmt.date(s.promisedAt, true), s.deliveredAt ? `已于 ${fmt.date(s.deliveredAt, true)} 签收` : '运输中')}
    </div>
    <div class="mt-200">${nodes}</div>
    <div data-min="deep">
      <hr class="divider mt-300">
      <div class="sec-head mt-300">
        <h3 class="title-3">温度曲线</h3>
        <span class="caption-5 muted">${min !== null ? `${fmt.temp(min)} 至 ${fmt.temp(max)}，${cps.length} 个节点` : '暂无温度读数'}</span>
      </div>
      ${chartable
        ? lineChart(cps.map((c) => timeLabel(c.at)), [{ values: temps, color: over ? 'var(--amber-600)' : 'var(--green-600)' }], { height: 200, area: false })
        : `<p class="body-6 muted mt-200">${temps.length ? '本批次为冷冻运输，节点温度低于 0℃，曲线只列出读数，不上图。' : '本批次还没有温度读数。'}</p>`}
      <p class="caption-5 muted mt-100">运输途中每次节点扫描记录一次温度，连续超温会进入售后通道。</p>
    </div>
  </section>`;
}

/* IoT 证据 */
function iotCard(d) {
  const iots = (d.records || []).filter((r) => r.method === 'iot');
  return `<section class="card card--pad" data-min="deep" data-reveal>
    <div class="sec-head">
      <div class="sec-head__title">${icon('cpu')}<h2 class="heading-6">IoT 采集证据</h2></div>
      <span class="badge ${iots.length ? 'badge--green' : ''}">${iots.length} 条自动采集</span>
    </div>
    <p class="caption-2 muted mt-100">传感器按固定频率上传，记录由网关直接写入链上，不需要人工填写。</p>
    ${iots.length
      ? `<div class="stack gap-200 mt-200">${iots.map((r) => `<div class="card card--soft card--pad">
          <div class="row between wrap gap-100">
            <p class="body-5">${esc(r.title)}</p>
            <span class="caption-5 mono muted">${fmt.date(r.at, true)}</span>
          </div>
          <div class="rec__ev mt-100">${(r.evidence || []).map((e) => `<span class="ev"><span class="ev__k caption-5 muted">${esc(e.label)}</span><span class="ev__v body-5 mono">${esc(e.value)}</span></span>`).join('')}</div>
        </div>`).join('')}</div>`
      : `<div class="mt-200">${emptyState('本批次没有 IoT 记录', '接入温湿度传感器后，读到的时间与数值会自动上链。', 'cpu', '')}</div>`}
  </section>`;
}

/* 链上存证 */
function chainCard(d) {
  const v = d.verify || {};
  const recs = d.records || [];
  const nodes = v.nodes || [];
  const byId = new Map(recs.map((r) => [r.id, r]));
  const last = recs.reduce((m, r) => Math.max(m, Number(r.height) || 0), 0);
  const okay = nodes.filter((n) => n.ok).length;

  const rows = nodes.map((n) => {
    const rec = byId.get(n.id);
    return `<tr>
      <td data-label="区块"><span class="mono">#${rec ? rec.height : '—'}</span></td>
      <td data-label="记录"><span class="body-5">${esc(n.title)}</span><div class="caption-5 muted mono">${esc(n.id)}</div></td>
      <td data-label="存储哈希"><code class="mono caption-5" title="${esc(n.stored)}">${shortHash(n.stored)}</code></td>
      <td data-label="重算结果">${n.ok ? '<span class="badge badge--green">一致</span>' : '<span class="badge badge--red">不一致</span>'}</td>
    </tr>`;
  }).join('');

  return `<section class="card card--pad" data-min="deep" data-reveal>
    <div class="sec-head">
      <div class="sec-head__title">${icon('database')}<h2 class="heading-6">链上存证</h2></div>
      <span class="badge ${okay === nodes.length ? 'badge--green' : 'badge--red'}">${okay} / ${nodes.length} 个节点一致</span>
    </div>
    <div class="grid grid--3 mt-200">
      ${statItem('链上记录', String(recs.length), '本批次')}
      ${statItem('最新区块', '#' + last, '全链高度')}
      ${statItem('哈希算法', 'SHA-256', '前序哈希 + 记录核心')}
    </div>
    <div class="table-wrap mt-300">
      <table class="table table--stack">
        <thead><tr><th>区块</th><th>记录</th><th>存储哈希</th><th>重算结果</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="caption-5 muted mt-100">重算方式：sha256（前序哈希 + 记录核心字段）。任何字段被改动，重算结果都会与存储哈希不同。</p>
  </section>`;
}

/* 生产者 */
function storyCard(d) {
  const f = d.farmer;
  const certs = f.certs || [];
  const addr = [f.region.province, f.region.county, f.region.village].filter(Boolean).join(' ');
  const orgType = /合作社/.test(f.org || '') ? '合作社' : '家庭农场';

  return `<section class="card card--pad" data-reveal>
    <div class="sec-head">
      <div class="sec-head__title">${icon('user')}<h2 class="heading-6">生产者</h2></div>
      <span class="badge">${orgType}</span>
    </div>
    <div class="story mt-200">
      <span class="avatar avatar--lg">${esc(String(f.name || '农').slice(0, 1))}</span>
      <div class="story__who">
        <p class="title-2">${esc(f.name)}</p>
        <p class="caption-2 muted">${esc(f.org)}${f.role ? ' · ' + esc(f.role) : ''}</p>
        <p class="caption-5 muted">${esc(addr)}</p>
      </div>
    </div>
    ${f.story ? `<blockquote class="quote card card--soft card--pad mt-300">${icon('quote')}<p class="body-3">${esc(f.story)}</p></blockquote>` : ''}
    <div class="facts mt-300">
      <div class="fact"><p class="title-1 mono">${esc(String(f.acreage || '—'))}<span class="caption-4 muted"> 亩</span></p><p class="caption-4 muted">种植面积</p></div>
      <div class="fact"><p class="title-1 mono">${esc(String(f.rating || '—'))}</p><p class="caption-4 muted">农户评分</p></div>
      <div class="fact"><p class="title-1 mono">${esc(fmt.int(f.orders || 0))}</p><p class="caption-4 muted">累计订单</p></div>
    </div>
    ${certs.length ? `<div class="row wrap gap-75 mt-300">${certs.map((c) => `<span class="tag">${icon('seal')}${esc(c)}</span>`).join('')}</div>` : ''}
  </section>`;
}

/* 价格构成 */
function priceCard(d) {
  const list = d.priceBreakdown || [];
  if (!list.length) return '';
  const sum = list.reduce((a, i) => a + Number(i.amount || 0), 0);
  const price = Number(d.product.price) || 0;
  const same = Math.abs(sum - price) < 0.01;

  return `<details class="card card--pad fold" data-min="advanced" data-reveal>
    <summary>
      <span class="sec-head__title">${icon('coins')}<span class="heading-6">价格构成</span></span>
      <span class="caption-2 muted">${same ? `合计 ${fmt.money(sum)}，与售价一致` : `合计 ${fmt.money(sum)}`}</span>
      <span class="rec__chev">${icon('chevronDown')}</span>
    </summary>
    <div class="mt-300">
      ${list.map((i) => `<div class="kv"><span class="kv__k">${esc(i.label)}</span><span class="kv__v mono">${fmt.money(i.amount)}</span></div>`).join('')}
      <div class="row between gap-200 mt-200">
        <span class="body-5">合计</span>
        <span class="body-1 mono">${fmt.money(sum)}</span>
      </div>
      <p class="caption-2 muted mt-200">地头收购价直接结算到农户账户，平台按成交额收取 3% 服务费，分选与冷链费用逐项列明。</p>
    </div>
  </details>`;
}

/* 其他批次 */
function relatedCard(d) {
  const list = d.related || [];
  return `<section class="card card--pad" data-min="advanced" data-reveal>
    <div class="sec-head">
      <div class="sec-head__title">${icon('box')}<h2 class="heading-6">同商品其他批次</h2></div>
      <span class="caption-2 muted">${list.length} 个</span>
    </div>
    ${list.length
      ? `<div class="related mt-200">${list.map((r) => `<a class="related__row" href="?code=${encodeURIComponent(r.code)}" data-code="${esc(r.code)}">
          <span class="mono body-5">${esc(r.code)}</span>
          <span class="caption-5 muted">${esc(r.plot)} · 采收 ${fmt.date(r.harvestedAt)}</span>
          <span class="related__go">${icon('arrowRight')}</span>
        </a>`).join('')}</div>`
      : '<p class="body-6 muted mt-200">该商品目前只有这一个在售批次。</p>'}
  </section>`;
}

/* ---------------- 分级 / 折叠 ---------------- */
function setLevel(level) {
  if (!Object.prototype.hasOwnProperty.call(LEVEL_RANK, level)) level = 'advanced';
  state.level = level;
  const root = el('result');

  $$('.segmented [data-level]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === level)));
  $$('[data-min]', root).forEach((node) => {
    node.hidden = LEVEL_RANK[node.dataset.min] > LEVEL_RANK[level];
  });

  const note = el('levelNote');
  if (note) note.textContent = LEVEL_NOTE[level];

  const hint = el('levelHint');
  if (hint) {
    const count = state.data ? (state.data.records || []).length : 0;
    if (level === 'base' && count) {
      hint.innerHTML = `<span class="body-6">还有 ${count} 条农事记录与检测明细没有展开</span>
        <button type="button" class="btn btn--sm btn--primary" data-level="advanced">切到进阶</button>`;
      hint.hidden = false;
    } else {
      hint.hidden = true;
      hint.innerHTML = '';
    }
  }
  observeReveal(root);
}

function toggleRecord(head) {
  const open = head.getAttribute('aria-expanded') !== 'false';
  const detail = head.parentElement ? head.parentElement.querySelector('.rec__detail') : null;
  head.setAttribute('aria-expanded', String(!open));
  if (detail) detail.hidden = open;
}

function setAllRecords(open) {
  const root = el('result');
  $$('[data-toggle-rec]', root).forEach((head) => {
    head.setAttribute('aria-expanded', String(open));
    const detail = head.parentElement ? head.parentElement.querySelector('.rec__detail') : null;
    if (detail) detail.hidden = !open;
  });
  state.expanded = open;
  const btn = root.querySelector('[data-toggle-all]');
  if (btn) {
    btn.setAttribute('aria-pressed', String(open));
    btn.innerHTML = `<span class="rec__chev">${icon('chevronDown')}</span> ${open ? '折叠全部' : '展开全部'}`;
  }
}

/* ---------------- AI 答疑 ---------------- */
function aiCard(d) {
  return `<div class="card card--pad ai-card" id="aiPanel" data-reveal>
    <div class="sec-head">
      <div class="sec-head__title">${icon('sparkle')}<h2 class="heading-6">AI 答疑</h2></div>
      <span class="badge badge--green">本批次</span>
    </div>
    <p class="caption-2 muted mt-100">只回答这一批的事：产地、用药、检测、冷链。答案带引用。</p>
    <form class="ai-form" id="aiForm">
      <input class="input" id="aiInput" type="text" maxlength="120" autocomplete="off" placeholder="问这一批，例如：打过几次药？" aria-label="向 AI 提问">
      <button class="btn btn--primary ai-send" type="submit" aria-label="发送问题">${icon('arrowRight')}</button>
    </form>
    <div class="chat ai-log" id="aiLog" aria-live="polite" hidden></div>
    <p class="caption-5 muted mt-100">每次只保留当前一问一答；回答来自本地规则引擎和这一批的链上记录。</p>
  </div>`;
}

function submitAsk() {
  const input = el('aiInput');
  const q = String(input.value || '').trim();
  if (!q) { input.focus(); return; }
  input.value = '';
  askAI(q);
}

async function askAI(question) {
  const q = String(question || '').trim();
  if (!q || state.busy || !state.data) return;
  state.busy = true;

  const log = el('aiLog');
  log.hidden = false;
  log.innerHTML = '';

  const userTurn = document.createElement('div');
  userTurn.className = 'ai-turn';
  userTurn.innerHTML = `<div class="msg msg--user"><div class="msg__bubble">${esc(q)}</div><div class="msg__meta">你 · ${fmt.date(new Date().toISOString(), true)}</div></div>`;
  log.appendChild(userTurn);

  const pending = document.createElement('div');
  pending.className = 'ai-turn';
  pending.innerHTML = `<div class="workflow">
      ${[0, 1, 2].map((i) => `<div class="workflow__step">
        <span class="workflow__idx">${i + 1}</span>
        <div style="flex:1">
          <div class="skeleton skeleton--text" style="width:${60 - i * 8}%"></div>
          <div class="skeleton skeleton--text" style="width:${86 - i * 6}%"></div>
        </div>
      </div>`).join('')}
    </div>
    <span class="typing"><span></span><span></span><span></span></span>`;
  log.appendChild(pending);
  trimLog();
  scrollToTurn(log, pending);

  try {
    const res = await api('/api/agent/ask', { method: 'POST', body: { question: q, code: state.data.batch.code } });
    pending.innerHTML = agentTurnHtml(res);
  } catch (e) {
    pending.innerHTML = `<div class="callout callout--red">
      ${icon('alert')}
      <div>
        <p class="body-5">智能体没有回答成功</p>
        <p class="caption-2" style="margin-top:var(--s-25)">${esc(e && e.message ? e.message : '请稍后再试')}</p>
        <button type="button" class="btn btn--sm btn--secondary mt-100" data-retry="${esc(q)}">再问一次</button>
      </div>
    </div>`;
  } finally {
    state.busy = false;
    trimLog();
    scrollToTurn(log, pending);
  }
}

function stepsHtml(steps) {
  return (steps || []).map((s, i) => `<div class="workflow__step">
    <span class="workflow__idx">${i + 1}</span>
    <div>
      <p class="body-5">${esc(s.label || s.key || '步骤')}</p>
      ${s.detail ? `<p class="caption-5 muted">${esc(s.detail)}</p>` : ''}
      <p class="caption-5 muted"><span class="mono">${esc(s.tool || '')}</span>${s.status === 'done' ? ' · 完成' : ''}</p>
    </div>
  </div>`).join('');
}

function agentTurnHtml(res) {
  const steps = res.steps || [];
  const paras = String(res.answer || '')
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const cites = (res.citations || []).map((c) => `<div class="source">
    <span class="source__tag">引用</span>
    <span>${esc(c.label || '')}${c.source ? `<span class="muted"> · ${esc(c.source)}</span>` : ''}${c.at ? `<span class="muted"> · ${esc(fmt.date(c.at))}</span>` : ''}</span>
  </div>`).join('');

  const engine = res.engine === 'local' ? '本地规则引擎' : res.engine ? `大模型 · ${res.engine}` : '未知引擎';
  const secs = Number(res.elapsed) >= 1000 ? `${(Number(res.elapsed) / 1000).toFixed(1)} s` : `${Number(res.elapsed) || 0} ms`;
  const confidence = typeof res.confidence === 'number' ? Math.round(res.confidence * 100) : null;

  return `<div class="msg msg--agent">
      <div class="msg__bubble"><div class="ai-answer">${paras || '<p>本批次暂无可回答的内容。</p>'}</div></div>
      <div class="msg__meta ai-meta">
        ${res.intentLabel ? `<span class="badge">${esc(res.intentLabel)}</span>` : ''}
        ${confidence !== null ? `<span>置信度 ${confidence}%</span>` : ''}
        <span>耗时 ${esc(secs)}</span>
        <span>${esc(engine)}</span>
      </div>
      ${cites ? `<div class="sources">${cites}</div>` : ''}
    </div>
    ${steps.length ? `<div class="ai-steps mt-200">
      <p class="caption-5 muted">工作流 · ${steps.length} 步</p>
      <div class="workflow" style="margin-top:var(--s-100)">${stepsHtml(steps)}</div>
    </div>` : ''}`;
}

function trimLog() {
  const log = el('aiLog');
  if (!log) return;
  const turns = $$('.ai-turn', log);
  while (turns.length > 6) turns.shift().remove();
}

function scrollLog(log) {
  if (!log) return;
  log.scrollTop = log.scrollHeight;
}

function scrollToTurn(log, turn) {
  if (!log || !turn || !turn.isConnected) return scrollLog(log);
  log.scrollTop = Math.max(0, turn.offsetTop - 8);
}

