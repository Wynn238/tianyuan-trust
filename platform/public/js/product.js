/* 商品详情页：面包屑、图文购买区、农户档案、四个标签页、同产地推荐、下单弹窗 */
(function () {
  'use strict';

  const TABS = [
    { key: 'detail', label: '商品详情' },
    { key: 'tests', label: '检测报告' },
    { key: 'price', label: '价格构成' },
    { key: 'reviews', label: '评价' },
  ];

  const MAX_QTY = 20;
  const SKELETON = $('#app') ? $('#app').innerHTML : '';
  const state = { product: null, trace: null, traceError: false, farmer: null, qty: 1, views: [] };

  initNav('market');
  document.addEventListener('DOMContentLoaded', boot);

  /* ---------------- 启动 ---------------- */
  async function boot() {
    const raw = qs('id');
    const id = raw && raw.trim() ? raw.trim().toUpperCase() : 'P01';
    state.product = null;
    state.trace = null;
    state.traceError = false;
    state.farmer = null;
    state.qty = 1;

    const app = $('#app');
    if (app) app.innerHTML = SKELETON;
    const related = $('#related');
    if (related) related.innerHTML = '';
    const mobile = $('#mobile-buy');
    if (mobile) mobile.innerHTML = '';

    try {
      const product = await api('/api/products/' + encodeURIComponent(id));
      state.product = product;
      document.title = product.name + ' · 田源可信';
      setMeta(product);

      let trace = null;
      const firstBatch = (product.batches || [])[0];
      if (firstBatch && firstBatch.code) {
        try {
          trace = await api('/api/trace/' + encodeURIComponent(firstBatch.code));
        } catch (err) {
          state.traceError = true;
        }
      }
      state.trace = trace;

      renderProduct(product, trace);
      renderMobileBuy(product);
      renderRelated(product);
      if (window.trackEvent) trackEvent('product_view', { objectType: 'product', objectId: product.id });
      observeReveal();

      if (location.hash === '#buy' && product.status === 'on') {
        setTimeout(openBuyModal, 250);
      }
    } catch (err) {
      const message = err && err.message ? err.message : '请稍后重试';
      if (message.indexOf('商品不存在') !== -1) renderNotFound(id);
      else renderError(message);
    }
  }

  /* ---------------- 工具 ---------------- */
  const num = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  function regionLine(region) {
    if (!region) return '';
    return [region.province, region.city, region.county, region.village].filter(Boolean).join(' ');
  }

  function avatarInitial(name) {
    const chars = Array.from(String(name || '农'));
    return chars[0] || '农';
  }

  function stars(rating, extra = '') {
    const value = Math.max(0, Math.min(5, Math.round(num(rating))));
    const icons = Array.from({ length: 5 }).map((_, i) => `<span class="${i < value ? 'is-on' : ''}">${icon('star')}</span>`).join('');
    return `<span class="stars ${extra}" role="img" aria-label="${value} 分，满分 5 分">${icons}</span>`;
  }

  function kv(key, value) {
    return `<div class="kv"><span class="kv__k">${esc(key)}</span><span class="kv__v">${esc(value)}</span></div>`;
  }

  function highlightList(items, pending) {
    return `<ul class="highlight-list mt-100">${items
      .map(
        (text) =>
          `<li class="check-line${pending ? ' check-line--pending' : ''}">${icon(
            pending ? 'clock' : 'check'
          )}<span class="body-6">${esc(text)}</span></li>`
      )
      .join('')}</ul>`;
  }

  function panel(key, inner, active) {
    return `<div class="panel" id="panel-${key}" role="tabpanel" aria-labelledby="tab-${key}" tabindex="0"${
      active ? ' data-active="true"' : ' hidden'
    }>${inner}</div>`;
  }

  function setMeta(product) {
    const region = regionLine(product.farmer && product.farmer.region);
    const description = product.summary || `${product.name}，产自${region || '产地直供'}，支持一箱一码查询。`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', product.name + ' · 田源可信');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', description);
  }

  /* ---------------- 主渲染 ---------------- */
  function renderProduct(product, trace) {
    const pending = product.status !== 'on';
    const farmer = Object.assign({}, product.farmer || {}, (trace && trace.farmer) || {});
    const batchBase = (product.batches || [])[0] || null;
    const batch = batchBase
      ? Object.assign({}, batchBase, (trace && trace.batch) || {})
      : (trace && trace.batch) || null;
    const region = farmer.region || {};
    const regionText = regionLine(region);
    const story = farmer.story || product.summary || '';
    const certs = Array.isArray(farmer.certs) ? farmer.certs : [];
    const highlights = Array.isArray(product.highlights) ? product.highlights : [];
    const details = product.content && Array.isArray(product.content.detail) ? product.content.detail : [];
    const traceCode = batch && batch.code ? batch.code : '';
    const traceHref = traceCode ? '/trace.html?code=' + encodeURIComponent(traceCode) : '';

    state.farmer = farmer;
    state.views = buildViews(product, farmer);

    $('#crumb').innerHTML = `
      <a href="/">首页</a>
      <span class="crumb__sep" aria-hidden="true">/</span>
      <a href="/shop.html">${esc(product.category || '产地商城')}</a>
      <span class="crumb__sep" aria-hidden="true">/</span>
      <span aria-current="page">${esc(product.name)}</span>`;

    const price = num(product.price);
    const oldPrice = num(product.originalPrice);
    const save = oldPrice > price ? oldPrice - price : 0;
    const ratingCount = num(product.ratingCount);
    const ratingAvg = num(product.ratingAvg);
    const sales = num(product.monthlySales);
    const repurchase = num(product.repurchaseRate);

    const statusHtml = pending
      ? '<span class="badge badge--amber badge--dot">待审核</span>'
      : '<span class="badge badge--green badge--dot">已上架</span>';
    const certBadges = [
      product.greenFood ? '<span class="badge badge--green">绿色食品</span>' : '',
      product.geoIndication ? '<span class="badge badge--blue">地理标志</span>' : '',
      product.organic ? '<span class="badge badge--green">有机</span>' : '',
    ]
      .filter(Boolean)
      .join('');

    const stageBadges = [
      pending ? '<span class="badge badge--amber">待审核</span>' : '<span class="badge badge--green">一箱一码</span>',
      product.grade ? `<span class="badge">${esc(product.grade)}</span>` : '',
    ]
      .filter(Boolean)
      .join('');

    const ratingHtml = ratingCount
      ? `<span class="body-4">${fmt.int(ratingAvg)} 分</span><span class="caption-2 muted">${fmt.int(ratingCount)} 条评分</span>`
      : '<span class="body-4">暂无评分</span><span class="caption-2 muted">等待首条评价</span>';

    const buyButton = `<button class="btn btn--secondary btn--lg" id="addCartBtn" type="button"${pending ? ' disabled' : ''}>${icon('bag')} 加入购物车</button><button class="btn btn--primary btn--lg" id="buyBtn" type="button"${
      pending ? ' disabled aria-disabled="true" title="检测报告补齐后开放购买"' : ''
    }>${icon('bag')} 立即购买</button><button class="btn btn--ghost btn--lg" id="favBtn" type="button" aria-pressed="false">${icon('heart')} 收藏</button>`;
    const traceButton =
      traceHref && !pending
        ? `<a class="product__trace-link" id="traceBtn" href="${traceHref}">${icon('scan')} 看这箱的溯源 <span class="icon">${icon('arrowRight')}</span></a>`
        : `<span class="product__trace-link is-disabled">暂无可查溯源</span>`;

    const certTags = certs.map((cert) => `<span class="tag">${esc(cert)}</span>`).join('');
    const productArtSize = 560;
    const thumbArtSize = 160;

    $('#app').innerHTML = `
      <div class="product-grid">
        <div class="gallery">
          <div class="stage" id="stage" data-view="1">
            <div class="stage__badges">${stageBadges}</div>
            <div class="stage__art stage__art--photo" id="stageArt">
              <img class="stage__photo" src="/assets/photos/products/${product.art || 'pear'}.jpg" alt="${esc(product.name)}" width="960" height="720">
            </div>
          </div>
          <p class="view-note" aria-live="polite">
            <span class="view-note__key caption-3" id="viewName">${esc(state.views[0].label)}</span>
            <span class="view-note__meta caption-2 ink-2" id="viewMeta">${esc(state.views[0].meta)}</span>
          </p>
          <div class="thumbs" role="group" aria-label="商品视角">
            ${state.views
              .map(
                (view, index) => `<button class="thumb" type="button" aria-pressed="${index === 0}" data-view="${index + 1}" aria-label="查看${esc(
                  view.label
                )}视角">
                  <span class="thumb__art">${view.key === 'photo'
                    ? `<img src="/assets/photos/products/${product.art || 'pear'}.jpg" alt="" width="960" height="720">`
                    : productViewArt(product.art || 'pear', view.key, { size: thumbArtSize })}</span>
                  <span class="thumb__label caption-4">${esc(view.label)}</span>
                </button>`
              )
              .join('')}
          </div>
        </div>

        <div class="buybox">
          <div class="head-meta">
            <a class="badge" href="/shop.html">${esc(product.category || '产地商城')}</a>
            ${statusHtml}
            ${certBadges}
          </div>
          <h1 class="heading-3 product-title">${esc(product.name)}</h1>
          <div class="rating-row">
            ${stars(ratingAvg)}
            ${ratingHtml}
          </div>
          <div class="price-line">
            <span class="stat__value price">${fmt.money(price)}</span>
            ${oldPrice > price ? `<span class="body-6 muted old-price">${fmt.money(oldPrice)}</span>` : ''}
            ${save > 0 ? `<span class="badge badge--amber">省 ${fmt.money(save)}</span>` : ''}
            <span class="caption-2 muted">${esc(product.unit || '')}</span>
          </div>
          <div class="sales-row">
            <div class="sales-item"><span class="caption-5 muted">月销</span><span class="body-4">${
              sales ? fmt.int(sales) + ' 件' : '暂无'
            }</span></div>
            <div class="sales-item"><span class="caption-5 muted">复购率</span><span class="body-4">${
              repurchase ? fmt.pct(repurchase) : '暂无'
            }</span></div>
            <div class="sales-item"><span class="caption-5 muted">发货地</span><span class="body-4">${esc(
              [region.province, region.county].filter(Boolean).join(' ') || '待补'
            )}</span></div>
          </div>
          <div class="spec-box">
            ${kv('规格', product.spec || '以实物为准')}
            ${kv('包装', product.unit || '标准包装')}
            ${kv('等级', product.grade || '平台分级')}
          </div>
          <div class="qty-row">
            <span class="qty-row__label body-5">购买数量</span>
            <div class="stepper" role="group" aria-label="购买数量">
              <button type="button" data-qty="dec" aria-label="减少数量" disabled><span class="stepper__minus" aria-hidden="true"></span></button>
              <input class="stepper__input body-4" id="qtyInput" type="number" inputmode="numeric" min="1" max="${MAX_QTY}" value="1" aria-label="购买数量">
              <button type="button" data-qty="inc" aria-label="增加数量">${icon('plus')}</button>
            </div>
            <span class="caption-2 muted">每单限购 ${MAX_QTY} 件</span>
          </div>
          <div class="cta-row">
            ${buyButton}
            ${traceButton}
          </div>
          <ul class="promise">
            <li class="promise__item">${icon('truck')}<span class="body-6"><span class="body-4">产地直发</span>　农户或合作社发货，箱内附批次溯源码。</span></li>
            <li class="promise__item">${icon('shield')}<span class="body-6"><span class="body-4">先行赔付</span>　收货 24 小时内拍照上传，系统自动核赔。</span></li>
            <li class="promise__item">${icon('scan')}<span class="body-6"><span class="body-4">一箱一码</span>　可查果园、农事记录与检测报告。</span></li>
          </ul>
          ${pending ? pendingBlock() : ''}
        </div>
      </div>

      <section class="farmer" aria-labelledby="farmer-title">
        <div class="card card--pad">
          <div class="farmer__grid">
            <div>
              <p class="eyebrow">农户档案</p>
              <div class="farmer__id mt-200">
                <div class="avatar avatar--lg" aria-hidden="true">${esc(avatarInitial(farmer.name))}</div>
                <div class="stack gap-50" style="min-width:0">
                  <h2 class="heading-6" id="farmer-title">${esc(farmer.name || '合作农户')}</h2>
                  <p class="body-6 muted">${esc(farmer.org || '合作社信息待补')}</p>
                </div>
              </div>
              <div class="farmer__meta">
                <span class="meta caption-2">${icon('pin')}<span>${esc(regionText || '产地待补')}</span></span>
                <span class="meta caption-2">${icon('star')}<span>${num(farmer.rating) ? fmt.int(farmer.rating) + ' 分' : '暂无评分'}</span></span>
                ${
                  num(farmer.orders)
                    ? `<span class="meta caption-2">${icon('trend')}<span>${fmt.int(farmer.orders)} 单已结算</span></span>`
                    : ''
                }
              </div>
            </div>
            <div class="stack gap-100">
              <p class="body-3 ink-2 clamp-2">${esc(story || '农户故事正在整理。')}</p>
              <div class="farmer__actions">
                <div class="cert-row">${certTags}</div>
                <button class="btn btn--secondary btn--sm" id="farmerBtn" type="button">${icon('user')} 查看农户档案</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="tabcard card" aria-label="商品详细信息">
        <div class="tabs" role="tablist" aria-label="商品信息分区">
          ${TABS.map(
            (tab, index) =>
              `<button type="button" role="tab" id="tab-${tab.key}" aria-controls="panel-${tab.key}" aria-selected="${
                index === 0
              }" tabindex="${index === 0 ? 0 : -1}">${tab.label}</button>`
          ).join('')}
        </div>
        ${detailPanel(details, highlights, batch, traceHref, pending)}
        ${testsPanel(trace, pending, traceHref, state.traceError)}
        ${pricePanel(product, pending)}
        ${reviewsPanel(product, pending)}
      </section>

      <p class="sr-only" role="status">商品信息已加载</p>`;

    wirePage(product, pending);
  }

  function buildViews(product, farmer) {
    const region = farmer.region || {};
    const origin = [regionLine(region), farmer.org].filter(Boolean).join('，');
    return [
      { key: 'photo', label: '实拍', meta: '产地实拍；农产品有个体差异，以到货实物为准' },
      { key: 'size', label: '果径', meta: `${product.spec || '规格以实物为准'}，按${product.grade || '平台'}标准分选` },
      { key: 'cut', label: '切面', meta: '果肉与口感以到货实物为准，糖度与农残看检测报告' },
      { key: 'origin', label: '产地', meta: origin || '产地信息待补' },
    ];
  }

  function pendingBlock() {
    return `<div class="pending">
      <div class="callout callout--amber" id="pendingCallout">${icon('alert')}<div><p class="body-4">该商品检测报告待补，平台暂缓上架</p><p class="caption-2">批次资料补齐并通过审核后，开放购买与溯源查询。</p></div></div>
      <div class="rules">
        <p class="title-3">平台规则说明</p>
        <ol class="rules__list">
          <li class="rules__item"><span class="rules__num caption-5">1</span><span class="body-6">新入驻农户须上传农残检测报告与承诺达标合格证，审核通过后方可上架。</span></li>
          <li class="rules__item"><span class="rules__num caption-5">2</span><span class="body-6">检测报告缺失或过期的商品，平台暂停交易与曝光，资料补齐后 1 个工作日内复核。</span></li>
          <li class="rules__item"><span class="rules__num caption-5">3</span><span class="body-6">上架商品按批次留存检测报告，抽检不合格立即下架并全量召回。</span></li>
        </ol>
      </div>
    </div>`;
  }

  /* ---------------- 标签页内容 ---------------- */
  function detailPanel(details, highlights, batch, traceHref, pending) {
    if (pending) {
      const inner = `<div class="callout callout--amber">${icon('alert')}<div><p class="body-4">商品资料审核中</p><p class="caption-2">完整详情与批次记录会在审核通过后展示，以下为待补资料清单。</p></div></div>
        ${highlights.length ? highlightList(highlights, true) : emptyState('详情待补', '农户尚未提交完整的商品详情，审核通过后会在这里展示。', 'file')}`;
      return panel('detail', inner, true);
    }

    const copy = details.length
      ? `<div class="detail-copy">${details
          .map(
            (item) =>
              `<div class="detail-block"><h3 class="heading-6">${esc(item.h || '')}</h3><p class="body-3 ink-2">${esc(
                item.p || ''
              )}</p></div>`
          )
          .join('')}</div>`
      : `<div class="aside-card"><p class="title-3">商品亮点</p>${highlightList(highlights)}</div>`;

    const aside = [];
    if (details.length && highlights.length) {
      aside.push(`<div class="aside-card"><p class="title-3">这批的凭据</p>${highlightList(highlights)}</div>`);
    }
    aside.push(batchCard(batch, traceHref));

    return panel(
      'detail',
      `<div class="detail-grid">${copy}<aside class="aside">${aside.join('')}</aside></div>`,
      true
    );
  }

  function batchCard(batch, traceHref) {
    if (!batch) {
      return `<div class="aside-card"><p class="title-3">本批次</p><p class="body-6 muted" style="margin-top:var(--s-75)">批次尚未生成，审核通过后赋码。</p></div>`;
    }
    return `<div class="aside-card">
      <p class="title-3">本批次</p>
      <div class="mt-100">
        <div class="kv"><span class="kv__k">溯源码</span><span class="kv__v mono wrap-any">${esc(batch.code || '')}</span></div>
        ${kv('果园', batch.plot || '待补')}
        ${kv('采收日期', batch.harvestedAt ? fmt.date(batch.harvestedAt) : '待补')}
        ${kv('农事记录', fmt.int(num(batch.recordCount)) + ' 条')}
        ${kv('链上校验', batch.verified ? '已通过' : '待校验')}
      </div>
      ${traceHref ? `<a class="btn btn--secondary btn--sm full mt-200" href="${traceHref}">${icon('scan')} 查看完整溯源</a>` : ''}
    </div>`;
  }

  function testsPanel(trace, pending, traceHref, traceError) {
    if (pending) {
      return panel(
        'tests',
        `<div class="callout callout--amber">${icon('alert')}<div><p class="body-4">该商品检测报告待补，平台暂缓上架</p><p class="caption-2">报告与合格证补齐并通过审核后，这里会展示逐项检测结果。</p></div></div>
        ${emptyState('检测报告待补', '平台按批次留存检测报告，审核通过前不展示未经验证的结论。', 'file')}`,
        false
      );
    }

    if (traceError) {
      return panel(
        'tests',
        emptyState(
          '检测报告加载失败',
          '批次检测数据读取失败，可以刷新页面重试，或前往溯源页查看。',
          'alert',
          traceHref ? `<a class="btn btn--secondary btn--sm" href="${traceHref}">前往溯源页</a>` : ''
        ),
        false
      );
    }

    const test = trace && Array.isArray(trace.tests) ? trace.tests[0] : null;
    if (!test) {
      return panel(
        'tests',
        emptyState(
          '暂无检测报告',
          '该批次尚未上传检测报告，可以先去溯源页查看农事记录与批次信息。',
          'flask',
          traceHref ? `<a class="btn btn--secondary btn--sm" href="${traceHref}">查看批次溯源</a>` : ''
        ),
        false
      );
    }

    const failed = (test.items || []).some((item) => item.pass === false);
    const conclusion = test.conclusion || '检测结论以报告原件为准';
    const warned = !failed && /预警|不足|风险/.test(conclusion);
    const tone = failed ? ' callout--red' : warned ? ' callout--amber' : '';
    const rows = (test.items || [])
      .map(
        (item) => `<tr>
          <td data-label="检测项"><span class="test-name"><span class="body-5">${esc(item.name || '')}</span>${
            item.safety === false ? '<span class="badge badge--blue">品质指标</span>' : ''
          }</span></td>
          <td data-label="检测值" class="mono">${esc(item.value || '')} ${esc(item.unit || '')}</td>
          <td data-label="限定值" class="mono">${esc(item.limit || '')} ${esc(item.unit || '')}</td>
          <td data-label="结论"><span class="badge badge--${item.pass === false ? 'red' : 'green'}">${
            item.pass === false ? '不合格' : '合格'
          }</span></td>
        </tr>`
      )
      .join('');

    const inner = `<div class="report-head">
        <div class="callout${tone}">${icon(failed || warned ? 'alert' : 'seal')}<div><p class="body-4">检测结论</p><p class="caption-2">${esc(
          conclusion
        )}</p></div></div>
        <div class="report-meta">
          <div class="report-meta__item"><span class="caption-5 muted">检测机构</span><span class="body-5">${esc(
            test.lab || '待补'
          )}</span></div>
          <div class="report-meta__item"><span class="caption-5 muted">报告编号</span><span class="body-5 mono">${esc(
            test.reportNo || '待补'
          )}</span></div>
          <div class="report-meta__item"><span class="caption-5 muted">检测日期</span><span class="body-5">${
            test.at ? fmt.date(test.at) : '待补'
          }</span></div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table table--stack">
          <thead><tr><th>检测项</th><th>检测值</th><th>限定值</th><th>结论</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="caption-5 muted report-note">说明：标注「品质指标」的项目用于分级与口感评价，不作为食品安全限量判定依据。检测结果以报告原件为准。</p>`;

    return panel('tests', inner, false);
  }

  function pricePanel(product, pending) {
    const breakdown = Array.isArray(product.priceBreakdown) ? product.priceBreakdown : [];
    if (!breakdown.length) {
      return panel(
        'price',
        emptyState(
          '价格构成待补',
          pending
            ? '商品通过审核后，这里会展示收购、包装、冷链与平台服务费明细。'
            : '该商品暂未生成价格构成明细，可以联系平台客服了解结算方式。',
          'coins'
        ),
        false
      );
    }

    const total = breakdown.reduce((sum, item) => sum + num(item.amount), 0);
    const bars = breakdown
      .map((item) => {
        const share = total ? (num(item.amount) / total) * 100 : 0;
        const platform = /平台|服务费/.test(item.label || '');
        return `<div class="bar${platform ? ' bar--platform' : ''}">
          <div class="bar__head">
            <span class="bar__label body-5"><span class="bar__dot" aria-hidden="true"></span>${esc(item.label || '')}</span>
            <span class="body-4 mono">${fmt.money(num(item.amount))}</span>
          </div>
          <div class="meter" role="img" aria-label="${esc(item.label || '')}占 ${fmt.pct(share, 1)}">
            <div class="meter__fill" style="width:${pctWidth(num(item.amount), total)}"></div>
          </div>
          <span class="caption-5 muted">占售价 ${fmt.pct(share, 1)}</span>
        </div>`;
      })
      .join('');

    const land = breakdown.filter((item) => /收购|地头/.test(item.label || ''))[0];
    const landNote = land
      ? `<div class="callout mt-300">${icon('hand')}<span class="body-6">地头收购价 ${fmt.money(
          num(land.amount)
        )}，占售价 ${fmt.pct((num(land.amount) / total) * 100, 1)}。订单完成结算后按平台规则直接结给农户。</span></div>`
      : '';

    const inner = `<div class="bars">${bars}</div>
      <div class="bars-total"><span class="body-5">合计</span><span class="heading-5 mono">${fmt.money(total)}</span></div>
      <p class="caption-5 muted price-note">价格构成由平台按批次结算单生成。平台服务费用于检测、赋码与售后垫付，不向农户收取入驻费。</p>
      ${landNote}`;

    return panel('price', inner, false);
  }

  function reviewsPanel(product, pending) {
    const reviews = Array.isArray(product.reviews) ? product.reviews : [];
    const ratingCount = num(product.ratingCount);
    const ratingAvg = num(product.ratingAvg);

    const summary = `<div class="review-summary">
      <div class="review-score">
        <span class="stat__value stat__value--sm">${ratingCount ? fmt.int(ratingAvg) : '暂无'}</span>
        <span class="caption-2 muted">${ratingCount ? '共 ' + fmt.int(ratingCount) + ' 条评分' : '暂无评分'}</span>
      </div>
      <div class="stack gap-50">
        ${stars(ratingAvg, 'stars--lg')}
        <span class="caption-2 muted">${
          reviews.length ? '最近 ' + fmt.int(reviews.length) + ' 条文字评价' : '暂无文字评价'
        }</span>
      </div>
      <span class="badge badge--green">${icon('shield')} 仅已购用户可评价</span>
    </div>`;

    if (!reviews.length) {
      return panel(
        'reviews',
        summary +
          emptyState(
            pending ? '等待首条评价' : '还没有文字评价',
            pending
              ? '商品通过审核并产生订单后，买家可以在这里发布评价。'
              : '买家确认收货后可以在订单里发布评价，评价会显示评分与标签。',
            'chat',
            '<a class="btn btn--secondary btn--sm" href="/shop.html">去商城看看</a>'
          ),
        false
      );
    }

    const list = reviews
      .map(
        (review) => `<article class="review-item">
          <div class="avatar" aria-hidden="true">${esc(avatarInitial(review.user))}</div>
          <div>
            <div class="review-head">
              <span class="body-4">${esc(review.user || '匿名用户')}</span>
              ${stars(num(review.rating))}
              <span class="caption-4 muted">${fmt.int(num(review.rating))} 分</span>
              <span class="caption-2 muted">${review.at ? fmt.date(review.at) : ''}</span>
            </div>
            <p class="body-3 ink-2 review-text">${esc(review.text || '用户未填写文字评价')}</p>
            ${
              Array.isArray(review.tags) && review.tags.length
                ? `<div class="review-tags">${review.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div>`
                : ''
            }
          </div>
        </article>`
      )
      .join('');

    return panel('reviews', `${summary}<div class="review-list">${list}</div>`, false);
  }

  /* ---------------- 交互 ---------------- */
  function wirePage(product, pending) {
    const buyBtn = $('#buyBtn');
    if (buyBtn) buyBtn.addEventListener('click', openBuyModal);
    const addBtn = $('#addCartBtn');
    if (addBtn) addBtn.addEventListener('click', addToCart);
    const favBtn = $('#favBtn');
    if (favBtn) {
      if (window.Auth && Auth.isLogged && Auth.isLogged()) {
        fetch('/api/favorites', { credentials: 'same-origin' }).then((r) => r.ok ? r.json() : null).then((d) => {
          if (d && (d.items || []).some((x) => x.id === product.id)) {
            favBtn.setAttribute('aria-pressed', 'true');
            favBtn.innerHTML = icon('heart') + ' 已收藏';
          }
        }).catch(() => {});
      }
      favBtn.addEventListener('click', async () => {
        if (!window.Auth || !Auth.isLogged()) { Auth.openLogin({ role: 'consumer', onSuccess: () => location.reload() }); return; }
        favBtn.disabled = true;
        try {
          const r = await fetch('/api/products/' + encodeURIComponent(product.id) + '/favorite', { method: 'POST', credentials: 'same-origin' });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error && d.error.message || '操作失败');
          favBtn.setAttribute('aria-pressed', String(!!d.favorited));
          favBtn.innerHTML = icon('heart') + (d.favorited ? ' 已收藏' : ' 收藏');
          toast(d.message || '已更新');
        } catch (e) { toast(e.message || '操作失败', 'error'); }
        finally { favBtn.disabled = false; }
      });
    }
    const farmerBtn = $('#farmerBtn');
    if (farmerBtn) farmerBtn.addEventListener('click', openFarmerModal);
    wireGallery();
    wireQty();
    wireTabs();
  }

  function wireGallery() {
    const stage = $('#stage');
    const viewName = $('#viewName');
    const viewMeta = $('#viewMeta');
    if (!stage || !viewName || !viewMeta) return;
    $$('.thumb').forEach((thumb, index) => {
      thumb.addEventListener('click', () => {
        const view = state.views[index];
        if (!view) return;
        $$('.thumb').forEach((item) => item.setAttribute('aria-pressed', 'false'));
        thumb.setAttribute('aria-pressed', 'true');
        stage.dataset.view = String(index + 1);
        const art = $('#stageArt');
        if (art) {
          const current = (state.product && state.product.art) || 'pear';
          art.innerHTML = view.key === 'photo'
            ? `<img class="stage__photo" src="/assets/photos/products/${current}.jpg" alt="${esc((state.product && state.product.name) || '')}" width="960" height="720">`
            : productViewArt(current, view.key, { size: 560 });
        }
        viewName.textContent = view.label;
        viewMeta.textContent = view.meta;
      });
    });
  }

  function wireQty() {
    const input = $('#qtyInput');
    const dec = $('[data-qty="dec"]');
    const inc = $('[data-qty="inc"]');
    if (!input || !dec || !inc) return;

    const clamp = (value) => Math.max(1, Math.min(MAX_QTY, num(value, 1)));
    const sync = (write) => {
      if (write) input.value = String(state.qty);
      dec.disabled = state.qty <= 1;
      inc.disabled = state.qty >= MAX_QTY;
    };

    input.addEventListener('input', () => {
      const value = parseInt(input.value, 10);
      if (Number.isFinite(value) && value >= 1 && value <= MAX_QTY) {
        state.qty = value;
        sync(false);
      }
    });
    input.addEventListener('blur', () => {
      state.qty = clamp(parseInt(input.value, 10));
      sync(true);
    });
    dec.addEventListener('click', () => {
      state.qty = clamp(state.qty - 1);
      sync(true);
    });
    inc.addEventListener('click', () => {
      state.qty = clamp(state.qty + 1);
      sync(true);
    });
    state.qty = 1;
    sync(true);
  }

  function wireTabs() {
    const tabs = $$('.tabs [role="tab"]');
    if (!tabs.length) return;
    const select = (index, focus) => {
      tabs.forEach((tab, i) => {
        const on = i === index;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
      });
      TABS.forEach((tab, i) => {
        const target = $('#panel-' + tab.key);
        if (!target) return;
        const on = i === index;
        target.hidden = !on;
        if (on) target.setAttribute('data-active', 'true');
        else target.removeAttribute('data-active');
      });
      if (focus) tabs[index].focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(index, false));
      tab.addEventListener('keydown', (event) => {
        let next = null;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        if (next !== null) {
          event.preventDefault();
          select(next, true);
        }
      });
    });

    const requested = TABS.findIndex((tab) => location.hash === '#' + tab.key);
    if (requested > 0) {
      select(requested, false);
      const card = $('.tabcard');
      if (card) setTimeout(() => card.scrollIntoView({ block: 'start' }), 120);
    }
  }

  /* ---------------- 农户档案弹窗 ---------------- */
  function openFarmerModal() {
    const product = state.product;
    const farmer = state.farmer || {};
    if (!product) return;
    const region = regionLine(farmer.region || {});
    const story = farmer.story || product.summary || '农户故事正在整理。';
    const certs = Array.isArray(farmer.certs) ? farmer.certs : [];
    const rows = [
      ['所在产区', region || '待补'],
      ['农户评分', num(farmer.rating) ? fmt.int(farmer.rating) + ' 分' : '暂无评分'],
    ];
    if (num(farmer.acreage)) rows.push(['经营面积', fmt.int(farmer.acreage) + ' 亩']);
    if (num(farmer.orders)) rows.push(['累计结算订单', fmt.int(farmer.orders) + ' 单']);
    if (farmer.joinedAt) rows.push(['入驻时间', fmt.date(farmer.joinedAt)]);

    const body = `<div class="stack gap-200">
      <div class="farmer__id">
        <div class="avatar avatar--lg" aria-hidden="true">${esc(avatarInitial(farmer.name))}</div>
        <div class="stack gap-50" style="min-width:0">
          <p class="heading-6">${esc(farmer.name || '合作农户')}</p>
          <p class="body-6 muted">${esc(farmer.org || '合作社信息待补')}</p>
        </div>
      </div>
      <div class="aside-card">${rows.map((row) => kv(row[0], row[1])).join('')}</div>
      <div>
        <p class="title-3">农户故事</p>
        <p class="body-3 ink-2" style="margin-top:var(--s-75)">${esc(story)}</p>
      </div>
      ${
        certs.length
          ? `<div><p class="title-3">资质与认证</p><div class="cert-row" style="margin-top:var(--s-75)">${certs
              .map((cert) => `<span class="tag">${esc(cert)}</span>`)
              .join('')}</div></div>`
          : ''
      }
      <p class="caption-5 muted">档案由合作社提交，平台按入驻材料核验；评分来自真实订单评价。</p>
    </div>`;

    modal({ title: '农户档案', body, actions: [{ label: '关闭' }] });
  }

  /* ---------------- 下单弹窗 ---------------- */
  async function addToCart() {
    const p = state.product;
    if (!p) return;
    const btn = $('#addCartBtn');
    if (btn) { btn.disabled = true; btn.textContent = '加入中…'; }
    try {
      let guestId = localStorage.getItem('ty_guest_id');
      if (!guestId) { guestId = crypto.randomUUID ? crypto.randomUUID() : 'g' + Date.now(); localStorage.setItem('ty_guest_id', guestId); }
      const headers = { 'Content-Type': 'application/json', 'X-Guest-Id': guestId };
      const token = window.Auth && Auth.getToken();
      if (token) headers.Authorization = 'Bearer ' + token;
      const res = await fetch('/api/cart/items', { method: 'POST', headers, body: JSON.stringify({ productId: p.id, qty: state.qty }) });
      const data = await res.json();
      if (!res.ok) throw new Error((data.error && data.error.message) || '加入失败');
      toast('已加入购物车，可在购物车统一结算');
      window.dispatchEvent(new Event('cart:changed'));
      if (btn) { btn.textContent = '已加入 · 去购物车'; btn.onclick = () => { location.href = '/cart.html'; }; }
    } catch (e) {
      toast(e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '加入购物车'; }
    }
  }

  function openBuyModal() {
    const product = state.product;
    if (!product) return;
    // 下单需要登录：未登录先弹登录框，登录成功后自动继续下单
    if (window.Auth && !Auth.isLogged()) {
      Auth.openLogin({ role: 'consumer', title: '登录后购买', desc: '登录即可下单，溯源与检测信息仍可免登录查看。', onSuccess: openBuyModal });
      return;
    }
    if (product.status !== 'on') {
      toast('该商品尚未通过审核，暂不可售', 'error');
      return;
    }
    const price = num(product.price);
    const initialQty = Math.max(1, Math.min(MAX_QTY, state.qty));
    const body = `<div class="stack gap-200">
      <div class="buy-summary">
        <div class="row between gap-100">
          <span class="body-5">${esc(product.name)}</span>
          <span class="body-4 mono">${fmt.money(price)}</span>
        </div>
        <p class="caption-2 muted" style="margin-top:var(--s-50)">${esc(product.spec || '')} · ${esc(
      product.unit || ''
    )}</p>
      </div>
      <div class="form-grid">
        <label class="field">
          <span class="field__label">收货人</span>
          <input class="input" name="buyerName" autocomplete="name" placeholder="例：李女士" aria-describedby="err-buyerName">
          <span class="field__hint" id="err-buyerName" data-error="buyerName"></span>
        </label>
        <label class="field">
          <span class="field__label">手机号</span>
          <input class="input" name="buyerPhone" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel" placeholder="11 位手机号" aria-describedby="err-buyerPhone">
          <span class="field__hint" id="err-buyerPhone" data-error="buyerPhone"></span>
        </label>
        <label class="field full">
          <span class="field__label">收货地址</span>
          <textarea class="textarea" name="buyerAddress" rows="2" autocomplete="street-address" placeholder="省市区、街道与门牌号" aria-describedby="err-buyerAddress"></textarea>
          <span class="field__hint" id="err-buyerAddress" data-error="buyerAddress"></span>
        </label>
      </div>
      <div class="qty-inline">
        <div class="field">
          <span class="field__label">购买数量</span>
          <div class="stepper" role="group" aria-label="购买数量">
            <button type="button" data-mqty="dec" aria-label="减少数量"><span class="stepper__minus" aria-hidden="true"></span></button>
            <input class="stepper__input body-4" name="orderQty" type="number" inputmode="numeric" min="1" max="${MAX_QTY}" value="${initialQty}" aria-label="购买数量">
            <button type="button" data-mqty="inc" aria-label="增加数量">${icon('plus')}</button>
          </div>
        </div>
        <div class="order-total"><span class="caption-1 muted">合计</span><span class="heading-6 mono js-total">${fmt.money(
          price * initialQty
        )}</span></div>
      </div>
      <p class="caption-5 muted">提交后生成演示订单，不发起真实支付。溯源码随订单绑定，可在溯源页查询。</p>
    </div>`;

    const dialog = modal({
      title: '确认订单',
      body,
      actions: [
        { label: '取消' },
        {
          label: '提交订单',
          variant: 'btn--primary',
          onClick: async (box) => {
            const qtyInput = $('[name="orderQty"]', box);
            const qty = Math.max(1, Math.min(MAX_QTY, parseInt(qtyInput ? qtyInput.value : '1', 10) || 1));
            const name = ($('[name="buyerName"]', box).value || '').trim();
            const phone = ($('[name="buyerPhone"]', box).value || '').replace(/[\s-]/g, '');
            const address = ($('[name="buyerAddress"]', box).value || '').trim();

            let valid = true;
            if (!name) {
              fieldError(box, 'buyerName', '请填写收货人');
              valid = false;
            }
            if (!/^1[3-9]\d{9}$/.test(phone)) {
              fieldError(box, 'buyerPhone', '请填写 11 位有效手机号');
              valid = false;
            }
            if (!address) {
              fieldError(box, 'buyerAddress', '请填写收货地址');
              valid = false;
            }
            if (!valid) {
              toast('请检查收货信息后再提交', 'error');
              return false;
            }

            const submit = $$('[data-act]', box)[1];
            if (submit) {
              submit.disabled = true;
              submit.textContent = '提交中';
            }
            try {
              const result = await api('/api/orders', {
                method: 'POST',
                body: {
                  productId: product.id,
                  qty,
                  buyer: { name, phone, city: address, address },
                },
              });
              state.qty = qty;
              const mainQty = $('#qtyInput');
              if (mainQty) {
                mainQty.value = String(qty);
                mainQty.dispatchEvent(new Event('input'));
              }
              showOrderSuccess(result, qty);
            } catch (err) {
              toast((err && err.message) || '下单失败，请稍后重试', 'error');
            } finally {
              if (submit && submit.isConnected) {
                submit.disabled = false;
                submit.textContent = '提交订单';
              }
            }
            return false;
          },
        },
      ],
    });

    const box = dialog.box;
    const qtyInput = $('[name="orderQty"]', box);
    const dec = $('[data-mqty="dec"]', box);
    const inc = $('[data-mqty="inc"]', box);
    const total = $('.js-total', box);
    const clamp = (value) => Math.max(1, Math.min(MAX_QTY, num(value, 1)));
    const syncQty = (write) => {
      const qty = clamp(parseInt(qtyInput.value, 10));
      if (write) qtyInput.value = String(qty);
      if (total) total.textContent = fmt.money(price * qty);
      if (dec) dec.disabled = qty <= 1;
      if (inc) inc.disabled = qty >= MAX_QTY;
    };
    qtyInput.addEventListener('input', () => syncQty(false));
    qtyInput.addEventListener('blur', () => syncQty(true));
    dec.addEventListener('click', () => {
      qtyInput.value = String(clamp(parseInt(qtyInput.value, 10) - 1));
      syncQty(true);
    });
    inc.addEventListener('click', () => {
      qtyInput.value = String(clamp(parseInt(qtyInput.value, 10) + 1));
      syncQty(true);
    });
    ['buyerName', 'buyerPhone', 'buyerAddress'].forEach((name) => {
      const field = $('[name="' + name + '"]', box);
      if (field) field.addEventListener('input', () => fieldError(box, name, ''));
    });
    syncQty(true);
    setTimeout(() => {
      const first = $('[name="buyerName"]', box);
      if (first) first.focus();
    }, 80);
  }

  function fieldError(box, name, message) {
    const input = $('[name="' + name + '"]', box);
    const hint = $('[data-error="' + name + '"]', box);
    if (!input || !hint) return;
    if (message) {
      input.classList.add('input--error');
      hint.textContent = message;
      hint.classList.add('field__hint--error');
    } else {
      input.classList.remove('input--error');
      hint.textContent = '';
      hint.classList.remove('field__hint--error');
    }
  }

  function showOrderSuccess(result, qty) {
    const product = state.product;
    const order = (result && result.order) || {};
    const code =
      (result && result.batch) ||
      ((product.batches || [])[0] && (product.batches || [])[0].code) ||
      '';
    const traceUrl = code ? '/trace.html?code=' + encodeURIComponent(code) : '/trace.html';
    const amount = order.amount !== undefined ? order.amount : num(product.price) * qty;
    const createdAt = order.createdAt || new Date().toISOString();

    const body = `<div class="stack gap-200" style="align-items:center;text-align:center">
      <div class="success-mark">${icon('check')}</div>
      <div class="stack gap-50">
        <p class="heading-6">订单已生成</p>
        <p class="body-6 muted">溯源码已随订单绑定，可以查看本批次的农事、检测与冷链记录。</p>
      </div>
      <div class="card card--soft full" style="padding:var(--s-200);text-align:left">
        <div class="kv"><span class="kv__k">订单号</span><span class="kv__v mono wrap-any">${esc(order.no || '')}</span></div>
        <div class="kv"><span class="kv__k">批次溯源码</span><span class="kv__v mono wrap-any">${esc(code || '尚未赋码')}</span></div>
        <div class="kv"><span class="kv__k">实付金额</span><span class="kv__v">${fmt.money(amount)}</span></div>
        <div class="kv"><span class="kv__k">下单时间</span><span class="kv__v">${fmt.date(createdAt, true)}</span></div>
      </div>
      <p class="caption-5 muted">演示环境，未发起真实支付。订单号与溯源码可直接在溯源页查询。</p>
    </div>`;

    modal({
      title: '下单成功',
      body,
      actions: [
        {
          label: '继续挑选',
          onClick: () => {
            const related = $('#related');
            if (related) related.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        },
        {
          label: '查看溯源',
          variant: 'btn--primary',
          onClick: () => {
            location.href = traceUrl;
            return false;
          },
        },
      ],
    });
  }

  /* ---------------- 同产地推荐 ---------------- */
  async function renderRelated(product) {
    const wrap = $('#related');
    if (!wrap) return;

    const head = `<div class="section-head">
      <div>
        <p class="eyebrow">产地推荐</p>
        <h2 class="heading-4" id="related-title">同产地推荐</h2>
        <p class="body-6 muted mt-75">来自${esc(product.category || '同品类')}的农户直发商品，一箱一码可查。</p>
      </div>
      <a class="btn btn--ghost btn--sm" href="/shop.html">逛商城${icon('arrowRight')}</a>
    </div>`;

    wrap.innerHTML = `<section class="related" aria-labelledby="related-title">${head}<div class="rec-grid">${skeletonCards(
      3
    )}</div></section>`;

    try {
      let pool = [];
      try {
        const sameCategory = await api('/api/products?category=' + encodeURIComponent(product.category || ''));
        pool = Array.isArray(sameCategory.items) ? sameCategory.items : [];
      } catch (err) {
        pool = [];
      }

      let candidates = uniqueProducts(pool).filter((item) => item.id !== product.id && item.status === 'on');
      if (candidates.length < 3) {
        const all = await api('/api/products');
        candidates = uniqueProducts(candidates.concat(Array.isArray(all.items) ? all.items : [])).filter(
          (item) => item.id !== product.id && item.status === 'on'
        );
      }

      const province = (product.farmer && product.farmer.region && product.farmer.region.province) || '';
      candidates.sort((a, b) => {
        const aSame = a.farmer && a.farmer.region && a.farmer.region.province === province ? 0 : 1;
        const bSame = b.farmer && b.farmer.region && b.farmer.region.province === province ? 0 : 1;
        return aSame - bSame || num(b.monthlySales) - num(a.monthlySales);
      });

      const items = candidates.slice(0, 3);
      if (!items.length) {
        wrap.innerHTML = `<section class="related" aria-labelledby="related-title">${head}${emptyState(
          '暂无同产地推荐',
          '该品类暂时没有其他在售商品，可以返回商城看看。',
          'box',
          '<a class="btn btn--secondary btn--sm" href="/shop.html">返回商城</a>'
        )}</section>`;
        return;
      }

      const cards = items.map((item) => relatedCard(item, province)).join('');
      wrap.innerHTML = `<section class="related" aria-labelledby="related-title">${head}<div class="rec-grid">${cards}</div></section>`;
      observeReveal();
    } catch (err) {
      wrap.innerHTML = `<section class="related" aria-labelledby="related-title">${head}${emptyState(
        '推荐加载失败',
        '同产地商品暂时读取失败，可以返回商城继续浏览。',
        'alert',
        '<a class="btn btn--secondary btn--sm" href="/shop.html">返回商城</a>'
      )}</section>`;
    }
  }

  function uniqueProducts(list) {
    const seen = new Set();
    return (list || []).filter((item) => {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function relatedCard(item, province) {
    const farmer = item.farmer || {};
    const region = farmer.region || {};
    const sameProvince = province && region.province === province;
    return `<a class="card card--hover card--flush rec" href="/product.html?id=${encodeURIComponent(item.id)}">
      <div class="rec__art">${productArt(item.art || 'pear', { size: 280 })}</div>
      <div class="rec__body">
        <div class="row wrap between gap-50">
          <span class="badge badge--${sameProvince ? 'green' : 'blue'}">${sameProvince ? '同产区' : '同品类'}</span>
          <span class="caption-5 muted">${esc(region.county || region.city || '')}</span>
        </div>
        <h3 class="title-3">${esc(item.name)}</h3>
        <p class="caption-2 muted">${esc(farmer.name || '合作农户')} · ${esc(farmer.org || '产地直发')}</p>
        <div class="rec__price">
          <span class="heading-6">${fmt.money(num(item.price))}</span>
          <span class="caption-2 muted">${esc(item.unit || '')}</span>
        </div>
        <div class="rec__meta caption-5">
          <span>月销 ${fmt.int(num(item.monthlySales))}</span>
          <span>${fmt.int(num(item.ratingAvg))} 分</span>
        </div>
      </div>
    </a>`;
  }

  function renderMobileBuy(product) {
    const host = $('#mobile-buy');
    if (!host) return;
    const pending = product.status !== 'on';
    host.innerHTML = `<div class="mobile-buy" role="region" aria-label="快捷购买">
      <div class="mobile-buy__price">
        <span class="caption-5 muted">${pending ? '待审核' : '到手价'}</span>
        <span class="body-4">${fmt.money(num(product.price))}</span>
      </div>
      <button class="btn btn--primary" id="mobileBuyBtn" type="button"${
        pending ? ' disabled aria-disabled="true"' : ''
      }>${icon('bag')} ${pending ? '暂缓上架' : '立即购买'}</button>
    </div>`;
    const button = $('#mobileBuyBtn');
    if (button && !pending) button.addEventListener('click', openBuyModal);
  }

  /* ---------------- 空态与错误 ---------------- */
  function renderNotFound(id) {
    document.title = '商品不存在 · 田源可信';
    $('#crumb').innerHTML = `
      <a href="/">首页</a>
      <span class="crumb__sep" aria-hidden="true">/</span>
      <a href="/shop.html">产地商城</a>
      <span class="crumb__sep" aria-hidden="true">/</span>
      <span aria-current="page">商品不存在</span>`;
    $('#app').innerHTML = emptyState(
      '没有找到这件商品',
      `链接里的商品编号 ${id} 可能已下架，或商品不存在。可以返回商城继续挑选。`,
      'search',
      '<a class="btn btn--primary" href="/shop.html">返回商城</a>'
    );
    $('#related').innerHTML = '';
    $('#mobile-buy').innerHTML = '';
  }

  function renderError(message) {
    document.title = '加载失败 · 田源可信';
    $('#app').innerHTML = emptyState(
      '页面加载失败',
      message || '商品信息暂时无法读取，请稍后重试。',
      'alert',
      '<button class="btn btn--primary" id="retryBtn" type="button">重新加载</button>'
    );
    $('#related').innerHTML = '';
    $('#mobile-buy').innerHTML = '';
    const retry = $('#retryBtn');
    if (retry) retry.addEventListener('click', () => boot());
  }
})();
