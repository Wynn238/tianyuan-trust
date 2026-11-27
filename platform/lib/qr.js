'use strict';
/* 轻量二维码编码器（字节模式，纠错等级 M，版本 1—10，掩码 0）
   仅用于生成溯源码标签，无第三方依赖。 */

const SPEC = {
  1: { total: 26, ecc: 10, groups: [[1, 16]] },
  2: { total: 44, ecc: 16, groups: [[1, 28]] },
  3: { total: 70, ecc: 26, groups: [[1, 44]] },
  4: { total: 100, ecc: 18, groups: [[2, 32]] },
  5: { total: 134, ecc: 24, groups: [[2, 43]] },
  6: { total: 172, ecc: 16, groups: [[4, 27]] },
  7: { total: 196, ecc: 18, groups: [[4, 31]] },
  8: { total: 242, ecc: 22, groups: [[2, 38], [2, 39]] },
  9: { total: 292, ecc: 22, groups: [[3, 36], [2, 37]] },
  10: { total: 346, ecc: 26, groups: [[4, 43], [1, 44]] },
};
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

/* GF(256) */
const EXP = new Array(512), LOG = new Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function rsGenerator(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, eccLen) {
  const gen = rsGenerator(eccLen);
  const res = new Array(eccLen).fill(0);
  for (const b of data) {
    const factor = b ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < eccLen; i++) res[i] ^= mul(gen[i + 1], factor);
  }
  return res;
}

function encodeData(bytes, version) {
  const spec = SPEC[version];
  const dataCap = spec.groups.reduce((s, [n, d]) => s + n * d, 0);
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach((b) => push(b, 8));
  const maxBits = dataCap * 8;
  push(0, Math.min(4, maxBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    codewords.push(v);
  }
  const pad = [0xec, 0x11];
  let pi = 0;
  while (codewords.length < dataCap) codewords.push(pad[pi++ % 2]);

  // 分块 + 纠错
  const blocks = [];
  let offset = 0;
  spec.groups.forEach(([count, len]) => {
    for (let i = 0; i < count; i++) {
      const d = codewords.slice(offset, offset + len);
      offset += len;
      blocks.push({ data: d, ecc: rsEncode(d, spec.ecc) });
    }
  });
  // 交错
  const out = [];
  const maxLen = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxLen; i++) blocks.forEach((b) => { if (i < b.data.length) out.push(b.data[i]); });
  for (let i = 0; i < spec.ecc; i++) blocks.forEach((b) => out.push(b.ecc[i]));
  return out;
}

function formatBits(mask) {
  const data = (0b00 << 3) | mask; // 纠错等级 M = 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

function buildMatrix(codewords, version, mask = 0) {
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFn = (r, c, v) => { if (r >= 0 && r < size && c >= 0 && c < size) { m[r][c] = v; fn[r][c] = true; } };

  // 定位图形
  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const dark = inside && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        setFn(rr, cc, dark);
      }
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  // 定时图形
  for (let i = 8; i < size - 8; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }

  // 校齐图形
  const pos = ALIGN[version];
  pos.forEach((r) => pos.forEach((c) => {
    if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) return;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        setFn(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }
    }
  }));

  // 预留格式信息区
  for (let i = 0; i < 9; i++) { setFn(8, i, false); setFn(i, 8, false); }
  for (let i = 0; i < 8; i++) { setFn(8, size - 1 - i, false); setFn(size - 1 - i, 8, false); }
  setFn(size - 8, 8, true); // 固定黑点

  // 版本信息（v7+）
  if (version >= 7) {
    const vb = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((vb >> i) & 1) === 1;
      setFn(Math.floor(i / 3), size - 11 + (i % 3), bit);
      setFn(size - 11 + (i % 3), Math.floor(i / 3), bit);
    }
  }

  return { size, m, fn };
}

/* 标准放置：自右下角起，两列一组，上下交替 */
function placeData(m, fn, bits, size) {
  let idx = 0;
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < 2; k++) {
      const c = col - k;
      for (let i = 0; i < size; i++) {
        const r = up ? size - 1 - i : i;
        if (fn[r][c]) continue;
        let v = idx < bits.length ? bits[idx] === 1 : false;
        idx++;
        if ((r + c) % 2 === 0) v = !v;
        m[r][c] = v;
      }
    }
    up = !up;
  }
  return idx;
}

function drawFormat(m, size, mask) {
  const fb = formatBits(mask);
  const bit = (i) => ((fb >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) m[8][i] = bit(i);
  m[8][7] = bit(6);
  m[8][8] = bit(7);
  m[7][8] = bit(8);
  for (let i = 9; i <= 14; i++) m[14 - i][8] = bit(i);
  for (let i = 0; i <= 7; i++) m[size - 1 - i][8] = bit(i);
  for (let i = 8; i <= 14; i++) m[8][size - 15 + i] = bit(i);
  m[size - 8][8] = true;
}

function toMatrix(text, mask = 0) {
  const bytes = Buffer.from(text, 'utf8');
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const cap = SPEC[v].groups.reduce((s, [n, d]) => s + n * d, 0) - (v <= 9 ? 2 : 3);
    if (bytes.length <= cap) { version = v; break; }
  }
  if (!version) throw new Error('内容过长，超出二维码容量');
  const cw = encodeData(bytes, version);
  const { size, m, fn } = buildMatrix(cw, version, 0);
  const bits = [];
  cw.forEach((c) => { for (let i = 7; i >= 0; i--) bits.push((c >> i) & 1); });
  placeData(m, fn, bits, size);
  drawFormat(m, size, 0);
  return { size, m, version };
}

function svg(text, size = 220) {
  const { size: n, m } = toMatrix(text);
  const quiet = 4;
  const dim = n + quiet * 2;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (m[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="溯源码"><rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#17180F"/></svg>`;
}

module.exports = { svg, toMatrix };
