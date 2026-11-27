'use strict';
const crypto = require('crypto');

const GENESIS = '0'.repeat(64);

function canonical(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

function coreOf(r) {
  return {
    batchId: r.batchId,
    type: r.type,
    at: r.at,
    title: r.title,
    detail: r.detail,
    operator: r.operator,
    method: r.method,
    evidence: r.evidence || [],
  };
}

function hashOf(prev, core) {
  return crypto.createHash('sha256').update(prev + '|' + canonical(core)).digest('hex');
}

/** 按时间顺序为某批次记录建链，写入 hash / prevHash / tx / height */
function build(records) {
  let prev = GENESIS;
  return records.map((r) => {
    const h = hashOf(prev, coreOf(r));
    r.prevHash = prev;
    r.hash = h;
    r.tx = '0x' + h.slice(0, 16);
    prev = h;
    return r;
  });
}

/** 重算校验：返回逐节点结果 */
function verify(records) {
  let prev = GENESIS;
  const nodes = [];
  let tamperedIndex = -1;
  records.forEach((r, i) => {
    const computed = hashOf(prev, coreOf(r));
    const ok = computed === r.hash && r.prevHash === prev;
    if (!ok && tamperedIndex < 0) tamperedIndex = i;
    nodes.push({
      index: i + 1,
      id: r.id,
      title: r.title,
      stored: r.hash,
      computed,
      prevOk: r.prevHash === prev,
      ok,
    });
    prev = r.hash;
  });
  return { ok: tamperedIndex < 0, total: records.length, tamperedIndex, nodes };
}

module.exports = { GENESIS, build, verify, hashOf, coreOf };
