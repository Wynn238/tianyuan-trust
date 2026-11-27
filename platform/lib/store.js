'use strict';

const database = require('./database');

let db = null;

/**
 * 异步加载：首次启动会把 db.json 导入 SQLite，之后 SQLite 是唯一写入源。
 * 兼容原调用方的 db 形状（users 由账号表重建）。
 */
async function load() {
  if (db) return db;
  db = await database.load();
  return db;
}

function save() {
  if (!db) throw new Error('数据库尚未初始化');
  database.save(db);
}

function reset() {
  throw new Error('Phase 0 起不再通过删除 db.json 重置；请使用受控的数据库重置脚本');
}

module.exports = { load, save, reset, DB_PATH: database.SQLITE_PATH };
