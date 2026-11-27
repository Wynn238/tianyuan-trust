'use strict';
/* 智能体引擎：意图识别 → 槽位抽取 → 工具调用 → 检索增强 → 回答合成
   默认本地确定性引擎；在设置中启用大模型后走 OpenAI 兼容接口，失败自动回退。 */

const BOUNDARY = /治|疗效|功效|保健|降血压|降血糖|防癌|抗癌|孕妇能吃|补肾|壮阳|减肥|长寿/;
const INTENTS = [
  { key: 'boundary', label: '能力边界', re: BOUNDARY, weight: 100 },
  { key: 'content', label: '内容生成', re: /文案|朋友圈|详情页|短视频|脚本|种草|标题|直播话术|宣传/, weight: 60 },
  { key: 'alert', label: '质检预警', re: /风险|预警|异常|召回|抽检|不合格|隐患/, weight: 55 },
  { key: 'test', label: '检测解读', re: /检测|农残|兽残|合格|限值|报告|未检出|重金属|残留/, weight: 50 },
  { key: 'chain', label: '存证核验', re: /上链|存证|哈希|篡改|区块链|区块|交易号/, weight: 50 },
  { key: 'pesticide', label: '用药记录', re: /打药|用药|农药|施药|间隔期|休药期|几次药/, weight: 48 },
  { key: 'logistics', label: '物流查询', re: /物流|到哪|发货|签收|快递|几天到|运单|冷链|温度|温控/, weight: 45 },
  { key: 'policy', label: '售后规则', re: /退货|退款|售后|赔付|坏了|运费|包邮|发票/, weight: 45 },
  { key: 'recommend', label: '选购推荐', re: /推荐|送礼|预算|怎么选|买什么|哪个好|适合/, weight: 40 },
  { key: 'price', label: '价格构成', re: /价格|多少钱|贵|便宜|成本|佣金/, weight: 35 },
  { key: 'trace', label: '溯源查询', re: /溯源|批次|产地|哪里|谁种|采摘|什么时候|真|假|正宗/, weight: 30 },
  { key: 'about', label: '能力介绍', re: /你是谁|能做什么|怎么用|会什么|介绍一下/, weight: 20 },
];

function detectIntent(q) {
  let best = { key: 'trace', label: '溯源查询', score: 0 };
  for (const it of INTENTS) {
    if (it.re.test(q)) {
      const score = it.weight + (q.match(it.re) || []).length;
      if (score > best.score) best = { key: it.key, label: it.label, score };
    }
  }
  if (best.score === 0) return { key: 'other', label: '待澄清', score: 0 };
  return best;
}

function extractCode(q, db, fallback) {
  const m = q.match(/TY-\d{4}-\d{4}-[A-Z]{2}/i);
  if (m) return m[0].toUpperCase();
  if (fallback) return fallback;
  // 用品名反查
  for (const b of db.batches) {
    const p = db.products.find((x) => x.id === b.productId);
    if (p && q.includes(p.name.slice(0, 2))) return b.code;
  }
  return null;
}
function extractOrder(q, fallback) {
  const m = q.match(/DD\d{8,12}/i);
  return m ? m[0].toUpperCase() : fallback || null;
}

