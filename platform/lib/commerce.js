'use strict';
/* 交易域：订单快照/归属、库存、购物车、入驻申请。零依赖，纯函数 + 同步临界区。 */

const MAX_QTY = 20;

/* ---------------- 库存 ---------------- */
function available(batch) {
  if (!batch) return 0;
  const total = Number(batch.stockQty) || 0;
  const sold = Number(batch.soldQty) || 0;
  return Math.max(0, total - sold);
}
function pickBatch(db, productId) {
  return db.batches
    .filter((b) => b.productId === productId && b.status !== 'shipped')
    .sort((a, b) => available(b) - available(a))[0] || null;
}
function sellable(db, product, batch) {
  if (!product || product.status !== 'on') return { ok: false, reason: '商品未上架' };
  const b = batch || pickBatch(db, product.id);
  if (!b) return { ok: false, reason: '暂无可售批次' };
  if (b.status === 'shipped') return { ok: false, reason: '批次已售罄' };
  if (available(b) <= 0) return { ok: false, reason: '库存不足' };
  return { ok: true, batch: b };
}

/* ---------------- 订单快照与适配 ---------------- */
function productSnapshot(p) {
  if (!p) return null;
  return { id: p.id, name: p.name, spec: p.spec, unit: p.unit, price: p.price, art: p.art, category: p.category, farmerId: p.farmerId };
}
function batchSnapshot(b) {
  if (!b) return null;
  return { id: b.id, code: b.code, plot: b.plot, harvestedAt: b.harvestedAt, grade: b.grade, area: b.area };
}
/** 旧单商品订单 → items；不改历史数据，只读适配 */
function orderItems(db, order) {
  if (Array.isArray(order.items) && order.items.length) return order.items;
  const p = db.products.find((x) => x.id === order.productId);
  const b = db.batches.find((x) => x.id === order.batchId);
  return [{
    key: `${order.productId}:${order.batchId || 'na'}`,
    productId: order.productId,
    batchId: order.batchId || null,
    qty: order.qty,
    unitPrice: order.unitPrice,
    lineAmount: order.amount,
    productSnapshot: productSnapshot(p) || { id: order.productId, name: '历史商品', price: order.unitPrice },
    batchSnapshot: batchSnapshot(b) || { id: order.batchId, code: '' },
  }];
}
function normalizeOrder(db, order) {
  const items = orderItems(db, order);
  const total = order.amount != null ? order.amount : items.reduce((s, i) => s + i.lineAmount, 0);
  return Object.assign({}, order, { items, totalAmount: Math.round(total * 100) / 100 });
}

/* ---------------- 归属与脱敏 ---------------- */
function isOwner(user, order) {
  return !!user && user.role === 'consumer' && order.userId && order.userId === user.id;
}
function farmerItems(db, order, farmerId) {
  return orderItems(db, order).filter((i) => {
    const p = db.products.find((x) => x.id === i.productId);
    return p && p.farmerId === farmerId;
  });
}
function canView(db, user, order) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'consumer') return isOwner(user, order);
  if (user.role === 'farmer') return farmerItems(db, order, user.farmerId).length > 0;
  return false;
}
function maskPhone(phone) {
  const s = String(phone || '');
  return s.length >= 7 ? s.slice(0, 3) + '****' + s.slice(-4) : s;
}
function maskAddress(addr) {
  const a = Object.assign({}, addr || {});
  if (a.phone) a.phone = maskPhone(a.phone);
  if (a.detail) a.detail = a.detail.replace(/./g, (c, i) => (i < 2 ? c : '*'));
  return a;
}
/** 农户视角：只保留自己的商品行与最低限度收件信息 */
function forFarmer(db, order, farmerId) {
  const items = farmerItems(db, order, farmerId);
  return {
    id: order.id, no: order.no, status: order.status, createdAt: order.createdAt,
    items,
    totalAmount: items.reduce((s, i) => s + i.lineAmount, 0),
    buyer: { name: (order.buyer && order.buyer.name) || '买家', city: (order.buyer && order.buyer.city) || '', phone: maskPhone(order.buyer && order.buyer.phone) },
    address: { city: (order.address && order.address.city) || '', detail: '（履约可见，已脱敏）' },
    shipmentId: order.shipmentId || null, afterSale: order.afterSale || null,
    review: null,
  };
}
function forAdmin(db, order) {
  const n = normalizeOrder(db, order);
  return Object.assign({}, n, { buyer: Object.assign({}, n.buyer, { phone: maskPhone(n.buyer && n.buyer.phone) }), address: maskAddress(n.address) });
}
function forOwner(db, order) {
  return normalizeOrder(db, order);
}

