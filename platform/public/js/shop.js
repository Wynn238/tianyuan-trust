/* 产地商城：搜索优先 + 分类入口 + 分类/产地/价格筛选 + 商品卡加购 */
(function () {
  'use strict';

  document.querySelectorAll('[data-icon]').forEach(function (node) {
    if (!node.firstElementChild) node.innerHTML = icon(node.dataset.icon);
  });
  initNav('market');

  var grid = document.getElementById('shop-grid');
  var countEl = document.getElementById('shop-count');
  var qEl = document.getElementById('shop-q');
  var sortEl = document.getElementById('shop-sort');
  var rail = document.getElementById('cate-rail');
  var sideCat = document.querySelector('[data-side="cat"]');
  var sideOrigin = document.querySelector('[data-side="origin"]');
  var sidePrice = document.querySelector('[data-side="price"]');
  var traceOnlyEl = document.getElementById('trace-only');
  var mCat = document.getElementById('m-cat');
  var mOrigin = document.getElementById('m-origin');
  var mPrice = document.getElementById('m-price');
  var forYou = document.getElementById('shop-for-you');
  var forYouGrid = document.getElementById('shop-for-you-grid');
  var forYouReason = document.getElementById('for-you-reason');
  var recItems = [];

  var CATS = [
    { key: '全部', label: '全部', char: '全' },
    { key: '水果', label: '水果', char: '果' },
    { key: '粮油', label: '粮油', char: '粮' },
    { key: '肉禽蛋', label: '肉禽蛋', char: '肉' },
    { key: '滋补', label: '滋补', char: '补' },
  ];
  var PRICES = [
    { key: 'all', label: '全部价格' },
    { key: '0-30', label: '30 元以下' },
    { key: '30-60', label: '30—60 元' },
    { key: '60-100', label: '60—100 元' },
    { key: '100-', label: '100 元以上' },
  ];

  var state = { all: [], cat: '全部', q: '', origin: '全部', price: 'all', traceOnly: false, sort: 'recommend' };
  var params = new URLSearchParams(location.search);
  if (params.get('q')) state.q = params.get('q');
  if (params.get('cat')) state.cat = params.get('cat');
  if (params.get('origin')) state.origin = params.get('origin');
  if (params.get('price')) state.price = params.get('price');
  if (params.get('sort')) state.sort = params.get('sort');
  if (params.get('trace') === '1') state.traceOnly = true;
  qEl.value = state.q;
  sortEl.value = state.sort;
  traceOnlyEl.checked = state.traceOnly;

  function origins() {
    var seen = {};
    state.all.forEach(function (p) {
      var r = (p.farmer && p.farmer.region) || {};
      var o = r.province || r.city || '其他';
      if (o) seen[o] = (seen[o] || 0) + 1;
    });
    return Object.keys(seen).map(function (k) { return { key: k, count: seen[k] }; });
  }
  function catCount(key) {
    if (key === '全部') return state.all.filter(function (p) { return p.status === 'on'; }).length;
    return state.all.filter(function (p) { return p.status === 'on' && p.category === key; }).length;
  }

  function sideButton(kind, key, label, count) {
    return '<button class="side-item" type="button" data-kind="' + kind + '" data-value="' + esc(key) + '" aria-pressed="false">' +
      '<span>' + esc(label) + '</span>' + (count != null ? '<em>' + count + '</em>' : '') + '</button>';
  }

  function buildFilters() {
    var activeCats = CATS.filter(function (c) { return c.key === '全部' || catCount(c.key) > 0; });
    rail.innerHTML = activeCats.map(function (c) {
      return '<button class="cate" type="button" data-cat="' + esc(c.key) + '" aria-pressed="' + String(c.key === state.cat) + '">' +
        '<span class="cate__dot">' + c.char + '</span><span class="cate__label">' + esc(c.label) + '</span></button>';
    }).join('');

    sideCat.innerHTML = CATS.filter(function (c) { return c.key === '全部' || catCount(c.key) > 0; })
      .map(function (c) { return sideButton('cat', c.key, c.label, c.key === '全部' ? state.all.length : catCount(c.key)); }).join('');
    var os = origins();
    sideOrigin.innerHTML = sideButton('origin', '全部', '全部产地', os.reduce(function (s, o) { return s + o.count; }, 0)) +
      os.map(function (o) { return sideButton('origin', o.key, o.key, o.count); }).join('');
    sidePrice.innerHTML = PRICES.map(function (p) { return sideButton('price', p.key, p.label, null); }).join('');

    mCat.innerHTML = CATS.filter(function (c) { return c.key === '全部' || catCount(c.key) > 0; })
      .map(function (c) { return '<option value="' + esc(c.key) + '">' + esc(c.label) + '</option>'; }).join('');
    mOrigin.innerHTML = '<option value="全部">全部产地</option>' +
      os.map(function (o) { return '<option value="' + esc(o.key) + '">' + esc(o.key) + '</option>'; }).join('');
    mPrice.innerHTML = PRICES.map(function (p) { return '<option value="' + esc(p.key) + '">' + esc(p.label) + '</option>'; }).join('');
    syncControls();
  }

  function syncControls() {
    rail.querySelectorAll('[data-cat]').forEach(function (n) { n.setAttribute('aria-pressed', String(n.dataset.cat === state.cat)); });
    [sideCat, sideOrigin, sidePrice].forEach(function (box) {
      box.querySelectorAll('[data-kind]').forEach(function (n) {
        var active = (n.dataset.kind === 'cat' && n.dataset.value === state.cat) ||
          (n.dataset.kind === 'origin' && n.dataset.value === state.origin) ||
          (n.dataset.kind === 'price' && n.dataset.value === state.price);
        n.setAttribute('aria-pressed', String(!!active));
      });
    });
    mCat.value = state.cat;
    mOrigin.value = state.origin;
    mPrice.value = state.price;
    traceOnlyEl.checked = state.traceOnly;
  }

  function moneyParts(n) {
    var s = Number(n || 0).toFixed(2).split('.');
    return { whole: s[0], dec: s[1] };
  }

  function card(p) {
    var m = moneyParts(p.price);
    var region = (p.farmer && p.farmer.region) || {};
    var origin = region.province || region.city || '产地';
    var code = p.code || '';
    var traceHref = '/trace.html?code=' + encodeURIComponent(code);
    var badges = '';
    if (p.geoIndication) badges += '<span class="badge badge--amber">地理标志</span>';
    if (p.organic) badges += '<span class="badge badge--green">有机</span>';
    if (p.greenFood) badges += '<span class="badge badge--green">绿色食品</span>';
    var tags = [];
    if (p.traceable) tags.push('可溯源');
    if (p.farmer) tags.push('产地直发');
    tags.push('坏果包赔');
    return '<article class="pcard" data-id="' + esc(p.id) + '">' +
      '<div class="pcard__media">' +
        '<a href="/product.html?id=' + encodeURIComponent(p.id) + '" aria-label="查看 ' + esc(p.name) + '"><img class="pcard__photo" src="/assets/photos/products/' + (p.art || 'pear') + '.jpg" alt="' + esc(p.name) + '" loading="lazy" width="960" height="720"></a>' +
        '<div class="pcard__badges">' + badges + '</div>' +
        '<button class="pcard__add" type="button" data-add="' + esc(p.id) + '" aria-label="把 ' + esc(p.name) + ' 加入购物车">' + icon('plus') + '</button>' +
      '</div>' +
      '<div class="pcard__body">' +
        '<a class="pcard__title" href="/product.html?id=' + encodeURIComponent(p.id) + '">' + esc(p.name) + '</a>' +
        '<p class="pcard__meta">' + esc(origin) + ' · ' + esc((p.farmer && p.farmer.org) || '产地合作社') + '</p>' +
        '<div class="pcard__tags">' + tags.map(function (t) { return '<span class="pcard__tag">' + t + '</span>'; }).join('') + '</div>' +
        '<div class="pcard__price"><b><i>¥</i>' + m.whole + '.' + m.dec + '</b><span>/' + esc(p.unit || '件') + '</span>' +
          (p.originalPrice ? '<s>' + fmt.money(p.originalPrice) + '</s>' : '') +
          '<em class="pcard__sales">月售 ' + fmt.int(p.monthlySales) + '</em></div>' +
        (p.traceable
          ? '<a class="pcard__trace" href="' + traceHref + '">' + icon('qr') + '批次 ' + esc(code) + '</a>'
          : '<span class="pcard__trace" style="color:var(--muted)">暂无可查批次</span>') +
      '</div>' +
    '</article>';
  }

  function matches(p) {
    if (p.status !== 'on') return false;
    if (state.cat !== '全部' && p.category !== state.cat) return false;
    if (state.origin !== '全部') {
      var r = (p.farmer && p.farmer.region) || {};
      if ((r.province || r.city || '其他') !== state.origin) return false;
    }
    if (state.price !== 'all') {
      var v = Number(p.price) || 0;
      if (state.price === '0-30' && v >= 30) return false;
      if (state.price === '30-60' && (v < 30 || v >= 60)) return false;
      if (state.price === '60-100' && (v < 60 || v >= 100)) return false;
      if (state.price === '100-' && v < 100) return false;
    }
    if (state.traceOnly && !p.traceable) return false;
    if (state.q) {
      var hay = [p.name, p.category, p.spec, p.farmer && p.farmer.org, p.farmer && p.farmer.region && p.farmer.region.province, p.farmer && p.farmer.region && p.farmer.region.county, p.code].join(' ').toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function sorted(list) {
    var arr = list.slice();
    if (state.sort === 'sales') arr.sort(function (a, b) { return (b.monthlySales || 0) - (a.monthlySales || 0); });
    else if (state.sort === 'rating') arr.sort(function (a, b) { return (b.ratingAvg || 0) - (a.ratingAvg || 0); });
    else if (state.sort === 'price-asc') arr.sort(function (a, b) { return a.price - b.price; });
    else if (state.sort === 'price-desc') arr.sort(function (a, b) { return b.price - a.price; });
    return arr;
  }

  function render() {
    var list = sorted(state.all.filter(matches));
    var traced = list.filter(function (p) { return p.traceable; }).length;
    countEl.textContent = list.length + ' 件商品 · ' + traced + ' 件可查批次';
    grid.innerHTML = list.length ? list.map(card).join('') : emptyState('没有找到匹配的商品', '换个关键词、产地或价格试试。', 'search',
      '<button class="btn btn--secondary btn--sm" type="button" data-reset>重置筛选</button>');
    grid.setAttribute('aria-busy', 'false');
    var reset = grid.querySelector('[data-reset]');
    if (reset) reset.onclick = resetAll;
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.cat !== '全部') p.set('cat', state.cat);
    if (state.origin !== '全部') p.set('origin', state.origin);
    if (state.price !== 'all') p.set('price', state.price);
    if (state.traceOnly) p.set('trace', '1');
    if (state.sort !== 'recommend') p.set('sort', state.sort);
    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  function resetAll() {
    state.cat = '全部'; state.q = ''; state.origin = '全部'; state.price = 'all'; state.traceOnly = false; state.sort = 'recommend';
    qEl.value = ''; sortEl.value = 'recommend'; traceOnlyEl.checked = false;
    syncControls(); render();
  }

  async function load() {
    try {
      var data = await api('/api/products?sort=recommend');
      state.all = (data.items || []).filter(function (p) { return p.status === 'on'; });
      buildFilters();
      render();
    } catch (e) {
      grid.innerHTML = emptyState('商品加载失败', e.message || '请稍后重试', 'alert');
      countEl.textContent = '加载失败';
    }
  }

  /* 筛选交互 */
  function pick(kind, value) {
    if (kind === 'cat') state.cat = value;
    if (kind === 'origin') state.origin = value;
    if (kind === 'price') state.price = value;
    syncControls(); render();
  }
  rail.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cat]');
    if (b) pick('cat', b.dataset.cat);
  });
  document.querySelector('.shop-side').addEventListener('click', function (e) {
    var b = e.target.closest('[data-kind]');
    if (b) pick(b.dataset.kind, b.dataset.value);
  });
  mCat.onchange = function () { pick('cat', mCat.value); };
  mOrigin.onchange = function () { pick('origin', mOrigin.value); };
  mPrice.onchange = function () { pick('price', mPrice.value); };
  traceOnlyEl.onchange = function () { state.traceOnly = traceOnlyEl.checked; render(); };
  sortEl.onchange = function () { state.sort = sortEl.value; render(); };
  document.getElementById('reset-filters').onclick = resetAll;

  /* 搜索与热门词 */
  var timer = null;
  qEl.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { state.q = qEl.value.trim(); render(); }, 260);
  });
  document.getElementById('search-form').addEventListener('submit', function (e) {
    e.preventDefault();
    state.q = qEl.value.trim();
    if (window.trackEvent && state.q) trackEvent('search', { query: state.q });
    render();
  });
  document.querySelectorAll('[data-hot]').forEach(function (b) {
    b.onclick = function () {
      state.q = b.dataset.hot;
      qEl.value = state.q;
      if (window.trackEvent) trackEvent('search', { query: state.q });
      render();
      document.getElementById('shop-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });

  /* 快速加购 */
  grid.addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-add]');
    if (!btn) return;
    e.preventDefault();
    var p = state.all.filter(function (x) { return x.id === btn.dataset.add; })[0];
    if (!p) return;
    btn.disabled = true;
    try {
      var guest = localStorage.getItem('ty_guest_id');
      if (!guest) { guest = crypto.randomUUID ? crypto.randomUUID() : 'g' + Date.now(); localStorage.setItem('ty_guest_id', guest); }
      var headers = { 'Content-Type': 'application/json', 'X-Guest-Id': guest };
      var token = window.Auth && Auth.getToken();
      if (token) headers.Authorization = 'Bearer ' + token;
      var res = await fetch('/api/cart/items', { method: 'POST', headers: headers, body: JSON.stringify({ productId: p.id, qty: 1 }) });
      var data = await res.json();
      if (!res.ok) throw new Error((data.error && data.error.message) || '加入失败');
      btn.classList.add('is-added');
      btn.innerHTML = icon('check');
      toast('已加入购物车：' + p.name);
      if (window.trackEvent) trackEvent('add_cart', { objectType: 'product', objectId: p.id });
      window.dispatchEvent(new Event('cart:changed'));
      setTimeout(function () {
        btn.classList.remove('is-added');
        btn.innerHTML = icon('plus');
        btn.disabled = false;
      }, 1400);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });


  /* ---------------- 为你推荐 ---------------- */
  async function loadForYou() {
    if (!forYou || !forYouGrid) return;
    try {
      var res = await fetch('/api/recommendations', { credentials: 'same-origin' });
      var data = await res.json();
      recItems = (data && data.items) || [];
      if (!recItems.length) return;
      forYou.hidden = false;
      if (forYouReason) forYouReason.textContent = (data.reason || '') + (data.basis === 'generic' ? ' · 通用推荐' : ' · 个性化推荐');
      forYouGrid.innerHTML = recItems.map(card).join('');
      if (window.trackEvent) trackEvent('rec_impression', { objectType: 'recommendation', objectId: recItems.map((x) => x.id).join(',') });
    } catch (e) { /* 推荐失败不影响商城 */ }
  }

  if (forYouGrid) {
    forYouGrid.addEventListener('click', async function (e) {
      var link = e.target.closest('a[href*="/product.html"]');
      if (link && window.trackEvent) {
        var id = (link.getAttribute('href') || '').match(/id=([^&]+)/);
        trackEvent('rec_click', { objectType: 'recommendation', objectId: id ? decodeURIComponent(id[1]) : '' });
      }
      var btn = e.target.closest('[data-add]');
      if (!btn) return;
      e.preventDefault();
      var p = recItems.filter(function (x) { return x.id === btn.dataset.add; })[0];
      if (!p) return;
      btn.disabled = true;
      try {
        var guest = localStorage.getItem('ty_guest_id');
        if (!guest) { guest = crypto.randomUUID ? crypto.randomUUID() : 'g' + Date.now(); localStorage.setItem('ty_guest_id', guest); }
        var headers = { 'Content-Type': 'application/json', 'X-Guest-Id': guest };
        var res = await fetch('/api/cart/items', { method: 'POST', headers: headers, body: JSON.stringify({ productId: p.id, qty: 1 }) });
        var data = await res.json();
        if (!res.ok) throw new Error((data.error && data.error.message) || '加入失败');
        btn.classList.add('is-added'); btn.innerHTML = icon('check');
        toast('已加入购物车：' + p.name);
        if (window.trackEvent) trackEvent('add_cart', { objectType: 'product', objectId: p.id });
        window.dispatchEvent(new Event('cart:changed'));
        setTimeout(function () { btn.classList.remove('is-added'); btn.innerHTML = icon('plus'); btn.disabled = false; }, 1400);
      } catch (err) {
        toast(err.message, 'error'); btn.disabled = false;
      }
    });
  }

  load();
  loadForYou();
})();
