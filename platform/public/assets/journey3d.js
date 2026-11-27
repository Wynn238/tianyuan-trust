/* 「一箱货的旅程」低多边形 3D 沙盘：地块 → 分选 → 冷链 → 餐桌 */
(function () {
  'use strict';

  var current = null;
  var activeSelect = null;
  var activeReset = null;
  var STEP_META = [
    { no: '01', key: 'orchard', label: '梨园' },
    { no: '02', key: 'pack', label: '分选打包' },
    { no: '03', key: 'cold', label: '冷链' },
    { no: '04', key: 'table', label: '餐桌' },
  ];

  function dateText(v) {
    if (!v) return '待补';
    try {
      var d = new Date(v);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    } catch (e) { return '待补'; }
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function buildSteps(d) {
    var recs = d.records || [];
    var process = recs.filter(function (r) { return r.type === 'process'; })[0] || {};
    var harvest = recs.filter(function (r) { return r.type === 'harvest'; })[0] || {};
    var store = recs.filter(function (r) { return r.type === 'store'; })[0] || {};
    var ship = d.shipment || {};
    var cps = ship.checkpoints || [];
    var temps = cps.map(function (c) { return Number(c.temp); }).filter(function (n) { return !isNaN(n); });
    var minT = temps.length ? Math.min.apply(null, temps) : null;
    var maxT = temps.length ? Math.max.apply(null, temps) : null;
    var warn = cps.filter(function (c) { return c.status === 'warn'; })[0];
    var region = (d.farmer && d.farmer.region) || {};

    return [
      {
        no: '01', key: 'orchard', label: '梨园',
        title: (d.batch && d.batch.plot) || '合作社保供地块',
        meta: [d.batch && d.batch.area, d.farmer && d.farmer.org].filter(Boolean).join(' · '),
        body: '这一批果子的起点。' + (d.farmer && d.farmer.name ? d.farmer.name + ' ' : '') + '在 ' + (harvest.at ? dateText(harvest.at) : '采收季') + ' 完成采收，随后 2 小时内进入预冷库。',
        at: harvest.at,
        rows: [
          ['地块', (region.county || '') + ' ' + ((d.batch && d.batch.plot) || '')],
          ['种植年份', d.batch && d.batch.plantedAt ? dateText(d.batch.plantedAt) : '—'],
          ['农事记录', recs.length + ' 条'],
        ],
        detail: harvest.detail || '',
      },
      {
        no: '02', key: 'pack', label: '分选打包',
        title: '合作社分选台',
        meta: [(d.batch && d.batch.qty) + ' kg', d.batch && d.batch.grade].filter(Boolean).join(' · '),
        body: process.detail || '按单果重分级、剔除碰伤果，泡沫托加纸箱包装，箱内附一枚溯源标签。',
        at: process.at,
        rows: [
          ['分选标准', (d.batch && d.batch.grade) || '—'],
          ['包装', (d.product && d.product.unit) || '标准箱'],
          ['记录', process.title || '分选与包装'],
        ],
        detail: process.detail || '',
      },
      {
        no: '03', key: 'cold', label: '冷链',
        title: (ship.carrier || '冷链运输') + (ship.waybill ? ' · ' + ship.waybill : ''),
        meta: [ship.from, ship.to].filter(Boolean).join(' → '),
        body: '全程 ' + cps.length + ' 个温控节点' + (minT != null ? '，温度 ' + minT.toFixed(1) + '—' + maxT.toFixed(1) + '℃' : '') + '。' + (warn ? '其中「' + warn.place + '」记录到 ' + warn.temp + '℃，已触发预警。' : '温度未超出 0—8℃ 区间。'),
        at: store.at,
        rows: [
          ['出库', cps[0] ? cps[0].place : '—'],
          ['温控节点', cps.length + ' 个'],
          ['预警', warn ? warn.place + ' ' + warn.temp + '℃' : '无'],
        ],
        detail: store.detail || '',
      },
      {
        no: '04', key: 'table', label: '餐桌',
        title: (ship.to || '收货城市') + ' · 已签收',
        meta: (d.scanCount || 0) + ' 次扫码 · ' + ((d.orders || []).length || 0) + ' 笔订单',
        body: '从出库到签收，这箱梨走了 ' + (cps.length ? cps.length : '若干') + ' 个节点。消费者扫箱上的码，看到的就是你刚才看到的这些记录。',
        at: ship.deliveredAt,
        rows: [
          ['签收时间', dateText(ship.deliveredAt)],
          ['扫码次数', (d.scanCount || 0) + ' 次'],
          ['订单', ((d.orders || []).length || 0) + ' 笔'],
        ],
        detail: '箱码：' + ((d.batch && d.batch.code) || '—'),
      },
    ];
  }

  function renderPanel(d, index) {
    var steps = buildSteps(d);
    var active = steps[index] || steps[0];
    var root = document.querySelector('[data-journey]');
    if (!root) return;
    root.querySelectorAll('[data-stop]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.stop) === index));
    });
    var detail = root.querySelector('[data-journey-detail]');
    if (!detail) return;
    detail.innerHTML =
      '<div class="journey__detail-head"><span class="journey__no">' + active.no + '</span>' +
      '<div><p class="journey__eyebrow">第 ' + Number(active.no) + ' 站 · ' + esc(active.label) + '</p>' +
      '<h3 class="journey__title">' + esc(active.title) + '</h3></div></div>' +
      '<p class="journey__meta">' + esc(active.meta) + '</p>' +
      '<p class="journey__body">' + esc(active.body) + '</p>' +
      '<dl class="journey__facts">' + active.rows.map(function (r) {
        return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1] || '—') + '</dd></div>';
      }).join('') + '</dl>' +
      (active.detail ? '<p class="journey__record">' + esc(active.detail) + '</p>' : '');
  }

  function mount(d) {
    dispose();
    var root = document.querySelector('[data-journey]');
    if (!root) return;
    var canvas = root.querySelector('.journey__gl');
    var fallback = root.querySelector('.journey__fallback');
    var loading = root.querySelector('.journey__loading');
    var stepsBox = root.querySelector('[data-journey-steps]');
    var resetBtn = root.querySelector('[data-journey-reset]');
    if (!canvas || !stepsBox) return;
    if (resetBtn) resetBtn.onclick = function () { if (activeReset) activeReset(); };

    var steps = buildSteps(d);
    stepsBox.innerHTML = steps.map(function (s, i) {
      return '<button class="journey__step" type="button" data-stop="' + i + '" aria-pressed="' + (i === 0) + '">' +
        '<span class="journey__step-no">' + s.no + '</span>' +
        '<span class="journey__step-label">' + esc(s.label) + '</span></button>';
    }).join('');
    renderPanel(d, 0);
    stepsBox.onclick = function (e) {
      var b = e.target.closest('[data-stop]');
      if (!b) return;
      if (activeSelect) activeSelect(Number(b.dataset.stop));
    };

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var small = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
    var glCanvas = document.createElement('canvas');
    var gl = glCanvas.getContext('webgl2') || glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
    if (!gl || reduce) {
      if (fallback) fallback.hidden = false;
      if (loading) loading.hidden = true;
      var layout = root.querySelector('.journey');
      if (layout) layout.classList.add('is-fallback');
      activeSelect = function (idx) { renderPanel(d, idx); };
      if (resetBtn) resetBtn.hidden = true;
      return;
    }

    function loadThree(cb, fail) {
      if (window.THREE) return cb();
      var s = document.createElement('script');
      s.src = '/assets/vendor/three.min.js';
      s.onload = cb;
      s.onerror = fail;
      document.head.appendChild(s);
    }

    loadThree(function () { boot(d, root, canvas, loading, reduce, small); }, function () {
      if (fallback) fallback.hidden = false;
      if (loading) loading.hidden = true;
      var layout = root.querySelector('.journey');
      if (layout) layout.classList.add('is-fallback');
      activeSelect = function (idx) { renderPanel(d, idx); };
      if (resetBtn) resetBtn.hidden = true;
    });
  }

  function boot(d, root, canvas, loading, reduce, isMobile) {
    var THREE = window.THREE;
    var scene = new THREE.Scene();
    var camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !isMobile, alpha: true });
    renderer.setPixelRatio(isMobile ? 1.35 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = !isMobile;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    var target = new THREE.Vector3(0.4, 0.0, 0);
    var look = target.clone();
    var lookGoal = target.clone();
    var viewBase = isMobile ? 17.0 : 13.5;
    var viewCurrent = viewBase;
    var viewGoal = viewBase;
    var focusIndex = -1;
    var theta = 0.82;
    var phi = 1.0;
    var radius = 30;
    var dragging = false;
    var moved = 0;
    var last = { x: 0, y: 0 };
    var markers = [];
    var selected = 0;
    var crateT = 0.08;
    var visible = true;
    var raf = 0;
    var clock = new THREE.Clock();

    function applyFrustum() {
      camera.left = -viewCurrent * camera.aspect / 2;
      camera.right = viewCurrent * camera.aspect / 2;
      camera.top = viewCurrent / 2;
      camera.bottom = -viewCurrent / 2;
      camera.updateProjectionMatrix();
    }
    function placeCamera() {
      camera.position.set(
        look.x + radius * Math.sin(phi) * Math.sin(theta),
        look.y + radius * Math.cos(phi),
        look.z + radius * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(look);
    }
    placeCamera();

    scene.add(new THREE.HemisphereLight(0xfff8e8, 0x6b5b45, 0.85));
    var sun = new THREE.DirectionalLight(0xfff3dc, 2.15);
    sun.position.set(9, 16, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    var fill = new THREE.DirectionalLight(0xbfd4c4, 0.55);
    fill.position.set(-8, 6, -7);
    scene.add(fill);

    function mat(color) { return new THREE.MeshStandardMaterial({ color: color, roughness: 0.9, metalness: 0 }); }
    function add(geo, color, x, y, z) {
      var m = new THREE.Mesh(geo, mat(color));
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    }

    // 底座
    var base = add(new THREE.BoxGeometry(18, 0.55, 6.5), 0xcdb68f, 0, -0.28, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    var shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(32, 22), new THREE.ShadowMaterial({ opacity: 0.28 }));
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.565;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);
    var edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(18, 0.55, 6.5)),
      new THREE.LineBasicMaterial({ color: 0xd4c3a4, transparent: true, opacity: 0.8 })
    );
    edge.position.y = -0.28;
    scene.add(edge);

    // 梨园地块
    add(new THREE.BoxGeometry(4.7, 0.08, 3.0), 0xb9d19e, -6.35, 0.04, -0.1);
    var treeColors = [0x24543a, 0x2f6b4a, 0x3a7350];
    for (var tx = 0; tx < 3; tx++) {
      for (var tz = 0; tz < 3; tz++) {
        var x = -7.6 + tx * 1.15;
        var z = -1.15 + tz * 1.1;
        var h = 0.85 + ((tx + tz) % 3) * 0.1;
        add(new THREE.CylinderGeometry(0.055, 0.08, h, 5), 0x8b6239, x, h / 2, z);
        var crown = add(new THREE.IcosahedronGeometry(0.46 + (tx + tz) % 2 * 0.08, 0), treeColors[(tx + tz) % 3], x, h + 0.28, z);
        crown.rotation.y = tx * 0.6;
        var crown2 = add(new THREE.IcosahedronGeometry(0.28, 0), treeColors[(tx + tz + 1) % 3], x + 0.16, h + 0.52, z - 0.12);
        crown2.rotation.y = tz * 0.8;
        if (tx === 1 && tz === 1) {
          for (var pi = 0; pi < 3; pi++) {
            add(new THREE.SphereGeometry(0.075, 10, 8), 0xd9b35e, x - 0.22 + pi * 0.2, h + 0.28, z + 0.35);
          }
        }
      }
    }
    for (var fur = 0; fur < 5; fur++) {
      add(new THREE.BoxGeometry(4.5, 0.012, 0.035), 0x9db98b, -6.35, 0.091, -1.25 + fur * 0.55);
    }
    for (var fp = 0; fp < 5; fp++) {
      add(new THREE.BoxGeometry(0.03, 0.42, 0.03), 0x8b6239, -8.65 + fp * 1.15, 0.22, -1.72);
      add(new THREE.BoxGeometry(0.03, 0.42, 0.03), 0x8b6239, -8.65 + fp * 1.15, 0.22, 1.68);
    }
    add(new THREE.BoxGeometry(4.7, 0.03, 0.03), 0x8b6239, -6.35, 0.34, -1.72);
    add(new THREE.BoxGeometry(4.7, 0.03, 0.03), 0x8b6239, -6.35, 0.34, 1.68);
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.48, 32), new THREE.MeshBasicMaterial({ color: 0xc08a2e, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(-6.6, 0.1, 1.05);
    scene.add(ring);

    // 分选棚 / 台 / 箱
    add(new THREE.BoxGeometry(3.1, 0.08, 2.5), 0xe3d7bf, -1.25, 0.05, -0.2);
    [[-2.55, -1.2], [-0.05, -1.2], [-2.55, 0.8], [-0.05, 0.8]].forEach(function (p) {
      add(new THREE.BoxGeometry(0.08, 1.9, 0.08), 0x8f7d5e, p[0], 0.98, p[1]);
    });
    var roofA = add(new THREE.BoxGeometry(3.15, 0.09, 1.35), 0x24543a, -1.3, 2.02, -0.75);
    roofA.rotation.x = -0.36;
    var roofB = add(new THREE.BoxGeometry(3.15, 0.09, 1.35), 0x2f6b4a, -1.3, 2.02, 0.35);
    roofB.rotation.x = 0.36;
    add(new THREE.BoxGeometry(3.2, 0.07, 0.09), 0xc08a2e, -1.3, 2.27, -0.2);
    add(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 5), 0x3d3a32, -1.3, 1.72, 0.05);
    var lamp = add(new THREE.SphereGeometry(0.09, 12, 10), 0xf2c96e, -1.3, 1.43, 0.05);
    lamp.material.emissive = new THREE.Color(0xc08a2e);
    lamp.material.emissiveIntensity = 0.7;
    add(new THREE.BoxGeometry(1.5, 0.12, 1.0), 0xe8dcc4, -1.3, 0.75, 0.05);
    [[-1.8, 0.2], [-0.85, 0.2], [-1.8, -0.2], [-0.85, -0.2]].forEach(function (p) {
      add(new THREE.BoxGeometry(0.07, 0.7, 0.07), 0x9b8768, p[0], 0.38, p[1]);
    });
    for (var i = 0; i < 3; i++) {
      add(new THREE.BoxGeometry(0.42, 0.3, 0.32), 0xc79a5f, -1.85 + i * 0.5, 0.98, 0.1);
      add(new THREE.BoxGeometry(0.34, 0.02, 0.24), 0xfffdf6, -1.85 + i * 0.5, 1.14, 0.1);
    }

    // 冷库 / 冷链车
    add(new THREE.BoxGeometry(1.9, 1.5, 1.7), 0xf4ecd9, 3.2, 0.75, -0.8);
    add(new THREE.BoxGeometry(2.0, 0.08, 1.8), 0x2f6b4a, 3.2, 1.52, -0.8);
    add(new THREE.BoxGeometry(0.06, 0.9, 0.65), 0x7c8f84, 4.12, 0.6, -0.8);
    add(new THREE.BoxGeometry(0.06, 0.9, 0.65), 0x7c8f84, 2.28, 0.6, -0.8);
    for (var rib = 0; rib < 4; rib++) {
      add(new THREE.BoxGeometry(0.03, 1.15, 0.04), 0xdfd4bd, 2.4 + rib * 0.38, 0.72, 0.06);
    }
    var coldLamp = add(new THREE.SphereGeometry(0.07, 10, 8), 0xd8e6d5, 4.12, 1.05, -0.55);
    coldLamp.material.emissive = new THREE.Color(0x9fc4a8);
    coldLamp.material.emissiveIntensity = 0.6;

    var truck = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.8), mat(0x2f6b4a));
    body.position.y = 0.75;
    truck.add(body);
    var cab = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.74), mat(0xe8dcc4));
    cab.position.set(0.95, 0.6, 0);
    truck.add(cab);
    [[-0.45, 0.28], [0.45, 0.28], [-0.45, -0.28], [0.45, -0.28]].forEach(function (p) {
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 10), mat(0x3d3a32));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(p[0], 0.28, p[1]);
      truck.add(wheel);
    });
    var windshield = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.32), new THREE.MeshStandardMaterial({ color: 0x8fb4b8, roughness: 0.3, metalness: 0.2 }));
    windshield.position.set(1.235, 0.72, 0);
    windshield.rotation.y = Math.PI / 2;
    truck.add(windshield);
    [[0.88, 0.18], [0.88, -0.18]].forEach(function (hp) {
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xe0b05e, emissiveIntensity: 0.9 }));
      head.position.set(1.23, 0.36, hp[1]);
      truck.add(head);
    });
    truck.position.set(3.0, 0.02, 1.25);
    scene.add(truck);

    // 餐桌 / 果盘 / 城市
    add(new THREE.BoxGeometry(2.3, 0.12, 1.6), 0x8a5d38, 7.1, 0.78, 0.1);
    [[6.15, 0.1], [8.05, 0.1], [6.15, 0.55], [8.05, 0.55]].forEach(function (p) {
      add(new THREE.BoxGeometry(0.08, 0.72, 0.08), 0x6f4b2e, p[0], 0.38, p[1]);
    });
    var plate = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 24), mat(0xfffdf6));
    plate.position.set(7.1, 0.88, 0.15);
    scene.add(plate);
    for (var f = 0; f < 4; f++) {
      var a = f / 4 * Math.PI * 2;
      var fruit = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), mat(f % 2 ? 0x9dbb63 : 0xc9d98a));
      fruit.position.set(7.1 + Math.cos(a) * 0.22, 1.0, 0.15 + Math.sin(a) * 0.22);
      scene.add(fruit);
    }
    [[-0.55, 0.95], [0.55, 0.95]].forEach(function (cp) {
      add(new THREE.BoxGeometry(0.42, 0.06, 0.4), 0x8a6a48, 7.1 + cp[0], 0.5, 0.95);
      add(new THREE.BoxGeometry(0.42, 0.5, 0.06), 0x8a6a48, 7.1 + cp[0], 0.75, 1.14);
      add(new THREE.BoxGeometry(0.05, 0.45, 0.05), 0x6f4b2e, 7.1 + cp[0] - 0.16, 0.25, 0.95);
      add(new THREE.BoxGeometry(0.05, 0.45, 0.05), 0x6f4b2e, 7.1 + cp[0] + 0.16, 0.25, 0.95);
    });
    add(new THREE.BoxGeometry(1.0, 0.5, 0.7), 0xb9b09c, 6.2, 0.25, -2.2);
    add(new THREE.BoxGeometry(0.8, 0.9, 0.7), 0x8fa294, 7.35, 0.45, -2.3);
    add(new THREE.BoxGeometry(0.7, 0.65, 0.7), 0xc7bda8, 8.3, 0.33, -2.0);
    for (var wy = 0; wy < 3; wy++) {
      for (var wx = 0; wx < 2; wx++) {
        add(new THREE.BoxGeometry(0.16, 0.2, 0.02), 0xf3ead7, 7.1 + wx * 0.28, 0.55 + wy * 0.22, -2.64);
      }
    }

    // 路径与移动的箱子
    var points = [
      new THREE.Vector3(-6.4, 0.4, 1.1),
      new THREE.Vector3(-3.6, 0.4, 1.2),
      new THREE.Vector3(-1.2, 0.4, 1.15),
      new THREE.Vector3(1.8, 0.4, 1.2),
      new THREE.Vector3(4.4, 0.4, 1.2),
      new THREE.Vector3(7.1, 0.4, 1.05),
    ];
    var curve = new THREE.CatmullRomCurve3(points);
    var route = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 90, 0.035, 5, false),
      new THREE.MeshStandardMaterial({ color: 0xc08a2e, roughness: 0.8, emissive: 0x6b4a18, emissiveIntensity: 0.15 })
    );
    route.castShadow = true;
    scene.add(route);
    for (var dpt = 0.1; dpt < 1; dpt += 0.12) {
      var pp = curve.getPointAt(dpt);
      add(new THREE.SphereGeometry(0.065, 8, 6), 0xc08a2e, pp.x, 0.44, pp.z);
    }
    [0.18, 0.45, 0.72, 0.9].forEach(function (bt, bi) {
      var bp = curve.getPointAt(bt);
      add(new THREE.IcosahedronGeometry(0.17, 0), bi % 2 ? 0x2f6b4a : 0x3a7350, bp.x + 0.32, 0.16, bp.z - 0.28);
    });
    function qrTexture() {
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var x = c.getContext('2d');
      x.fillStyle = '#FFFDF6'; x.fillRect(0, 0, 128, 128);
      x.fillStyle = '#1A4A32';
      function finder(px, py) {
        x.fillRect(px, py, 34, 34);
        x.fillStyle = '#FFFDF6'; x.fillRect(px + 7, py + 7, 20, 20);
        x.fillStyle = '#1A4A32'; x.fillRect(px + 12, py + 12, 10, 10);
      }
      finder(8, 8); finder(86, 8); finder(8, 86);
      for (var i = 0; i < 18; i++) {
        for (var j = 0; j < 18; j++) {
          if ((i * 7 + j * 13) % 5 < 2) x.fillRect(20 + i * 5, 20 + j * 5, 4, 4);
        }
      }
      var t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    var crate = new THREE.Group();
    var box = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.38, 0.46), mat(0xc79a5f));
    box.castShadow = true;
    crate.add(box);
    var label = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: qrTexture() }));
    label.position.set(0.0, 0.0, 0.232);
    crate.add(label);
    var topQr = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: qrTexture() }));
    topQr.rotation.x = -Math.PI / 2;
    topQr.position.y = 0.192;
    crate.add(topQr);
    scene.add(crate);

    // 四站标记
    var markerPos = [
      new THREE.Vector3(-6.4, 1.75, 0.9),
      new THREE.Vector3(-1.3, 2.3, -0.1),
      new THREE.Vector3(3.0, 1.95, 0.2),
      new THREE.Vector3(7.1, 1.75, 0.2),
    ];
    function markerLabel(n) {
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var x = c.getContext('2d');
      x.fillStyle = '#FFFDF6';
      x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#C08A2E'; x.lineWidth = 8; x.stroke();
      x.fillStyle = '#1A4A32';
      x.font = 'bold 62px system-ui, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(String(n), 64, 68);
      var t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    markerPos.forEach(function (p, idx) {
      var g = new THREE.Group();
      var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.08, 24), mat(0xc08a2e));
      disc.position.y = 0;
      g.add(disc);
      var dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat(0xfffdf6));
      dot.position.y = 0.10;
      g.add(dot);
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.1, 5), mat(0xc08a2e));
      pole.position.y = -0.58;
      g.add(pole);
      var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerLabel(idx + 1), transparent: true, depthTest: false }));
      sprite.scale.set(0.62, 0.62, 1);
      sprite.position.y = 0.58;
      g.add(sprite);
      g.position.copy(p);
      g.userData.stop = idx;
      scene.add(g);
      markers.push(g);
    });

    function setFocus(idx) {
      if (idx == null) {
        focusIndex = -1;
        lookGoal.copy(target);
        viewGoal = viewBase;
      } else {
        focusIndex = idx;
        var mp = markerPos[idx];
        lookGoal.set(mp.x, 0.95, mp.z);
        viewGoal = isMobile ? 9.2 : 7.4;
      }
    }
    function select(idx, focus) {
      selected = idx;
      renderPanel(d, idx);
      markers.forEach(function (g, i) {
        var active = i === idx;
        g.scale.setScalar(active ? 1.35 : 1);
        g.children[1].material.color.setHex(active ? 0x1a4a32 : 0xfffdf6);
      });
      setFocus(focus ? idx : null);
    }
    function choose(idx) {
      if (focusIndex === idx) select(idx, false);
      else select(idx, true);
    }
    select(0, false);
    activeSelect = choose;
    activeReset = function () { setFocus(null); };

    function resize() {
      var box = canvas.parentElement.getBoundingClientRect();
      var w = Math.max(1, box.width);
      var h = Math.max(220, Math.min(620, w * (isMobile ? 0.86 : 0.8)));
      canvas.parentElement.style.height = h + 'px';
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      applyFrustum();
    }
    var ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    resize();

    function hit(e) {
      var rect = canvas.getBoundingClientRect();
      var mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      var ray = new THREE.Raycaster();
      ray.setFromCamera(mouse, camera);
      var hits = ray.intersectObjects(markers, true);
      if (hits.length) {
        var obj = hits[0].object;
        while (obj && obj.userData.stop === undefined) obj = obj.parent;
        if (obj) return obj.userData.stop;
      }
      return null;
    }

    canvas.addEventListener('pointerdown', function (e) {
      dragging = true;
      moved = 0;
      last.x = e.clientX;
      last.y = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - last.x;
      var dy = e.clientY - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      last.x = e.clientX;
      last.y = e.clientY;
      theta -= dx * 0.006;
      phi = Math.max(0.55, Math.min(1.25, phi - dy * 0.005));
      placeCamera();
    });
    canvas.addEventListener('pointerup', function (e) {
      dragging = false;
      if (moved < 6) {
        var idx = hit(e);
        if (idx != null) choose(idx);
      }
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    });
    canvas.addEventListener('pointercancel', function () { dragging = false; });

    var io = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && !raf) loop();
    }, { threshold: 0.08 });
    io.observe(canvas);

    function loop() {
      raf = requestAnimationFrame(loop);
      if (!visible) { raf = 0; return; }
      var t = clock.getElapsedTime();
      look.lerp(lookGoal, 0.085);
      if (Math.abs(viewCurrent - viewGoal) > 0.02) {
        viewCurrent += (viewGoal - viewCurrent) * 0.085;
        applyFrustum();
      }
      if (!reduce && !dragging) theta += 0.00055;
      placeCamera();
      if (!reduce) {
        crateT = (crateT + 0.00055) % 1;
        var pt = curve.getPointAt(crateT);
        crate.position.set(pt.x, 0.55, pt.z);
        crate.rotation.y = -0.3 + Math.sin(t * 0.5) * 0.1;
      } else {
        crate.position.set(0.5, 0.55, 1.2);
      }
      renderer.render(scene, camera);
    }
    loop();

    current = {
      dispose: function () {
        cancelAnimationFrame(raf);
        io.disconnect();
        ro.disconnect();
        renderer.dispose();
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); });
            else o.material.dispose();
          }
        });
      },
    };
    if (loading) loading.hidden = true;
    root.classList.add('is-ready');
  }

  function dispose() {
    if (current && current.dispose) current.dispose();
    current = null;
    activeSelect = null;
  }

  window.Journey3D = { mount: mount, dispose: dispose };
})();