/* ---------------- 购物车 ---------------- */
function cartKey(user, guestId) {
  return user ? 'user:' + user.id : (guestId ? 'guest:' + String(guestId).slice(0, 64) : null);
}
function getCart(db, key) {
  if (!key) return null;
  if (!db.carts[key]) db.carts[key] = { items: [], updatedAt: new Date().toISOString() };
  return db.carts[key];
}
function itemKey(productId, batchId) { return productId + ':' + (batchId || 'na'); }
function cartView(db, cart) {
  const items = (cart.items || []).map((it) => {
    const p = db.products.find((x) => x.id === it.productId);
    const b = db.batches.find((x) => x.id === it.batchId);
    const ok = p && b ? sellable(db, p, b) : { ok: false, reason: '商品或批次不存在' };
    return {
      key: itemKey(it.productId, it.batchId),
      productId: it.productId, batchId: it.batchId, qty: it.qty,
      product: productSnapshot(p), batch: batchSnapshot(b),
      unitPrice: p ? p.price : 0,
      lineAmount: p ? Math.round(p.price * it.qty * 100) / 100 : 0,
      available: b ? available(b) : 0,
      sellable: ok.ok, reason: ok.ok ? '' : ok.reason,
      checked: it.checked !== false,
    };
  });
  const selected = items.filter((i) => i.checked && i.sellable);
  return {
    items,
    count: items.reduce((s, i) => s + i.qty, 0),
    selectedCount: selected.reduce((s, i) => s + i.qty, 0),
    selectedAmount: Math.round(selected.reduce((s, i) => s + i.lineAmount, 0) * 100) / 100,
    totalAmount: Math.round(items.reduce((s, i) => s + i.lineAmount, 0) * 100) / 100,
  };
}
function addToCart(db, key, productId, batchId, qty) {
  const p = db.products.find((x) => x.id === productId);
  const b = batchId ? db.batches.find((x) => x.id === batchId) : pickBatch(db, productId);
  const s = sellable(db, p, b);
  if (!s.ok) return { ok: false, reason: s.reason };
  const cart = getCart(db, key);
  const k = itemKey(p.id, s.batch.id);
  const found = cart.items.find((i) => itemKey(i.productId, i.batchId) === k);
  const want = Math.max(1, Math.min(MAX_QTY, Number(qty) || 1));
  const next = (found ? found.qty : 0) + want;
  if (next > Math.min(MAX_QTY, available(s.batch))) {
    return { ok: false, reason: `最多可购 ${Math.min(MAX_QTY, available(s.batch))} 件` };
  }
  if (found) found.qty = next;
  else cart.items.push({ productId: p.id, batchId: s.batch.id, qty: want, checked: true, addedAt: new Date().toISOString() });
  cart.updatedAt = new Date().toISOString();
  return { ok: true, cart };
}
function updateCartItem(db, key, itemKeyStr, patch) {
  const cart = getCart(db, key);
  const it = cart.items.find((i) => itemKey(i.productId, i.batchId) === itemKeyStr);
  if (!it) return { ok: false, reason: '购物车中没有该商品' };
  if (patch.remove) {
    cart.items = cart.items.filter((i) => i !== it);
  } else {
    if (patch.qty != null) {
      const b = db.batches.find((x) => x.id === it.batchId);
      const max = Math.min(MAX_QTY, available(b));
      const q = Math.max(1, Math.min(max, Number(patch.qty) || 1));
      if (max <= 0) return { ok: false, reason: '库存不足' };
      it.qty = q;
    }
    if (patch.checked != null) it.checked = !!patch.checked;
  }
  cart.updatedAt = new Date().toISOString();
  return { ok: true, cart };
}
function mergeCart(db, guestKey, userKey) {
  const guest = db.carts[guestKey];
  if (!guest) return { merged: 0 };
  const cart = getCart(db, userKey);
  let merged = 0;
  guest.items.forEach((gi) => {
    const k = itemKey(gi.productId, gi.batchId);
    const found = cart.items.find((i) => itemKey(i.productId, i.batchId) === k);
    if (found) found.qty = Math.min(MAX_QTY, found.qty + gi.qty);
    else cart.items.push(Object.assign({}, gi));
    merged += 1;
  });
  delete db.carts[guestKey];
  cart.updatedAt = new Date().toISOString();
  return { merged };
}

