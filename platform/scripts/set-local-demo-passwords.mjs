/**
 * 本地演示专用：把所有账号密码重置为同一个值。
 * 默认拒绝在 NODE_ENV=production 下执行。
 * 用法：
 *   $env:DEMO_PASSWORD='...'; node scripts/set-local-demo-passwords.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import Database from 'better-sqlite3';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DB_PATH = path.join(ROOT, 'data', 'tianyuan.sqlite');
const ENV_PATH = path.resolve(ROOT, '..', '.acceptance.env');

if (process.env.NODE_ENV === 'production') {
  console.error('拒绝执行：这是本地演示脚本，不能在生产环境把密码重置为统一弱口令。');
  process.exit(1);
}
const password = process.env.DEMO_PASSWORD || process.argv[2];
if (!password || String(password).length < 6) {
  console.error('请通过 DEMO_PASSWORD 或第一个参数提供至少 6 位密码。');
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
const hash = await argon2.hash(String(password));
const tx = db.transaction(() => {
  const staff = db.prepare('UPDATE staff SET password_hash=?, password_algo=?, salt=NULL').run(hash, 'argon2').changes;
  const consumers = db.prepare('UPDATE consumer SET password_hash=?, password_algo=?, salt=NULL').run(hash, 'argon2').changes;
  const farmers = db.prepare('UPDATE farmer_account SET password_hash=?, password_algo=?, salt=NULL').run(hash, 'argon2').changes;
  return { staff, consumers, farmers };
});
const counts = tx();
db.close();

// 同步员工测试账号文件；只保留角色 key，不写入回复。
const roleKeys = ['SUPER_ADMIN', 'AUDITOR', 'QA', 'CS', 'FINANCE', 'ORIGIN_OPS', 'SYS_ADMIN'];
if (fs.existsSync(ENV_PATH)) {
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).filter(Boolean);
  const map = Object.fromEntries(lines.map((line) => {
    const i = line.indexOf('=');
    return [line.slice(0, i), line.slice(i + 1)];
  }));
  for (const key of roleKeys) {
    if (map[`${key}_PHONE`]) map[`${key}_PASSWORD`] = String(password);
  }
  fs.writeFileSync(ENV_PATH, Object.entries(map).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', 'utf8');
}

console.log(`已重置：员工 ${counts.staff} / 消费者 ${counts.consumers} / 农户 ${counts.farmers}`);
console.log('仅限本地演示；上线前必须重新生成随机密码。');
