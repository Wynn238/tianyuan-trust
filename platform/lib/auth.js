'use strict';

/**
 * 认证：HttpOnly Cookie 会话 + Argon2 口令 + 旧 SHA-256 自动升级。
 * 保留 HMAC token 作为会话值；浏览器不再把 token 写入 localStorage。
 */
const crypto = require('crypto');
const argon2 = require('argon2');

const TOKENS = new Map(); // sid -> { userId, role, exp }
const TTL_MS = 24 * 60 * 60 * 1000;
const COOKIE = 'ty_session';
const SECRET = process.env.TY_SESSION_SECRET || 'tianyuan-local-session-secret-change-in-production';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (str) => Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

function makeSalt() { return crypto.randomBytes(8).toString('hex'); }
/** 新密码：Argon2id。 */
async function hashNewPassword(password) { return argon2.hash(String(password)); }
/** 旧算法：sha256(salt + '|' + password)，只用于兼容旧账号。 */
function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(salt + '|' + String(password)).digest('hex');
}

function maskPhone(phone) {
  const s = String(phone || '');
  return /^1\d{10}$/.test(s) ? s.slice(0, 3) + '****' + s.slice(7) : s;
}

function roleLabel(role) {
  return role === 'consumer' ? '消费者' : role === 'farmer' ? '农户' : '运营';
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    nickname: user.nickname,
    role: user.role,
    staffRole: user.staffRole || null,
    employeeNo: user.employeeNo || null,
    scope: user.scope || '',
    status: user.status,
    farmerId: user.farmerId || null,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  };
}

function issueToken(user) {
  const sid = crypto.randomBytes(16).toString('hex');
  const payload = b64url(JSON.stringify({ uid: user.id, role: user.role, exp: Date.now() + TTL_MS, sid }));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
  TOKENS.set(sid, { userId: user.id, role: user.role, exp: Date.now() + TTL_MS });
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [payload, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
  const a = Buffer.from(String(sig));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try { data = JSON.parse(fromB64url(payload)); } catch (e) { return null; }
  if (!data || !data.uid || !data.exp || data.exp < Date.now()) return null;
  const rec = TOKENS.get(data.sid);
  if (!rec || rec.exp < Date.now()) return null;
  return data;
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    if (!k) return;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { out[k] = part.slice(i + 1).trim(); }
  });
  return out;
}

function bearerToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

function sessionToken(req) {
  return parseCookies(req)[COOKIE] || bearerToken(req);
}

function userFromRequest(db, req) {
  const payload = verifyToken(sessionToken(req));
  if (!payload) return null;
  return db.users.find((u) => u.id === payload.uid) || null;
}

function setSessionCookie(res, token, secure) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${Math.floor(TTL_MS / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

async function verifyPassword(user, password) {
  const hash = String(user.password || '');
  if (user.passwordAlgo === 'argon2' || hash.startsWith('$argon2')) {
    try { return { ok: await argon2.verify(hash, String(password)), upgraded: null }; } catch (e) { return { ok: false, upgraded: null }; }
  }
  const legacy = hashPassword(password, user.salt || '');
  const a = Buffer.from(legacy);
  const b = Buffer.from(hash);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) return { ok: false, upgraded: null };
  const upgraded = await argon2.hash(String(password));
  return { ok: true, upgraded };
}

/**
 * entry：consumer / farmer / staff（admin 兼容）。
 * 登录入口必须与账号类型一致；不再允许一个入口登录任意角色。
 */
async function login(db, { phone, password, role, entry } = {}) {
  const phoneStr = String(phone || '').trim();
  const entryStr = String(entry || (role === 'admin' ? 'staff' : role) || '').trim();
  if (!phoneStr || !password) {
    const e = new Error('请输入手机号与密码');
    e.status = 400;
    throw e;
  }
  const user = db.users.find((u) => u.phone === phoneStr);
  if (!user) {
    const e = new Error('手机号或密码不正确');
    e.status = 401;
    throw e;
  }
  if (entryStr) {
    const expectedRole = entryStr === 'staff' || entryStr === 'admin' ? 'admin' : entryStr;
    if (user.role !== expectedRole) {
      const e = new Error('该账号不属于当前登录入口');
      e.status = 401;
      throw e;
    }
  }
  if (role && role !== user.role && !(role === 'admin' && user.role === 'admin')) {
    const e = new Error('该账号不属于当前登录入口');
    e.status = 401;
    throw e;
  }
  if (user.status === 'disabled' || user.status === 'left' || user.status === 'deletion_requested') {
    const e = new Error(user.status === 'deletion_requested' ? '账号正在注销处理中' : '账号已停用');
    e.status = 403;
    throw e;
  }
  const v = await verifyPassword(user, password);
  if (!v.ok) {
    const e = new Error('手机号或密码不正确');
    e.status = 401;
    throw e;
  }
  if (v.upgraded) {
    user.password = v.upgraded;
    user.passwordAlgo = 'argon2';
  }
  return { token: issueToken(user), user: publicUser(user), upgraded: !!v.upgraded };
}

function logout(req) {
  const payload = verifyToken(sessionToken(req));
  if (payload && payload.sid) TOKENS.delete(payload.sid);
  return true;
}

module.exports = {
  makeSalt, hashPassword, hashNewPassword, issueToken, verifyToken, bearerToken, sessionToken,
  userFromRequest, login, logout, publicUser, roleLabel, maskPhone, setSessionCookie, clearSessionCookie,
  TTL_MS, COOKIE, _tokens: TOKENS,
};