/* ---------------- 结算（同步临界区） ---------------- */
function checkout(db, user, address) {
  if (!user || user.role !== 'consumer') return { ok: false, status: 403, reason: '请使用消费者账号结算' };
  const key = cartKey(user, null);
  const cart = getCart(db, key);
  const chosen = cart.items.filter((i) => i.checked !== false);
  if (!chosen.length) return { ok: false, status: 400, reason: '购物车没有勾选商品' };
  // 1) 全量校验（任一失败整单失败）
  const plan = [];
  for (const it of chosen) {
    const p = db.products.find((x) => x.id === it.productId);
    const b = db.batches.find((x) => x.id === it.batchId);
    const s = sellable(db, p, b);
    if (!s.ok) return { ok: false, status: 409, reason: `${p ? p.name : it.productId}：${s.reason}` };
    if (it.qty > available(b)) return { ok: false, status: 409, reason: `${p.name}：库存不足（剩余 ${available(b)} 件）` };
    plan.push({ it, p, b, qty: it.qty });
  }
  // 2) 同 tick 扣减 + 建单（Node 单线程，无 await，天然原子）
  const now = new Date();
  const seq = String(db.orders.length + 1).padStart(2, '0');
  const no = 'DD' + `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}` + seq;
  const items = plan.map(({ it, p, b, qty }) => {
    const unitPrice = p.price;
    b.soldQty = (Number(b.soldQty) || 0) + qty;
    return {
      key: itemKey(p.id, b.id), productId: p.id, batchId: b.id, qty,
      unitPrice, lineAmount: Math.round(unitPrice * qty * 100) / 100,
      productSnapshot: productSnapshot(p), batchSnapshot: batchSnapshot(b),
    };
  });
  const total = Math.round(items.reduce((s, i) => s + i.lineAmount, 0) * 100) / 100;
  const order = {
    id: 'O' + String(Date.now()).slice(-8), no, userId: user.id, items, totalAmount: total, amount: total,
    buyer: { name: address.name, phone: address.phone, city: address.city },
    address: { name: address.name, phone: address.phone, city: address.city, detail: address.detail },
    status: 'paid', payment: 'demo', createdAt: now.toISOString(), shipmentId: null,
  };
  db.orders.push(order);
  // 3) 清掉已购商品
  const boughtKeys = new Set(items.map((i) => i.key));
  cart.items = cart.items.filter((i) => !boughtKeys.has(itemKey(i.productId, i.batchId)));
  cart.updatedAt = now.toISOString();
  return { ok: true, order };
}

