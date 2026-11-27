/* 消费端首页：导航、图标填充、商城筛选与商品卡 */
(function () {
  'use strict';

  function hydrateIcons(root) {
    Array.from((root || document).querySelectorAll('[data-icon]')).forEach(function (node) {
      if (node.firstElementChild) return;
      node.innerHTML = icon(node.dataset.icon);
    });
  }

  hydrateIcons(document);
  initNav('home');

  /* 首屏视频：可暂停，尊重减弱动态 */
  var heroVideo = document.querySelector('.hero-media__video');
  var heroToggle = document.querySelector('[data-video-toggle]');
  if (heroVideo && heroToggle) {
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    var syncVideo = function () {
      var paused = heroVideo.paused;
      heroToggle.textContent = paused ? '播放' : '暂停';
      heroToggle.setAttribute('aria-label', paused ? '播放背景视频' : '暂停背景视频');
    };
    if (reduceMotion && reduceMotion.matches) heroVideo.pause();
    heroToggle.addEventListener('click', function () {
      if (heroVideo.paused) heroVideo.play(); else heroVideo.pause();
    });
    heroVideo.addEventListener('play', syncVideo);
    heroVideo.addEventListener('pause', syncVideo);
    syncVideo();
  }

  var heroArt = $('#hero-art');
  if (heroArt) heroArt.innerHTML = productArt('pear', { size: 320 });

  /* ---------------- 商城 ---------------- */
  var state = { cat: '全部', q: '', sort: 'recommend', items: [], seq: 0 };
  var grid = $('#market-grid');
  var countEl = $('#market-count');
  var searchEl = $('#market-q');
  var sortEl = $('#market-sort');
  var traceCountEl = $('#market-trace-count');

  function certBadges(p) {
    var out = [];
    if (p.geoIndication) out.push('<span class="badge badge--amber">地理标志</span>');
    if (p.organic) out.push('<span class="badge badge--green">有机</span>');
    if (p.greenFood) out.push('<span class="badge badge--green">绿色食品</span>');
    if (!out.length) out.push('<span class="badge">' + esc(p.grade || '当季') + '</span>');
    return out.join('');
  }

  function priceHTML(n) {
    var v = Number(n || 0);
    var fixed = (Math.round(v * 100) / 100).toString();
    var parts = fixed.split('.');
    return '<i>¥</i><b>' + parts[0] + '</b>' + (parts[1] ? '<small>.' + parts[1] + '</small>' : '');
  }

  function productCard(p) {
    var code = p.code || '';
    var traceHref = code ? '/trace.html?code=' + encodeURIComponent(code) : '/trace.html';
    var rating = Number(p.ratingAvg || 0).toFixed(1);
    var save = (p.originalPrice && p.price && p.originalPrice > p.price) ? p.originalPrice - p.price : 0;
    var repurchase = Number(p.repurchaseRate || 0);
    var lowStock = typeof p.availableStock === 'number' && p.availableStock > 0 && p.availableStock < 100;
    var region = (p.farmer && p.farmer.region) || {};
    var origin = [region.province, region.county].filter(Boolean).join(' · ');
    return '<article class="card card--hover product">' +
      '<a class="product__main" href="/product.html?id=' + encodeURIComponent(p.id) + '" aria-label="查看 ' + esc(p.name) + ' 的商品详情">' +
        '<div class="product__media">' +
          '<div class="cover cover--photo"><img class="cover__img" src="/assets/photos/products/' + (p.art || 'pear') + '.jpg" alt="' + esc(p.name) + '" loading="lazy" width="960" height="720"></div>' +
          '<div class="product__badges">' + certBadges(p) + '</div>' +
        '</div>' +
        '<div class="product__body">' +
          '<p class="title-2 product__name">' + esc(p.name) + '</p>' +
          (p.summary ? '<p class="caption-2 product__summary">' + esc(p.summary) + '</p>' : '') +
          '<p class="caption-2 muted">' + esc(p.spec || '') + ' · ' + esc(p.unit || '') + '</p>' +
          '<p class="caption-2 muted">' + esc((p.farmer && p.farmer.org) || '产地合作社') + (origin ? ' · ' + esc(origin) : '') + '</p>' +
          '<div class="product__price">' +
            '<span class="product__price-now">' + priceHTML(p.price) + '</span>' +
            (save > 0 ?
              '<span class="caption-2 muted product__price-was">' + fmt.money(p.originalPrice) + '</span>' +
              '<span class="product__save">立省 ' + fmt.money(save) + '</span>' : '') +
          '</div>' +
          '<p class="product__rating caption-2">' +
            '<span class="icon">' + icon('star') + '</span>' +
            '<span class="body-5">' + rating + '</span>' +
            (repurchase ? '<span class="product__repurchase">复购 ' + repurchase.toFixed(1) + '%</span>' : '') +
            '<span class="muted">' + fmt.int(p.ratingCount) + ' 条评价 · 月售 ' + fmt.int(p.monthlySales) + '</span>' +
          '</p>' +
          (lowStock ? '<p class="caption-2 product__stock">仅剩 ' + fmt.int(p.availableStock) + ' 件，售完等下一批</p>' : '') +
          (code ? '<p class="product__code caption-4 mono"><span class="icon">' + icon('qr') + '</span><span>' + esc(code) + '</span></p>' : '') +
        '</div>' +
      '</a>' +
      '<div class="product__foot">' +
        (p.traceable ? '<span class="badge badge--green badge--dot">可溯源 · ' + fmt.int(p.batchCount || 1) + ' 个批次</span>' : '<span class="badge">暂无可查批次</span>') +
        '<span class="row gap-75">' +
        '<a class="btn btn--primary btn--sm" href="/product.html?id=' + encodeURIComponent(p.id) + '">查看商品</a>' +
        (p.traceable ? '<a class="btn btn--secondary btn--sm" href="' + traceHref + '">看溯源</a>' : '') +
        '</span>' +
      '</div>' +
    '</article>';
  }

  function setCount(text) {
    if (countEl) countEl.textContent = text;
  }

  async function loadMarket() {
    if (!grid) return;
    var seq = ++state.seq;
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = skeletonCards(6);
    setCount('正在加载在售商品');

    try {
      var params = new URLSearchParams();
      if (state.cat && state.cat !== '全部') params.set('category', state.cat);
      if (state.q) params.set('q', state.q);
      params.set('sort', state.sort);

      var data = await api('/api/products?' + params.toString());
      if (seq !== state.seq) return;

      var items = (data.items || []).filter(function (p) { return p.status === 'on'; });
      state.items = items;
      grid.removeAttribute('aria-busy');

      if (!items.length) {
        grid.innerHTML = '<div class="market__wide">' + emptyState(
          '没有找到这类货',
          '换个词试试，或者回到全部在售看看',
          'search',
          '<button class="btn btn--secondary" type="button" data-reset>清空筛选</button>'
        ) + '</div>';
        setCount('0 件在售');
        return;
      }

      grid.innerHTML = items.map(productCard).join('');
      var traced = items.filter(function (p) { return p.code; }).length;
      setCount(items.length + ' 件在售 · ' + traced + ' 件带批次码 · 均来自可核对的产地');
      if (traceCountEl) traceCountEl.textContent = traced + ' 件可查批次';
    } catch (err) {
      if (seq !== state.seq) return;
      grid.removeAttribute('aria-busy');
      grid.innerHTML = '<div class="market__wide"><div class="callout callout--red" role="alert">' +
        icon('alert') +
        '<div class="stack gap-75">' +
          '<p class="body-5">商品没取回来：' + esc(err.message) + '</p>' +
          '<button class="btn btn--sm btn--secondary" type="button" data-retry>重新加载</button>' +
        '</div>' +
      '</div></div>';
      setCount('商品加载失败');
      toast('商品加载失败，请稍后重试', 'error');
    }
  }

  function resetMarket() {
    state.cat = '全部';
    state.q = '';
    state.sort = 'recommend';
    if (searchEl) searchEl.value = '';
    if (sortEl) sortEl.value = 'recommend';
    Array.from(document.querySelectorAll('[data-cat]')).forEach(function (chip) {
      chip.setAttribute('aria-pressed', String(chip.dataset.cat === '全部'));
    });
    loadMarket();
  }

  var chipEls = Array.from(document.querySelectorAll('[data-cat]'));
  chipEls.forEach(function (chip) {
    chip.addEventListener('click', function () {
      state.cat = chip.dataset.cat || '全部';
      chipEls.forEach(function (c) {
        c.setAttribute('aria-pressed', String(c === chip));
      });
      loadMarket();
    });
  });

  var runSearch = debounce(function () {
    loadMarket();
  }, 300);

  if (searchEl) {
    searchEl.addEventListener('input', function (event) {
      state.q = String(event.target.value || '').trim();
      runSearch();
    });
  }

  if (sortEl) {
    sortEl.addEventListener('change', function () {
      state.sort = sortEl.value;
      loadMarket();
    });
  }

  if (grid) {
    grid.addEventListener('click', function (event) {
      var target = event.target;
      if (target.closest('[data-retry]')) {
        loadMarket();
        return;
      }
      if (target.closest('[data-reset]')) resetMarket();
    });
  }

  /* 复制哈希片段 */
  var copyBtn = document.querySelector('[data-copy-hash]');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      copyText('0x9da58cabc0d1fdf4');
    });
  }

  observeReveal();
  loadMarket();
})();
