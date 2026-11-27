'use strict';

/**
 * SQLite 持久化 + 账号 / 角色 / 权限 / 审计。
 *
 * 设计取舍（Phase 0）：
 * - 业务表先以 (table_name, row_id, data) 形式存入 SQLite，保持现有业务代码的数组对象结构；
 * - 账号拆成 staff / consumer / farmer_account，由 db.users 兼容层供现有路由使用；
 * - 角色、权限、审计、id_mapping 是真正的 SQL 表；
 * - 数据从 db.json 一次性导入，之后 SQLite 为唯一写入源，db.json 保留为迁移前备份。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const argon2 = require('argon2');
const secrets = require('./secrets');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const JSON_PATH = path.join(DATA_DIR, 'db.json');
const SQLITE_PATH = path.join(DATA_DIR, 'tianyuan.sqlite');
const ENV_PATH = path.join(ROOT, '..', '.acceptance.env');

const PERMISSIONS = {
  'admin.overview': ['菜单', '经营总览'],
  'product.review': ['操作', '商品审核'],
  'farmer.review': ['操作', '农户入驻审核'],
  'alert.resolve': ['操作', '预警处置'],
  'ledger.view': ['菜单', '链账本'],
  'geos.view': ['菜单', '地理标志库'],
  'order.view': ['菜单', '订单查询'],
  'cs.view': ['菜单', '客服 360 与工单'],
  'settlement.view': ['菜单', '分账与提现'],
  'reconcile.view': ['菜单', '对账'],
  'staff.manage': ['操作', '账号与角色管理'],
  'role.manage': ['操作', '角色与权限管理'],
  'settings.llm': ['操作', '大模型设置'],
  'audit.view': ['菜单', '审计日志'],
  'demo.view': ['操作', '演示路径可见'],
  'demo.tamper': ['操作', '篡改演示'],
  'origin.scope': ['数据', '所辖产地数据范围'],
};

const ROLES = {
  super_admin: ['平台超管', '除大模型设置外的全部模块'],
  auditor: ['审核专员', '商品审核、农户入驻审核、订单查询'],
  qa: ['质检溯源专员', '预警处置、链账本、地理标志库、订单查询'],
  cs: ['客服', '客服 360、工单、订单查询'],
  finance: ['财务', '分账、提现审核、对账'],
  origin_ops: ['产地运营', '所辖产地商品审核、农户管理、订单与经营看板'],
  sys_admin: ['系统管理员', '账号与角色、大模型设置、审计日志、篡改演示'],
};

const ROLE_PERMISSIONS = {
  super_admin: Object.keys(PERMISSIONS).filter((p) => p !== 'settings.llm' && p !== 'demo.tamper'),
  auditor: ['admin.overview', 'product.review', 'farmer.review', 'order.view', 'demo.view'],
  qa: ['admin.overview', 'alert.resolve', 'ledger.view', 'geos.view', 'order.view', 'demo.view'],
  cs: ['cs.view', 'order.view', 'demo.view'],
  finance: ['admin.overview', 'settlement.view', 'reconcile.view', 'order.view', 'demo.view'],
  origin_ops: ['admin.overview', 'product.review', 'farmer.review', 'order.view', 'origin.scope', 'demo.view'],
  sys_admin: ['admin.overview', 'ledger.view', 'geos.view', 'staff.manage', 'role.manage', 'settings.llm', 'audit.view', 'demo.view', 'demo.tamper'],
};

const ARRAY_TABLES = [
  'farmers', 'products', 'batches', 'records', 'tests', 'shipments', 'orders',
  'reviews', 'alerts', 'geos', 'kb', 'applications', 'ledger', 'carts', 'scanLog',
];
const OBJECT_KEYS = ['version', 'createdAt', 'demo', 'settings', 'counters', 'scans', 'breakdown', '_demoOrdersAssigned', '_commerceVersion'];

let conn = null;

function open() {
  if (conn) return conn;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  conn = new Database(SQLITE_PATH);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.pragma('busy_timeout = 5000');
  schema(conn);
  return conn;
}

function schema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS business (
      table_name TEXT NOT NULL,
      row_id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (table_name, row_id)
    );
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS role (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS permission (
      code TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS role_permission (
      role_code TEXT NOT NULL,
      permission_code TEXT NOT NULL,
      PRIMARY KEY (role_code, permission_code)
    );
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      employee_no TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_algo TEXT NOT NULL DEFAULT 'argon2',
      salt TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      role_code TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT '',
      supervisor_id TEXT,
      joined_at TEXT,
      left_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS staff_role (
      staff_id TEXT NOT NULL,
      role_code TEXT NOT NULL,
      PRIMARY KEY (staff_id, role_code)
    );
    CREATE TABLE IF NOT EXISTS consumer (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_algo TEXT NOT NULL DEFAULT 'sha256',
      salt TEXT,
      nickname TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS farmer_account (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_algo TEXT NOT NULL DEFAULT 'sha256',
      salt TEXT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      farmer_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS farmer (
      farmer_id TEXT PRIMARY KEY,
      subject_type TEXT,
      name TEXT NOT NULL,
      owner TEXT,
      id_card_enc TEXT,
      plots TEXT,
      main_category TEXT,
      region TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      cert_level TEXT,
      fulfillment_score REAL DEFAULT 0,
      account_id TEXT
    );
    CREATE TABLE IF NOT EXISTS consent_record (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      granted INTEGER NOT NULL,
      at TEXT NOT NULL,
      source TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      at TEXT NOT NULL,
      action TEXT NOT NULL,
      object_type TEXT,
      object_id TEXT,
      before TEXT,
      after TEXT,
      ip TEXT,
      prev_hash TEXT,
      hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS id_mapping (
      legacy_id TEXT PRIMARY KEY,
      new_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS favorite (
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS profile_snapshot (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settlement_state (
      order_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      paid_at TEXT,
      operator_id TEXT,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS support_ticket (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      order_id TEXT,
      type TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'normal',
      handler_id TEXT,
      resolution TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notification (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS event_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      session_id TEXT,
      type TEXT NOT NULL,
      object_type TEXT,
      object_id TEXT,
      query TEXT,
      at TEXT NOT NULL,
      meta TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_business_table ON business(table_name);
    CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
    CREATE INDEX IF NOT EXISTS idx_event_at ON event_log(at);
    CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_ticket_user ON support_ticket(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_ticket_status ON support_ticket(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_event_user ON event_log(user_id, at);
  `);

  const insPerm = db.prepare('INSERT OR IGNORE INTO permission(code,type,description) VALUES (?,?,?)');
  for (const [code, [type, desc]] of Object.entries(PERMISSIONS)) insPerm.run(code, type, desc);
  const insRole = db.prepare('INSERT OR IGNORE INTO role(code,name,description) VALUES (?,?,?)');
  for (const [code, [name, desc]] of Object.entries(ROLES)) insRole.run(code, name, desc);
  const seeded = db.prepare("SELECT value FROM app_state WHERE key='roles_seeded'").get();
  if (!seeded) {
    db.exec('DELETE FROM role_permission');
    const insRP = db.prepare('INSERT OR IGNORE INTO role_permission(role_code,permission_code) VALUES (?,?)');
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) for (const p of perms) insRP.run(role, p);
    db.prepare('INSERT OR REPLACE INTO app_state(key,value) VALUES (?,?)').run('roles_seeded', '1');
  }
}

function ensureSaltColumns(db) {
  for (const table of ['staff', 'consumer', 'farmer_account']) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN salt TEXT`); } catch (e) { /* already exists */ }
  }
}