/* ---------------- 再次购买 ---------------- */
function buyAgain(db, user, order) {
  if (!isOwner(user, order)) return { ok: false, status: 403, reason: '只能对自己的订单再次购买' };
  const added = [];
  const skipped = [];
  orderItems(db, order).forEach((it) => {
    const p = db.products.find((x) => x.id === it.productId);
    const b = pickBatch(db, it.productId);
    const s = sellable(db, p, b);
    if (!s.ok) { skipped.push({ productId: it.productId, name: (it.productSnapshot && it.productSnapshot.name) || it.productId, reason: s.reason }); return; }
    const r = addToCart(db, cartKey(user, null), it.productId, s.batch.id, it.qty);
    if (r.ok) added.push({ productId: it.productId, name: p.name, qty: it.qty });
    else skipped.push({ productId: it.productId, name: p ? p.name : it.productId, reason: r.reason });
  });
  return { ok: true, added, skipped };
}

/* ---------------- 迁移与种子补齐 ---------------- */
function migrate(db) {
  let changed = false;
  db.users = db.users || [];
  db.users.forEach((u) => {
    if (!u.status) { u.status = 'active'; changed = true; }
    if (!u.nickname) { u.nickname = u.name; changed = true; }
    if (u.farmerId === undefined) { u.farmerId = u.farmerId || null; }
  });
  db.farmers.forEach((f) => { if (!f.status) { f.status = 'active'; changed = true; } });
  db.batches.forEach((b, i) => {
    if (b.stockQty == null) {
      b.stockQty = 80 + ((i * 37) % 120);
      b.stockSource = 'migrated-demo';
      changed = true;
    }
    if (b.soldQty == null) b.soldQty = 0;
  });
  db.orders.forEach((o, idx) => {
    if (!Array.isArray(o.items)) {
      const p = db.products.find((x) => x.id === o.productId);
      const b = db.batches.find((x) => x.id === o.batchId);
      o.items = [{
        key: itemKey(o.productId, o.batchId || 'na'), productId: o.productId, batchId: o.batchId || null,
        qty: o.qty, unitPrice: o.unitPrice, lineAmount: o.amount,
        productSnapshot: productSnapshot(p), batchSnapshot: batchSnapshot(b),
      }];
      o.totalAmount = o.amount;
      if (!o.address) o.address = { name: o.buyer && o.buyer.name, phone: o.buyer && o.buyer.phone, city: o.buyer && o.buyer.city, detail: '（历史订单未保存详细地址）' };
      if (o.userId === undefined) o.userId = null;
      changed = true;
    }
  });
  // 把最早 3 笔订单归给演示消费者 U1001，便于个人中心演示（仅演示数据）
  if (!db._demoOrdersAssigned) {
    db.orders.slice(0, 3).forEach((o) => { if (!o.userId) o.userId = 'U1001'; });
    db._demoOrdersAssigned = true;
    changed = true;
  }
  // 迁移后重算 soldQty（以订单为准，避免种子/迁移不一致）
  const sold = {};
  db.orders.forEach((o) => orderItems(db, o).forEach((i) => { sold[i.batchId] = (sold[i.batchId] || 0) + (Number(i.qty) || 0); }));
  db.batches.forEach((b) => {
    const s = sold[b.id] || 0;
    if (s > (b.soldQty || 0)) { b.soldQty = s; changed = true; }
    if (b.stockQty < b.soldQty) { b.stockQty = b.soldQty + 20; changed = true; }
  });
  db.carts = db.carts || {};
  db.applications = db.applications || [];
  if (!db._commerceVersion) { db._commerceVersion = 1; changed = true; }
  return changed;
}

function traceStats(db) {
  const on = db.products.filter((p) => p.status === 'on');
  const traceable = on.filter((p) => db.batches.some((b) => b.productId === p.id && b.code));
  return { total: on.length, traceable: traceable.length };
}

module.exports = {
  MAX_QTY, available, pickBatch, sellable, productSnapshot, batchSnapshot,
  orderItems, normalizeOrder, isOwner, farmerItems, canView, maskPhone, maskAddress,
  forFarmer, forAdmin, forOwner, cartKey, getCart, cartView, itemKey, addToCart,
  updateCartItem, mergeCart, checkout, buyAgain, migrate, traceStats,
};
