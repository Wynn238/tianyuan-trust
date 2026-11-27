'use strict';
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const store = require('./lib/store');
const chain = require('./lib/chain');
const agent = require('./lib/agent');
const auth = require('./lib/auth');
const commerce = require('./lib/commerce');
const qr = require('./lib/qr');
const database = require('./lib/database');

const PORT = Number(process.env.PORT) || 8848;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');

/** 演示用局域网地址：手机与服务在同一网络时可直接扫码 */
function lanBase() {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  // 优先常见局域网网段，避免落到虚拟网卡
  const pick = ips.find((ip) => ip.startsWith('192.168.')) || ips.find((ip) => ip.startsWith('10.')) || ips[0];
  return pick ? `http://${pick}:${PORT}` : `http://${HOST}:${PORT}`;
}

const MIME = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};

let db = null;
const LOGIN_FAILS = new Map();

/* ---------------- 工具 ---------------- */
const json = (res, data, status = 200) => {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};
const fail = (res, status, message, code = 'ERROR') => json(res, { error: { code, message } }, status);

/**
 * 鉴权守卫：未登录 401，角色不符 403。
 * TODO: 接入正式鉴权时改为统一的中间件链，并把权限矩阵配置化。
 */
function requireUser(req, res, roles) {
  const user = auth.userFromRequest(db, req);
  if (!user) {
    fail(res, 401, '请先登录（未登录或登录已过期）', 'UNAUTHORIZED');
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    fail(res, 403, '当前账号无权访问该功能', 'FORBIDDEN');
    return null;
  }
  // 农户账号未通过入驻审核前，不开放工作台数据
  if (user.role === 'farmer' && (user.status !== 'active' || !user.farmerId)) {
    fail(res, 403, '农户账号待审核激活，请先完成入驻审核', 'FARMER_PENDING');
    return null;
  }
  return user;
}

function inOriginScope(actor, farmer) {
  if (!actor || actor.role !== 'admin' || actor.staffRole !== 'origin_ops' || !actor.scope) return true;
  const region = farmer && farmer.region ? JSON.stringify(farmer.region) : '';
  return String(region).includes(actor.scope);
}

function productFarmer(p) {
  return p ? db.farmers.find((f) => f.id === p.farmerId) : null;
}

function latestConsent(userId, type) {
  const rows = database.listConsents(userId).filter((r) => r.type === type);
  return rows.length ? rows[0] : null;
}

function consumerProfiles() {
  const now = Date.now();
  return db.users.filter((u) => u.role === 'consumer').map((u) => {
    const orders = db.orders.filter((o) => o.userId === u.id);
    const spend = orders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
    const last = orders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const recency = last ? Math.floor((now - new Date(last.createdAt).getTime()) / 86400000) : null;
    const reviews = db.reviews.filter((r) => r.userId === u.id);
    const categories = {};
    for (const o of orders) {
      for (const it of (o.items || [])) {
        const p = db.products.find((x) => x.id === it.productId);
        if (p) categories[p.category] = (categories[p.category] || 0) + 1;
      }
    }
    const topCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([name, count]) => ({ name, count }));
    const consent = latestConsent(u.id, 'profile');
    const allowed = !!(consent && consent.granted);
    const behavior = database.eventSummary(u.id);
    const tags = [];
    if (allowed && orders.length) {
      tags.push(recency <= 30 ? '活跃' : recency <= 90 ? '沉默' : '沉睡');
      if (orders.length >= 3) tags.push('复购');
      if (spend >= 500) tags.push('高价值');
      if (topCategories[0]) tags.push(topCategories[0].name + '偏好');
      if (orders.filter((o) => o.afterSale).length / orders.length >= 0.2) tags.push('售后关注');
    } else if (allowed && !orders.length) {
      tags.push('新客');
    }
    return {
      id: u.id, name: u.nickname || u.name || '消费者', phone: auth.maskPhone(u.phone),
      status: u.status || 'active', consent: allowed, consentStatus: consent ? (consent.granted ? 'granted' : 'denied') : 'unset',
      orders: orders.length, spend: Math.round(spend * 100) / 100, avgOrder: orders.length ? Math.round(spend / orders.length * 100) / 100 : 0,
      lastOrderAt: last ? last.createdAt : null, recencyDays: recency,
      reviews: reviews.length, aftersales: orders.filter((o) => o.afterSale).length,
      topCategories, tags,
      behavior: allowed ? { events: behavior.count, lastAt: behavior.lastAt, byType: behavior.byType } : { events: 0, lastAt: null, byType: {} },
      sample: { orders: orders.length, reviews: reviews.length },
    };
  }).sort((a, b) => b.spend - a.spend);
}

function farmerProfiles() {
  return db.farmers.map((f) => {
    const products = db.products.filter((p) => p.farmerId === f.id);
    const productIds = new Set(products.map((p) => p.id));
    const batches = db.batches.filter((b) => productIds.has(b.productId));
    const batchIds = new Set(batches.map((b) => b.id));
    const records = db.records.filter((r) => batchIds.has(r.batchId));
    const orders = db.orders.filter((o) => (o.items || []).some((it) => productIds.has(it.productId)));
    const alerts = db.alerts.filter((a) => batchIds.has(a.batchId));
    const cats = [...new Set(products.map((p) => p.category))];
    const completeBatches = batches.filter((b) => records.some((r) => r.batchId === b.id)).length;
    const completeness = batches.length ? Math.round(completeBatches / batches.length * 100) : 0;
    const certs = Array.isArray(f.certs) ? f.certs : [];
    const highAlerts = alerts.filter((a) => a.level === 'high' && a.status !== 'resolved').length;
    const tags = [];
    if (f.acreage >= 50) tags.push('规模户'); else tags.push('小农户');
    if (cats.length >= 2) tags.push('多品类'); else if (cats[0]) tags.push(cats[0] + '型');
    if (batches.length && completeness >= 80) tags.push('档案完整'); else if (batches.length) tags.push('待补记录');
    if (certs.length >= 2) tags.push('认证齐全');
    if (highAlerts) tags.push('质量关注'); else if (batches.length) tags.push('稳定');
    return {
      id: f.id, name: f.name, org: f.org || '', region: f.region || {}, phone: f.phone || '',
      status: f.status || 'active', products: products.length, batches: batches.length, records: records.length,
      orders: orders.length, alerts: alerts.length, highAlerts, completeness, certs,
      rating: f.rating || 0, acreage: f.acreage || 0, tags, sample: { products: products.length, batches: batches.length, records: records.length, orders: orders.length },
    };
  }).sort((a, b) => b.products - a.products);
}

function profileAllowed(userId) {
  const c = latestConsent(userId, 'profile');
  return !!(c && c.granted);
}

function recommendations(actor) {
  const on = db.products.filter((p) => p.status === 'on');
  const withFarmer = (p) => ({ ...p, farmer: db.farmers.find((f) => f.id === p.farmerId) || null });
  if (actor && actor.role === 'consumer' && profileAllowed(actor.id)) {
    const ev = database.eventSummary(actor.id);
    const orders = db.orders.filter((o) => o.userId === actor.id);
    const scores = {};
    for (const id of ev.productIds) {
      const p = db.products.find((x) => x.id === id);
      if (p) scores[p.category] = (scores[p.category] || 0) + 2;
    }
    for (const o of orders) {
      for (const it of (o.items || [])) {
        const p = db.products.find((x) => x.id === it.productId);
        if (p) scores[p.category] = (scores[p.category] || 0) + 1;
      }
    }
    for (const id of database.favoriteProductIds(actor.id)) {
      const p = db.products.find((x) => x.id === id);
      if (p) scores[p.category] = (scores[p.category] || 0) + 2;
    }
    const cats = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
    const list = on.filter((p) => !cats.length || cats.includes(p.category))
      .sort((a, b) => (scores[b.category] || 0) - (scores[a.category] || 0) || (b.ratingAvg || 0) - (a.ratingAvg || 0));
    return { items: list.slice(0, 4).map(withFarmer), basis: 'profile', reason: cats.length ? `基于你最近关注的${cats.slice(0, 2).join('、')}品类` : '基于你的订单记录' };
  }
  return {
    items: on.slice().sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0) || (b.monthlySales || 0) - (a.monthlySales || 0)).slice(0, 4).map(withFarmer),
    basis: 'generic',
    reason: '评分与销量排序，登录并授权画像后可个性化',
  };
}

function can(user, perm) {
  if (!user) return false;
  return Array.isArray(user.permissions) && user.permissions.includes(perm);
}

function requirePerm(res, user, perm) {
  if (can(user, perm)) return true;
  fail(res, 403, '当前账号无权执行该操作', 'FORBIDDEN');
  return false;
}

function clientIp(req) {
  return String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();
}

function audit(req, actor, action, objectType, objectId, before, after) {
  try {
    database.audit(database.open(), {
      actorId: actor && actor.id, action, objectType, objectId,
      before: before == null ? null : before, after: after == null ? null : after, ip: clientIp(req),
    });
  } catch (e) { console.error('[audit]', e.message); }
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // 同源表单/测试客户端
  try {
    const host = new URL(origin).host;
    return host === req.headers.host;
  } catch (e) { return false; }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 2e6) { reject(new Error('请求体过大')); req.destroy(); }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

const productOf = (b) => db.products.find((p) => p.id === b.productId);
const farmerOfProduct = (p) => db.farmers.find((f) => f.id === p.farmerId);
const nf = (n) => Number(n || 0);

/** 新商品的默认价格构成：所有分项之和必须等于售价 */
function defaultBreakdown(price) {
  const labels = ['地头收购', '分选包装', '冷链运输', '平台服务（3%）'];
  const ratios = [0.58, 0.12, 0.1, 0.08];
  const rows = labels.map((label, i) => ({ label, amount: Math.round(price * ratios[i] * 100) / 100 }));
  const used = rows.reduce((sum, r) => sum + r.amount, 0);
  rows.push({ label: '农户收益', amount: Math.round((price - used) * 100) / 100 });
  return rows;
}

function rebuildLedger() {
  const all = [];
  db.batches.forEach((b) => {
    const rs = db.records.filter((r) => r.batchId === b.id).sort((a, c) => a.at.localeCompare(c.at));
    chain.build(rs);
    all.push(...rs);
  });
  all.sort((a, c) => a.at.localeCompare(c.at));
  db.ledger = all.map((r, i) => {
    r.height = i + 1;
    return {
      height: r.height, batchId: r.batchId, recordId: r.id, type: r.type,
      dataHash: r.hash, prevHash: r.prevHash, hash: r.hash, at: r.at, tx: r.tx,
      writer: r.method === 'iot' ? 'IoT 网关' : r.method === 'api' ? '第三方系统' : '农户端',
    };
  });
}

