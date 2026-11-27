import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8848';

function readEnv() {
  const p = path.join(ROOT, '.acceptance.env');
  if (!fs.existsSync(p)) return {};
  return Object.fromEntries(fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
    const i = line.indexOf('=');
    return [line.slice(0, i), line.slice(i + 1)];
  }));
}

const env = readEnv();

async function request(pathname, { method = 'GET', body, cookie, origin } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  const res = await fetch(BASE + pathname, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') || '' };
}

async function login(phone, password, entry) {
  const r = await request('/api/auth/login', { method: 'POST', body: { phone, password, entry } });
  assert.equal(r.status, 200, `login ${entry} failed: ${r.data && r.data.error && r.data.error.message}`);
  const cookie = r.setCookie.split(';')[0];
  assert.match(cookie, /^ty_session=/);
  return { cookie, user: r.data.user };
}

test('未登录访问受保护接口返回 401', async () => {
  for (const p of ['/api/admin/overview', '/api/settings', '/api/orders', '/api/farmer/me/dashboard']) {
    const r = await request(p);
    assert.equal(r.status, 401, p);
  }
});

test('匿名 meta 不返回 demo 与 gmvDemo', async () => {
  const r = await request('/api/meta');
  assert.equal(r.status, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(r.data, 'demo'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(r.data.stats, 'gmvDemo'), false);
});

test('农户 Cookie 会话与数据范围', async () => {
  const farmer = await login('13900000001', '123456', 'farmer');
  assert.equal(farmer.user.role, 'farmer');
  assert.equal(farmer.user.farmerId, 'F01');

  const dash = await request('/api/farmer/me/dashboard', { cookie: farmer.cookie });
  assert.equal(dash.status, 200);
  assert.equal(dash.data.farmer.id, 'F01');

  const orders = await request('/api/orders', { cookie: farmer.cookie });
  assert.equal(orders.status, 200);
  for (const o of orders.data.items) {
    assert.ok(o.items.every((it) => it.productSnapshot && it.productSnapshot.name));
  }

  const admin = await login(env.SUPER_ADMIN_PHONE, env.SUPER_ADMIN_PASSWORD, 'staff');
  const cross = await request('/api/farmer/me/records', {
    method: 'POST', cookie: farmer.cookie,
    body: { batchId: 'B02', type: 'fertilize', title: '越权测试', detail: '不应写入' },
  });
  assert.equal(cross.status, 403);
  const adminDash = await request('/api/farmer/me/dashboard', { cookie: admin.cookie });
  assert.equal(adminDash.status, 403);
});

test('消费者订单按会话过滤，忽略 userId 参数', async () => {
  const c = await login('13800000001', '123456', 'consumer');
  const a = await request('/api/orders', { cookie: c.cookie });
  const b = await request('/api/orders?userId=U1002', { cookie: c.cookie });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.deepEqual((a.data.items || []).map((o) => o.id), (b.data.items || []).map((o) => o.id));
});

test('七类员工权限矩阵的关键格', async () => {
  const superA = await login(env.SUPER_ADMIN_PHONE, env.SUPER_ADMIN_PASSWORD, 'staff');
  const auditor = await login(env.AUDITOR_PHONE, env.AUDITOR_PASSWORD, 'staff');
  const qa = await login(env.QA_PHONE, env.QA_PASSWORD, 'staff');
  const cs = await login(env.CS_PHONE, env.CS_PASSWORD, 'staff');
  const finance = await login(env.FINANCE_PHONE, env.FINANCE_PASSWORD, 'staff');
  const origin = await login(env.ORIGIN_OPS_PHONE, env.ORIGIN_OPS_PASSWORD, 'staff');
  const sys = await login(env.SYS_ADMIN_PHONE, env.SYS_ADMIN_PASSWORD, 'staff');
  assert.equal(superA.user.staffRole, 'super_admin');
  assert.equal(auditor.user.staffRole, 'auditor');
  assert.equal(sys.user.staffRole, 'sys_admin');

  assert.equal((await request('/api/admin/overview', { cookie: superA.cookie })).status, 200);
  assert.equal((await request('/api/admin/overview', { cookie: auditor.cookie })).status, 200);
  assert.equal((await request('/api/admin/overview', { cookie: qa.cookie })).status, 200);
  assert.equal((await request('/api/admin/overview', { cookie: cs.cookie })).status, 403);
  assert.equal((await request('/api/admin/customers', { cookie: cs.cookie })).status, 200);
  assert.equal((await request('/api/admin/profiles/farmers', { cookie: cs.cookie })).status, 403);
  assert.equal((await request('/api/admin/overview', { cookie: finance.cookie })).status, 200);
  assert.equal((await request('/api/admin/overview', { cookie: origin.cookie })).status, 200);

  assert.equal((await request('/api/settings', { cookie: superA.cookie })).status, 403);
  assert.equal((await request('/api/settings', { cookie: auditor.cookie })).status, 403);
  assert.equal((await request('/api/settings', { cookie: sys.cookie })).status, 200);
  assert.equal((await request('/api/admin/settlement', { cookie: finance.cookie })).status, 200);
  assert.equal((await request('/api/admin/roles', { cookie: sys.cookie })).status, 200);

  assert.equal((await request('/api/admin/applications', { cookie: auditor.cookie })).status, 200);
  assert.equal((await request('/api/admin/applications', { cookie: qa.cookie })).status, 403);
  assert.equal((await request('/api/admin/ledger', { cookie: qa.cookie })).status, 200);
  assert.equal((await request('/api/admin/ledger', { cookie: auditor.cookie })).status, 403);
  assert.equal((await request('/api/admin/audit', { cookie: sys.cookie })).status, 200);
  assert.equal((await request('/api/admin/audit', { cookie: superA.cookie })).status, 200);
});

test('Origin 校验与设置密钥脱敏', async () => {
  const bad = await fetch(BASE + '/api/cart/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: '{}',
  });
  assert.equal(bad.status, 403);
  const sys = await login(env.SYS_ADMIN_PHONE, env.SYS_ADMIN_PASSWORD, 'staff');
  const settings = await request('/api/settings', { cookie: sys.cookie });
  assert.equal(settings.status, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(settings.data.llm, 'apiKey'), false);
});