function repairLegacySalts(db) {
  if (!fs.existsSync(JSON_PATH)) return;
  let json;
  try { json = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')); } catch (e) { return; }
  const users = Array.isArray(json.users) ? json.users : [];
  const tx = db.transaction(() => {
    for (const u of users) {
      if (!u.salt) continue;
      if (u.role === 'consumer') db.prepare("UPDATE consumer SET salt=? WHERE id=? AND (salt IS NULL OR salt='')").run(u.salt, u.id);
      else if (u.role === 'farmer') db.prepare("UPDATE farmer_account SET salt=? WHERE id=? AND (salt IS NULL OR salt='')").run(u.salt, u.id);
      else if (u.role === 'admin') db.prepare("UPDATE staff SET salt=? WHERE id=? AND (salt IS NULL OR salt='')").run(u.salt, u.id);
    }
  });
  tx();
}

function rowId(row, index) {
  if (row && row.id != null) return String(row.id);
  if (row && row.height != null) return String(row.height);
  if (row && row.code != null) return String(row.code);
  if (row && row.no != null) return String(row.no);
  return String(index);
}

function importObject(db, json) {
  const tx = db.transaction(() => {
    for (const name of ARRAY_TABLES) {
      if (!Array.isArray(json[name])) continue;
      json[name].forEach((row, i) => {
        db.prepare('INSERT OR REPLACE INTO business(table_name,row_id,data) VALUES (?,?,?)')
          .run(name, rowId(row, i), JSON.stringify(row));
      });
    }
    for (const key of OBJECT_KEYS) {
      if (json[key] !== undefined) {
        db.prepare('INSERT OR REPLACE INTO app_state(key,value) VALUES (?,?)')
          .run(key, JSON.stringify(json[key]));
      }
    }
    if (Array.isArray(json.users)) {
      db.prepare('INSERT OR REPLACE INTO app_state(key,value) VALUES (?,?)')
        .run('__legacy_users', JSON.stringify(json.users));
    }
  });
  tx();
}

function importJson(db) {
  if (!fs.existsSync(JSON_PATH)) return null;
  const json = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  importObject(db, json);
  return json;
}
function readState(db) {
  const out = {};
  for (const row of db.prepare('SELECT key,value FROM app_state').all()) out[row.key] = JSON.parse(row.value);
  return out;
}

function readBusiness(db) {
  const out = {};
  for (const name of ARRAY_TABLES) out[name] = [];
  for (const row of db.prepare('SELECT table_name,row_id,data FROM business ORDER BY table_name,row_id').all()) {
    if (!out[row.table_name]) out[row.table_name] = [];
    out[row.table_name].push(JSON.parse(row.data));
  }
  return out;
}

function rolePermissions(db, roleCode) {
  return db.prepare(`SELECT permission_code FROM role_permission WHERE role_code=? ORDER BY permission_code`)
    .all(roleCode).map((r) => r.permission_code);
}

function loadAccounts(db) {
  const users = [];
  for (const s of db.prepare('SELECT * FROM staff').all()) {
    users.push({
      id: s.id, phone: s.phone, name: s.name, nickname: s.name,
      role: 'admin', staffRole: s.role_code, permissions: rolePermissions(db, s.role_code),
      employeeNo: s.employee_no, status: s.status, scope: s.scope,
      password: s.password_hash, passwordAlgo: s.password_algo, salt: s.salt,
      createdAt: s.created_at, joinedAt: s.joined_at,
    });
  }
  for (const c of db.prepare('SELECT * FROM consumer').all()) {
    users.push({
      id: c.id, phone: c.phone, name: c.nickname || c.phone, nickname: c.nickname || c.phone,
      role: 'consumer', status: c.status, password: c.password_hash, passwordAlgo: c.password_algo, salt: c.salt,
      createdAt: c.created_at,
    });
  }
  for (const f of db.prepare('SELECT * FROM farmer_account').all()) {
    users.push({
      id: f.id, phone: f.phone, name: f.name, nickname: f.name,
      role: 'farmer', status: f.status, farmerId: f.farmer_id,
      password: f.password_hash, passwordAlgo: f.password_algo, salt: f.salt, createdAt: f.created_at,
    });
  }
  return users;
}

function syncAccounts(db, data) {
  const tx = db.transaction(() => {
    const users = Array.isArray(data.users) ? data.users : [];
    for (const u of users) {
      const at = u.createdAt || new Date().toISOString();
      if (u.role === 'admin') {
        const role = u.staffRole || 'super_admin';
        const emp = u.employeeNo || ('S' + String(u.id).replace(/\D/g, '').slice(-5));
        db.prepare(`INSERT INTO staff(id,employee_no,name,phone,password_hash,password_algo,salt,status,role_code,scope,supervisor_id,joined_at,left_at,created_at)
          VALUES (@id,@employee_no,@name,@phone,@password_hash,@password_algo,@salt,@status,@role_code,@scope,@supervisor_id,@joined_at,@left_at,@created_at)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone, password_hash=excluded.password_hash, password_algo=excluded.password_algo, salt=excluded.salt, status=excluded.status, role_code=excluded.role_code, scope=excluded.scope, supervisor_id=excluded.supervisor_id, left_at=excluded.left_at`)
          .run({
            id: u.id, employee_no: emp, name: u.name || u.nickname || u.phone, phone: u.phone,
            password_hash: u.password, password_algo: u.passwordAlgo || 'sha256', salt: u.salt || null,
            status: u.status || 'active', role_code: role, scope: u.scope || '',
            supervisor_id: u.supervisorId || null, joined_at: u.joinedAt || at, left_at: u.leftAt || null, created_at: at,
          });
        db.prepare('INSERT OR REPLACE INTO staff_role(staff_id,role_code) VALUES (?,?)').run(u.id, role);
      } else if (u.role === 'farmer') {
        db.prepare(`INSERT INTO farmer_account(id,phone,password_hash,password_algo,salt,name,status,farmer_id,created_at)
          VALUES (?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET phone=excluded.phone, password_hash=excluded.password_hash, password_algo=excluded.password_algo, salt=excluded.salt, name=excluded.name, status=excluded.status, farmer_id=excluded.farmer_id`)
          .run(u.id, u.phone, u.password, u.passwordAlgo || 'sha256', u.salt || null, u.name || u.nickname || u.phone, u.status || 'pending', u.farmerId || null, at);
      } else {
        db.prepare(`INSERT INTO consumer(id,phone,password_hash,password_algo,salt,nickname,status,created_at)
          VALUES (?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET phone=excluded.phone, password_hash=excluded.password_hash, password_algo=excluded.password_algo, salt=excluded.salt, nickname=excluded.nickname, status=excluded.status`)
          .run(u.id, u.phone, u.password, u.passwordAlgo || 'sha256', u.salt || null, u.nickname || u.name || u.phone, u.status || 'active', at);
      }
      if (u.id) db.prepare('INSERT OR IGNORE INTO id_mapping(legacy_id,new_id,kind,note) VALUES (?,?,?,?)')
        .run(u.id, u.id, u.role, 'migration: same id');
    }

    const farmers = Array.isArray(data.farmers) ? data.farmers : [];
    for (const f of farmers) {
      const account = users.find((u) => u.farmerId === f.id);
      db.prepare(`INSERT INTO farmer(farmer_id,subject_type,name,owner,id_card_enc,plots,main_category,region,status,cert_level,fulfillment_score,account_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(farmer_id) DO UPDATE SET name=excluded.name, owner=excluded.owner, plots=excluded.plots, main_category=excluded.main_category, region=excluded.region, status=excluded.status, cert_level=excluded.cert_level, fulfillment_score=excluded.fulfillment_score, account_id=excluded.account_id`)
        .run(f.farmer_id || f.id, f.type || 'B', f.name || '', f.owner || f.name || '',
          null, JSON.stringify(f.plots || f.plot || []), f.mainCategory || '', JSON.stringify(f.region || {}),
          f.status || 'active', f.certLevel || '', Number(f.rating) || 0, account ? account.id : null);
    }
  });
  tx();
}

function randomPassword() {
  return crypto.randomBytes(12).toString('base64url');
}

async function seedStaff(db) {
  const env = {};
  if (fs.existsSync(ENV_PATH)) {
    for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
    }
  }
  const existing = db.prepare('SELECT id,phone,role_code FROM staff').all();
  const byRole = new Map(existing.map((x) => [x.role_code, x]));

  async function ensure(role, row, phone, name) {
    const key = role.toUpperCase();
    if (!env[`${key}_PHONE`]) env[`${key}_PHONE`] = phone;
    if (!env[`${key}_PASSWORD`]) {
      const password = randomPassword();
      const hash = await argon2.hash(password);
      if (row) db.prepare('UPDATE staff SET password_hash=?, password_algo=? WHERE id=?').run(hash, 'argon2', row.id);
      env[`${key}_PASSWORD`] = password;
    }
    if (row) return row;
    const passwordHash = await argon2.hash(env[`${key}_PASSWORD`]);
    const id = role === 'super_admin' ? 'S1000' : 'S' + String(1001 + ['auditor','qa','cs','finance','origin_ops','sys_admin'].indexOf(role));
    db.prepare(`INSERT INTO staff(id,employee_no,name,phone,password_hash,password_algo,status,role_code,scope,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, id, name, phone, passwordHash, 'argon2', 'active', role, role === 'origin_ops' ? '安徽省' : '', new Date().toISOString());
    db.prepare('INSERT OR REPLACE INTO staff_role(staff_id,role_code) VALUES (?,?)').run(id, role);
    return { id, phone, role_code: role };
  }

  let superRow = byRole.get('super_admin');
  if (!superRow) {
    const legacy = db.prepare('SELECT value FROM app_state WHERE key=?').get('__legacy_users');
    let legacyAdmin = null;
    if (legacy) {
      try { legacyAdmin = (JSON.parse(legacy.value) || []).find((u) => u.role === 'admin'); } catch (e) { /* ignore */ }
    }
    superRow = await ensure('super_admin', null, legacyAdmin ? legacyAdmin.phone : '13700000000', '平台超管');
  } else {
    await ensure('super_admin', superRow, superRow.phone, '平台超管');
  }

  const extra = [
    ['auditor', '审核专员', '13700000001'],
    ['qa', '质检溯源专员', '13700000002'],
    ['cs', '客服', '13700000003'],
    ['finance', '财务', '13700000004'],
    ['origin_ops', '产地运营', '13700000005'],
    ['sys_admin', '系统管理员', '13700000006'],
  ];
  for (const [role, name, phone] of extra) {
    const row = byRole.get(role);
    await ensure(role, row || null, row ? row.phone : phone, name);
  }

  const lines = Object.entries(env).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`);
  if (lines.length) {
    fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf8');
    try {
      const gi = path.join(ROOT, '..', '.gitignore');
      const old = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
      if (!old.split(/\r?\n/).includes('.acceptance.env')) fs.writeFileSync(gi, old + (old.endsWith('\n') ? '' : '\n') + '.acceptance.env\n', 'utf8');
    } catch (e) { /* ignore */ }
  }
}
async function load() {
  const db = open();
  ensureSaltColumns(db);
  repairLegacySalts(db);
  let json = null;
  const businessCount = db.prepare('SELECT COUNT(*) c FROM business').get().c;
  if (businessCount === 0) {
    json = importJson(db);
    if (!json) {
      json = require('../data/seed')();
      importObject(db, json);
    }
  }
  const state = readState(db);
  const business = readBusiness(db);
  const data = Object.assign({}, state, business);

  let users = loadAccounts(db);
  if (!users.length) {
    const raw = state.__legacy_users || (json && json.users) || [];
    users = raw.map((u) => ({ ...u, passwordAlgo: u.passwordAlgo || 'sha256' }));
    data.users = users;
    syncAccounts(db, data);
    users = loadAccounts(db);
  }
  await seedStaff(db);
  users = loadAccounts(db);
  data.users = users;
  if (data.settings && data.settings.llm && data.settings.llm.apiKey) {
    data.settings.llm.apiKey = secrets.decrypt(data.settings.llm.apiKey);
  }
  data._sqlite = true;
  return data;
}

function save(data) {
  const db = open();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM business').run();
    for (const name of ARRAY_TABLES) {
      const rows = Array.isArray(data[name]) ? data[name] : [];
      rows.forEach((row, i) => {
        db.prepare('INSERT OR REPLACE INTO business(table_name,row_id,data) VALUES (?,?,?)')
          .run(name, rowId(row, i), JSON.stringify(row));
      });
    }
    const states = {};
    for (const key of OBJECT_KEYS) {
      if (data[key] !== undefined) states[key] = data[key];
    }
    if (states.settings && states.settings.llm && states.settings.llm.apiKey && !String(states.settings.llm.apiKey).startsWith(secrets.PREFIX)) {
      states.settings = JSON.parse(JSON.stringify(states.settings));
      states.settings.llm.apiKey = secrets.encrypt(states.settings.llm.apiKey);
    }
    for (const [key, value] of Object.entries(states)) {
      db.prepare('INSERT OR REPLACE INTO app_state(key,value) VALUES (?,?)').run(key, JSON.stringify(value));
    }
    syncAccounts(db, data);
  });
  tx();
}