function traceBundle(code) {
  const batch = db.batches.find((b) => String(b.code).toUpperCase() === String(code).toUpperCase());
  if (!batch) return null;
  const product = productOf(batch);
  const farmer = farmerOfProduct(product);
  const records = db.records.filter((r) => r.batchId === batch.id).sort((a, b) => a.at.localeCompare(b.at));
  const tests = db.tests.filter((t) => t.batchId === batch.id);
  const shipment = db.shipments.find((s) => s.batchId === batch.id) || null;
  const orders = db.orders.filter((o) => o.batchId === batch.id);
  const reviews = db.reviews.filter((r) => r.productId === product.id).slice(0, 3);
  const geo = db.geos.find((g) => g.name === product.geo) || null;
  return {
    product, farmer, batch, geo, records, tests, shipment, orders: orders.length,
    reviews, verify: chain.verify(records),
    scanCount: db.scans[batch.code] || 0,
    priceBreakdown: db.breakdown[product.id] || [],
    related: db.batches.filter((b) => b.productId === product.id && b.id !== batch.id).map((b) => ({ code: b.code, plot: b.plot, harvestedAt: b.harvestedAt })),
  };
}

function productCard(p) {
  const f = farmerOfProduct(p);
  const batches = db.batches.filter((b) => b.productId === p.id);
  const sell = commerce.sellable(db, p);
  return {
    ...p, farmer: { id: f.id, name: f.name, org: f.org, region: f.region, type: f.type, rating: f.rating },
    batchCount: batches.length, code: batches[0] && batches[0].code,
    traceable: batches.some((b) => b.code),
    sellable: sell.ok, availableStock: sell.ok ? commerce.available(sell.batch) : 0,
    stockReason: sell.ok ? '' : sell.reason,
    traceRate: p.status === 'on' ? 100 : 0,
  };
}

