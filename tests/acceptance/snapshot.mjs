#!/usr/bin/env node
/**
 * 业务数据快照 / 验收基线
 *
 * 用法：
 *   node tests/acceptance/snapshot.mjs            # 打印当前快照
 *   node tests/acceptance/snapshot.mjs --write    # 写入 tests/acceptance/baseline.json
 *   node tests/acceptance/snapshot.mjs --check    # 与 baseline.json 对比，差异时 exit 1
 *
 * 只统计业务数据表，不输出手机号、密码、密钥或任何行内容。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const DB_PATH = path.join(ROOT, 'platform/data/db.json');
const SQLITE_PATH = path.join(ROOT, 'platform/data/tianyuan.sqlite');
const req = createRequire(path.join(ROOT, 'platform/package.json'));
const BASELINE_PATH = path.join(HERE, 'baseline.json');

// 业务数据表：Phase 改造前后行数与内容必须一致。
// 不含 users / carts / scanLog / scans / settings / demo：
// 这些会因登录、浏览、配置或账号重建而合理变化。
const TABLES = [
  'farmers', 'products', 'batches', 'records', 'tests', 'shipments',
  'orders', 'reviews', 'alerts', 'geos', 'ledger', 'kb', 'applications',
];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(canonical(value));
}

function rowKey(row, index) {
  if (row && row.id != null) return String(row.id);
  if (row && row.height != null) return String(row.height);
  if (row && row.code != null) return String(row.code);
  if (row && row.no != null) return String(row.no);
  return String(index);
}

function snapshot(db) {
  const tables = {};
  let total = 0;
  for (const name of TABLES) {
    const rows = Array.isArray(db[name]) ? db[name].slice() : [];
    const sorted = rows
      .map((row, i) => ({ row, key: rowKey(row, i) }))
      .sort((a, b) => a.key.localeCompare(b.key, 'en'))
      .map((x) => x.row);
    const payload = stableStringify(sorted);
    tables[name] = {
      rows: sorted.length,
      sha256: crypto.createHash('sha256').update(payload).digest('hex'),
    };
    total += sorted.length;
  }
  return { version: 1, tables, total };
}

function readDb() {
  if (fs.existsSync(SQLITE_PATH)) {
    const Database = req('better-sqlite3');
    const conn = new Database(SQLITE_PATH, { readonly: true });
    try {
      const out = {};
      for (const row of conn.prepare('SELECT table_name,data FROM business ORDER BY table_name,row_id').all()) {
        if (!out[row.table_name]) out[row.table_name] = [];
        out[row.table_name].push(JSON.parse(row.data));
      }
      return out;
    } finally { conn.close(); }
  }
  if (!fs.existsSync(DB_PATH)) throw new Error(`找不到数据文件：${SQLITE_PATH}`);
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function diff(current, baseline) {
  const out = [];
  for (const name of TABLES) {
    const a = baseline.tables?.[name];
    const b = current.tables?.[name];
    if (!a || !b) {
      out.push(`${name}: 基线或当前快照缺少该表`);
      continue;
    }
    if (a.rows !== b.rows || a.sha256 !== b.sha256) {
      out.push(`${name}: 基线 ${a.rows} 行/${a.sha256.slice(0, 12)}… → 当前 ${b.rows} 行/${b.sha256.slice(0, 12)}…`);
    }
  }
  return out;
}

const args = new Set(process.argv.slice(2));
const current = snapshot(readDb());

if (args.has('--write')) {
  fs.mkdirSync(HERE, { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n', 'utf8');
  console.log(`baseline 已写入 ${BASELINE_PATH}`);
  console.log(`表数 ${Object.keys(current.tables).length}，总行数 ${current.total}`);
  process.exit(0);
}

if (args.has('--check')) {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`找不到基线：${BASELINE_PATH}`);
    process.exit(2);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const differences = diff(current, baseline);
  if (differences.length) {
    console.error('业务数据与基线不一致：');
    for (const d of differences) console.error(`- ${d}`);
    process.exit(1);
  }
  console.log(`OK：${Object.keys(current.tables).length} 张业务表与基线一致，总行数 ${current.total}`);
  process.exit(0);
}

console.log(JSON.stringify(current, null, 2));