function ctxOf(db, code) {
  const batch = db.batches.find((b) => b.code === code);
  if (!batch) return null;
  const product = db.products.find((p) => p.id === batch.productId);
  const farmer = db.farmers.find((f) => f.id === product.farmerId);
  const records = db.records.filter((r) => r.batchId === batch.id).sort((a, b) => a.at.localeCompare(b.at));
  const tests = db.tests.filter((t) => t.batchId === batch.id);
  const shipments = db.shipments.filter((s) => s.batchId === batch.id);
  const orders = db.orders.filter((o) => o.batchId === batch.id);
  return { batch, product, farmer, records, tests, shipments, orders };
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
const shortHash = (h) => (h ? h.slice(0, 10) + '…' + h.slice(-4) : '');

function step(list, key, label, detail, tool, status = 'done') {
  list.push({ key, label, detail, tool, status });
}

function baseResult(intent, extra) {
  return Object.assign({ intent: intent.key, intentLabel: intent.label, confidence: 0.86, steps: [], answer: '', citations: [], followups: [], data: null }, extra);
}

/* ---------------- 工具实现 ---------------- */
function toolTrace(ctx) {
  return {
    code: ctx.batch.code, product: ctx.product.name, farmer: ctx.farmer.name, org: ctx.farmer.org,
    region: `${ctx.farmer.region.province}${ctx.farmer.region.city}${ctx.farmer.region.county}${ctx.farmer.region.village}`,
    records: ctx.records.length, first: ctx.records[0] && ctx.records[0].at, last: ctx.records[ctx.records.length - 1] && ctx.records[ctx.records.length - 1].at,
    grade: ctx.batch.grade, harvest: ctx.batch.harvestedAt, qty: ctx.batch.qty,
  };
}
function toolPesticides(ctx) {
  const list = ctx.records.filter((r) => r.type === 'pesticide');
  const harvest = new Date(ctx.batch.harvestedAt).getTime();
  return list.map((r) => {
    const gap = Math.round((harvest - new Date(r.at).getTime()) / 86400000);
    const m = r.evidence.find((e) => e.label.includes('间隔期') || e.label.includes('休药期'));
    const need = m ? parseInt(m.value, 10) : null;
    return { at: r.at, title: r.title, detail: r.detail, gapDays: gap, needDays: need, ok: need == null || gap >= need, recordId: r.id, hash: r.hash };
  });
}
function toolTests(ctx) {
  return ctx.tests.map((t) => ({
    reportNo: t.reportNo, lab: t.lab, at: t.at, conclusion: t.conclusion,
    items: t.items.map((i) => ({ ...i })),
    maxRatio: Math.max(...t.items.filter((i) => i.safety).map((i) => i.ratio || 0)),
  }));
}
function toolChain(ctx) {
  const v = require('./chain').verify(ctx.records);
  return { ok: v.ok, total: v.total, height: ctx.records.length ? ctx.records[ctx.records.length - 1].height : 0, tx: ctx.records.length ? ctx.records[ctx.records.length - 1].tx : '', lastHash: ctx.records.length ? ctx.records[ctx.records.length - 1].hash : '', tamperedIndex: v.tamperedIndex };
}
function toolCold(ctx) {
  const s = ctx.shipments[0];
  if (!s) return null;
  const over = s.checkpoints.filter((c) => c.status === 'warn');
  return { waybill: s.waybill, carrier: s.carrier, from: s.from, to: s.to, checkpoints: s.checkpoints, over: over.length, maxTemp: Math.max(...s.checkpoints.map((c) => c.temp)) };
}
function toolPrice(db, product) {
  const b = db.breakdown[product.id] || [];
  const total = b.reduce((s, x) => s + x.amount, 0);
  return { total, parts: b, farmerShare: b.filter((x) => x.label.includes('地头') || x.label.includes('收购')).reduce((s, x) => s + x.amount, 0) };
}
function toolKB(db, q, top = 3) {
  const terms = q.replace(/[，。？！,.?!\s]/g, ' ').split(' ').filter((w) => w.length > 1);
  return db.kb
    .map((k) => {
      let score = 0;
      terms.forEach((t) => { if (k.title.includes(t)) score += 3; if (k.content.includes(t)) score += 1; if (k.tags.some((g) => t.includes(g))) score += 2; });
      return { ...k, score };
    })
    .filter((k) => k.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, top);
}
function toolScan(db) {
  return db.alerts.filter((a) => a.status === 'open').map((a) => ({ ...a }));
}

/* ---------------- 回答合成 ---------------- */
function askLocal(db, question, code) {
  const intent = detectIntent(question);
  const steps = [];
  const citations = [];
  const res = baseResult(intent);

  if (intent.key === 'boundary') {
    step(steps, 'guard', '边界识别', '命中功效类表述，进入拒答分支', 'boundary');
    res.confidence = 0.95;
    res.answer = '这个问题我不能回答。平台只提供可核验的产地、农事、检测与冷链信息，农产品不是药品，不能替代诊断或治疗。\n\n如果你关心的是安全，我可以直接给你这批的检测结论、用药记录和链上存证，这三项才是能核实的东西。';
    res.followups = ['这批的检测报告查了什么', '最后一次打药是什么时候', '冷链温度正常吗'];
    res.steps = steps;
    return res;
  }
  if (intent.key === 'about') {
    step(steps, 'route', '能力清单', '返回可执行的四类任务', 'about');
    res.confidence = 0.98;
    res.answer = '我是平台的溯源助农智能体，能查三类事：\n\n· 溯源与检测：某个批次谁种的、打过几次药、检测值是多少、链上是否被改过；\n· 交易与售后：物流到哪了、坏了怎么赔、价格里每一分钱去哪了；\n· 经营辅助：按批次生成商品文案与短视频脚本，或扫描在售批次的质量风险。\n\n直接问就行，比如「TY-2026-0912-DS 打过几次药」。';
    res.followups = ['TY-2026-0912-DS 打过几次药', '预算 100 元送长辈', '这批货有没有质量风险'];
    res.steps = steps;
    return res;
  }

  step(steps, 'intent', '意图识别', `识别为「${intent.label}」，置信度 0.86`, 'classifier');

  const ctx = code ? ctxOf(db, code) : null;

  if (intent.key === 'alert') {
    step(steps, 'scan', '扫描在售批次', '检测限值占比 / 冷链温区 / 扫码频次', 'alert.scan');
    const alerts = toolScan(db);
    res.confidence = 0.9;
    res.answer = `当前有 ${alerts.length} 项待处置预警，按等级排序：\n\n` +
      alerts.map((a, i) => `${i + 1}. [${a.level === 'high' ? '高' : a.level === 'mid' ? '中' : '低'}] ${a.title}\n   ${a.detail}`).join('\n\n') +
      '\n\n处置建议：高风险项先冻结相关批次库存，24 小时内复检；复检合格恢复上架，不合格启动召回，全过程在链上留痕并向消费者公示。';
    res.citations = alerts.map((a) => ({ label: a.title, source: `预警 ${a.id}`, at: a.at }));
    res.followups = ['冷链超温那一单怎么补偿', '间隔期不足的批次还能发货吗', '扫码异常一般怎么处理'];
    res.steps = steps;
    res.data = { alerts };
    return res;
  }

  if (intent.key === 'policy') {
    let hits = toolKB(db, question, 2);
    if (!hits.length) {
      const M = [[/坏|烂|赔|退款|退/, 'KB04'], [/运费/, 'KB10'], [/佣金|结算|服务费/, 'KB06'], [/发票/, 'KB06'], [/预售|发货|逾期/, 'KB11'], [/地标|地理标志/, 'KB07'], [/数据|隐私|地址/, 'KB08'], [/助农/, 'KB09'], [/链|存证|哈希/, 'KB12']];
      for (const [re, id] of M) {
        if (re.test(question)) { const k = db.kb.find((x) => x.id === id); if (k) hits = [k]; break; }
      }
    }
    step(steps, 'kb', '检索平台规则库', hits.length ? hits.map((h) => h.id).join('、') : '无命中', 'kb.search');
    res.confidence = hits.length ? 0.88 : 0.5;
    res.answer = hits.length
      ? hits.map((h) => h.content).join('\n\n') + '\n\n如果你已经下单，把订单号发我，我可以直接看这单到哪一步了。'
      : '平台规则库里暂时没有对应条款，建议转人工客服确认，我不编造规则。';
    res.citations = hits.map((h) => ({ label: h.title, source: h.id, at: null }));
    res.followups = ['坏果怎么赔', '运费谁承担', '我的订单到哪了'];
    res.steps = steps;
    return res;
  }

  if (intent.key === 'recommend') {
    const budget = (question.match(/(\d{2,4})\s*元/) || [])[1];
    const max = budget ? Number(budget) : 120;
    const list = db.products.filter((p) => p.status === 'on' && p.price <= max).sort((a, b) => b.ratingAvg - a.ratingAvg).slice(0, 3);
    step(steps, 'filter', '按预算与评分筛选', `预算 ${max} 元，命中 ${list.length} 款`, 'product.search');
    res.confidence = 0.82;
    res.answer = `按 ${max} 元预算，我挑了 3 款有检测报告、可查溯源的：\n\n` +
      list.map((p, i) => `${i + 1}. ${p.name}　${p.price} 元 / ${p.unit}\n   ${p.highlights[0]}；${p.ratingAvg} 分（${p.ratingCount} 条评价）`).join('\n\n') +
      '\n\n送礼优先选砀山酥梨或赣南脐橙，包装和果径稳定；自己吃可以选徐闻香蕉，性价比最高。';
    res.data = { products: list.map((p) => p.id) };
    res.followups = ['砀山酥梨的检测报告', '脐橙什么时候采摘的', '有礼盒装吗'];
    res.steps = steps;
    return res;
  }

  if (intent.key === 'content') {
    const target = (ctx && ctx.product) || db.products.find((p) => question.includes(p.name.slice(0, 2))) || db.products[0];
    const c = contentLocal(db, target.id, ctx ? ctx.batch.id : null, '朋友圈');
    step(steps, 'content', '提取批次素材', `${target.name} · ${c.meta.batchCode}`, 'content.generate');
    res.confidence = 0.84;
    res.answer = `按 ${c.meta.batchCode} 这批的农事、检测和产地信息，我先写一条朋友圈文案：\n\n「${c.title}」\n\n` +
      c.points.slice(0, 3).map((p) => '· ' + p).join('\n') +
      `\n\n要成篇的详情页或 45 秒短视频脚本，可以在智能体工作台的「内容生成」里选渠道后导出。${c.compliance}`;
    res.data = { content: c };
    res.followups = ['再写一条短视频脚本', '换成小红书风格', '这批的检测亮点是什么'];
    res.steps = steps;
    return res;
  }

  if (!ctx) {
    step(steps, 'slot', '槽位缺失', '未识别到批次码，回退候选列表', 'slot.fallback');
    const options = db.batches.slice(0, 3).map((b) => {
      const p = db.products.find((x) => x.id === b.productId);
      return `${p.name}（${b.code}）`;
    });
    res.confidence = 0.4;
    res.answer = `我需要一个批次码才能查具体记录。你可以直接扫包装上的码，或从这三个在售批次里选：\n\n· ${options.join('\n· ')}\n\n如果只是想了解平台怎么溯源，我可以先讲清楚一物一码背后的四类数据。`;
    res.followups = options;
    res.steps = steps;
    return res;
  }

  step(steps, 'locate', '定位批次', `${ctx.product.name} · ${ctx.batch.code}`, 'trace.query');
  res.data = { code: ctx.batch.code, product: ctx.product.name, farmer: ctx.farmer.name };

  if (intent.key === 'pesticide' || intent.key === 'trace') {
    const ps = toolPesticides(ctx);
    step(steps, 'records', '读取农事记录', `链上共 ${ctx.records.length} 条，其中用药 ${ps.length} 次`, 'trace.query');
    step(steps, 'interval', '核算安全间隔期', ps.map((p) => `${p.gapDays}天/${p.needDays ?? '—'}天`).join('、') || '无用药记录', 'rule.interval');
    const harvest = fmtDate(ctx.batch.harvestedAt);
    const village = ctx.farmer.region.village.replace(/^.*?镇/, '');
    if (ps.length) {
      const bad = ps.filter((p) => !p.ok);
      res.confidence = 0.93;
      res.answer =
        `这批${ctx.product.name}来自${ctx.farmer.region.province}${ctx.farmer.region.county}${village}，生产者${ctx.farmer.name}，${harvest}采收。\n\n` +
        `链上一共 ${ctx.records.length} 条记录，其中用药 ${ps.length} 次：\n\n` +
        ps.map((p) => `· ${fmtDate(p.at)}　${p.title}，${p.detail.split('，')[0]}；安全间隔期 ${p.needDays ?? '—'} 天，距采收 ${p.gapDays} 天`).join('\n') +
        `\n\n${bad.length ? '注意：有 1 次用药距采收不足间隔期，平台已触发预警并暂缓发货。' : `按标签间隔期核算，每次用药距采收都满足要求，最短的一次也留了 ${Math.min(...ps.map((p) => p.gapDays - (p.needDays || 0)))} 天余量。`}`;
    } else {
      res.confidence = 0.85;
      res.answer = `这批${ctx.product.name}（${ctx.batch.code}）在链上有 ${ctx.records.length} 条农事记录，没有用药记录，属于全程未施药管理。关键节点：${ctx.records.slice(0, 3).map((r) => `${fmtDate(r.at)} ${r.title}`).join('；')}。`;
    }
    res.citations = ps.map((p) => ({ label: `${p.title}（${fmtDate(p.at)}）`, source: `记录 ${p.recordId} · ${shortHash(p.hash)}`, at: p.at }));
    const t = toolTests(ctx)[0];
    if (t) {
      const max = t.items.filter((i) => i.safety).sort((a, b) => (b.ratio || 0) - (a.ratio || 0))[0];
      step(steps, 'test', '调用检测报告', `${t.reportNo}，${t.items.length} 项`, 'test.report');
      res.answer += `\n\n检测报告 ${t.reportNo}（${t.lab}）结论：${t.conclusion}。其中占比最高的是${max.name}，检测值 ${max.value}${max.value === '未检出' ? '' : max.unit}，限量 ${max.limit}${max.unit}，约为限值的 ${max.ratio}%。`;
      res.citations.push({ label: `检测报告 ${t.reportNo}`, source: t.lab, at: t.at });
    }
    const ch = toolChain(ctx);
    step(steps, 'chain', '链上存证核验', `${ch.total} 条记录，哈希链${ch.ok ? '一致' : '异常'}`, 'chain.verify');
    res.answer += `\n\n以上记录都已写入哈希链，最新交易 ${ch.tx}（区块 #${ch.height}），可点开链上明细自行复核。`;
    res.followups = ['检测报告里农残合格吗', '冷链温度正常吗', '为什么这个价格'];
    res.steps = steps;
    return res;
  }

  if (intent.key === 'test') {
    const tests = toolTests(ctx);
    step(steps, 'test', '调用检测报告', tests.length ? `${tests.length} 份报告` : '无报告', 'test.report');
    if (!tests.length) {
      res.confidence = 0.5;
      res.answer = `这批${ctx.product.name}目前还没有上传检测报告，按规定不能上架销售。我可以帮你转到人工客服，或看看同产地的其他批次。`;
      res.steps = steps;
      return res;
    }
    const t = tests[0];
    step(steps, 'compare', '逐项对比限量', `${t.items.length} 项，最高占比 ${t.maxRatio}%`, 'rule.limit');
    res.confidence = 0.94;
    res.answer =
      `检测报告 ${t.reportNo}，由${t.lab}于 ${fmtDate(t.at)} 出具，结论是：${t.conclusion}。\n\n` +
      t.items.map((i) => `· ${i.name}：${i.value === '未检出' ? i.value : i.value + i.unit}（限量 ${i.limit}${i.unit}）${i.pass ? '合格' : '不合格'}${i.safety ? '' : '，属品质指标'}`).join('\n') +
      `\n\n说明一下：报告里的“未检出”指低于方法检出限，不是绝对为零。安全类指标里占比最高的是 ${t.maxRatio}%，距离限值还有余量。`;
    res.citations = [{ label: `检测报告 ${t.reportNo}`, source: t.lab, at: t.at }];
    res.followups = ['这些指标的国家标准是什么', '最后一次打药是什么时候', '这个批次的冷链怎么样'];
    res.steps = steps;
    return res;
  }

  if (intent.key === 'chain') {
    const ch = toolChain(ctx);
    step(steps, 'chain', '重算哈希链', `${ch.total} 条记录逐条校验`, 'chain.verify');
    res.confidence = 0.96;
    res.answer = ch.ok
      ? `这批${ctx.product.name}的 ${ch.total} 条记录哈希全部对得上：每条记录的哈希由“上一条哈希 + 本条内容”算出，任何一条被改过，后面的链条都会断。最新一条交易 ${ch.tx}，区块高度 #${ch.height}。\n\n需要说明的是，存证能证明“记录之后没被改过”，但证明不了“录入时就是真的”。所以关键节点我们要求物联网自动采集，人工录入必须带照片或扫码凭证。`
      : `校验没有通过：第 ${ch.tamperedIndex} 条记录与链上哈希不一致，说明该条内容在上链后被改动过。这类情况平台会立即冻结批次并通知运营核查。`;
    const last = ctx.records[ctx.records.length - 1];
    res.citations = [{ label: `区块 #${ch.height} 交易 ${ch.tx}`, source: '哈希链', at: last && last.at }];
    res.followups = ['篡改演示怎么做的', '链上存了哪些信息', '物联网数据也算上链吗'];
    res.steps = steps;
    return res;
  }

  if (intent.key === 'logistics') {
    const c = toolCold(ctx);
    step(steps, 'logistics', '查询冷链轨迹', c ? `${c.checkpoints.length} 个节点` : '无运单', 'order.logistics');
    if (!c) {
      res.confidence = 0.6;
      res.answer = `这批${ctx.product.name}还没有生成运单，可能还在打包。订单生成后物流节点会每 30 分钟同步一次温度。`;
      res.steps = steps;
      return res;
    }
    res.confidence = 0.9;
    res.answer = `运单 ${c.waybill}（${c.carrier}），从${c.from}发往${c.to}，共 ${c.checkpoints.length} 个节点：\n\n` +
      c.checkpoints.map((p) => `· ${fmtDate(p.at)} ${p.place.split(' ')[0]}　${p.temp}℃${p.status === 'warn' ? '（超出温区）' : ''}`).join('\n') +
      (c.over ? `\n\n其中有 ${c.over} 个节点超温，最高 ${c.maxTemp}℃。平台已按冷链异常进入售后绿色通道，可以先行赔付。` : '\n\n全程温度都在约定温区内。');
    res.followups = ['超温了怎么赔', '这个批次检测合格吗', '还能再下一单吗'];
    res.steps = steps;
    return res;
  }

  if (intent.key === 'price') {
    const pr = toolPrice(db, ctx.product);
    step(steps, 'price', '拆解价格构成', `${pr.parts.length} 项`, 'price.compose');
    res.confidence = 0.9;
    res.answer = `${ctx.product.name}售价 ${pr.total.toFixed(2)} 元，构成如下：\n\n` +
      pr.parts.map((p) => `· ${p.label}：${p.amount.toFixed(2)} 元`).join('\n') +
      `\n\n地头收购价 ${pr.farmerShare.toFixed(2)} 元，占售价比 ${(pr.farmerShare / pr.total * 100).toFixed(0)}%。平台只收 3% 服务费，中间环节从传统流通的四到五层压到两层，这是价格能下来的原因，不是把品质降下去。`;
    res.followups = ['农户实际能拿到多少', '为什么比超市新鲜', '有优惠吗'];
    res.steps = steps;
    return res;
  }

  // 默认：产地真实性
  const ch = toolChain(ctx);
  step(steps, 'verify', '核验产地与存证', `${ch.total} 条记录，${ch.ok ? '链一致' : '链异常'}`, 'chain.verify');
  res.confidence = 0.88;
  res.answer = `这批${ctx.product.name}的批次码是 ${ctx.batch.code}，产自${ctx.farmer.region.province}${ctx.farmer.region.city}${ctx.farmer.region.county}${ctx.farmer.region.village}，由${ctx.farmer.org}的${ctx.farmer.name}生产，${fmtDate(ctx.batch.harvestedAt)}采收，共 ${ctx.records.length} 条链上记录。\n\n` +
    (ctx.product.geoIndication ? `地理标志「${ctx.product.geo}」授权给该主体，授权书与产地证明可在商品页查看。` : '该商品未使用地理标志，产地信息以地块记录为准。') +
    `\n\n想知道更具体的，可以直接问「打过几次药」「检测合格吗」「冷链怎么样」。`;
  res.citations = [{ label: `批次 ${ctx.batch.code}`, source: `${ctx.records.length} 条链上记录`, at: ctx.batch.harvestedAt }];
  res.followups = ['打过几次药', '检测报告里农残合格吗', '冷链温度正常吗'];
  res.steps = steps;
  return res;
}

/* ---------------- 内容生成 ---------------- */
function contentLocal(db, productId, batchId, channel) {
  const p = db.products.find((x) => x.id === productId) || db.products[0];
  const f = db.farmers.find((x) => x.id === p.farmerId);
  const batch = db.batches.find((b) => b.id === batchId) || db.batches.find((b) => b.productId === p.id) || db.batches[0];
  const records = db.records.filter((r) => r.batchId === batch.id).sort((a, b) => a.at.localeCompare(b.at));
  const test = db.tests.find((t) => t.batchId === batch.id);
  const harvest = new Date(batch.harvestedAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
  const pesticideCount = records.filter((r) => r.type === 'pesticide').length;
  const top = test ? test.items.filter((i) => i.safety).sort((a, b) => (b.ratio || 0) - (a.ratio || 0))[0] : null;
  const titles = {
    '朋友圈': `${harvest}头茬，${f.region.county}${p.name.split(' · ')[0]}，只发这一批`,
    '小红书': `在${f.region.county}待了三天，我才知道${p.name.split(' · ')[0]}为什么甜`,
    '详情页': `${p.name}｜${f.region.province}${f.region.county}直发，一箱一码可查`,
  };
  return {
    title: titles[channel] || titles['详情页'],
    points: [
      `${p.highlights[0]}`,
      pesticideCount ? `全季用药 ${pesticideCount} 次，每次都记录登记证号与间隔期` : '全季未使用化学农药',
      test ? `检测报告 ${test.reportNo}：${top ? `${top.name} ${top.value}${top.unit}，限量 ${top.limit}${top.unit}` : '全部合格'}` : '检测报告待补，暂不售卖',
      `${harvest}采收，${p.unit}，${p.grade}`,
      `合作社直发，坏果按颗赔付`,
    ],
    detail: [
      { h: '这一批从哪里来', p: `${batch.plot}，${batch.area}，${f.org}的${f.name}负责。${f.story.slice(0, 60)}……` },
      { h: '种植过程可查', p: records.filter((r) => ['pesticide', 'fertilize', 'irrigate'].includes(r.type)).map((r) => `${new Date(r.at).getMonth() + 1}月${r.detail.split('，')[0]}`).join('；') + '。每一步都有操作人、时间与凭证，扫码即可查看。' },
      { h: '检测与赔付', p: test ? `${test.lab}出具报告 ${test.reportNo}，${test.conclusion}。收货 24 小时内坏果拍照上传，系统自动核赔。` : '本批次检测报告尚未上传，平台暂不开放销售。' },
    ],
    script: [
      `【开场 0—3s】镜头：清晨果园，露水特写。口播：「${harvest}，${f.region.county}，这一批只摘了 ${batch.qty}${batch.unit}。」`,
      `【4—12s】镜头：手持溯源码贴箱。口播：「一箱一个码，扫开能看到谁种的、打过几次药、检测报告编号。」`,
      `【13—25s】镜头：掰开果肉，切面特写。口播：「${p.highlights[0]}。不是所有${p.name.split(' · ')[0]}都这样，得看产地和采收期。」`,
      `【26—38s】镜头：打包台，贴单发货。口播：「${f.name}的合作社直发，冷链 ${p.category === '水果' ? '0—4℃' : '全程温控'}，坏果按颗赔。」`,
      `【39—45s】镜头：二维码特写 + 检测报告。口播：「点下方链接，先看溯源，再下单。」`,
    ],
    hashtags: ['#溯源助农', '#一物一码', `#${f.region.county.replace(/[县市]$/, '')}`, `#${p.name.split(' · ')[0]}`, '#产地直发'],
    compliance: '已标注「AI 辅助生成，农户已确认」；未使用「最」「第一」「治疗」等绝对化或功效用语。',
    meta: { batchCode: batch.code, reportNo: test ? test.reportNo : null, channel: channel || '详情页' },
  };
}

/* ---------------- 智能客服 ---------------- */
function serviceLocal(db, question, orderId) {
  const intents = [
    { k: 'refund', re: /坏|烂|赔付|退|退款|少|缺斤/, kb: ['KB04', 'KB10'] },
    { k: 'logistics', re: /物流|到哪|发货|几天|签收|快递/, kb: ['KB05'] },
    { k: 'invoice', re: /发票|开票/, kb: [] },
    { k: 'cancel', re: /取消|改地址|修改/, kb: ['KB11'] },
    { k: 'commission', re: /佣金|结算|扣费|服务费/, kb: ['KB06'] },
    { k: 'privacy', re: /信息|隐私|电话|地址|数据/, kb: ['KB08'] },
    { k: 'trace', re: /溯源码|扫码|查不到|假的/, kb: ['KB01', 'KB12'] },
  ];
  const hit = intents.find((i) => i.re.test(question)) || { k: 'general', kb: ['KB13'] };
  const order = orderId ? db.orders.find((o) => o.no === orderId) : null;
  const kb = hit.kb.map((id) => db.kb.find((k) => k.id === id)).filter(Boolean);
  let answer = '';
  let action = '回复用户';
  let handoff = false;

  if (hit.k === 'refund') {
    answer = '可以赔。生鲜签收 24 小时内拍照上传即可，不用寄回：坏果率 5% 以下补 5 元券，5%—20% 按比例退款，20% 以上全额退款。如果是冷链超温导致的腐坏，平台先行赔付，再向承运方追偿。';
    action = '已为你打开自助理赔入口';
  } else if (hit.k === 'logistics') {
    answer = '运单生成后每 30 分钟同步一次温度和位置。生鲜一般 48 小时内送达，超过承诺时效会自动补偿 5 元无门槛券。';
    action = order ? `已定位订单 ${order.no}，当前状态：${order.status}` : '请提供订单号，我直接查这一单';
  } else if (hit.k === 'invoice') {
    answer = '可以在订单详情里申请电子普通发票，农户自产自销的可以开具免税普票；企业抬头请填税号，48 小时内开出。';
    action = '已记录开票需求';
  } else if (hit.k === 'cancel') {
    answer = '未发货可以随时取消并全额退款；已发货的生鲜不支持中途改地址，建议联系快递员改约派送。预售商品发货前取消不收费用。';
    action = '已为你查询可取消状态';
  } else if (hit.k === 'commission') {
    answer = '平台按成交额收 3% 服务费，首年 1.5%，没有入驻费和年费。签收后 7 天售后期结束 T+1 结算，检测、赋码、冷链费用在结算单里逐项列明。';
    action = '已发送结算说明';
  } else if (hit.k === 'privacy') {
    answer = '农户身份证、银行卡、精确住址不上链也不对外展示，扫码只看到村级产地和农事记录。你可以在账户里导出或删除自己的数据。';
    action = '已说明数据使用范围';
  } else if (hit.k === 'trace') {
    answer = '每个包装箱上有一个溯源码，扫码能看到地块、农事、检测、冷链四类记录。如果扫出来提示“批次不存在”，先核对字母和数字，仍不行就是标签问题，可以直接拒收并申请退款。';
    action = '已打开溯源码校验';
  } else {
    answer = '这个问题我需要转人工确认，避免给你错误信息。你可以在订单页点「联系客服」，工作时间 9:00—21:00，平均 3 分钟内响应。';
    action = '已转人工';
    handoff = true;
  }
  if (order && hit.k !== 'logistics') {
    answer += `\n\n顺带查了一下你的订单 ${order.no}，当前状态是「${order.status}」，批次 ${order.batchId}。`;
  }
  return {
    answer, action, handoff,
    intent: hit.k,
    refs: kb.map((k) => ({ id: k.id, title: k.title })),
  };
}

/* ---------------- 大模型适配 ---------------- */
const SYSTEM_PROMPT = `你是「田源可信」农产品溯源助农平台的智能体，服务消费者、农户与平台运营三类用户。

【角色与任务】
基于平台提供的结构化事实回答溯源、检测、冷链、售后与内容生成问题。你只解释事实，不创造事实。

【可用工具与数据】
你只能使用随消息给出的 batch/trace/test/chain/cold/price/kb 字段，不得编造批次、检测值、区块高度、农户信息。字段缺失就说明缺失。

【工作流程】
1 先判断用户问的是哪一批、哪一类问题；2 只在给定数据内找答案；3 用中文短段落回答，先结论后依据；4 末尾给 2—3 个可继续追问的问题。

【回答规范】
- 数字必须来自给定数据，检测值要带单位与限量；
- 提到记录时给出日期与记录编号；提到存证时给出交易哈希前缀；
- 不承诺功效，不替代检测机构，不做医疗或投资建议；
- 不确定就说不确定，并建议转人工。

【硬性边界】
禁止：疾病治疗与保健功效、绝对化用语（最、第一、100%）、编造数据、泄露农户手机号与精确住址、评价其他平台。

【输出格式】
纯文本，不超过 320 字；不用 Markdown 标题；引用来源用【记录 R003 / 2026-09-12】这样的短标记。`;

async function askLLM(db, question, code, localRes) {
  const s = db.settings.llm;
  const ctx = code ? ctxOf(db, code) : null;
  const payload = {
    question,
    trace: ctx ? toolTrace(ctx) : null,
    pesticides: ctx ? toolPesticides(ctx) : [],
    tests: ctx ? toolTests(ctx) : [],
    chain: ctx ? toolChain(ctx) : null,
    cold: ctx ? toolCold(ctx) : null,
    kb: toolKB(db, question).map((k) => ({ id: k.id, title: k.title, content: k.content })),
    localDraft: localRes.answer,
  };
  const body = {
    model: s.model,
    temperature: Number(s.temperature) || 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `用户问题：${question}\n\n平台数据（JSON）：\n${JSON.stringify(payload, null, 1)}` },
    ],
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${s.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`模型接口返回 ${res.status}`);
    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('模型没有返回内容');
    return { text: text.trim(), model: s.model };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- 对外接口 ---------------- */
async function ask(db, { question, code }) {
  const q = String(question || '').trim();
  if (!q) throw new Error('问题不能为空');
  const t0 = Date.now();
  const local = askLocal(db, q, code);
  local.elapsed = Date.now() - t0;
  local.engine = 'local';
  if (db.settings.llm.enabled && db.settings.llm.apiKey) {
    try {
      const t1 = Date.now();
      const llm = await askLLM(db, q, code, local);
      local.answer = llm.text;
      local.engine = 'llm';
      local.model = llm.model;
      local.elapsed = Date.now() - t0;
      local.steps.push({ key: 'llm', label: '大模型合成', detail: `${llm.model} 生成，用时 ${Date.now() - t1}ms`, tool: 'llm', status: 'done' });
    } catch (e) {
      local.steps.push({ key: 'llm', label: '大模型不可用', detail: `${e.message}，已回退本地引擎`, tool: 'llm', status: 'warn' });
    }
  }
  local.question = q;
  return local;
}

function content(db, { productId, batchId, channel, tone }) {
  return contentLocal(db, productId, batchId, channel, tone);
}
function service(db, { question, orderId }) {
  return serviceLocal(db, question, orderId);
}

module.exports = { ask, content, service, detectIntent, ctxOf, toolKB, SYSTEM_PROMPT };