function dailySeries(days = 7, products, orders) {
  const out = [];
  const prods = Array.isArray(products) ? products : db.products;
  const ords = Array.isArray(orders) ? orders : db.orders;
  const now = new Date('2026-11-25T12:00:00+08:00');
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    let base = 0;
    prods.forEach((p) => { base += (p.monthlySales * p.price) / 30; });
    const jitter = 0.85 + ((d.getDate() * 37) % 30) / 100;
    const real = ords.filter((o) => o.createdAt.slice(0, 10) === key).reduce((s, o) => s + o.amount, 0);
    out.push({
      date: key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      gmv: Math.round(base * jitter + real),
      orders: Math.round((base * jitter + real) / 78),
    });
  }
  return out;
}
function platformStats(scope) {
  const sc = scope || {};
  const products = Array.isArray(sc.products) ? sc.products : db.products;
  const orders = Array.isArray(sc.orders) ? sc.orders : db.orders;
  const farmers = Array.isArray(sc.farmers) ? sc.farmers : db.farmers;
  const batches = Array.isArray(sc.batches) ? sc.batches : db.batches;
  const records = Array.isArray(sc.records) ? sc.records : db.records;
  const ledger = Array.isArray(sc.ledger) ? sc.ledger : db.ledger;
  const on = products.filter((p) => p.status === 'on');
  const gmv = Math.round(on.reduce((s, p) => s + p.monthlySales * p.price, 0));
  const avgOrder = Math.round((gmv / Math.max(1, on.reduce((s, p) => s + p.monthlySales, 0))) * 10) / 10 || 76;
  const totalScans = Object.values(db.scans).reduce((s, v) => s + v, 0);
  const covered = batches.filter((b) => records.some((r) => r.batchId === b.id)).length;
  return {
    farmers: farmers.length,
    households: sc.households != null ? sc.households : db.counters.households,
    products: on.length,
    batches: batches.length,
    records: records.length,
    chainHeight: ledger.length,
    gmv, avgOrder,
    orders: orders.length,
    scans: totalScans,
    traceCoverage: batches.length ? Math.round((covered / batches.length) * 1000) / 10 : 0,
    geoCount: Array.isArray(sc.geos) ? sc.geos.length : db.geos.length,
  };
}
/* ---------------- 路由 ---------------- */
async function api(req, res, url) {
  const seg = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = req.method;
  const q = url.searchParams;
  if (['POST', 'PATCH', 'DELETE'].includes(method) && !originAllowed(req)) {
    return fail(res, 403, '跨站请求被拒绝', 'ORIGIN_REJECTED');
  }

  if (seg[0] === 'events' && method === 'POST') {
    const body = await readBody(req);
    const types = ['page_view', 'product_view', 'search', 'add_cart', 'checkout', 'review', 'favorite', 'rec_impression', 'rec_click'];
    const type = String(body.type || '').trim();
    if (!types.includes(type)) return fail(res, 400, '事件类型不合法');
    const actor = auth.userFromRequest(db, req);
    const userId = actor && actor.role === 'consumer' && profileAllowed(actor.id) ? actor.id : null;
    database.logEvent({
      userId,
      sessionId: String(body.sessionId || '').slice(0, 64),
      type,
      objectType: String(body.objectType || '').slice(0, 30),
      objectId: String(body.objectId || '').slice(0, 80),
      query: String(body.query || '').slice(0, 60),
      meta: body.meta && typeof body.meta === 'object' ? body.meta : null,
    });
    return json(res, { ok: true });
  }
  if (seg[0] === 'recommendations' && method === 'GET') {
    return json(res, recommendations(auth.userFromRequest(db, req)));
  }

  if (seg[0] === 'notifications') {
    // 通知必须能被待审核/已驳回农户读到，不能走“激活后才能用”的 requireUser。
    const actor = auth.userFromRequest(db, req);
    if (!actor) return fail(res, 401, '请先登录', 'UNAUTHORIZED');
    if (!['consumer', 'farmer', 'admin'].includes(actor.role)) return fail(res, 403, '当前账号无权访问通知', 'FORBIDDEN');
    if (method === 'GET' && !seg[1]) {
      const items = database.listNotifications(actor.id, q.get('limit'));
      return json(res, { items, unread: items.filter((x) => !x.read).length });
    }
    if (method === 'POST' && seg[1] && seg[2] === 'read') {
      database.markNotificationRead(actor.id, seg[1]);
      return json(res, { ok: true });
    }
    if (method === 'POST' && seg[1] === 'read-all') {
      for (const n of database.listNotifications(actor.id, 50)) database.markNotificationRead(actor.id, n.id);
      return json(res, { ok: true });
    }
    return fail(res, 404, '接口不存在');
  }

  if (seg[0] === 'support' && seg[1] === 'tickets') {
    const actor = auth.userFromRequest(db, req);
    if (!actor) return fail(res, 401, '请先登录', 'UNAUTHORIZED');
    if (method === 'GET' && !seg[2]) {
      if (actor.role === 'consumer') return json(res, { items: database.listTickets(actor.id) });
      if (actor.role === 'admin' && can(actor, 'cs.view')) return json(res, { items: database.listTickets() });
      return fail(res, 403, '当前账号无权查看工单', 'FORBIDDEN');
    }
    if (method === 'POST' && !seg[2]) {
      if (actor.role !== 'consumer') return fail(res, 403, '仅消费者可以提交工单', 'FORBIDDEN');
      const body = await readBody(req);
      const subject = String(body.subject || '').trim();
      if (subject.length < 2) return fail(res, 400, '请填写工单标题');
      const orderId = body.orderId ? String(body.orderId) : '';
      if (orderId) {
        const o = db.orders.find((x) => x.id === orderId || x.no === orderId);
        if (!o || o.userId !== actor.id) return fail(res, 403, '只能为自己的订单提交工单', 'FORBIDDEN');
      }
      const ticket = database.createTicket({
        userId: actor.id, orderId, type: String(body.type || 'other').slice(0, 20),
        subject, description: String(body.description || '').slice(0, 1000),
      });
      return json(res, { ticket, message: '工单已提交，客服会尽快处理' }, 201);
    }
    if (method === 'PATCH' && seg[2]) {
      if (actor.role !== 'admin' || !can(actor, 'cs.view')) return fail(res, 403, '当前账号无权处理工单', 'FORBIDDEN');
      const body = await readBody(req);
      const ticket = database.updateTicket(seg[2], {
        status: ['open', 'in_progress', 'resolved'].includes(body.status) ? body.status : undefined,
        resolution: body.resolution,
        handlerId: actor.id,
      });
      if (!ticket) return fail(res, 404, '工单不存在');
      if (body.status === 'resolved') database.notify(ticket.user_id, 'ticket_resolved', '客服工单已处理', ticket.resolution || ticket.subject, '/account.html');
      audit(req, actor, 'ticket.update', 'ticket', ticket.id, null, { status: ticket.status });
      return json(res, { ticket, message: '工单已更新' });
    }
    return fail(res, 404, '接口不存在');
  }

  if (seg[0] === 'auth') {
  if (seg[0] === 'auth' && seg[1] === 'register' && method === 'POST') {
    const body = await readBody(req);
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    const nickname = String(body.nickname || '').trim().slice(0, 20);
    if (!/^1\d{10}$/.test(phone)) return fail(res, 400, '请输入正确的手机号');
    if (password.length < 6) return fail(res, 400, '密码至少 6 位');
    if (body.agree !== true) return fail(res, 400, '请先同意演示协议');
    if (db.users.some((u) => u.phone === phone)) return fail(res, 409, '该手机号已注册', 'PHONE_TAKEN');
    const user = {
      id: 'U' + String(db.users.length + 1).padStart(4, '0') + String(Date.now()).slice(-3),
      phone, name: nickname || auth.maskPhone(phone), nickname: nickname || auth.maskPhone(phone),
      role: 'consumer', status: 'active', farmerId: null,
      password: await auth.hashNewPassword(password), passwordAlgo: 'argon2',
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    store.save();
    auth.setSessionCookie(res, auth.issueToken(user), req.headers['x-forwarded-proto'] === 'https');
    return json(res, { user: auth.publicUser(user), message: '注册成功' }, 201);
  }

    if (seg[1] === 'login' && method === 'POST') {
      const body = await readBody(req);
      const key = String(body.phone || '').trim();
      const now = Date.now();
      const rec = LOGIN_FAILS.get(key);
      if (rec && rec.until > now) {
        return fail(res, 429, '登录失败次数过多，请稍后再试', 'LOGIN_LOCKED');
      }
      try {
        const data = await auth.login(db, body);
        LOGIN_FAILS.delete(key);
        store.save();
        auth.setSessionCookie(res, data.token, req.headers['x-forwarded-proto'] === 'https');
        return json(res, { user: data.user, message: '登录成功' });
      } catch (e) {
        const r = LOGIN_FAILS.get(key) || { count: 0, until: 0 };
        r.count += 1;
        if (r.count >= 5) r.until = now + 10 * 60 * 1000;
        LOGIN_FAILS.set(key, r);
        return fail(res, e.status || 401, e.message || '登录失败', 'AUTH_FAILED');
      }
    }
    if (seg[1] === 'logout' && method === 'POST') {
      auth.logout(req);
      auth.clearSessionCookie(res);
      return json(res, { ok: true, message: '已退出登录' });
    }
    if (seg[1] === 'session' && method === 'GET') {
      const user = auth.userFromRequest(db, req);
      return json(res, { user: user ? auth.publicUser(user) : null });
    }
    if (seg[1] === 'me' && method === 'GET') {
      const user = auth.userFromRequest(db, req);
      if (!user) return fail(res, 401, '未登录或登录已过期', 'UNAUTHORIZED');
      return json(res, { user: auth.publicUser(user) });
    }
    return fail(res, 404, '接口不存在');
  }

  if (seg[0] === 'account') {
    const user = requireUser(req, res, ['consumer']);
    if (!user) return;
    if (seg[1] === 'profile' && method === 'GET') {
      const orders = db.orders.filter((o) => o.userId === user.id);
      return json(res, {
        user: auth.publicUser(user),
        stats: { orders: orders.length, aftersales: orders.filter((o) => o.afterSale).length, reviews: db.reviews.filter((r) => r.userId === user.id).length },
      });
    }
    if (seg[1] === 'profile' && method === 'PATCH') {
      const body = await readBody(req);
      if (body.nickname != null) {
        const nick = String(body.nickname).trim().slice(0, 20);
        if (!nick) return fail(res, 400, '昵称不能为空');
        user.nickname = nick; user.name = nick;
      }
      if (body.avatar != null) user.avatar = String(body.avatar).slice(0, 8);
      store.save();
      return json(res, { user: auth.publicUser(user), message: '资料已更新' });
    }
    if (seg[1] === 'consent' && method === 'GET') {
      const rows = database.listConsents(user.id);
      const privacy = rows.find((r) => r.type === 'recommendation') || rows.find((r) => r.type === 'privacy');
      const profile = rows.find((r) => r.type === 'profile');
      return json(res, { items: rows, privacy: privacy ? privacy.granted : null, profile: profile ? profile.granted : null });
    }
    if (seg[1] === 'consent' && method === 'POST') {
      const body = await readBody(req);
      const type = String(body.type || 'privacy').slice(0, 20);
      const granted = body.granted === true || body.granted === 1;
      if (!['privacy', 'recommendation', 'marketing', 'profile'].includes(type)) return fail(res, 400, '同意类型不合法');
      database.recordConsent(user.id, type, granted, 'account');
      return json(res, { ok: true, type, granted, message: granted ? '已记录同意' : '已记录拒绝' });
    }
    if (seg[1] === 'export' && method === 'GET') {
      const orders = db.orders.filter((o) => o.userId === user.id).map((o) => commerce.forOwner(db, o));
      const reviews = db.reviews.filter((r) => r.userId === user.id);
      return json(res, {
        exportedAt: new Date().toISOString(),
        user: auth.publicUser(user),
        orders,
        reviews,
        consents: database.listConsents(user.id),
      });
    }
    if (seg[1] === 'delete' && method === 'POST') {
      user.status = 'deletion_requested';
      store.save();
      audit(req, user, 'account.delete_request', 'consumer', user.id, null, { status: user.status });
      auth.logout(req);
      auth.clearSessionCookie(res);
      return json(res, { ok: true, message: '注销申请已记录；当前为演示环境，未删除订单与溯源数据' });
    }
    return fail(res, 404, '接口不存在');
  }

  if (seg[0] === 'cart') {
    const user = auth.userFromRequest(db, req);
    const guestId = req.headers['x-guest-id'];
    const key = commerce.cartKey(user, guestId);
    if (seg[1] === 'merge' && method === 'POST') {
      if (!user) return fail(res, 401, '请先登录后再合并购物车');
      const body = await readBody(req);
      const gk = commerce.cartKey(null, body.guestId || guestId);
      const r = commerce.mergeCart(db, gk, commerce.cartKey(user));
      store.save();
      return json(res, { merged: r.merged, cart: commerce.cartView(db, commerce.getCart(db, commerce.cartKey(user))), message: `已合并 ${r.merged} 件商品` });
    }
    if (!key) return fail(res, 400, '缺少购物车标识');
    if (seg.length === 1 && method === 'GET') {
      return json(res, commerce.cartView(db, commerce.getCart(db, key)));
    }
    if (seg[1] === 'items' && seg.length === 2 && method === 'POST') {
      const body = await readBody(req);
      const r = commerce.addToCart(db, key, body.productId, body.batchId, body.qty);
      if (!r.ok) return fail(res, 409, r.reason);
      store.save();
      return json(res, { cart: commerce.cartView(db, r.cart), message: '已加入购物车' });
    }
    if (seg[1] === 'items' && seg[2] && method === 'PATCH') {
      const body = await readBody(req);
      const r = commerce.updateCartItem(db, key, decodeURIComponent(seg[2]), body);
      if (!r.ok) return fail(res, 409, r.reason);
      store.save();
      return json(res, { cart: commerce.cartView(db, r.cart), message: '购物车已更新' });
    }
    if (seg[1] === 'items' && seg[2] && method === 'DELETE') {
      const r = commerce.updateCartItem(db, key, decodeURIComponent(seg[2]), { remove: true });
      if (!r.ok) return fail(res, 404, r.reason);
      store.save();
      return json(res, { cart: commerce.cartView(db, r.cart), message: '已移除' });
    }
    return fail(res, 404, '接口不存在');
  }

  if (seg[0] === 'checkout' && method === 'POST') {
    const user = requireUser(req, res, ['consumer']);
    if (!user) return;
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const city = String(body.city || '').trim();
    const detail = String(body.detail || '').trim();
    if (!name || !phone || !city || !detail) return fail(res, 400, '请完整填写收货信息');
    if (!/^1\d{10}$/.test(phone)) return fail(res, 400, '请输入正确的手机号');
    // 地址只作订单快照，不进地址簿
    const r = commerce.checkout(db, user, { name, phone, city, detail });
    if (!r.ok) return fail(res, r.status || 409, r.reason);
    store.save();
    return json(res, { order: commerce.forOwner(db, r.order), message: '演示订单已创建，未发起真实支付' }, 201);
  }

  if (seg[0] === 'demo' && seg[1] === 'orders' && method === 'GET') {
    // 匿名智能体只能用完全脱敏的演示订单
    const items = db.orders.slice(0, 3).map((o) => {
      const n = commerce.normalizeOrder(db, o);
      return {
        id: o.id, no: o.no, status: o.status, amount: n.totalAmount, createdAt: o.createdAt,
        items: n.items.map((i) => ({ name: (i.productSnapshot && i.productSnapshot.name) || '商品', qty: i.qty })),
        buyer: { name: '演示用户', phone: '', city: '' },
      };
    });
    return json(res, { items, demo: true, note: '完全脱敏的演示订单，不含真实买家信息' });
  }

  if (seg[0] === 'health') return json(res, { ok: true, time: new Date().toISOString(), llm: db.settings.llm.enabled });

  if (seg[0] === 'meta') {
    return json(res, {
      categories: [...new Set(db.products.map((p) => p.category))],
      regions: [...new Set(db.farmers.map((f) => f.region.province))],
      stats: platformStats(),
      llm: { enabled: !!(db.settings.llm.enabled && db.settings.llm.apiKey), model: db.settings.llm.model },
      ...(can(auth.userFromRequest(db, req), 'demo.view') ? { demo: db.demo } : {}),
    });
  }

  if (seg[0] === 'products' && seg[2] === 'favorite' && method === 'POST') {
    const actor = requireUser(req, res, ['consumer']);
    if (!actor) return;
    const p = db.products.find((x) => x.id === seg[1]);
    if (!p || p.status !== 'on') return fail(res, 404, '商品不存在或未上架');
    const result = database.toggleFavorite(actor.id, p.id);
    database.logEvent({ userId: actor.id, sessionId: 'favorite', type: 'favorite', objectType: 'product', objectId: p.id });
    return json(res, { ...result, productId: p.id, message: result.favorited ? '已收藏' : '已取消收藏' });
  }
  if (seg[0] === 'favorites' && method === 'GET') {
    const actor = requireUser(req, res, ['consumer']);
    if (!actor) return;
    const ids = database.favoriteProductIds(actor.id);
    return json(res, { items: ids.map((id) => db.products.find((p) => p.id === id)).filter((p) => p && p.status === 'on').map(productCard) });
  }
  if (seg[0] === 'products' && method === 'GET') {
    if (seg[1]) {
      const p = db.products.find((x) => x.id === seg[1]);
      if (!p) return fail(res, 404, '商品不存在');
      if (p.status !== 'on') {
        const actor = auth.userFromRequest(db, req);
        const canPreview = actor && (actor.role === 'admin' || (actor.role === 'farmer' && actor.farmerId === p.farmerId));
        if (!canPreview) return fail(res, 404, '商品不存在或尚未上架');
      }
      const card = productCard(p);
      card.batches = db.batches.filter((b) => b.productId === p.id).map((b) => ({
        ...b, recordCount: db.records.filter((r) => r.batchId === b.id).length,
        verified: chain.verify(db.records.filter((r) => r.batchId === b.id)).ok,
      }));
      card.reviews = db.reviews.filter((r) => r.productId === p.id);
      card.priceBreakdown = db.breakdown[p.id] || [];
      card.geo = db.geos.find((g) => g.name === p.geo) || null;
      card.content = agent.content(db, { productId: p.id, channel: '详情页' });
      return json(res, card);
    }
    let list = db.products.filter((p) => p.status === 'on').map(productCard);
    if (q.get('category')) list = list.filter((p) => p.category === q.get('category'));
    if (q.get('q')) {
      const s = q.get('q').trim();
      list = list.filter((p) => (p.name + p.summary + p.farmer.name + p.farmer.region.county).includes(s));
    }
    if (q.get('traceOnly') === '1') list = list.filter((p) => p.code);
    const sort = q.get('sort') || 'recommend';
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
    else if (sort === 'sales') list.sort((a, b) => b.monthlySales - a.monthlySales);
    else if (sort === 'rating') list.sort((a, b) => b.ratingAvg - a.ratingAvg);
    else list.sort((a, b) => (b.status === 'on') - (a.status === 'on') || b.monthlySales - a.monthlySales);
    return json(res, { items: list, total: list.length });
  }

  if (seg[0] === 'trace' && method === 'GET' && seg[1]) {
    if (seg[2] === 'verify') {
      const b = db.batches.find((x) => x.code.toUpperCase() === seg[1].toUpperCase());
      if (!b) return fail(res, 404, '批次不存在');
      const rs = db.records.filter((r) => r.batchId === b.id).sort((x, y) => x.at.localeCompare(y.at));
      return json(res, chain.verify(rs));
    }
    const bundle = traceBundle(decodeURIComponent(seg[1]));
    if (!bundle) return fail(res, 404, '溯源码不存在，请核对字母与数字');
    bundle.qrBase = lanBase();
    return json(res, bundle);
  }

  if (seg[0] === 'agent') {
    if (method !== 'POST') return fail(res, 405, '请使用 POST');
    const body = await readBody(req);
    if (seg[1] === 'ask') return json(res, await agent.ask(db, body));
    if (seg[1] === 'content') return json(res, agent.content(db, body));
    if (seg[1] === 'service') return json(res, agent.service(db, body));
    return fail(res, 404, '接口不存在');
  }

  if (seg[0] === 'farmer' && seg[1] === 'register' && method === 'POST') {
    // 新农户注册：账号状态 pending，不能直接进入工作台
    const body = await readBody(req);
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    if (!/^1\d{10}$/.test(phone)) return fail(res, 400, '请输入正确的手机号');
    if (password.length < 6) return fail(res, 400, '密码至少 6 位');
    if (db.users.some((u) => u.phone === phone)) return fail(res, 409, '该手机号已注册', 'PHONE_TAKEN');
    const user = {
      id: 'U' + String(db.users.length + 1).padStart(4, '0') + String(Date.now()).slice(-3),
      phone, name: String(body.contact || auth.maskPhone(phone)).slice(0, 20),
      nickname: String(body.contact || auth.maskPhone(phone)).slice(0, 20),
      role: 'farmer', status: 'pending', farmerId: null,
      password: await auth.hashNewPassword(password), passwordAlgo: 'argon2',
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    store.save();
    auth.setSessionCookie(res, auth.issueToken(user), req.headers['x-forwarded-proto'] === 'https');
    return json(res, {
      user: auth.publicUser(user),
      message: '农户账号已创建（待审核）。请继续提交入驻申请。',
    }, 201);
  }

  if (seg[0] === 'farmer' && seg[1] === 'application') {
    const user = auth.userFromRequest(db, req);
    if (!user) return fail(res, 401, '请先登录');
    if (user.role !== 'farmer') return fail(res, 403, '仅农户账号可提交入驻申请');
    const mine = db.applications.filter((a) => a.userId === user.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0] || null;
    if (method === 'GET') {
      return json(res, { application: mine, user: auth.publicUser(user) });
    }
    if (method === 'POST') {
      if (user.status === 'active' && user.farmerId) return fail(res, 409, '账号已通过审核，无需重复提交');
      const body = await readBody(req);
      const required = ['orgType', 'orgName', 'region', 'contact', 'mainCategory', 'description'];
      for (const k of required) {
        if (!String(body[k] || '').trim()) return fail(res, 400, '请完整填写入驻资料');
      }
      const materials = Array.isArray(body.materials) ? body.materials.slice(0, 5).map((m) => ({
        name: String(m.name || '材料').slice(0, 80),
        type: String(m.type || 'application/octet-stream').slice(0, 60),
        size: Math.max(0, Number(m.size) || 0),
        demo: true, note: '演示：仅记录文件元数据，未真实存储文件',
      })) : [];
      const app = mine && mine.status !== 'approved' ? mine : { id: 'FA' + Date.now(), userId: user.id, submittedAt: new Date().toISOString() };
      Object.assign(app, {
        status: 'pending', orgType: String(body.orgType).slice(0, 20), orgName: String(body.orgName).slice(0, 60),
        region: String(body.region).slice(0, 80), contact: String(body.contact).slice(0, 30),
        mainCategory: String(body.mainCategory).slice(0, 30), description: String(body.description).slice(0, 500),
        materials, submittedAt: new Date().toISOString(), reviewedAt: null, reviewer: null, rejectReason: '',
      });
      if (!db.applications.includes(app)) db.applications.push(app);
      user.status = 'pending';
      store.save();
      return json(res, { application: app, message: '入驻申请已提交（演示），等待运营审核' }, 201);
    }
  }

  if (seg[0] === 'farmer' && seg[2] === 'products' && seg[3] && method === 'PATCH') {
    // —— 修改待审 / 被驳回商品，重新提交审核 ——
    const actor = requireUser(req, res, ['farmer', 'admin']);
    if (!actor) return;
    if (actor.role === 'farmer' && seg[1] !== actor.farmerId) {
      return fail(res, 403, '只能修改自己的商品', 'FORBIDDEN');
    }
    const p = db.products.find((x) => x.id === seg[3]);
    if (!p || p.farmerId !== seg[1]) return fail(res, 404, '商品不存在');
    if (p.status === 'on') return fail(res, 409, '已上架商品不能直接修改，请先下架');
    const owner = db.farmers.find((f) => f.id === p.farmerId);
    if (!owner) return fail(res, 400, '商品所属农户不存在');
    const body = await readBody(req);
    const categories = [...new Set(db.products.map((x) => x.category))];
    const name = body.name !== undefined ? String(body.name || '').trim().slice(0, 40) : p.name;
    const category = body.category !== undefined ? String(body.category || '').trim() : p.category;
    const price = body.price !== undefined ? Number(body.price) : p.price;
    const summary = body.summary !== undefined ? String(body.summary || '').trim().slice(0, 200) : p.summary;
    const artKeys = ['pear', 'apple', 'orange', 'strawberry', 'rice', 'banana', 'beef', 'lamb', 'goji'];
    const art = body.art !== undefined && artKeys.includes(String(body.art)) ? String(body.art) : p.art;
    if (name.length < 2) return fail(res, 400, '商品名称至少 2 个字');
    if (!categories.includes(category)) return fail(res, 400, '请选择有效品类');
    if (!Number.isFinite(price) || price <= 0 || price > 99999) return fail(res, 400, '售价需在 0.01–99999 元之间');
    if (!summary) return fail(res, 400, '请填写商品简介');
    if (db.products.some((x) => x.id !== p.id && x.farmerId === p.farmerId && x.name === name)) {
      return fail(res, 409, '你已经有同名商品');
    }
    const artFile = path.join(PUBLIC, 'assets', 'photos', 'products', art + '.jpg');
    if (!fs.existsSync(artFile)) return fail(res, 400, '商品主图不可用');
    p.name = name;
    p.category = category;
    p.price = Math.round(price * 100) / 100;
    p.originalPrice = Math.round(price * 1.2 * 100) / 100;
    p.unit = body.unit !== undefined ? String(body.unit || '').trim().slice(0, 20) || p.unit : p.unit;
    p.spec = body.spec !== undefined ? String(body.spec || '').trim().slice(0, 60) || p.spec : p.spec;
    p.grade = body.grade !== undefined ? String(body.grade || '').trim().slice(0, 20) || p.grade : p.grade;
    p.geo = body.geo !== undefined ? String(body.geo || '').trim().slice(0, 40) : p.geo;
    p.art = art;
    p.summary = summary;
    p.status = 'pending';
    p.reviewNote = '';
    p.reviewedAt = null;
    db.breakdown[p.id] = defaultBreakdown(p.price);
    store.save();
    return json(res, { product: productCard(p), message: '商品已修改并重新提交审核' });
  }

  if (seg[0] === 'farmer') {
    // —— 农户端接口：farmer / admin 可访问；农户只能访问自己的 farmerId ——
    const actor = requireUser(req, res, ['farmer']);
    if (!actor) return;
    const targetId = seg[1] === 'me' ? actor.farmerId : seg[1];
    if (!targetId || targetId !== actor.farmerId) {
      return fail(res, 403, '只能查看本农户的数据', 'FORBIDDEN');
    }
    const f = db.farmers.find((x) => x.id === targetId);
    if (!f) return fail(res, 404, '农户不存在');
    if (seg[2] === 'dashboard' && method === 'GET') {
      const products = db.products.filter((p) => p.farmerId === f.id);
      const ids = products.map((p) => p.id);
      const batches = db.batches.filter((b) => ids.includes(b.productId));
      const orders = db.orders.filter((o) => commerce.farmerItems(db, o, f.id).length > 0);
      const gmv = Math.round(products.reduce((s, p) => s + (p.monthlySales * p.price * 7) / 30, 0));
      const records = db.records.filter((r) => batches.some((b) => b.id === r.batchId));
      const shareRatio = products.length ? products.reduce((s, p) => {
        const b = db.breakdown[p.id] || [];
        const share = b.filter((x) => x.label.includes('地头') || x.label.includes('收购')).reduce((t, x) => t + x.amount, 0);
        return s + share / (p.price || 1);
      }, 0) / products.length : 0.46;
      const farmerShare = gmv * (shareRatio || 0.46);
      return json(res, {
        farmer: f,
        kpis: {
          gmv, orders: Math.max(orders.length, Math.round(gmv / 76)), sampleOrders: orders.length, batches: batches.length, records: records.length,
          rating: f.rating, repurchase: Math.round((products.reduce((s, p) => s + p.repurchaseRate, 0) / (products.length || 1)) * 10) / 10,
          income: Math.round(farmerShare), orders30: Math.round(gmv / 76),
          pending: db.alerts.filter((a) => a.status === 'open' && batches.some((b) => b.id === a.batchId)).length,
        },
        trend: (() => {
          const raw = dailySeries(7);
          const rawSum = raw.reduce((s, d) => s + d.gmv, 0) || 1;
          return raw.map((d) => {
            const v = Math.round((d.gmv * gmv) / rawSum);
            return { ...d, gmv: v, orders: Math.max(1, Math.round(v / 76)) };
          });
        })(),
        todos: [
          { key: 'records', title: '今日农事待记录', desc: '系统按批次提醒，超过 48 小时未记录将影响溯源完整度', count: 1 },
          { key: 'packing', title: '待打包发货', desc: '订单付款后需在 24 小时内出库', count: orders.filter((o) => ['paid', 'packing'].includes(o.status)).length },
          { key: 'audit', title: '待补资料', desc: '检测报告、承诺达标合格证', count: db.products.filter((p) => p.farmerId === f.id && p.status === 'pending').length },
        ],
        recentOrders: orders.slice(0, 4).map((o) => commerce.forFarmer(db, o, f.id)),
        products: products.map((p) => ({ ...p, batches: db.batches.filter((b) => b.productId === p.id).length })),
      });
    }
    if (seg[2] === 'batches' && method === 'GET') {
      const products = db.products.filter((p) => p.farmerId === f.id);
      const ids = products.map((p) => p.id);
      const batches = db.batches.filter((b) => ids.includes(b.productId)).map((b) => {
        const rs = db.records.filter((r) => r.batchId === b.id).sort((a, c) => a.at.localeCompare(c.at));
        return {
          ...b, product: products.find((p) => p.id === b.productId),
          recordCount: rs.length, lastRecord: rs[rs.length - 1] || null,
          verified: chain.verify(rs).ok,
          daysToHarvest: Math.ceil((new Date(b.harvestedAt) - new Date('2026-11-25')) / 86400000),
        };
      });
      return json(res, { items: batches });
    }
    return fail(res, 404, '接口不存在');
  }

  if (seg[0] === 'orders') {
    // —— 统一订单访问控制：消费者看自己，农户只看自己的商品行，运营看脱敏全量 ——
    const actor = requireUser(req, res, ['consumer', 'farmer', 'admin']);
    if (!actor) return;

    const findOrder = (id) => db.orders.find((o) => o.id === id || o.no === id);

    if (method === 'GET' && seg.length === 1) {
      let list = db.orders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (actor.role === 'consumer') {
        list = list.filter((o) => o.userId === actor.id);
        return json(res, { items: list.map((o) => commerce.forOwner(db, o)) });
      }
      if (actor.role === 'farmer') {
        list = list.filter((o) => commerce.farmerItems(db, o, actor.farmerId).length > 0);
        return json(res, { items: list.map((o) => commerce.forFarmer(db, o, actor.farmerId)) });
      }
      return json(res, { items: list.map((o) => commerce.forAdmin(db, o)) });
    }

    if (method === 'GET' && seg[1]) {
      const o = findOrder(decodeURIComponent(seg[1]));
      if (!o) return fail(res, 404, '订单不存在');
      if (!commerce.canView(db, actor, o)) return fail(res, 403, '无权查看该订单', 'FORBIDDEN');
      if (actor.role === 'consumer') return json(res, commerce.forOwner(db, o));
      if (actor.role === 'farmer') return json(res, commerce.forFarmer(db, o, actor.farmerId));
      return json(res, commerce.forAdmin(db, o));
    }

    // 直接下单（兼容商品页“立即购买”，同样写 items/快照并扣库存）
    if (method === 'POST' && seg.length === 1) {
      if (actor.role !== 'consumer') return fail(res, 403, '仅消费者可以下单');
      const body = await readBody(req);
      const p = db.products.find((x) => x.id === body.productId);
      const s = commerce.sellable(db, p);
      if (!s.ok) return fail(res, 409, s.reason);
      const qty = Math.max(1, Math.min(commerce.MAX_QTY, Number(body.qty) || 1));
      if (qty > commerce.available(s.batch)) return fail(res, 409, '库存不足');
      const b = s.batch;
      const address = Object.assign({ name: actor.name, phone: auth.maskPhone(actor.phone), city: '上海市', detail: '（演示地址）' }, body.buyer || {});
      const now = new Date();
      const no = 'DD' + `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}` + String(db.orders.length + 1).padStart(2, '0');
      b.soldQty = (Number(b.soldQty) || 0) + qty;
      const item = {
        key: commerce.itemKey(p.id, b.id), productId: p.id, batchId: b.id, qty,
        unitPrice: p.price, lineAmount: Math.round(p.price * qty * 100) / 100,
        productSnapshot: commerce.productSnapshot(p), batchSnapshot: commerce.batchSnapshot(b),
      };
      const order = {
        id: 'O' + String(Date.now()).slice(-8), no, userId: actor.id, items: [item],
        totalAmount: item.lineAmount, amount: item.lineAmount,
        buyer: { name: address.name, phone: address.phone, city: address.city },
        address: { name: address.name, phone: address.phone, city: address.city, detail: address.detail },
        status: 'paid', payment: 'demo', createdAt: now.toISOString(), shipmentId: null,
      };
      db.orders.push(order);
      store.save();
      return json(res, { order: commerce.forOwner(db, order), batch: b.code, message: '演示订单已创建，未发起真实支付' }, 201);
    }

    if (seg[2] === 'aftersale' && method === 'POST') {
      const o = findOrder(decodeURIComponent(seg[1]));
      if (!o) return fail(res, 404, '订单不存在');
      if (!commerce.isOwner(actor, o)) return fail(res, 403, '只能为自己的订单申请售后', 'FORBIDDEN');
      const body = await readBody(req);
      const items = commerce.orderItems(db, o);
      const item = body.itemKey ? items.find((i) => i.key === body.itemKey) : items[0];
      if (!item) return fail(res, 404, '订单中没有该商品');
      const ratio = body.type === 'bad' ? 0.5 : body.type === 'missing' ? 0.3 : 0.15;
      const amount = Math.round(item.lineAmount * ratio * 100) / 100;
      o.afterSale = {
        itemKey: item.key, productId: item.productId, type: body.type || 'bad',
        note: body.note || '', photos: Number(body.photos) || 1,
        autoResult: body.type === 'bad' ? `通过，按商品行比例先行赔付 ${amount.toFixed(2)} 元` : '已受理，预计 2 小时内处理',
        amount, at: new Date().toISOString(), status: 'approved',
      };
      o.status = 'aftersale';
      store.save();
      return json(res, { afterSale: o.afterSale, message: `演示自动核赔 ${amount.toFixed(2)} 元，未发起真实退款` });
    }

    if (seg[2] === 'review' && method === 'POST') {
      const o = findOrder(decodeURIComponent(seg[1]));
      if (!o) return fail(res, 404, '订单不存在');
      if (!commerce.isOwner(actor, o)) return fail(res, 403, '只能评价自己的订单', 'FORBIDDEN');
      const body = await readBody(req);
      const items = commerce.orderItems(db, o);
      const item = body.itemKey ? items.find((i) => i.key === body.itemKey) : items[0];
      if (!item) return fail(res, 404, '订单中没有该商品');
      if (db.reviews.some((r) => r.orderId === o.id && r.productId === item.productId)) {
        return fail(res, 409, '该商品已评价过，不能重复提交', 'ALREADY_REVIEWED');
      }
      const review = {
        id: 'V' + Date.now(), orderId: o.id, orderItemKey: item.key, productId: item.productId,
        userId: actor.id, rating: Math.max(1, Math.min(5, Number(body.rating) || 5)),
        text: String(body.text || '').slice(0, 500), at: new Date().toISOString(),
        user: actor.nickname || actor.name, tags: Array.isArray(body.tags) ? body.tags.slice(0, 5) : [],
      };
      db.reviews.unshift(review);
      o.review = review;
      const p = db.products.find((x) => x.id === item.productId);
      if (p) {
        p.ratingAvg = Math.round(((p.ratingAvg * p.ratingCount + review.rating) / (p.ratingCount + 1)) * 10) / 10;
        p.ratingCount += 1;
      }
      store.save();
      return json(res, { review, message: '评价已发布' });
    }

    if (seg[2] === 'buy-again' && method === 'POST') {
      const o = findOrder(decodeURIComponent(seg[1]));
      if (!o) return fail(res, 404, '订单不存在');
      const r = commerce.buyAgain(db, actor, o);
      if (!r.ok) return fail(res, r.status || 403, r.reason);
      store.save();
      return json(res, { added: r.added, skipped: r.skipped, message: r.added.length ? '可售商品已加入购物车' : '没有可再次购买的商品' });
    }

    return fail(res, 404, '接口不存在');
  }

  if (seg[0] === 'farmer' && seg[2] === 'records' && method === 'POST') {
    // 已在上面 farmer 分支处理 GET；此处通常不会到达
  }

  if (seg[0] === 'admin') {
    // —— 后台接口：仅员工；具体动作由权限点控制 ——
    const actor = requireUser(req, res, ['admin']);
    if (!actor) return;
    if (seg[1] === 'audit' && method === 'GET') {
      if (!requirePerm(res, actor, 'audit.view')) return;
      return json(res, { items: database.auditList(database.open(), q.get('limit')) });
    }
    if (seg[1] === 'orders' && method === 'GET') {
      if (!requirePerm(res, actor, 'order.view')) return;
      return json(res, { items: db.orders.slice().reverse().filter((o) => {
        const p = db.products.find((x) => x.id === o.productId);
        return inOriginScope(actor, productFarmer(p));
      }).map((o) => { const p = db.products.find((x) => x.id === o.productId); const snap = (o.items && o.items[0] && o.items[0].productSnapshot) || null; return { ...o, product: p || snap, productName: (p && p.name) || (snap && snap.name) || o.productName || '' }; }) });
    }
    if (seg[1] === 'products' && method === 'GET') {
      if (!requirePerm(res, actor, 'product.review')) return;
      return json(res, { items: db.products.filter((p) => p.status === 'pending' && inOriginScope(actor, productFarmer(p))).map(productCard) });
    }
    if (seg[1] === 'alerts' && method === 'GET') {
      if (!requirePerm(res, actor, 'alert.resolve')) return;
      return json(res, { items: db.alerts.slice().sort((a, b) => b.at.localeCompare(a.at)) });
    }
    if (seg[1] === 'geos' && method === 'GET') {
      if (!requirePerm(res, actor, 'geos.view')) return;
      return json(res, { items: db.geos.filter((g) => inOriginScope(actor, { region: g.region || g.area })) });
    }
    if (seg[1] === 'customers' && method === 'GET') {
      if (!requirePerm(res, actor, 'cs.view')) return;
      const items = db.users.filter((u) => u.role === 'consumer').map((u) => {
        const orders = db.orders.filter((o) => o.userId === u.id);
        const spend = orders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
        return {
          id: u.id, name: u.nickname || u.name || '消费者', phone: auth.maskPhone(u.phone),
          orders: orders.length, spend, aftersales: orders.filter((o) => o.afterSale).length,
          lastOrder: orders.length ? orders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].createdAt : null,
          status: u.status || 'active',
        };
      }).sort((a, b) => b.spend - a.spend);
      return json(res, { items });
    }
    if (seg[1] === 'settlement' && method === 'GET') {
      if (!can(actor, 'settlement.view') && !can(actor, 'reconcile.view')) return fail(res, 403, '当前账号无权查看分账', 'FORBIDDEN');
      const states = Object.fromEntries(database.settlementStates().map((x) => [x.order_id, x]));
      const rows = db.orders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((o) => {
        const p = db.products.find((x) => x.id === o.productId);
        const f = p ? db.farmers.find((x) => x.id === p.farmerId) : null;
        const amount = Number(o.amount) || 0;
        const st = states[o.id] || null;
        return {
          id: o.id, no: o.no, createdAt: o.createdAt, status: o.status,
          productName: (p && p.name) || ((o.items && o.items[0] && o.items[0].productSnapshot && o.items[0].productSnapshot.name) || o.productName || '—'),
          farmerName: (f && f.name) || '—',
          amount, fee: Math.round(amount * 0.03 * 100) / 100, payable: Math.round(amount * 0.97 * 100) / 100,
          settlementStatus: (st && st.status) || 'pending', paidAt: st ? st.paid_at : null,
        };
      });
      const summary = rows.reduce((s, r) => ({
        gmv: s.gmv + r.amount, fee: s.fee + r.fee, payable: s.payable + r.payable, count: s.count + 1,
        paid: s.paid + (r.settlementStatus === 'paid' ? r.payable : 0),
        pending: s.pending + (r.settlementStatus === 'paid' ? 0 : r.payable),
      }), { gmv: 0, fee: 0, payable: 0, count: 0, paid: 0, pending: 0 });
      return json(res, { items: rows, summary });
    }
    if (seg[1] === 'settlement' && seg[3] === 'pay' && method === 'POST') {
      if (!requirePerm(res, actor, 'settlement.view')) return;
      const o = db.orders.find((x) => x.id === seg[2] || x.no === seg[2]);
      if (!o) return fail(res, 404, '订单不存在');
      const body = await readBody(req);
      database.markSettled(o.id, actor.id, body.note || '财务确认结算');
      const p = db.products.find((x) => x.id === o.productId);
      const f = p ? db.farmers.find((x) => x.id === p.farmerId) : null;
      const owner = db.users.find((u) => u.role === 'farmer' && u.farmerId === (p && p.farmerId));
      if (owner) database.notify(owner.id, 'settlement_paid', '订单已结算', `${o.no} 已结算，农户应付 ${(Number(o.amount) * 0.97).toFixed(2)} 元。`, '/farmer.html');
      audit(req, actor, 'settlement.pay', 'order', o.id, null, { status: 'paid', farmer: f ? f.id : null });
      return json(res, { ok: true, message: '已标记结算（演示）' });
    }
    if (seg[1] === 'roles' && seg[2] && method === 'PATCH') {
      if (!requirePerm(res, actor, 'role.manage')) return;
      if (!database.ROLES[seg[2]]) return fail(res, 404, '角色不存在');
      const body = await readBody(req);
      if (!Array.isArray(body.permissions)) return fail(res, 400, 'permissions 必须是数组');
      const valid = body.permissions.filter((p) => database.PERMISSIONS[p]).slice(0, 50);
      const conn = database.open();
      const tx = conn.transaction(() => {
        conn.prepare('DELETE FROM role_permission WHERE role_code=?').run(seg[2]);
        const ins = conn.prepare('INSERT OR IGNORE INTO role_permission(role_code,permission_code) VALUES (?,?)');
        for (const p of valid) ins.run(seg[2], p);
      });
      tx();
      for (const u of db.users) {
        if (u.role === 'admin' && u.staffRole === seg[2]) u.permissions = database.rolePermissionsFor(seg[2]);
      }
      audit(req, actor, 'role.update', 'role', seg[2], null, { permissions: valid });
      return json(res, { ok: true, role: { code: seg[2], name: database.ROLES[seg[2]][0], permissions: valid }, message: '角色权限已更新' });
    }
    if (seg[1] === 'approvals' && method === 'GET') {
      const canFarmers = can(actor, 'farmer.review');
      const canProducts = can(actor, 'product.review');
      if (!canFarmers && !canProducts) return fail(res, 403, '当前账号无权查看审批历史', 'FORBIDDEN');
      const staffName = (id) => {
        const u = db.users.find((x) => x.id === id);
        return u ? (u.name || u.nickname || id) : (id || '');
      };
      const seen = new Set();
      const items = [];
      for (const ev of database.approvalEvents(300)) {
        if (ev.objectType === 'application' && !canFarmers) continue;
        if (ev.objectType === 'product' && !canProducts) continue;
        if (ev.objectType === 'application') {
          const app = db.applications.find((a) => a.id === ev.objectId);
          if (!app || !inOriginScope(actor, app)) continue;
          items.push({ type: 'farmer', id: ev.objectId, name: app.orgName, status: ev.status, reviewer: staffName(ev.actorId), at: ev.at, reason: ev.reason || '' });
          seen.add('A:' + ev.objectId);
        } else if (ev.objectType === 'product') {
          const p = db.products.find((x) => x.id === ev.objectId);
          if (!p || !inOriginScope(actor, productFarmer(p))) continue;
          items.push({ type: 'product', id: ev.objectId, name: p.name, status: ev.status, reviewer: staffName(ev.actorId), at: ev.at, reason: ev.reason || '' });
          seen.add('P:' + ev.objectId);
        }
      }
      // 种子数据没有审核审计时，补当前已处理记录，避免历史页空白。
      if (canFarmers) for (const a of db.applications) {
        if (a.status === 'pending' || seen.has('A:' + a.id) || !inOriginScope(actor, a)) continue;
        items.push({ type: 'farmer', id: a.id, name: a.orgName, status: a.status, reviewer: a.reviewer || '', at: a.reviewedAt || a.submittedAt, reason: a.rejectReason || '' });
      }
      if (canProducts) for (const p of db.products) {
        if (p.status === 'pending' || seen.has('P:' + p.id) || !p.reviewedAt || !inOriginScope(actor, productFarmer(p))) continue;
        items.push({ type: 'product', id: p.id, name: p.name, status: p.status, reviewer: p.reviewer || '', at: p.reviewedAt, reason: p.reviewNote || '' });
      }
      items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
      return json(res, { items });
    }
    if (seg[1] === 'profiles' && seg[2] === 'snapshot') {
      const kind = String(q.get('kind') || (method === 'POST' && (await readBody(req)).kind) || 'consumers');
      if (!['consumers', 'farmers'].includes(kind)) return fail(res, 400, '画像类型不合法');
      const allowed = kind === 'consumers' ? (can(actor, 'cs.view') || can(actor, 'admin.overview')) : can(actor, 'farmer.review');
      if (!allowed) return fail(res, 403, '当前账号无权处理该画像快照', 'FORBIDDEN');
      if (method === 'POST') {
        const items = kind === 'consumers' ? consumerProfiles() : farmerProfiles().filter((p) => inOriginScope(actor, { region: p.region }));
        const snap = database.saveProfileSnapshot(kind, items);
        audit(req, actor, 'profile.snapshot', 'profile', kind, null, { count: items.length });
        return json(res, { ok: true, snapshot: snap, count: items.length, message: '画像快照已生成' });
      }
      if (method === 'GET') {
        return json(res, { snapshot: database.latestProfileSnapshot(kind) });
      }
      return fail(res, 404, '接口不存在');
    }
    if (seg[1] === 'recommendations' && seg[2] === 'stats' && method === 'GET') {
      if (!can(actor, 'cs.view') && !can(actor, 'admin.overview')) return fail(res, 403, '当前账号无权查看推荐效果', 'FORBIDDEN');
      const conn = database.open();
      const rows = conn.prepare("SELECT type, COUNT(*) c, COUNT(DISTINCT session_id) s FROM event_log WHERE type IN ('rec_impression','rec_click','add_cart','checkout') GROUP BY type").all();
      const map = Object.fromEntries(rows.map((r) => [r.type, { count: r.c, sessions: r.s }]));
      const impressions = map.rec_impression ? map.rec_impression.count : 0;
      const clicks = map.rec_click ? map.rec_click.count : 0;
      return json(res, {
        impressions, clicks, addCart: map.add_cart ? map.add_cart.count : 0, checkout: map.checkout ? map.checkout.count : 0,
        ctr: impressions ? Math.round(clicks / impressions * 1000) / 10 : 0,
        checkoutRate: clicks ? Math.round((map.checkout ? map.checkout.count : 0) / clicks * 1000) / 10 : 0,
        note: '演示事件口径：CTR = rec_click / rec_impression；不含去重用户。',
      });
    }
    if (seg[1] === 'profiles' && seg[2] === 'consumers' && method === 'GET') {
      if (!requirePerm(res, actor, 'cs.view')) return;
      return json(res, { items: consumerProfiles(), generatedAt: new Date().toISOString(), notes: '仅统计有 userId 的订单；未授权画像的消费者不生成偏好标签。' });
    }
    if (seg[1] === 'profiles' && seg[2] === 'farmers' && method === 'GET') {
      if (!requirePerm(res, actor, 'farmer.review')) return;
      return json(res, { items: farmerProfiles().filter((p) => inOriginScope(actor, { region: p.region })), generatedAt: new Date().toISOString(), notes: '由商品、批次、记录、订单、预警实时计算；样本量随行。' });
    }
    if (seg[1] === 'staff' && method === 'GET') {
      if (!requirePerm(res, actor, 'staff.manage')) return;
      return json(res, {
        items: db.users.filter((u) => u.role === 'admin').map((u) => ({ ...auth.publicUser(u), phone: u.phone })),
        roles: Object.entries(database.ROLES).map(([code, [name, desc]]) => ({ code, name, desc })),
      });
    }
    if (seg[1] === 'roles' && method === 'GET') {
      if (!requirePerm(res, actor, 'role.manage')) return;
      return json(res, {
        roles: Object.entries(database.ROLES).map(([code, [name, desc]]) => ({
          code, name, desc, permissions: database.ROLE_PERMISSIONS[code] || [],
        })),
        permissions: Object.entries(database.PERMISSIONS).map(([code, [type, desc]]) => ({ code, type, desc })),
      });
    }
    if (seg[1] === 'staff' && seg[2] && method === 'PATCH') {
      if (!requirePerm(res, actor, 'staff.manage')) return;
      const u = db.users.find((x) => x.id === seg[2] && x.role === 'admin');
      if (!u) return fail(res, 404, '员工不存在');
      const body = await readBody(req);
      if (u.id === actor.id && body.staffRole && body.staffRole !== u.staffRole) {
        return fail(res, 400, '不能修改自己的角色，请让另一位管理员操作', 'SELF_ROLE');
      }
      if (u.id === actor.id && body.status && body.status !== 'active') {
        return fail(res, 400, '不能停用或离职自己的账号', 'SELF_STATUS');
      }
      const nextRole = body.staffRole || u.staffRole;
      const nextStatus = body.status || u.status;
      if (u.staffRole === 'super_admin' && (nextRole !== 'super_admin' || nextStatus !== 'active')) {
        const supers = db.users.filter((x) => x.role === 'admin' && x.staffRole === 'super_admin' && x.status === 'active');
        if (supers.length <= 1) return fail(res, 409, '至少保留一个启用的平台超管', 'LAST_SUPER');
      }
      if (body.staffRole) {
        if (!database.ROLES[body.staffRole]) return fail(res, 400, '角色不存在');
        u.staffRole = body.staffRole;
        u.permissions = database.rolePermissionsFor(u.staffRole);
      }
      if (body.status) {
        if (!['active', 'disabled', 'left'].includes(body.status)) return fail(res, 400, '状态不合法');
        u.status = body.status;
      }
      store.save();
      audit(req, actor, 'staff.update', 'staff', u.id, null, { staffRole: u.staffRole, status: u.status });
      return json(res, { user: auth.publicUser(u), message: '员工信息已更新' });
    }
    if (seg[1] === 'applications' && method === 'GET') {
      if (!requirePerm(res, actor, 'farmer.review')) return;
      const list = db.applications.filter((a) => a.status === 'pending' && inOriginScope(actor, a)).slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
      return json(res, { items: list });
    }
    if (seg[1] === 'applications' && seg[3] === 'review' && method === 'POST') {
      if (!requirePerm(res, actor, 'farmer.review')) return;
      const app = db.applications.find((a) => a.id === seg[2]);
      if (!app) return fail(res, 404, '入驻申请不存在');
      if (app.status !== 'pending') return fail(res, 409, '该申请已处理');
      const body = await readBody(req);
      const applicant = db.users.find((u) => u.id === app.userId);
      if (body.action === 'approve') {
        const fid = 'F' + String(db.farmers.length + 1).padStart(2, '0');
        db.farmers.push({
          id: fid, name: app.orgName, org: app.orgName, type: 'D',
          region: { province: app.region, city: '', county: '', village: '' },
          phone: applicant ? auth.maskPhone(applicant.phone) : '', joinedAt: new Date().toISOString(),
          acreage: 0, certs: [], story: app.description, rating: 0, orders: 0, status: 'active',
        });
        app.status = 'approved'; app.farmerId = fid; app.reviewedAt = new Date().toISOString();
        app.reviewer = actor.name || '平台运营'; app.rejectReason = '';
        if (applicant) { applicant.status = 'active'; applicant.farmerId = fid; }
        store.save();
        audit(req, actor, 'farmer.review', 'application', app.id, null, { status: 'approved', farmerId: fid });
        if (applicant) database.notify(applicant.id, 'farmer_approval', '农户入驻审核通过', `你的入驻申请已通过，农户编号 ${fid}。现在可以进入工作台。`, '/farmer.html');
        return json(res, { application: app, farmerId: fid, message: `已通过审核，农户编号 ${fid}` });
      }
      app.status = 'rejected'; app.reviewedAt = new Date().toISOString();
      app.reviewer = actor.name || '平台运营';
      app.rejectReason = String(body.reason || '资料不完整，请补充后重新提交').slice(0, 200);
      if (applicant) applicant.status = 'rejected';
      store.save();
      audit(req, actor, 'farmer.review', 'application', app.id, null, { status: 'rejected', reason: app.rejectReason });
      if (applicant) database.notify(applicant.id, 'farmer_reject', '农户入驻申请被驳回', app.rejectReason, '/farmer-apply.html');
      return json(res, { application: app, message: '已驳回，申请人可修改后重新提交' });
    }

    if (seg[1] === 'overview') {
      if (!requirePerm(res, actor, 'admin.overview')) return;
      const scoped = actor.staffRole === 'origin_ops' && actor.scope;
      const products = scoped ? db.products.filter((p) => inOriginScope(actor, productFarmer(p))) : db.products;
      const productIds = new Set(products.map((p) => p.id));
      const farmers = scoped ? db.farmers.filter((f) => inOriginScope(actor, f)) : db.farmers;
      const batches = scoped ? db.batches.filter((b) => productIds.has(b.productId)) : db.batches;
      const batchIds = new Set(batches.map((b) => b.id));
      const records = scoped ? db.records.filter((r) => batchIds.has(r.batchId)) : db.records;
      const orders = scoped ? db.orders.filter((o) => (o.items || []).some((it) => productIds.has(it.productId))) : db.orders;
      const ledger = scoped ? db.ledger.filter((l) => batchIds.has(l.batchId)) : db.ledger;
      const alerts = scoped ? db.alerts.filter((a) => batchIds.has(a.batchId)) : db.alerts;
      const geos = scoped ? db.geos.filter((g) => inOriginScope(actor, { region: g.region || g.area })) : db.geos;
      const cats = {};
      products.forEach((p) => { cats[p.category] = (cats[p.category] || 0) + p.monthlySales * p.price; });
      const regions = {};
      farmers.forEach((f) => {
        const val = products.filter((p) => p.farmerId === f.id).reduce((s, p) => s + p.monthlySales * p.price, 0);
        const province = (f.region && f.region.province) || '其他';
        regions[province] = (regions[province] || 0) + val;
      });
      const all = batches.map((b) => chain.verify(records.filter((r) => r.batchId === b.id)));
      const stats = platformStats({ products, farmers, batches, records, orders, ledger, geos, households: scoped ? farmers.length : undefined });
      const payload = {
        kpis: Object.assign(stats, {
          openAlerts: alerts.filter((a) => a.status === 'open').length,
          chainOk: all.filter((v) => v.ok).length,
          chainTotal: all.length,
          repurchase: products.length ? Math.round((products.reduce((s, p) => s + p.repurchaseRate, 0) / products.length) * 10) / 10 : 0,
        }),
        trend: dailySeries(14, products, orders),
        categoryMix: Object.entries(cats).map(([label, value]) => ({ label, value: Math.round(value) })),
        regionMix: Object.entries(regions).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value),
        alerts: can(actor, 'alert.resolve') ? alerts.slice().sort((a, b) => b.at.localeCompare(a.at)) : [],
        ledger: can(actor, 'ledger.view') ? ledger.slice(-8).reverse() : [],
        audit: can(actor, 'product.review') ? products.filter((p) => p.status === 'pending').map(productCard) : [],
        llm: { enabled: !!(db.settings.llm.enabled && db.settings.llm.apiKey), model: db.settings.llm.model, baseUrl: can(actor, 'settings.llm') ? db.settings.llm.baseUrl : '' },
        recentOrders: can(actor, 'order.view') ? orders.slice(-5).reverse().map((o) => {
          const p = products.find((x) => x.id === o.productId) || (o.items || []).map((it) => products.find((x) => x.id === it.productId)).find(Boolean);
          return { ...o, product: p || null };
        }) : [],
        geos: can(actor, 'geos.view') ? geos : [],
        applications: can(actor, 'farmer.review') ? db.applications.filter((a) => a.status === 'pending' && inOriginScope(actor, a)) : [],
      };
      if (q.get('slim') === '1') {
        for (const key of ['alerts', 'ledger', 'audit', 'recentOrders', 'geos', 'applications']) delete payload[key];
      }
      return json(res, payload);
    }
    if (seg[1] === 'ledger') {
      if (!requirePerm(res, actor, 'ledger.view')) return;
      const limit = Math.min(200, Number(q.get('limit')) || 50);
      return json(res, { items: db.ledger.slice().reverse().slice(0, limit), total: db.ledger.length });
    }
    if (seg[1] === 'alerts' && seg[3] === 'resolve' && method === 'POST') {
      if (!requirePerm(res, actor, 'alert.resolve')) return;
      const a = db.alerts.find((x) => x.id === seg[2]);
      if (!a) return fail(res, 404, '预警不存在');
      const body = await readBody(req);
      a.status = 'resolved';
      a.resolvedAt = new Date().toISOString();
      a.resolveNote = body.note || '已按处置流程处理';
      store.save();
      audit(req, actor, 'alert.resolve', 'alert', a.id, null, { status: a.status, note: a.resolveNote });
      return json(res, { alert: a, message: '预警已处置' });
    }
    if (seg[1] === 'products' && seg[3] === 'review' && method === 'POST') {
      if (!requirePerm(res, actor, 'product.review')) return;
      const p = db.products.find((x) => x.id === seg[2]);
      if (!p) return fail(res, 404, '商品不存在');
      const body = await readBody(req);
      p.status = body.action === 'approve' ? 'on' : 'rejected';
      p.reviewNote = body.reason || '';
      p.reviewedAt = new Date().toISOString();
      p.reviewer = actor.name || '平台运营';
      store.save();
      audit(req, actor, 'product.review', 'product', p.id, null, { status: p.status, reason: p.reviewNote });
      const owner = db.users.find((u) => u.role === 'farmer' && u.farmerId === p.farmerId);
      if (owner) database.notify(owner.id, p.status === 'on' ? 'product_approved' : 'product_rejected', p.status === 'on' ? '商品审核通过' : '商品审核被驳回', p.status === 'on' ? `${p.name} 已上架商城。` : `${p.name}：${p.reviewNote || '请补充材料后重新提交'}`, '/farmer.html');
      return json(res, { product: p, message: body.action === 'approve' ? '已通过审核并上架' : '已驳回，原因已通知农户' });
    }
    if (seg[1] === 'demo' && seg[2] === 'tamper' && method === 'POST') {
      if (!requirePerm(res, actor, 'demo.tamper')) return;
      const body = await readBody(req);
      const bid = body.batchId || 'B01';
      const rs = db.records.filter((r) => r.batchId === bid).sort((a, b) => a.at.localeCompare(b.at));
      if (!rs.length) return fail(res, 404, '批次无记录');
      const target = rs[Math.min(2, rs.length - 1)];
      if (body.on) {
        db.demo.tamper = { batchId: bid, recordId: target.id, originalDetail: target.detail };
        target.detail = target.detail + '（演示：该条内容在上链后被改动）';
      } else if (db.demo.tamper.originalDetail) {
        const r = db.records.find((x) => x.id === db.demo.tamper.recordId);
        if (r) r.detail = db.demo.tamper.originalDetail;
        db.demo.tamper = { batchId: null, recordId: null, originalDetail: null };
      }
      store.save();
      audit(req, actor, 'demo.tamper', 'batch', bid, null, { on: !!body.on, recordId: db.demo.tamper.recordId });
      return json(res, { demo: db.demo, verify: chain.verify(rs) });
    }
    return fail(res, 404, '接口不存在');
  }

  if (seg[0] === 'kb') {
    return json(res, { items: db.kb, total: db.kb.length });
  }

  if (seg[0] === 'settings') {
    // —— 大模型配置：仅 sys_admin ——
    const settingsActor = requireUser(req, res, ['admin']);
    if (!settingsActor) return;
    if (!requirePerm(res, settingsActor, 'settings.llm')) return;
    if (method === 'GET') {
      const s = db.settings.llm;
      return json(res, {
        llm: { enabled: s.enabled, baseUrl: s.baseUrl, model: s.model, temperature: s.temperature, configured: !!s.apiKey, keyMask: s.apiKey ? s.apiKey.slice(0, 4) + '••••' + s.apiKey.slice(-4) : '' },
      });
    }
    if (method === 'POST') {
      const body = await readBody(req);
      const s = db.settings.llm;
      if (typeof body.enabled === 'boolean') s.enabled = body.enabled;
      if (body.baseUrl) s.baseUrl = String(body.baseUrl).trim();
      if (body.model) s.model = String(body.model).trim();
      if (body.temperature !== undefined) s.temperature = Number(body.temperature) || 0.2;
      if (body.apiKey) s.apiKey = String(body.apiKey).trim();
      if (body.clearKey) s.apiKey = '';
      store.save();
      audit(req, settingsActor, 'settings.llm', 'settings', 'llm', null, { enabled: s.enabled, model: s.model, configured: !!s.apiKey });
      return json(res, { ok: true, llm: { enabled: s.enabled, model: s.model, configured: !!s.apiKey } });
    }
  }

  if (seg[0] === 'qr') {
    const data = q.get('data') || 'https://example.com';
    const size = Math.min(600, Math.max(80, Number(q.get('size')) || 220));
    try {
      const svg = qr.svg(data, size);
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
      return res.end(svg);
    } catch (e) {
      return fail(res, 400, e.message);
    }
  }

  return fail(res, 404, '接口不存在');
}

