/* 智能体工作台：溯源问答 / 内容生成 / 智能客服 */
(function () {
  'use strict';

  /* ---------------- 常量 ---------------- */
  const TAB_HINTS = {
    ask: '回答附执行链路、引用与置信度，追问会沿用当前批次',
    content: '素材取自批次档案，六块内容均可一键复制',
    service: '售后、物流、发票与佣金问题，必要时转人工',
  };
  const TAB_LABEL = { ask: '溯源问答', content: '内容生成', service: '智能客服' };
  const ORDER_STATUS = {
    paid: '已支付', packing: '打包中', shipping: '冷链运输',
    delivered: '已送达', aftersale: '售后中', done: '已完成',
  };
  const SERVICE_INTENT = {
    refund: '售后赔付', logistics: '物流查询', invoice: '发票开具', cancel: '取消与改址',
    commission: '佣金结算', privacy: '数据隐私', trace: '溯源校验', general: '待转人工',
  };
  const SKELETON_LABELS = ['意图识别', '定位批次', '调用工具', '检索知识库', '合成回答'];
  const CHANNEL_LABEL = { 朋友圈: '朋友圈', 小红书: '小红书', 详情页: '商品详情页' };
  const MAX_MESSAGES = 8;

  const CASES = [
    { id: 'T1', tab: 'ask', q: '这箱梨打过几次药', code: 'TY-2026-0912-DS', expect: '用药 2 次、间隔期核算与检测报告引用' },
    { id: 'T2', tab: 'ask', q: '检测报告里农残合格吗', code: 'TY-2026-0912-DS', expect: '逐项对比限量，给出可核对的结论' },
    { id: 'T3', tab: 'ask', q: '冷链温度正常吗', code: 'TY-2026-0912-DS', expect: '5 个冷链节点，标出超温与赔付入口' },
    { id: 'T4', tab: 'ask', q: '这批货有没有质量风险', code: 'TY-2026-0912-DS', expect: '4 项预警分级，附处置建议' },
    { id: 'T5', tab: 'content', label: '给砀山酥梨写一条朋友圈', productId: 'P01', channel: '朋友圈', expect: '标题、5 条卖点、45 秒分镜与话题标签' },
    { id: 'T6', tab: 'content', label: '给五常大米写小红书笔记', productId: 'P02', channel: '小红书', expect: '换渠道换标题，卖点仍来自批次记录' },
    { id: 'T7', tab: 'service', q: '坏了怎么赔', order: 'DD2026112303', expect: '赔付比例、自助理赔动作与规则引用' },
    { id: 'T8', tab: 'service', q: '物流到哪了', order: 'DD2026112202', expect: '带上订单定位，说明时效与补偿' },
    { id: 'T9', tab: 'service', q: '枸杞能降血糖吗', order: 'DD2026110906', expect: '拒绝功效承诺，amber 提示已转人工' },
  ];

  /* ---------------- 状态 ---------------- */
  const state = {
    llm: null,
    products: [],
    orders: [],
    kb: [],
    lastCode: '',
    asking: false,
    serviceBusy: false,
    contentBusy: false,
    contentSeq: 0,
    content: null,
    contentDetail: null,
    contentChannel: '朋友圈',
    copy: {},
  };

  const $one = (sel, root = document) => root.querySelector(sel);
  const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitForIdle(check, timeout = 8000) {
    const started = Date.now();
    while (check() && Date.now() - started < timeout) await sleep(150);
  }

  function nodeFrom(html) {
    const t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  }
  function hydrateIcons(root = document) {
    $all('[data-icon]', root).forEach((n) => {
      n.innerHTML = icon(n.dataset.icon);
    });
  }
  function shortName(name) {
    return String(name || '').split(' · ')[0];
  }

  /* ---------------- 启动 ---------------- */
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    if (window.Auth && Auth.ready) await Auth.ready;
    initNav('agent');
    hydrateIcons();
    bindTabs();
    bindAsk();
    bindContent();
    bindService();
    const demoAllowed = !window.Auth || !Auth.hasPermission || Auth.hasPermission('demo.view');
    if (demoAllowed) {
      bindDemo();
      renderDemoCases();
    } else {
      const demo = document.getElementById('demo');
      if (demo) demo.remove();
    }
    await loadCore();
    renderContentEmpty();
    renderServiceIdle();
    observeReveal();
    maybeAutoAsk();
  }

  async function loadCore() {
    const [metaR, prodR, orderR, kbR] = await Promise.allSettled([
      api('/api/meta'),
      api('/api/products'),
      api('/api/orders'),
      api('/api/kb'),
    ]);
    const failed = [];

    if (metaR.status === 'fulfilled') {
      state.llm = metaR.value.llm || null;
    } else {
      failed.push('平台信息');
    }
    if (prodR.status === 'fulfilled') {
      state.products = (prodR.value.items || []).filter((p) => p.code && p.status !== 'pending');
    } else {
      failed.push('商品批次');
    }
    if (orderR.status === 'fulfilled') {
      state.orders = orderR.value.items || [];
    } else {
      failed.push('订单');
    }
    if (kbR.status === 'fulfilled') {
      state.kb = kbR.value.items || [];
    } else {
      failed.push('知识库');
    }

    renderEngine(metaR.status === 'fulfilled' ? state.llm : null);
    fillBatchSelect();
    fillOrders();
    fillContentProducts();
    updateCounts();
    renderKB();

    if (failed.length) toast('部分数据加载失败：' + failed.join('、'), 'error');
    if (!state.products.length) renderAskErrorState();
  }

  function updateCounts() {
    $all('[data-kb-count]').forEach((n) => {
      n.textContent = state.kb.length ? String(state.kb.length) : '—';
    });
  }

  /* ---------------- 引擎徽标 ---------------- */
  function renderEngine(llm) {
    const host = $one('#engineCard');
    if (!host) return;
    if (!llm) {
      host.innerHTML = `
        <div class="engine-card__main">
          <span class="engine-card__icon">${icon('cpu')}</span>
          <div class="engine-card__label">
            <p class="caption-5 muted">推理引擎</p>
            <p class="title-3">引擎信息未知</p>
          </div>
          <span class="badge badge--red engine-card__state">未连接</span>
        </div>
        <p class="caption-5 muted engine-card__note">未能读取平台配置，刷新页面重试。</p>`;
      return;
    }
    const enabled = !!llm.enabled;
    host.innerHTML = `
      <div class="engine-card__main">
        <span class="engine-card__icon">${icon('cpu')}</span>
        <div class="engine-card__label">
          <p class="caption-5 muted">推理引擎</p>
          <p class="title-3">${enabled ? '大模型' : '本地引擎'}</p>
        </div>
        <span class="badge ${enabled ? 'badge--blue' : 'badge--green'} badge--dot engine-card__state">${enabled ? '已启用' : '运行中'}</span>
      </div>
      <p class="caption-5 muted engine-card__note">${enabled
        ? '已接入 ' + esc(llm.model || '大模型') + '，回答由模型生成并附引用来源。'
        : '未启用 ' + esc(llm.model || 'deepseek-chat') + '，回答由本地规则引擎生成，可在运营后台切换。'}</p>`;
  }

  /* ---------------- 标签页 ---------------- */
  function bindTabs() {
    const tabs = $all('.tabs [role="tab"]');
    tabs.forEach((btn, i) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
      btn.addEventListener('keydown', (e) => {
        let next = -1;
        if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next < 0) return;
        e.preventDefault();
        tabs[next].focus();
        switchTab(tabs[next].dataset.tab);
      });
    });
  }

  function switchTab(key, opts = {}) {
    if (!TAB_LABEL[key]) return;
    $all('.tabs [role="tab"]').forEach((b) => {
      const on = b.dataset.tab === key;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    ['ask', 'content', 'service'].forEach((k) => {
      const panel = document.getElementById('panel-' + k);
      if (panel) panel.hidden = k !== key;
    });
    const hint = $one('#tabHint');
    if (hint) hint.textContent = TAB_HINTS[key];
    observeReveal();
    if (key === 'content' && !state.content && !state.contentBusy && opts.auto !== false) generateContent();
  }

  function scrollToPanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 88;
    window.scrollTo({ top: Math.max(0, top), behavior: reduce() ? 'auto' : 'smooth' });
  }

  /* ---------------- 通用：批次与订单 ---------------- */
  function fillBatchSelect() {
    const sel = $one('#batchSelect');
    if (!sel) return;
    if (!state.products.length) {
      sel.innerHTML = '<option value="">暂无可用批次</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">不指定（先追问批次）</option>' + state.products
      .map((p) => `<option value="${esc(p.code)}">${esc(p.code)} · ${esc(shortName(p.name))}</option>`)
      .join('');
    const pear = state.products.find((p) => p.name.indexOf('砀山酥梨') >= 0) || state.products[0];
    sel.value = pear.code;
    updateBatchHint();
  }

  function updateBatchHint() {
    const sel = $one('#batchSelect');
    const hint = $one('#batchHint');
    if (!sel || !hint) return;
    if (sel.value) {
      const p = state.products.find((x) => x.code === sel.value);
      hint.textContent = '当前批次 ' + sel.value + (p ? ' · ' + p.name : '') + '，追问会自动沿用';
    } else {
      hint.textContent = '不指定时，智能体会先追问批次';
    }
  }

  function fillOrders() {
    const sel = $one('#orderSelect');
    if (!sel) return;
    if (!state.orders.length) {
      sel.innerHTML = '<option value="">暂无订单</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">不指定订单</option>' + state.orders
      .map((o) => {
        const name = o.product ? shortName(o.product.name) : o.productId;
        return `<option value="${esc(o.no)}">${esc(o.no)} · ${esc(name)} · ${esc(ORDER_STATUS[o.status] || o.status)}</option>`;
      })
      .join('');
    sel.value = state.orders[0].no;
    updateOrderHint();
  }

  function updateOrderHint() {
    const sel = $one('#orderSelect');
    const hint = $one('#orderHint');
    if (!sel || !hint) return;
    const o = state.orders.find((x) => x.no === sel.value);
    if (!o) {
      hint.textContent = '不指定订单时，客服只回答通用规则';
      return;
    }
    hint.textContent = '当前订单：' + (ORDER_STATUS[o.status] || o.status) + ' · ' + o.qty + ' 件 · ' + fmt.money(o.amount);
  }

  /* ---------------- 通用：消息 ---------------- */
  function scrollLog(log) {
    if (!log) return;
    const top = log.scrollHeight;
    if (reduce()) log.scrollTop = top;
    else log.scrollTo({ top, behavior: 'smooth' });
  }
  function trimLog(log) {
    while (log.children.length > MAX_MESSAGES) log.firstElementChild.remove();
  }
  function startLog(log) {
    if (!log || log.dataset.started === 'true') return;
    if (log.querySelector('.empty, .skeleton')) log.innerHTML = '';
    log.dataset.started = 'true';
  }
  function appendUser(log, text) {
    const node = nodeFrom(`<div class="msg msg--user"><div class="msg__bubble body-6">${esc(text)}</div></div>`);
    log.appendChild(node);
    trimLog(log);
    scrollLog(log);
  }
  function appendError(log, message, retryQuestion, retryKind) {
    const node = nodeFrom(`<div class="msg msg--agent"><div class="msg__bubble agent-bubble">
      <div class="callout callout--red">${icon('alert')}<div><p class="body-4">这条问题没有回答成功</p><p class="body-6">${esc(message)}</p></div></div>
      <div class="followups"><button class="btn btn--secondary btn--sm" type="button" data-retry>重试</button></div>
    </div></div>`);
    const retry = $one('[data-retry]', node);
    retry.addEventListener('click', () => {
      node.remove();
      if (retryKind === 'service') askService(retryQuestion);
      else askQuestion(retryQuestion);
    });
    log.appendChild(node);
    trimLog(log);
    scrollLog(log);
  }
  function setSubmitBusy(form, busy) {
    if (!form) return;
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = busy;
  }

  /* ---------------- A 溯源问答 ---------------- */
  function bindAsk() {
    const form = $one('#askForm');
    const input = $one('#askInput');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) {
        toast('先输入一个问题', 'error');
        input.focus();
        return;
      }
      input.value = '';
      askQuestion(q);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    $one('#askChips').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-ask]');
      if (chip) askQuestion(chip.dataset.ask);
    });
    $one('#batchSelect').addEventListener('change', updateBatchHint);
    $one('#askLog').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-q]');
      if (chip) askQuestion(chip.dataset.q);
    });
  }

  function maybeAutoAsk() {
    if (!state.products.length) return;
    window.setTimeout(() => {
      if (state.asking) return;
      const log = $one('#askLog');
      if (!log || !log.querySelector('.skeleton')) return;
      const select = $one('#batchSelect');
      if (select && select.value) state.lastCode = select.value;
      askQuestion('这箱梨打过几次药');
    }, 350);
  }

  async function askQuestion(question) {
    const q = String(question || '').trim();
    if (!q) {
      toast('先输入一个问题', 'error');
      return;
    }
    if (state.asking) {
      toast('上一个问题还在处理，稍等一下', 'error');
      return;
    }
    const log = $one('#askLog');
    const select = $one('#batchSelect');
    const code = (select && select.value) || state.lastCode || '';

    state.asking = true;
    setSubmitBusy($one('#askForm'), true);
    startLog(log);
    appendUser(log, q);
    const pending = appendAskPending(log);

    try {
      const body = { question: q };
      if (code) body.code = code;
      const started = performance.now();
      const res = await api('/api/agent/ask', { method: 'POST', body });
      const spent = performance.now() - started;
      if (!reduce()) await sleep(Math.max(0, 900 - spent));

      if (res && res.data && res.data.code) {
        state.lastCode = res.data.code;
        if (select && !select.value) {
          const exists = Array.from(select.options).some((o) => o.value === res.data.code);
          if (exists) {
            select.value = res.data.code;
            updateBatchHint();
          }
        }
      }
      await runWorkflow(pending, res);
    } catch (err) {
      pending.el.remove();
      appendError(log, err.message || '问答请求失败', q, 'ask');
      toast(err.message || '问答请求失败', 'error');
    } finally {
      state.asking = false;
      setSubmitBusy($one('#askForm'), false);
    }
  }

  function appendAskPending(log) {
    const el = nodeFrom(`<div class="msg msg--agent"><div class="msg__bubble agent-bubble">
      <div class="typing-row">
        <span class="typing"><span></span><span></span><span></span></span>
        <span class="caption-5 muted" data-label>编排智能体正在分派</span>
      </div>
      <div class="workflow workflow--chat" data-wf></div>
    </div></div>`);
    const wf = $one('[data-wf]', el);
    wf.innerHTML = SKELETON_LABELS.map((_, i) => stepSkeleton(i)).join('');
    log.appendChild(el);
    trimLog(log);
    scrollLog(log);
    return { el, bubble: $one('.agent-bubble', el), wf, label: $one('[data-label]', el), log };
  }

  function stepSkeleton(i) {
    return `<div class="workflow__step is-pending" data-wf-skel="${i}">
      <span class="workflow__idx">${i + 1}</span>
      <div class="wf-body">
        <span class="body-5 muted">${SKELETON_LABELS[i] || '执行步骤'}</span>
        <div class="wf-skel">
          <div class="skeleton skeleton--text" style="width:60%"></div>
          <div class="skeleton skeleton--text" style="width:88%"></div>
        </div>
      </div>
    </div>`;
  }

  function stepInner(i, step) {
    return `<span class="workflow__idx">${i + 1}</span>
      <div class="wf-body">
        <div class="wf-top">
          <span class="body-5">${esc(step.label || '执行步骤')}</span>
          ${step.tool ? `<span class="caption-5 muted wf-tool">${esc(step.tool)}</span>` : ''}
        </div>
        <p class="caption-5 muted">${esc(step.detail || '')}</p>
      </div>`;
  }

  async function runWorkflow(pending, res) {
    const steps = Array.isArray(res.steps) ? res.steps : [];
    const wf = pending.wf;
    while (wf.children.length < steps.length) wf.appendChild(nodeFrom(stepSkeleton(wf.children.length)));
    if (pending.label) pending.label.textContent = '共 ' + steps.length + ' 步，正在逐步点亮';
    if (!reduce()) await sleep(120);

    for (let i = 0; i < steps.length; i += 1) {
      const row = wf.children[i];
      if (!row) break;
      const step = steps[i] || {};
      row.classList.remove('is-pending');
      row.innerHTML = stepInner(i, step);
      row.classList.add('workflow__step--active');
      if (step.status === 'warn') row.classList.add('workflow__step--warn');
      if (pending.label) pending.label.textContent = '第 ' + (i + 1) + ' / ' + steps.length + ' 步 · ' + (step.label || '执行中');
      scrollLog(pending.log);
      if (!reduce()) await sleep(300);
    }

    Array.from(wf.children).slice(steps.length).forEach((n) => n.remove());
    if (pending.label) pending.label.textContent = '共 ' + steps.length + ' 步，已全部完成';
    revealAnswer(pending, res);
  }

  function revealAnswer(pending, res) {
    const conf = Math.max(0, Math.min(100, Math.round((Number(res.confidence) || 0) * 100)));
    const isLLM = res.engine === 'llm';
    const citations = (res.citations || []).map((c) => `<div class="source">
      <span class="source__tag">引用</span>
      <div class="source__body">
        <span class="body-5">${esc(c.label || '')}</span>
        <span class="caption-5 muted">${esc(c.source || '')}${c.at ? ' · ' + fmt.date(c.at) : ''}</span>
      </div>
    </div>`).join('');
    const followups = (res.followups || []).map((f) => `<button class="chip body-5" type="button" data-q="${esc(f)}">${esc(f)}</button>`).join('');
    const stepsCount = (res.steps || []).length;

    const wrap = nodeFrom(`<div class="answer-wrap">
      <p class="answer body-6">${esc(res.answer || '')}</p>
      ${citations ? '<div class="sources">' + citations + '</div>' : ''}
      <div class="answer-meta">
        <span class="badge badge--green">置信度 ${conf}%</span>
        <span class="badge ${isLLM ? 'badge--blue' : ''}">${icon('cpu')}${isLLM ? '大模型' : '本地引擎'}${res.model ? ' · ' + esc(res.model) : ''}</span>
        <span class="badge badge--amber">${esc(res.intentLabel || res.intent || '问答')}</span>
        <span class="caption-5 muted">耗时 ${Number(res.elapsed) > 0 ? Number(res.elapsed) + ' ms' : '<1 ms'} · ${stepsCount} 个步骤</span>
      </div>
      ${followups ? '<div class="followups"><span class="caption-5 muted">继续追问</span>' + followups + '</div>' : ''}
    </div>`);

    pending.bubble.appendChild(wrap);
    const typing = $one('.typing-row', pending.bubble);
    if (typing) typing.remove();
    if (reduce()) wrap.classList.add('is-in');
    else requestAnimationFrame(() => wrap.classList.add('is-in'));
    scrollLog(pending.log);
  }

  function renderAskErrorState() {
    const log = $one('#askLog');
    if (!log) return;
    log.innerHTML = emptyState(
      '批次数据没有加载出来',
      '问答需要批次档案与检测报告，请确认本地服务在运行后重试。',
      'database',
      '<button class="btn btn--secondary btn--sm" type="button" data-reload>重新加载</button>'
    );
    const btn = $one('[data-reload]', log);
    if (btn) btn.addEventListener('click', () => window.location.reload());
  }

  /* ---------------- B 内容生成 ---------------- */
  function bindContent() {
    $one('#contentForm').addEventListener('submit', (e) => {
      e.preventDefault();
      generateContent();
    });
    $one('#contentProduct').addEventListener('change', async (e) => {
      await loadBatches(e.target.value);
      if (state.content) generateContent({ silent: true });
    });
    $one('#contentBatch').addEventListener('change', () => {
      if (state.content) generateContent({ silent: true });
    });
    $all('#channelGroup button').forEach((btn) => {
      btn.addEventListener('click', () => {
        setChannel(btn.dataset.channel);
        if (state.content) generateContent({ silent: true });
      });
    });
    $one('#genResult').addEventListener('click', (e) => {
      const empty = e.target.closest('[data-empty-gen]');
      if (empty) {
        generateContent();
        return;
      }
      const copyBtn = e.target.closest('[data-copy]');
      if (copyBtn) copyBlock(copyBtn);
    });
  }

  function setChannel(channel) {
    if (!CHANNEL_LABEL[channel]) return;
    state.contentChannel = channel;
    $all('#channelGroup button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.channel === channel));
    });
  }

  function fillContentProducts() {
    const sel = $one('#contentProduct');
    if (!sel) return;
    if (!state.products.length) {
      sel.innerHTML = '<option value="">暂无可用商品</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = state.products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    const pear = state.products.find((p) => p.name.indexOf('砀山酥梨') >= 0) || state.products[0];
    sel.value = pear.id;
    loadBatches(pear.id);
  }

  async function loadBatches(productId) {
    const sel = $one('#contentBatch');
    if (!sel || !productId) return;
    sel.disabled = true;
    sel.innerHTML = '<option value="">加载批次中</option>';
    try {
      const detail = await api('/api/products/' + encodeURIComponent(productId));
      state.contentDetail = detail;
      const batches = detail.batches || [];
      if (!batches.length) {
        sel.innerHTML = '<option value="">该商品暂无批次</option>';
        return;
      }
      sel.innerHTML = batches.map((b) => `<option value="${esc(b.id)}">${esc(b.code)} · ${esc(b.plot)} · ${fmt.date(b.harvestedAt)}</option>`).join('');
      sel.value = batches[0].id;
    } catch (err) {
      sel.innerHTML = '<option value="">批次加载失败</option>';
      toast(err.message || '批次加载失败', 'error');
    } finally {
      sel.disabled = false;
    }
  }

  function renderContentEmpty() {
    if (state.content) return;
    const host = $one('#genResult');
    if (!host) return;
    host.innerHTML = emptyState(
      '还没有生成文案',
      '选好商品、批次与渠道，点「生成文案」。素材只来自该批次的农事与检测记录。',
      'sparkle',
      '<button class="btn btn--secondary btn--sm" type="button" data-empty-gen>生成一条示例</button>'
    );
  }

  async function generateContent(opts = {}) {
    if (state.contentBusy) return;
    const productSel = $one('#contentProduct');
    const batchSel = $one('#contentBatch');
    if (!productSel || !batchSel) return;
    const productId = productSel.value;
    const batchId = batchSel.value;
    if (!productId || !batchId) {
      toast('请先选择商品与批次', 'error');
      return;
    }
    if (!state.products.length) {
      toast('商品数据还在加载，稍后重试', 'error');
      return;
    }

    state.contentBusy = true;
    const seq = (state.contentSeq += 1);
    const host = $one('#genResult');
    setSubmitBusy($one('#contentForm'), true);
    if (opts.silent) host.classList.add('is-loading');
    else host.innerHTML = genSkeletonHTML();

    try {
      const res = await api('/api/agent/content', {
        method: 'POST',
        body: { productId, batchId, channel: state.contentChannel },
      });
      if (seq !== state.contentSeq) return;
      state.content = res;
      renderContent(res);
    } catch (err) {
      if (seq !== state.contentSeq) return;
      host.innerHTML = `<div class="callout callout--red">${icon('alert')}<div><p class="body-4">文案生成失败</p><p class="body-6">${esc(err.message || '请稍后重试')}</p></div></div>`;
      toast(err.message || '文案生成失败', 'error');
    } finally {
      if (seq === state.contentSeq) {
        state.contentBusy = false;
        setSubmitBusy($one('#contentForm'), false);
        host.classList.remove('is-loading');
      }
    }
  }

  function genSkeletonHTML() {
    return `<div class="gen-skeleton">
      <div class="skeleton skeleton--title"></div>
      <div class="skeleton skeleton--text" style="width:92%"></div>
      <div class="skeleton skeleton--text" style="width:78%"></div>
      <div class="skeleton skeleton--stat"></div>
      <div class="skeleton skeleton--text" style="width:88%"></div>
      <div class="skeleton skeleton--text" style="width:64%"></div>
    </div>`;
  }

  function buildCopyPayload(res) {
    return {
      title: res.title || '',
      points: (res.points || []).map((p, i) => (i + 1) + '. ' + p).join('\n'),
      detail: (res.detail || []).map((d) => d.h + '\n' + d.p).join('\n\n'),
      script: (res.script || []).join('\n'),
      hashtags: (res.hashtags || []).join(' '),
      compliance: res.compliance || '',
    };
  }

  function contentBlock(title, hint, key, body) {
    return `<hr class="divider">
      <section class="gen-block">
        <div class="gen-block__head">
          <div class="stack gap-25">
            <h3 class="title-4">${esc(title)}</h3>
            ${hint ? `<span class="caption-5 muted">${esc(hint)}</span>` : ''}
          </div>
          <button class="btn btn--ghost btn--sm" type="button" data-copy="${esc(key)}">${icon('copy')}<span>复制</span></button>
        </div>
        <div class="gen-block__body">${body}</div>
      </section>`;
  }

  function renderContent(res) {
    const host = $one('#genResult');
    const product = state.contentDetail || state.products.find((p) => p.id === $one('#contentProduct').value) || {};
    const channel = state.contentChannel;
    state.copy = buildCopyPayload(res);

    const points = (res.points || []).map((t, i) => `<li>
      <span class="gen-points__n caption-3">${i + 1}</span>
      <span class="body-6">${esc(t)}</span>
    </li>`).join('');
    const detail = (res.detail || []).map((d) => `<div class="gen-para">
      <p class="body-4">${esc(d.h)}</p>
      <p class="body-6 muted">${esc(d.p)}</p>
    </div>`).join('');
    const script = (res.script || []).map((line) => {
      const m = String(line).match(/^【([^】]+)】([\s\S]*)$/);
      const time = m ? m[1] : '';
      const text = m ? m[2] : line;
      return `<div class="script-item">
        ${time ? `<span class="badge badge--amber script-item__time">${esc(time)}</span>` : ''}
        <span class="body-6 script-item__text">${esc(text)}</span>
      </div>`;
    }).join('');
    const tags = (res.hashtags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    const meta = res.meta || {};

    host.innerHTML = `
      <div class="gen-head">
        <span class="gen-head__art">${productArt(product.art || 'pear', { size: 64 })}</span>
        <div class="gen-head__text">
          <p class="title-2">${esc(product.name || '')}</p>
          <p class="caption-2 muted">${esc(meta.batchCode || '')} · ${esc(CHANNEL_LABEL[channel] || channel)}</p>
        </div>
        <span class="badge badge--green">已生成</span>
      </div>
      <p class="gen-note caption-5 muted">${icon('database')}素材来自该批次的农事与检测记录，不凭空写</p>
      <div class="gen-head__badges">
        ${meta.reportNo ? `<span class="badge badge--blue">报告 ${esc(meta.reportNo)}</span>` : ''}
        <span class="badge">${esc(CHANNEL_LABEL[channel] || channel)}</span>
        <span class="badge badge--amber">AI 辅助生成</span>
      </div>
      ${contentBlock('标题', '', 'title', `<p class="title-2">${esc(res.title || '')}</p>`)}
      ${contentBlock('卖点', '全部来自批次记录', 'points', `<ol class="gen-points">${points}</ol>`)}
      ${contentBlock('详情段落', '', 'detail', detail)}
      ${contentBlock('45 秒脚本分镜', '开场 3 秒抓注意力，结尾给行动', 'script', `<div class="script-list">${script}</div>`)}
      ${contentBlock('话题标签', '', 'hashtags', `<div class="tag-row">${tags}</div>`)}
      ${contentBlock('合规说明', '', 'compliance', `<div class="callout">${icon('shield')}<p class="body-6">${esc(res.compliance || '')}</p></div>`)}
      <p class="caption-5 muted mt-200">生成渠道：${esc(channel)} · 素材批次 ${esc(meta.batchCode || '')}</p>`;
    observeReveal(host);
  }

  function copyBlock(btn) {
    const text = state.copy[btn.dataset.copy] || '';
    copyText(text);
    const original = btn.innerHTML;
    btn.innerHTML = icon('check') + '<span>已复制</span>';
    window.setTimeout(() => {
      btn.innerHTML = original;
    }, 1600);
  }

  /* ---------------- C 智能客服 ---------------- */
  function bindService() {
    const form = $one('#serviceForm');
    const input = $one('#serviceInput');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) {
        toast('先输入一个问题', 'error');
        input.focus();
        return;
      }
      input.value = '';
      askService(q);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    $one('#serviceChips').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-service]');
      if (chip) askService(chip.dataset.service);
    });
    $one('#orderSelect').addEventListener('change', updateOrderHint);
    $one('#serviceLog').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-q]');
      if (chip) {
        askService(chip.dataset.q);
        return;
      }
      const ref = e.target.closest('[data-kb-ref]');
      if (ref) openKB(ref.dataset.kbRef);
    });
  }

  function renderServiceIdle() {
    const log = $one('#serviceLog');
    if (!log) return;
    log.innerHTML = emptyState(
      '选一条建议问题开始',
      '客服会带上订单状态与物流信息，回答附动作提示与知识库引用。',
      'chat'
    );
  }

  async function askService(question) {
    const q = String(question || '').trim();
    if (!q) {
      toast('先输入一个问题', 'error');
      return;
    }
    if (state.serviceBusy) {
      toast('上一条问题还在处理，稍等一下', 'error');
      return;
    }
    const log = $one('#serviceLog');
    const orderNo = $one('#orderSelect').value || '';

    state.serviceBusy = true;
    setSubmitBusy($one('#serviceForm'), true);
    startLog(log);
    appendUser(log, q);

    const pending = nodeFrom(`<div class="msg msg--agent"><div class="msg__bubble agent-bubble">
      <div class="typing-row">
        <span class="typing"><span></span><span></span><span></span></span>
        <span class="caption-5 muted">客服智能体正在匹配规则库</span>
      </div>
    </div></div>`);
    log.appendChild(pending);
    trimLog(log);
    scrollLog(log);

    try {
      const body = { question: q };
      if (orderNo) body.orderId = orderNo;
      const res = await api('/api/agent/service', { method: 'POST', body });
      if (!reduce()) await sleep(600);
      renderServiceAnswer(pending, res);
    } catch (err) {
      pending.remove();
      appendError(log, err.message || '客服请求失败', q, 'service');
      toast(err.message || '客服请求失败', 'error');
    } finally {
      state.serviceBusy = false;
      setSubmitBusy($one('#serviceForm'), false);
    }
  }

  function localizeStatus(text) {
    return String(text || '').replace(/\b(paid|packing|shipping|delivered|aftersale|done)\b/g, (m) => ORDER_STATUS[m] || m);
  }

  function renderServiceAnswer(pending, res) {
    const intent = SERVICE_INTENT[res.intent] || '客服';
    const answer = localizeStatus(res.answer || '');
    const action = localizeStatus(res.action || '');
    const refs = (res.refs || []).map((r) => `<button class="source" type="button" data-kb-ref="${esc(r.id)}">
      <span class="source__tag">知识库</span>
      <span class="source__body">
        <span class="body-5">${esc(r.title || '')}</span>
        <span class="caption-5 muted">${esc(r.id || '')}</span>
      </span>
      ${icon('chevronRight', 'source__arrow')}
    </button>`).join('');
    const followups = (res.followups || []).map((f) => `<button class="chip body-5" type="button" data-q="${esc(f)}">${esc(f)}</button>`).join('');

    const wrap = nodeFrom(`<div class="answer-wrap">
      <p class="answer body-6">${esc(answer)}</p>
      ${action ? `<div class="callout mt-200">${icon('hand')}<div><p class="body-4">动作提示</p><p class="body-6">${esc(action)}</p></div></div>` : ''}
      ${res.handoff ? `<div class="callout callout--amber mt-200">${icon('alert')}<div><p class="body-4">已转人工</p><p class="body-6">涉及承诺或专业判断，已把会话与订单上下文转交人工客服。</p></div></div>` : ''}
      ${refs ? '<div class="sources">' + refs + '</div>' : ''}
      ${followups ? '<div class="followups"><span class="caption-5 muted">继续问</span>' + followups + '</div>' : ''}
      <div class="answer-meta">
        <span class="badge ${res.handoff ? 'badge--amber' : 'badge--green'}">${res.handoff ? '已转人工' : '已自动答复'}</span>
        <span class="badge">${esc(intent)}</span>
        <span class="caption-5 muted">${(res.refs || []).length} 条知识库引用</span>
      </div>
    </div>`);

    const bubble = $one('.agent-bubble', pending) || pending;
    bubble.appendChild(wrap);
    const typing = $one('.typing-row', pending);
    if (typing) typing.remove();
    if (reduce()) wrap.classList.add('is-in');
    else requestAnimationFrame(() => wrap.classList.add('is-in'));
    scrollLog($one('#serviceLog'));
  }

  /* ---------------- 知识库 ---------------- */
  function renderKB() {
    const host = $one('#kbList');
    if (!host) return;
    if (!state.kb.length) {
      host.innerHTML = '<p class="caption-5 muted">知识库加载失败，刷新页面重试。</p>';
      return;
    }
    host.innerHTML = state.kb.map((k) => {
      const content = String(k.content || '');
      const preview = content.length > 80 ? content.slice(0, 80) + '…' : content;
      return `<div class="kb-item" data-kb="${esc(k.id)}">
        <button class="kb-item__head" type="button" aria-expanded="false" aria-controls="kbbody-${esc(k.id)}">
          <span class="badge">${esc(k.id)}</span>
          <span class="kb-item__title body-5">${esc(k.title || '')}</span>
          <span class="kb-item__chev">${icon('chevronDown')}</span>
        </button>
        <div class="kb-item__body" id="kbbody-${esc(k.id)}" hidden>
          <p class="caption-2 muted">${esc(preview)}</p>
          <div class="kb-item__foot">
            <span class="caption-5 muted">共 ${content.length} 字</span>
            <button class="btn btn--ghost btn--sm" type="button" data-kb-full="${esc(k.id)}">看全文</button>
          </div>
        </div>
      </div>`;
    }).join('');

    $all('.kb-item', host).forEach((item) => {
      const head = $one('.kb-item__head', item);
      const body = $one('.kb-item__body', item);
      head.addEventListener('click', () => {
        const open = item.dataset.open === 'true';
        item.dataset.open = String(!open);
        head.setAttribute('aria-expanded', String(!open));
        body.hidden = open;
      });
    });
    host.onclick = (e) => {
      const btn = e.target.closest('[data-kb-full]');
      if (btn) openKB(btn.dataset.kbFull);
    };
  }

  function openKB(id) {
    const k = state.kb.find((x) => x.id === id);
    if (!k) return;
    const tags = (k.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    modal({
      title: k.id + ' · ' + k.title,
      body: `<p class="body-3">${esc(k.content || '')}</p>
        ${tags ? '<div class="tag-row mt-300">' + tags + '</div>' : ''}`,
    });
  }

  /* ---------------- 演示脚本 ---------------- */
  function renderDemoCases() {
    const host = $one('#demoGrid');
    if (!host) return;
    host.innerHTML = CASES.map((c) => `<button class="case" type="button" data-case="${c.id}">
      <span class="case__top">
        <span class="badge badge--green">${c.id}</span>
        <span class="caption-5 muted">${TAB_LABEL[c.tab]}</span>
        <span class="case__arrow">${icon('arrowRight')}</span>
      </span>
      <span class="body-4 case__q">${esc(c.q || c.label)}</span>
      <span class="body-6 muted case__expect"><b>期望闭环</b> ${esc(c.expect)}</span>
    </button>`).join('');
  }

  function bindDemo() {
    $one('#demoGrid').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-case]');
      if (!btn) return;
      const item = CASES.find((c) => c.id === btn.dataset.case);
      if (item) runCase(item);
    });
  }

  async function runCase(item) {
    if (item.tab === 'ask') {
      switchTab('ask', { auto: false });
      const sel = $one('#batchSelect');
      if (item.code && Array.from(sel.options).some((o) => o.value === item.code)) sel.value = item.code;
      updateBatchHint();
      scrollToPanel('panel-ask');
      await waitForIdle(() => state.asking);
      await sleep(reduce() ? 0 : 240);
      askQuestion(item.q);
      return;
    }
    if (item.tab === 'content') {
      switchTab('content', { auto: false });
      await waitForIdle(() => state.contentBusy);
      setChannel(item.channel);
      $one('#contentProduct').value = item.productId;
      await loadBatches(item.productId);
      scrollToPanel('panel-content');
      generateContent();
      return;
    }
    switchTab('service', { auto: false });
    const orderSel = $one('#orderSelect');
    if (item.order && Array.from(orderSel.options).some((o) => o.value === item.order)) orderSel.value = item.order;
    updateOrderHint();
    scrollToPanel('panel-service');
    await waitForIdle(() => state.serviceBusy);
    await sleep(reduce() ? 0 : 240);
    askService(item.q);
  }
})();