function audit(db, { actorId, action, objectType, objectId, before, after, ip }) {
  const at = new Date().toISOString();
  const prev = db.prepare('SELECT hash FROM audit_log ORDER BY at DESC, id DESC LIMIT 1').get();
  const prevHash = prev ? prev.hash : '';
  const payload = JSON.stringify({ actorId, at, action, objectType, objectId, before, after, prevHash });
  const hash = crypto.createHash('sha256').update(payload).digest('hex');
  const id = 'A' + Date.now() + crypto.randomBytes(3).toString('hex');
  db.prepare(`INSERT INTO audit_log(id,actor_id,at,action,object_type,object_id,before,after,ip,prev_hash,hash)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, actorId || null, at, action, objectType || null, objectId || null,
    before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), ip || null, prevHash, hash);
  return { id, hash };
}

function auditList(db, limit = 100) {
  return db.prepare('SELECT id,actor_id,at,action,object_type,object_id,ip,prev_hash,hash FROM audit_log ORDER BY at DESC LIMIT ?').all(Math.min(500, Math.max(1, Number(limit) || 100)));
}


function recordConsent(userId, type, granted, source) {
  const db = open();
  const id = 'C' + Date.now() + crypto.randomBytes(3).toString('hex');
  db.prepare('INSERT INTO consent_record(id,user_id,type,granted,at,source) VALUES (?,?,?,?,?,?)')
    .run(id, userId, type, granted ? 1 : 0, new Date().toISOString(), source || 'account');
  return { id, type, granted: !!granted };
}

function listConsents(userId) {
  return open().prepare('SELECT type,granted,at,source FROM consent_record WHERE user_id=? ORDER BY at DESC').all(userId)
    .map((r) => ({ ...r, granted: !!r.granted }));
}


function logEvent({ userId, sessionId, type, objectType, objectId, query, meta }) {
  const db = open();
  const id = 'E' + Date.now() + crypto.randomBytes(3).toString('hex');
  db.prepare('INSERT INTO event_log(id,user_id,session_id,type,object_type,object_id,query,at,meta) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, userId || null, sessionId || null, String(type), objectType || null, objectId || null, query || null, new Date().toISOString(), meta ? JSON.stringify(meta) : null);
  return { id };
}

function eventSummary(userId) {
  const db = open();
  const rows = db.prepare('SELECT type,object_id,at FROM event_log WHERE user_id=? ORDER BY at DESC LIMIT 500').all(userId);
  const byType = {};
  for (const r of rows) byType[r.type] = (byType[r.type] || 0) + 1;
  return { count: rows.length, byType, lastAt: rows[0] ? rows[0].at : null, productIds: [...new Set(rows.filter((r) => r.type === 'product_view' && r.object_id).map((r) => r.object_id))] };
}


function notify(userId, type, title, body, link) {
  if (!userId) return null;
  const db = open();
  const id = 'N' + Date.now() + crypto.randomBytes(3).toString('hex');
  db.prepare('INSERT INTO notification(id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, userId, type, String(title).slice(0, 100), String(body || '').slice(0, 500), link || '', new Date().toISOString());
  return { id };
}

function listNotifications(userId, limit) {
  return open().prepare('SELECT id,type,title,body,link,read_at,created_at FROM notification WHERE user_id=? ORDER BY created_at DESC LIMIT ?')
    .all(userId, Math.min(50, Math.max(1, Number(limit) || 20)))
    .map((r) => ({ ...r, read: !!r.read_at }));
}

function markNotificationRead(userId, id) {
  return open().prepare('UPDATE notification SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL')
    .run(new Date().toISOString(), id, userId).changes;
}


function createTicket({ userId, orderId, type, subject, description }) {
  const db = open();
  const id = 'T' + Date.now() + crypto.randomBytes(2).toString('hex');
  const at = new Date().toISOString();
  db.prepare('INSERT INTO support_ticket(id,user_id,order_id,type,subject,description,status,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id, userId, orderId || null, type || 'other', String(subject).slice(0, 80), String(description || '').slice(0, 1000), 'open', 'normal', at, at);
  return { id, status: 'open', createdAt: at };
}

function listTickets(userId) {
  const db = open();
  if (userId) return db.prepare('SELECT * FROM support_ticket WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(userId);
  return db.prepare('SELECT * FROM support_ticket ORDER BY created_at DESC LIMIT 200').all();
}

function updateTicket(id, { status, resolution, handlerId }) {
  const db = open();
  const ticket = db.prepare('SELECT * FROM support_ticket WHERE id=?').get(id);
  if (!ticket) return null;
  db.prepare('UPDATE support_ticket SET status=?, resolution=?, handler_id=?, updated_at=? WHERE id=?')
    .run(status || ticket.status, resolution != null ? String(resolution).slice(0, 1000) : ticket.resolution, handlerId || ticket.handler_id, new Date().toISOString(), id);
  return db.prepare('SELECT * FROM support_ticket WHERE id=?').get(id);
}


function settlementStates() {
  return open().prepare('SELECT * FROM settlement_state').all();
}

function markSettled(orderId, operatorId, note) {
  const db = open();
  const at = new Date().toISOString();
  db.prepare('INSERT INTO settlement_state(order_id,status,paid_at,operator_id,note) VALUES (?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET status=excluded.status, paid_at=excluded.paid_at, operator_id=excluded.operator_id, note=excluded.note')
    .run(orderId, 'paid', at, operatorId || null, String(note || '').slice(0, 200));
  return { orderId, status: 'paid', paidAt: at };
}


function rolePermissionsFor(code) {
  return rolePermissions(open(), code);
}


function saveProfileSnapshot(kind, data) {
  const db = open();
  const id = 'PS' + Date.now() + crypto.randomBytes(3).toString('hex');
  db.prepare('INSERT INTO profile_snapshot(id,kind,data,created_at) VALUES (?,?,?,?)')
    .run(id, kind, JSON.stringify(data), new Date().toISOString());
  return { id, kind, createdAt: new Date().toISOString() };
}

function latestProfileSnapshot(kind) {
  const row = open().prepare('SELECT * FROM profile_snapshot WHERE kind=? ORDER BY created_at DESC LIMIT 1').get(kind);
  if (!row) return null;
  return { id: row.id, kind: row.kind, createdAt: row.created_at, data: JSON.parse(row.data) };
}


function approvalEvents(limit) {
  const rows = open().prepare("SELECT actor_id,at,action,object_type,object_id,after FROM audit_log WHERE action IN ('farmer.review','product.review') ORDER BY at DESC, id DESC LIMIT ?")
    .all(Math.min(500, Math.max(1, Number(limit) || 200)));
  return rows.map((r) => {
    let after = {};
    try { after = r.after ? JSON.parse(r.after) : {}; } catch (e) { after = {}; }
    return { actorId: r.actor_id, at: r.at, action: r.action, objectType: r.object_type, objectId: r.object_id, status: after.status || '', reason: after.reason || '', farmerId: after.farmerId || '' };
  });
}


function toggleFavorite(userId, productId) {
  const db = open();
  const exists = db.prepare('SELECT 1 FROM favorite WHERE user_id=? AND product_id=?').get(userId, productId);
  if (exists) {
    db.prepare('DELETE FROM favorite WHERE user_id=? AND product_id=?').run(userId, productId);
    return { favorited: false };
  }
  db.prepare('INSERT INTO favorite(user_id,product_id,created_at) VALUES (?,?,?)').run(userId, productId, new Date().toISOString());
  return { favorited: true };
}

function favoriteProductIds(userId) {
  return open().prepare('SELECT product_id FROM favorite WHERE user_id=? ORDER BY created_at DESC').all(userId).map((r) => r.product_id);
}

module.exports = {
  SQLITE_PATH, JSON_PATH, ENV_PATH,
  PERMISSIONS, ROLES, ROLE_PERMISSIONS,
  open, load, save, audit, auditList, recordConsent, listConsents, logEvent, eventSummary, rolePermissionsFor, notify, listNotifications, markNotificationRead, createTicket, listTickets, updateTicket, settlementStates, markSettled, saveProfileSnapshot, latestProfileSnapshot, approvalEvents, toggleFavorite, favoriteProductIds, randomPassword,
};