/* 记录写入（farmer 分支的 POST 在 api 里单独处理，避免与 GET 冲突） */
async function farmerPost(req, res, url) {
  const seg = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  // —— 农事记录 / 新建批次：farmer / admin 可写；农户只能写自己的 ——
  const actor = requireUser(req, res, ['farmer', 'admin']);
  if (!actor) return;
  const targetId = seg[1] === 'me' ? actor.farmerId : seg[1];
  if (!targetId) return fail(res, 403, '只能为本农户提交数据', 'FORBIDDEN');
  if (actor.role === 'farmer' && targetId !== actor.farmerId) {
    return fail(res, 403, '只能为本农户提交数据', 'FORBIDDEN');
  }
  const body = await readBody(req);

  if (seg[2] === 'products') {
    // 商品归属：农户只能写给自己；运营必须显式指定 farmerId
    const farmerId = actor.role === 'admin' ? String(body.farmerId || '') : actor.farmerId;
    const owner = db.farmers.find((f) => f.id === farmerId);
    if (!owner) return fail(res, 400, '请选择有效的农户');
    const name = String(body.name || '').trim().slice(0, 40);
    const category = String(body.category || '').trim();
    const categories = [...new Set(db.products.map((x) => x.category))];
    const price = Number(body.price);
    const unit = String(body.unit || '').trim().slice(0, 20) || '5 斤装';
    const spec = String(body.spec || '').trim().slice(0, 60) || unit;
    const grade = String(body.grade || '').trim().slice(0, 20) || '一级';
    const summary = String(body.summary || '').trim().slice(0, 200);
    const geo = String(body.geo || owner.region.county || owner.region.province || '').trim().slice(0, 40);
    const artKeys = ['pear', 'apple', 'orange', 'strawberry', 'rice', 'banana', 'beef', 'lamb', 'goji'];
    const art = artKeys.includes(String(body.art)) ? String(body.art) : 'pear';
    const artFile = path.join(PUBLIC, 'assets', 'photos', 'products', art + '.jpg');
    if (name.length < 2) return fail(res, 400, '商品名称至少 2 个字');
    if (!categories.includes(category)) return fail(res, 400, '请选择有效品类');
    if (!Number.isFinite(price) || price <= 0 || price > 99999) return fail(res, 400, '售价需在 0.01–99999 元之间');
    if (!summary) return fail(res, 400, '请填写商品简介');
    if (db.products.some((x) => x.farmerId === farmerId && x.name === name)) return fail(res, 409, '你已经有同名商品');
    if (!fs.existsSync(artFile)) return fail(res, 400, '商品主图不可用');

    let seq = db.products.length + 1;
    let id = 'P' + String(seq).padStart(2, '0');
    while (db.products.some((x) => x.id === id)) {
      seq += 1;
      id = 'P' + String(seq).padStart(2, '0');
    }
    const highlights = Array.isArray(body.highlights)
      ? body.highlights.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 3)
      : [];
    const product = {
      id, name, category, unit, spec, grade,
      price: Math.round(price * 100) / 100,
      originalPrice: Math.round(price * 1.2 * 100) / 100,
      organic: body.organic === true,
      greenFood: body.greenFood === true,
      geoIndication: body.geoIndication === true,
      geo, farmerId, art,
      status: 'pending',
      createdAt: new Date().toISOString(),
      monthlySales: 0, repurchaseRate: 0, ratingAvg: 0, ratingCount: 0,
      summary,
      highlights: highlights.length ? highlights : ['产地直供，批次可追溯', '平台审核后上架'],
      reviewNote: '', reviewedAt: null,
    };
    db.products.push(product);
    db.breakdown[id] = defaultBreakdown(product.price);
    store.save();
    return json(res, {
      product: productCard(product),
      message: '商品已提交审核，平台通过后进入商城',
    }, 201);
  }

  if (seg[2] === 'records') {
    const b = db.batches.find((x) => x.id === body.batchId);
    if (!b) return fail(res, 404, '批次不存在');
    const p = productOf(b);
    if (actor.role === 'farmer' && (!p || p.farmerId !== actor.farmerId)) {
      return fail(res, 403, '只能为本农户的批次写记录', 'FORBIDDEN');
    }
    const r = {
      id: 'R' + String(db.records.length + 1).padStart(3, '0'), batchId: b.id,
      type: body.type || 'fertilize', at: body.at || new Date().toISOString(),
      title: body.title || '农事记录', detail: body.detail || '',
      operator: body.operator || (farmerOfProduct(p) ? farmerOfProduct(p).name : '农户'),
      method: body.method || 'voice', evidence: body.evidence || [],
    };
    db.records.push(r);
    rebuildLedger();
    store.save();
    return json(res, { record: r, message: '记录已上链存证' }, 201);
  }
  if (seg[2] === 'batches') {
    const p = db.products.find((x) => x.id === body.productId);
    if (!p) return fail(res, 400, '商品不存在');
    if (p.status !== 'on') return fail(res, 409, '商品待审核或未上架，不能建批次');
    if (actor.role === 'farmer' && p.farmerId !== actor.farmerId) {
      return fail(res, 403, '只能为自己的商品建批次', 'FORBIDDEN');
    }
    const n = db.batches.filter((x) => x.productId === p.id).length + 1;
    const harvest = body.harvestAt || new Date().toISOString();
    const code = `TY-${new Date(harvest).getFullYear()}-${String(new Date(harvest).getMonth() + 1).padStart(2, '0')}${String(new Date(harvest).getDate()).padStart(2, '0')}-${p.art.slice(0, 2).toUpperCase()}${n}`;
    const b = {
      id: 'B' + String(db.batches.length + 1).padStart(2, '0'), productId: p.id, code,
      plot: body.plot || '待补充地块', area: body.area || '—',
      plantedAt: body.plantedAt || new Date().toISOString(), harvestedAt: harvest,
      qty: Number(body.qty) || 1000, unit: p.category === '肉禽蛋' ? 'kg' : 'kg', status: 'growing', grade: p.grade,
    };
    db.batches.push(b);
    store.save();
    return json(res, { batch: b, message: `批次已创建，溯源码 ${code}` }, 201);
  }
  return fail(res, 404, '接口不存在');
}

/* ---------------- 静态文件 ---------------- */
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  if (p === '/t') {
    const code = url.searchParams.get('c') || '';
    res.writeHead(302, { Location: `/trace.html?code=${encodeURIComponent(code)}` });
    return res.end();
  }
  const file = path.join(PUBLIC, p);
  if (!file.startsWith(PUBLIC)) return fail(res, 403, '禁止访问');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      if (p.endsWith('.html') || p === '/index.html') return fail(res, 404, '页面不存在');
      return fail(res, 404, '资源不存在');
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const cache = ext === '.html' ? 'no-store' : 'public, max-age=60';
    // 支持 Range，保证 iOS / Safari 的视频播放与循环稳定
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        let start = m[1] ? Number(m[1]) : 0;
        let end = m[2] ? Number(m[2]) : st.size - 1;
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= st.size) {
          res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
          return res.end();
        }
        end = Math.min(end, st.size - 1);
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Range': `bytes ${start}-${end}/${st.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Cache-Control': cache,
        });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': cache,
    });
    fs.createReadStream(file).pipe(res);
});
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'POST' && /^\/api\/farmer\/[^/]+\/(records|batches|products)$/.test(url.pathname)) {
        return await farmerPost(req, res, url);
      }
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      return await api(req, res, url);
    }
    return serveStatic(req, res, url);
  } catch (e) {
    console.error('[error]', req.method, url.pathname, e.message);
    if (!res.headersSent) return fail(res, 500, e.message || '服务器内部错误', 'INTERNAL');
    res.end();
  }
});

async function start() {
  db = await store.load();
  server.listen(PORT, HOST, () => {
    console.log(`\n  田源可信 · 溯源助农平台`);
    console.log(`  http://${HOST}:${PORT}`);
    console.log(`  数据：${db.records.length} 条记录 / ${db.ledger.length} 个区块 / ${db.batches.length} 个批次`);
    console.log(`  账号：${db.users.length} 个 / SQLite：${database.SQLITE_PATH}`);
    console.log(`  智能体：本地引擎${db.settings.llm.enabled && db.settings.llm.apiKey ? ' + 大模型已启用' : '（大模型未启用，可在后台设置）'}\n`);
  });
}

if (require.main === module) {
  start().catch((e) => { console.error('[startup]', e); process.exitCode = 1; });
}

module.exports = { server, start };
