'use strict';
/* 演示数据：为课程原型构造，人物、报告号、区块均为虚构样例 */
const crypto = require('crypto');
const chain = require('../lib/chain');

const iso = (s, hh = 9) => new Date(`${s}T${String(hh).padStart(2, '0')}:00:00+08:00`).toISOString();

let rid = 0;
function rec(batchId, type, at, title, detail, operator, method, evidence) {
  return {
    id: 'R' + String(++rid).padStart(3, '0'),
    batchId, type, at, title, detail, operator, method,
    evidence: evidence || [],
  };
}

function pb(price, parts) {
  let used = 0;
  return parts.map(([label, share], i) => {
    const amount = i === parts.length - 1 ? +(price - used).toFixed(2) : +(price * share).toFixed(2);
    used = +(used + amount).toFixed(2);
    return { label, amount };
  });
}

function seed() {
  const farmers = [
    {
      id: 'F01', name: '王秀兰', type: 'B', avatarHue: 128,
      org: '砀山县梨源果业合作社', role: '理事长',
      region: { province: '安徽省', city: '宿州市', county: '砀山县', village: '良梨镇魏寨村' },
      phone: '138****6027', joinedAt: iso('2026-03-04'), acreage: 68,
      certs: ['绿色食品认证', '地理标志使用授权', '承诺达标合格证'],
      story: '种了二十六年梨。合作社带着 43 户把老梨园改成矮化密植，一亩地少打两遍药，糖度反而高了两度。她最常说的一句话是：梨甜不甜，树上说了算，不是嘴上说了算。',
      rating: 4.9, orders: 1862,
    },
    {
      id: 'F02', name: '李长福', type: 'B', avatarHue: 96,
      org: '五常市长福家庭农场', role: '农场主',
      region: { province: '黑龙江省', city: '哈尔滨市', county: '五常市', village: '民乐朝鲜族乡红光村' },
      phone: '139****2188', joinedAt: iso('2026-02-18'), acreage: 320,
      certs: ['有机产品认证', '地理标志使用授权', '承诺达标合格证'],
      story: '稻花香二号只能在积温带里慢慢长。农场把 320 亩分成 9 个地块，每块单独记录插秧、灌溉和收割时间，收割后低温烘干，不靠陈粮拼配。',
      rating: 4.8, orders: 2431,
    },
    {
      id: 'F03', name: '马占海', type: 'D', avatarHue: 24,
      org: '盐池县滩羊产业联合社', role: '理事长',
      region: { province: '宁夏回族自治区', city: '吴忠市', county: '盐池县', village: '花马池镇佟记圈村' },
      phone: '137****9043', joinedAt: iso('2026-01-12'), acreage: 0,
      certs: ['农产品地理标志', '动物检疫合格证明', '地理标志使用授权'],
      story: '联合社替 86 户养羊户统一做耳标、防疫和出栏记录。滩羊吃的是盐碱地里的甘草和苦豆子，出栏周期长，账要算清楚，才敢跟外面讲价。',
      rating: 4.7, orders: 964,
    },
    {
      id: 'F04', name: '陈志强', type: 'C', avatarHue: 48,
      org: '徐闻县志强香蕉园', role: '返乡青年',
      region: { province: '广东省', city: '湛江市', county: '徐闻县', village: '曲界镇愚公楼村' },
      phone: '135****7712', joinedAt: iso('2026-04-22'), acreage: 45,
      certs: ['承诺达标合格证'],
      story: '2024 年从广州回徐闻，接手家里 45 亩蕉园。第一年赶上集中上市，田头价 0.4 元一斤，连工钱都不够。现在他先把批次和成熟度录进系统，再按订单排采收，价格至少能谈到成本线以上。',
      rating: 4.6, orders: 587,
    },
    {
      id: 'F05', name: '周雪', type: 'B', avatarHue: 12,
      org: '中宁县雪原枸杞合作社', role: '理事长',
      region: { province: '宁夏回族自治区', city: '中卫市', county: '中宁县', village: '舟塔乡潘营村' },
      phone: '136****3359', joinedAt: iso('2026-03-30'), acreage: 120,
      certs: ['绿色食品认证', '地理标志使用授权'],
      story: '枸杞最怕两件事：硫熏和掺假。合作社自建了烘干房，每批做二氧化硫和农残检测，报告编号直接印在袋子上，谁都能查。',
      rating: 4.8, orders: 1206,
    },
    {
      id: 'F06', name: '孙立军', type: 'C', avatarHue: 340,
      org: '东港市立军草莓农场', role: '新农人',
      region: { province: '辽宁省', city: '丹东市', county: '东港市', village: '椅圈镇夏家村' },
      phone: '133****0481', joinedAt: iso('2026-05-09'), acreage: 12,
      certs: ['绿色食品认证', '承诺达标合格证'],
      story: '十二亩地、九个棚，靠一双手和一部手机。棚里装了温湿度传感器，手机上能看；采摘前七天停止用药，是他给自己定的死规矩。',
      rating: 4.9, orders: 733,
    },
    {
      id: 'F07', name: '张德海', type: 'D', avatarHue: 200,
      org: '高青县黑牛养殖联合社', role: '理事长',
      region: { province: '山东省', city: '淄博市', county: '高青县', village: '黑里寨镇杨家村' },
      phone: '138****5521', joinedAt: iso('2026-02-02'), acreage: 0,
      certs: ['农产品地理标志', '动物检疫合格证明'],
      story: '黑牛按 28 个月育肥，谷饲 400 天以上。联合社给每头牛建了耳标档案，饲料配方、防疫、出栏体重全部留痕，雪花纹不是靠嘴说的。',
      rating: 4.7, orders: 412,
    },
    {
      id: 'F08', name: '刘建国', type: 'B', avatarHue: 32,
      org: '信丰县建国果业家庭农场', role: '农场主',
      region: { province: '江西省', city: '赣州市', county: '信丰县', village: '安西镇脐橙场' },
      phone: '139****8865', joinedAt: iso('2026-03-16'), acreage: 210,
      certs: ['绿色食品认证', '地理标志使用授权', '承诺达标合格证'],
      story: '脐橙要留树保鲜，采前一个月不灌水，糖酸比才上得来。农场 210 亩分 12 个小区，每区单独采样测糖，达标才采。',
      rating: 4.8, orders: 1547,
    },
    {
      id: 'F09', name: '赵明', type: 'A', avatarHue: 16,
      org: '洛川县凤栖镇果农', role: '果农',
      region: { province: '陕西省', city: '延安市', county: '洛川县', village: '凤栖镇桥西村' },
      phone: '134****2290', joinedAt: iso('2026-11-19'), acreage: 8,
      certs: ['承诺达标合格证'],
      story: '八亩红富士，靠合作社代办入驻。检测报告还没出来，平台先让上架审核卡住，等报告齐了再卖。',
      rating: 4.5, orders: 0,
    },
  ];

  const products = [
    {
      id: 'P01', name: '砀山酥梨 · 头茬采摘', category: '水果', unit: '5 斤装', spec: '单果 250—300g · 12 枚', grade: '一级',
      price: 39.9, originalPrice: 49.9, organic: false, greenFood: true, geoIndication: true,
      geo: '砀山酥梨', farmerId: 'F01', art: 'pear', status: 'on', createdAt: iso('2026-09-14'),
      monthlySales: 3860, repurchaseRate: 41.2, ratingAvg: 4.9, ratingCount: 1284,
      summary: '黄河故道沙壤土，昼夜温差大，果肉细脆、石细胞少。采后 24 小时内预冷入库，全程 0—4℃ 冷链发出。',
      highlights: ['可溶性固形物 12.8%（地标要求 ≥11%）', '采前 21 天停止用药，间隔期留足 3 倍余量', '一箱一码，扫码可看果园、用药与检测'],
    },
    {
      id: 'P02', name: '五常稻花香大米 · 当季新米', category: '粮油', unit: '5 kg 装', spec: '真空砖 · 10 小袋', grade: '有机',
      price: 59.9, originalPrice: 69.9, organic: true, greenFood: true, geoIndication: true,
      geo: '五常大米', farmerId: 'F02', art: 'rice', status: 'on', createdAt: iso('2026-10-11'),
      monthlySales: 5210, repurchaseRate: 48.6, ratingAvg: 4.8, ratingCount: 2107,
      summary: '稻花香二号，单一品种、单一地块，不拼配。收割后低温烘干至 15% 水分，当季现磨，米香清甜。',
      highlights: ['单一品种单一地块，拒绝陈粮拼配', '水分 15.2%，低于国标 15.5% 上限', '每袋独立溯源码，可查插秧到碾米'],
    },
    {
      id: 'P03', name: '盐池滩羊 · 羔羊后腿', category: '肉禽蛋', unit: '2 斤装', spec: '整只后腿 · 约 1kg', grade: '特级',
      price: 128, originalPrice: 148, organic: false, greenFood: true, geoIndication: true,
      geo: '盐池滩羊', farmerId: 'F03', art: 'lamb', status: 'on', createdAt: iso('2026-11-06'),
      monthlySales: 1120, repurchaseRate: 36.4, ratingAvg: 4.7, ratingCount: 486,
      summary: '盐碱地放牧，180 天羔羊。屠宰后 4 小时内排酸，全程 -18℃ 冷链，膻味轻、肌间脂肪均匀。',
      highlights: ['耳标可查防疫与休药期记录', '检疫合格证明随箱可查', '顺丰冷运，48 小时直达'],
    },
    {
      id: 'P04', name: '徐闻香蕉 · 自然熟', category: '水果', unit: '5 斤装', spec: '约 3 把 · 青转黄发货', grade: '一级',
      price: 19.9, originalPrice: 26.9, organic: false, greenFood: false, geoIndication: false,
      geo: '', farmerId: 'F04', art: 'banana', status: 'on', createdAt: iso('2026-11-19'),
      monthlySales: 2240, repurchaseRate: 28.9, ratingAvg: 4.5, ratingCount: 362,
      summary: '七成熟采割，路上自然转黄，不加催熟剂。产地直发，把中间三档批发环节的加价让给两头。',
      highlights: ['按订单排采收，不做集中上市踩踏', '七成熟采割，到货刚好能吃', '坏果按根赔付，拍照即核'],
    },
    {
      id: 'P05', name: '中宁枸杞 · 头茬干果', category: '滋补', unit: '250g 装', spec: '特级 · 180 粒/50g', grade: '特级',
      price: 45.9, originalPrice: 55.9, organic: false, greenFood: true, geoIndication: true,
      geo: '中宁枸杞', farmerId: 'F05', art: 'goji', status: 'on', createdAt: iso('2026-08-28'),
      monthlySales: 1680, repurchaseRate: 44.1, ratingAvg: 4.8, ratingCount: 704,
      summary: '头茬夏果，自然晾晒加低温烘干，不硫熏。多糖含量 4.2%，粒大色暗红，入口微甜后味略苦。',
      highlights: ['二氧化硫未检出，不熏不染', '每袋带检测报告编号', '头茬果，非秋果掺混'],
    },
    {
      id: 'P06', name: '丹东九九草莓 · 现摘空运', category: '水果', unit: '2 斤装', spec: '单果 25g+ · 泡沫托装', grade: '特级',
      price: 68, originalPrice: 78, organic: false, greenFood: true, geoIndication: false,
      geo: '', farmerId: 'F06', art: 'strawberry', status: 'on', createdAt: iso('2026-11-21'),
      monthlySales: 940, repurchaseRate: 39.5, ratingAvg: 4.9, ratingCount: 388,
      summary: '九个棚轮采，清晨摘、当日发。棚内温湿度传感器每 30 分钟上传一次，冷链 0—4℃ 直达。',
      highlights: ['采前 7 天停止用药，间隔期可查', '棚内温湿度曲线随码可看', '坏果一颗赔一颗，不用寄回'],
    },
    {
      id: 'P07', name: '高青黑牛 · 眼肉牛排', category: '肉禽蛋', unit: '1kg 装', spec: '原切 4 片 · 2cm 厚', grade: '特级',
      price: 168, originalPrice: 198, organic: false, greenFood: false, geoIndication: true,
      geo: '高青黑牛', farmerId: 'F07', art: 'beef', status: 'on', createdAt: iso('2026-11-13'),
      monthlySales: 520, repurchaseRate: 31.8, ratingAvg: 4.7, ratingCount: 156,
      summary: '谷饲 400 天以上，28 个月出栏。原切不调理，-18℃ 冷链，解冻后不回温。',
      highlights: ['耳标档案可查饲料与防疫', '原切非拼接，配料表只有牛肉', '动物检疫合格证明随箱'],
    },
    {
      id: 'P08', name: '赣南脐橙 · 留树保鲜', category: '水果', unit: '5 斤装', spec: '单果 200—250g · 10 枚', grade: '一级',
      price: 36.9, originalPrice: 45.9, organic: false, greenFood: true, geoIndication: true,
      geo: '赣南脐橙', farmerId: 'F08', art: 'orange', status: 'on', createdAt: iso('2026-11-16'),
      monthlySales: 4120, repurchaseRate: 46.3, ratingAvg: 4.8, ratingCount: 1620,
      summary: '信丰安西镇红壤丘陵，采前控水提糖。可溶性固形物 13.6%，酸度 0.7%，糖酸比 19.4。',
      highlights: ['按小区采样测糖，达标才采', '采前一个月控水，不催熟', '一箱一码，可查果园与分选线'],
    },
    {
      id: 'P09', name: '洛川红富士 · 尝鲜装', category: '水果', unit: '5 斤装', spec: '单果 200g+ · 12 枚', grade: '一级',
      price: 42.9, originalPrice: 52.9, organic: false, greenFood: false, geoIndication: true,
      geo: '洛川苹果', farmerId: 'F09', art: 'apple', status: 'pending', createdAt: iso('2026-11-20'),
      monthlySales: 0, repurchaseRate: 0, ratingAvg: 0, ratingCount: 0,
      summary: '黄土高原优生区，昼夜温差 12℃。农户新入驻，检测报告尚未上传，平台暂缓上架。',
      highlights: ['待补：农残检测报告', '待补：承诺达标合格证'],
    },
  ];

  // 价格构成：地头价 / 分选包装 / 冷链物流 / 平台服务费 / 农户自留
  const breakdown = {};
  breakdown.P01 = pb(39.9, [['地头收购价', 0.46], ['分选与包装', 0.1], ['冷链与干线物流', 0.2], ['平台服务费（3%）', 0.03]]);
  breakdown.P02 = pb(59.9, [['地头收购价', 0.52], ['烘干与碾米', 0.12], ['包装与物流', 0.16], ['平台服务费（3%）', 0.03]]);
  breakdown.P03 = pb(128, [['活羊收购价', 0.58], ['屠宰分割', 0.1], ['冷链物流', 0.15], ['平台服务费（3%）', 0.03]]);
  breakdown.P04 = pb(19.9, [['地头收购价', 0.42], ['催熟与分把', 0.08], ['物流与包装', 0.28], ['平台服务费（3%）', 0.03]]);
  breakdown.P05 = pb(45.9, [['地头收购价', 0.45], ['烘干与筛选', 0.14], ['包装与物流', 0.19], ['平台服务费（3%）', 0.03]]);
  breakdown.P06 = pb(68, [['地头收购价', 0.55], ['分选与泡沫托', 0.1], ['空运冷链', 0.18], ['平台服务费（3%）', 0.03]]);
  breakdown.P07 = pb(168, [['活牛收购价', 0.6], ['屠宰分割与排酸', 0.12], ['冷链物流', 0.13], ['平台服务费（3%）', 0.03]]);
  breakdown.P08 = pb(36.9, [['地头收购价', 0.5], ['分选与包装', 0.1], ['物流', 0.2], ['平台服务费（3%）', 0.03]]);

  const batches = [
    { id: 'B01', productId: 'P01', code: 'TY-2026-0912-DS', plot: '良梨镇 3 号梨园', area: '12 亩', plantedAt: iso('2009-03-12'), harvestedAt: iso('2026-09-12'), qty: 3200, unit: 'kg', status: 'listed', grade: '一级' },
    { id: 'B02', productId: 'P02', code: 'TY-2026-1008-WC', plot: '民乐乡 4 号田', area: '86 亩', plantedAt: iso('2026-05-18'), harvestedAt: iso('2026-10-08'), qty: 45000, unit: 'kg', status: 'listed', grade: '有机' },
    { id: 'B03', productId: 'P03', code: 'TY-2026-1105-YC', plot: '花马池 2 号羊舍', area: '86 户联合', plantedAt: iso('2026-05-10'), harvestedAt: iso('2026-11-05'), qty: 320, unit: '只', status: 'listed', grade: '特级' },
    { id: 'B04', productId: 'P04', code: 'TY-2026-1118-XW', plot: '曲界镇 7 号蕉园', area: '18 亩', plantedAt: iso('2025-12-02'), harvestedAt: iso('2026-11-18'), qty: 6800, unit: 'kg', status: 'listed', grade: '一级' },
    { id: 'B05', productId: 'P05', code: 'TY-2026-0826-ZN', plot: '舟塔乡 5 号枸杞地', area: '32 亩', plantedAt: iso('2018-04-06'), harvestedAt: iso('2026-08-26'), qty: 2400, unit: 'kg', status: 'listed', grade: '特级' },
    { id: 'B06', productId: 'P06', code: 'TY-2026-1120-DD', plot: '椅圈镇 1 号棚', area: '1.4 亩', plantedAt: iso('2026-08-28'), harvestedAt: iso('2026-11-20'), qty: 620, unit: 'kg', status: 'listed', grade: '特级' },
    { id: 'B07', productId: 'P07', code: 'TY-2026-1112-GQ', plot: '黑里寨 3 区育肥舍', area: '联合社', plantedAt: iso('2024-07-15'), harvestedAt: iso('2026-11-12'), qty: 48, unit: '头', status: 'listed', grade: '特级' },
    { id: 'B08', productId: 'P08', code: 'TY-2026-1115-GN', plot: '安西镇 9 号小区', area: '24 亩', plantedAt: iso('2012-03-20'), harvestedAt: iso('2026-11-15'), qty: 9800, unit: 'kg', status: 'listed', grade: '一级' },
    { id: 'B09', productId: 'P01', code: 'TY-2026-0919-DS', plot: '良梨镇 5 号梨园', area: '9 亩', plantedAt: iso('2011-03-10'), harvestedAt: iso('2026-09-19'), qty: 2600, unit: 'kg', status: 'shipped', grade: '一级' },
    { id: 'B10', productId: 'P02', code: 'TY-2026-1015-WC', plot: '民乐乡 7 号田', area: '64 亩', plantedAt: iso('2026-05-22'), harvestedAt: iso('2026-10-15'), qty: 38000, unit: 'kg', status: 'listed', grade: '有机' },
    { id: 'B11', productId: 'P06', code: 'TY-2026-1110-DD', plot: '椅圈镇 3 号棚', area: '1.2 亩', plantedAt: iso('2026-08-20'), harvestedAt: iso('2026-11-10'), qty: 540, unit: 'kg', status: 'shipped', grade: '特级' },
    { id: 'B12', productId: 'P08', code: 'TY-2026-1102-GN', plot: '安西镇 12 号小区', area: '18 亩', plantedAt: iso('2013-03-18'), harvestedAt: iso('2026-11-02'), qty: 7200, unit: 'kg', status: 'shipped', grade: '一级' },
  ];

  // 演示库存：以“件”为单位，来源标记便于解释；不赋予无限库存
  batches.forEach((b, i) => {
    b.stockQty = 80 + ((i * 37) % 120);
    b.soldQty = 0;
    b.stockSource = 'seed-demo';
  });

  const records = [
    // B01 砀山酥梨
    rec('B01', 'prune', iso('2026-03-06', 10), '冬季修剪与清园', '完成 12 亩梨园整形修剪，剪除病枝 46 株，清园后全园喷施 3 波美度石硫合剂一次。', '王秀兰', 'manual', [{ label: '作业面积', value: '12 亩' }, { label: '参与人数', value: '5 人' }]),
    rec('B01', 'fertilize', iso('2026-04-12', 9), '花前追肥', '施用腐熟羊粪有机肥 800kg/亩，配施复合肥（15-15-15）40kg/亩，沟施后覆土浇水。', '王秀兰', 'scan', [{ label: '有机肥批号', value: 'YF-2026-0311' }, { label: '用量', value: '800kg/亩' }]),
    rec('B01', 'pesticide', iso('2026-05-23', 8), '蚜虫防治用药', '10% 吡虫啉可湿性粉剂 20g/亩兑水 30kg 喷雾，重点喷叶背。安全间隔期 14 天。', '王秀兰', 'scan', [{ label: '农药登记证', value: 'PD20095123' }, { label: '安全间隔期', value: '14 天' }, { label: '用量', value: '20g/亩' }]),
    rec('B01', 'irrigate', iso('2026-06-18', 7), '膨果期灌溉', '滴灌 2 次，每次 6 小时，土壤含水率维持在 65% 上下。', '王秀兰', 'iot', [{ label: '土壤含水率', value: '64.8%' }, { label: '灌溉量', value: '18m³/亩' }]),
    rec('B01', 'pesticide', iso('2026-08-20', 9), '梨小食心虫防治', '20% 氯虫苯甲酰胺悬浮剂 10ml/亩，配合性诱捕器 8 个/亩。安全间隔期 21 天，采前 23 天完成用药。', '王秀兰', 'scan', [{ label: '农药登记证', value: 'PD20183456' }, { label: '安全间隔期', value: '21 天' }, { label: '距采收', value: '23 天' }]),
    rec('B01', 'harvest', iso('2026-09-12', 6), '分批采收', '清晨采收，单果人工套袋，采后 2 小时内运至预冷库，预冷至 2℃。', '王秀兰', 'manual', [{ label: '采收量', value: '3200kg' }, { label: '糖度抽检', value: '12.8 Brix' }, { label: '预冷温度', value: '2.1℃' }]),
    rec('B01', 'process', iso('2026-09-13', 10), '分选与包装', '按单果重分为 250—300g 等级，剔除碰伤果 62 个，泡沫托加纸箱包装 640 箱。', '梨源合作社分选线', 'api', [{ label: '分选线编号', value: 'FX-02' }, { label: '合格率', value: '96.4%' }]),
    rec('B01', 'store', iso('2026-09-13', 15), '入库冷藏', '进入 0—4℃ 冷库 C-03，库温记录仪每 30 分钟上传一次。', '梨源合作社冷库', 'iot', [{ label: '库温', value: '2.4℃' }, { label: '库位', value: 'C-03-12' }]),

    // B02 五常大米
    rec('B02', 'sow', iso('2026-05-18', 7), '机械插秧', '稻花香二号秧苗，行距 30cm、株距 14cm，机插 86 亩，缺苗率 2.1%。', '李长福', 'manual', [{ label: '品种', value: '稻花香二号' }, { label: '积温带', value: '第一积温带' }]),
    rec('B02', 'fertilize', iso('2026-06-05', 8), '返青分蘖肥', '施用水稻专用复合肥 12kg/亩，配合硅肥 5kg/亩，无人机撒施。', '李长福', 'iot', [{ label: '作业机号', value: 'UAV-03' }, { label: '用量', value: '12kg/亩' }]),
    rec('B02', 'pesticide', iso('2026-07-02', 16), '稻瘟病预防', '75% 三环唑可湿性粉剂 30g/亩，无人机飞防，安全间隔期 21 天。', '李长福', 'scan', [{ label: '农药登记证', value: 'PD20081234' }, { label: '安全间隔期', value: '21 天' }]),
    rec('B02', 'irrigate', iso('2026-07-28', 6), '浅水灌溉与晒田', '灌浆期浅水勤灌，8 月 5 日起晒田 7 天，控制无效分蘖。', '李长福', 'iot', [{ label: '水位', value: '3cm' }, { label: '晒田天数', value: '7 天' }]),
    rec('B02', 'harvest', iso('2026-10-08', 9), '机械收割', '联合收割机作业，留茬 15cm，损失率 2.4%，湿谷含水率 19.6%。', '李长福', 'api', [{ label: '收割机编号', value: 'H-2026-08' }, { label: '产量', value: '45120kg' }]),
    rec('B02', 'process', iso('2026-10-10', 10), '低温烘干与碾米', '45℃ 低温循环烘干至水分 15.2%，静置 7 天后碾米，出米率 68.4%。', '长福家庭农场加工间', 'api', [{ label: '烘干温度', value: '45℃' }, { label: '出米率', value: '68.4%' }]),
    rec('B02', 'store', iso('2026-10-18', 8), '恒温仓储', '15℃ 恒温库储存，避光防潮，每月抽检水分与脂肪酸值。', '长福家庭农场', 'iot', [{ label: '库温', value: '15.2℃' }, { label: '库位', value: 'WH-B-07' }]),

    // B03 盐池滩羊
    rec('B03', 'sow', iso('2026-05-10', 8), '羔羊入栏建档', '86 户联合社羔羊统一佩戴电子耳标，建档 320 只，记录出生日期与母羊编号。', '马占海', 'scan', [{ label: '耳标数', value: '320 枚' }, { label: '关联农户', value: '86 户' }]),
    rec('B03', 'fertilize', iso('2026-07-15', 7), '放牧与补饲', '盐碱地放牧 6 小时/日，补饲苜蓿干草与玉米青贮，日增重 210g。', '马占海', 'manual', [{ label: '日增重', value: '210g' }, { label: '补饲配方', value: '苜蓿 40% + 青贮 60%' }]),
    rec('B03', 'pesticide', iso('2026-09-28', 9), '秋季防疫与驱虫', '注射小反刍兽疫疫苗，伊维菌素驱虫，休药期 28 天，10 月 26 日后方可出栏。', '盐池县动物疫控中心', 'api', [{ label: '疫苗批号', value: 'PPR-2026-0921' }, { label: '休药期', value: '28 天' }]),
    rec('B03', 'harvest', iso('2026-11-05', 5), '集中出栏与检疫', '出栏 320 只，逐只查验耳标与休药期，产地检疫合格，出具检疫证明。', '盐池县动物卫生监督所', 'api', [{ label: '检疫证号', value: '宁动检字 2026-1105' }, { label: '出栏均重', value: '38.6kg' }]),
    rec('B03', 'process', iso('2026-11-05', 11), '定点屠宰与排酸', '定点屠宰场屠宰，4 小时内进入 0—4℃ 排酸间，排酸 24 小时。', '盐池滩羊定点屠宰场', 'api', [{ label: '屠宰场备案号', value: 'NX-YC-003' }, { label: '排酸时长', value: '24h' }]),
    rec('B03', 'store', iso('2026-11-06', 9), '分割与冷冻入库', '分割为后腿、前腿、羊排等 6 个部位，-18℃ 冷冻入库。', '联合社冷链仓', 'iot', [{ label: '库温', value: '-18.4℃' }, { label: '分割损耗', value: '4.1%' }]),

    // B04 徐闻香蕉
    rec('B04', 'sow', iso('2025-12-02', 8), '组培苗定植', '巴西蕉组培苗定植 18 亩，株距 2.2m×2.0m，定植 3600 株。', '陈志强', 'manual', [{ label: '品种', value: '巴西蕉' }, { label: '定植密度', value: '120 株/亩' }]),
    rec('B04', 'fertilize', iso('2026-03-18', 9), '苗期追肥', '水肥一体化，高氮水溶肥 5kg/亩，每 10 天一次，共 4 次。', '陈志强', 'iot', [{ label: 'EC 值', value: '1.8 mS/cm' }, { label: '用量', value: '5kg/亩' }]),
    rec('B04', 'pesticide', iso('2026-06-22', 8), '叶斑病防治', '25% 丙环唑乳油 1500 倍液喷雾，重点喷新叶，安全间隔期 28 天。', '陈志强', 'scan', [{ label: '农药登记证', value: 'PD20111234' }, { label: '安全间隔期', value: '28 天' }]),
    rec('B04', 'irrigate', iso('2026-09-10', 7), '滴灌与排水', '雨季清沟排水，旱期滴灌 4 小时/次，土壤含水率 70%。', '陈志强', 'iot', [{ label: '土壤含水率', value: '71.2%' }, { label: '排水沟', value: '已疏通 1.2km' }]),
    rec('B04', 'harvest', iso('2026-11-18', 6), '七成熟采割', '按订单分批采割，七成熟（果指饱满度 75%），采后立即分把装箱。', '陈志强', 'manual', [{ label: '采收量', value: '6800kg' }, { label: '成熟度', value: '7 成' }]),
    rec('B04', 'process', iso('2026-11-18', 10), '清洗分把与预冷', '清水清洗、去除蕉指损伤，按 3 把/袋分装，14℃ 预冷 6 小时。', '志强香蕉园', 'manual', [{ label: '预冷温度', value: '14.2℃' }, { label: '损耗率', value: '3.6%' }]),

    // B05 中宁枸杞
    rec('B05', 'prune', iso('2026-03-22', 9), '春季修剪', '剪除病弱枝、徒长枝，保留结果枝 3.2 万条/亩。', '周雪', 'manual', [{ label: '修剪方式', value: '人工整形' }, { label: '留枝量', value: '3.2 万条/亩' }]),
    rec('B05', 'fertilize', iso('2026-04-28', 8), '萌芽肥', '施用腐熟羊粪 1.2 吨/亩 + 枸杞专用肥 30kg/亩，沟施。', '周雪', 'scan', [{ label: '有机肥批号', value: 'YF-2026-0412' }, { label: '用量', value: '1.2 吨/亩' }]),
    rec('B05', 'pesticide', iso('2026-06-15', 7), '蚜虫与木虱防治', '0.5% 苦参碱水剂 800 倍液，生物农药，安全间隔期 7 天。', '周雪', 'scan', [{ label: '农药登记证', value: 'PD20172345' }, { label: '安全间隔期', value: '7 天' }]),
    rec('B05', 'harvest', iso('2026-08-26', 6), '头茬夏果采摘', '人工采摘头茬果，当日摊晾，避免堆沤发热。', '周雪', 'manual', [{ label: '采摘量', value: '2400kg' }, { label: '果实等级', value: '特级 180 粒/50g' }]),
    rec('B05', 'process', iso('2026-08-27', 9), '低温烘干与色选', '45℃ 热风烘干 26 小时，水分 12.8%，色选剔除霉变粒，无硫熏。', '雪原合作社烘干房', 'api', [{ label: '烘干温度', value: '45℃' }, { label: '水分', value: '12.8%' }]),

    // B06 丹东草莓（安全间隔期不足的预警样本）
    rec('B06', 'sow', iso('2026-08-28', 8), '草莓苗定植', '红颜品种定植 1.4 亩，采用高架基质栽培，滴灌带铺设完成。', '孙立军', 'manual', [{ label: '品种', value: '红颜' }, { label: '定植数', value: '9800 株' }]),
    rec('B06', 'fertilize', iso('2026-09-20', 9), '花前追肥', '平衡型水溶肥 3kg/亩，配施腐殖酸 2L/亩，滴灌施入。', '孙立军', 'iot', [{ label: 'EC 值', value: '1.4 mS/cm' }, { label: '用量', value: '3kg/亩' }]),
    rec('B06', 'pesticide', iso('2026-11-16', 15), '灰霉病应急防治', '40% 嘧霉胺悬浮剂 800 倍液喷雾，安全间隔期 7 天。', '孙立军', 'voice', [{ label: '农药登记证', value: 'PD20154321' }, { label: '安全间隔期', value: '7 天' }]),
    rec('B06', 'harvest', iso('2026-11-20', 6), '清晨采摘', '清晨采果 620kg，单果 25g 以上，采后 1 小时内进入 2℃ 冷库。', '孙立军', 'manual', [{ label: '采收量', value: '620kg' }, { label: '采后温度', value: '2.2℃' }]),
    rec('B06', 'store', iso('2026-11-20', 8), '冷库预冷', '0—4℃ 冷库预冷 4 小时，装泡沫托加冰袋发运。', '立军草莓农场', 'iot', [{ label: '库温', value: '2.6℃' }, { label: '预冷时长', value: '4h' }]),

    // B07 高青黑牛
    rec('B07', 'sow', iso('2024-07-15', 9), '犊牛入栏建档', '渤海黑牛杂交犊牛入栏 48 头，佩戴耳标，建立个体档案。', '张德海', 'scan', [{ label: '入栏数', value: '48 头' }, { label: '耳标数', value: '48 枚' }]),
    rec('B07', 'fertilize', iso('2026-06-30', 8), '谷饲育肥', '玉米、豆粕、麸皮配方谷饲，日喂 2 次，日增重 1.35kg。', '张德海', 'manual', [{ label: '日增重', value: '1.35kg' }, { label: '谷饲天数', value: '400 天以上' }]),
    rec('B07', 'pesticide', iso('2026-08-12', 9), '口蹄疫免疫', '注射口蹄疫 O 型灭活疫苗，休药期 21 天。', '高青县动物疫控中心', 'api', [{ label: '疫苗批号', value: 'FMD-2026-0805' }, { label: '休药期', value: '21 天' }]),
    rec('B07', 'harvest', iso('2026-11-12', 5), '出栏与检疫', '出栏 48 头，平均活重 620kg，产地检疫合格。', '高青县动物卫生监督所', 'api', [{ label: '检疫证号', value: '鲁动检字 2026-1112' }, { label: '均重', value: '620kg' }]),
    rec('B07', 'process', iso('2026-11-12', 12), '屠宰分割与排酸', '定点屠宰，72 小时排酸，分割为眼肉、西冷等部位。', '高青黑牛屠宰场', 'api', [{ label: '排酸时长', value: '72h' }, { label: '出肉率', value: '58.2%' }]),

    // B08 赣南脐橙
    rec('B08', 'prune', iso('2026-02-26', 9), '春剪与清园', '剪除病枝、交叉枝，清园后喷施石硫合剂。', '刘建国', 'manual', [{ label: '修剪株数', value: '1320 株' }, { label: '清园面积', value: '24 亩' }]),
    rec('B08', 'fertilize', iso('2026-06-08', 8), '壮果肥', '施用脐橙专用复合肥 1.2kg/株，配合钙镁磷肥。', '刘建国', 'scan', [{ label: '肥料批号', value: 'FL-2026-0528' }, { label: '用量', value: '1.2kg/株' }]),
    rec('B08', 'pesticide', iso('2026-08-30', 7), '红蜘蛛防治', '24% 螺螨酯悬浮剂 4000 倍液，安全间隔期 30 天。', '刘建国', 'scan', [{ label: '农药登记证', value: 'PD20167890' }, { label: '安全间隔期', value: '30 天' }]),
    rec('B08', 'irrigate', iso('2026-10-10', 7), '采前控水', '采前 35 天停止灌溉，提高糖酸比，土壤含水率降至 55%。', '刘建国', 'iot', [{ label: '土壤含水率', value: '54.6%' }, { label: '控水天数', value: '35 天' }]),
    rec('B08', 'harvest', iso('2026-11-15', 7), '分小区采收', '9 号小区采样测糖 13.6 Brix，达标后采收，单果剪蒂。', '刘建国', 'manual', [{ label: '糖度', value: '13.6 Brix' }, { label: '采收量', value: '9800kg' }]),
    rec('B08', 'process', iso('2026-11-15', 13), '清洗分选与打蜡', '清洗、烘干、按果径分选，不添加保鲜剂，单果贴溯源码。', '建国果业分选线', 'api', [{ label: '分选线', value: 'FX-05' }, { label: '果径', value: '75—80mm' }]),

    // B09 P01 另一批次
    rec('B09', 'pesticide', iso('2026-07-28', 9), '梨木虱防治', '22.4% 螺虫乙酯悬浮剂 4000 倍液，安全间隔期 21 天。', '王秀兰', 'scan', [{ label: '农药登记证', value: 'PD20140987' }, { label: '安全间隔期', value: '21 天' }]),
    rec('B09', 'harvest', iso('2026-09-19', 6), '采收', '采收 2600kg，预冷后入冷库。', '王秀兰', 'manual', [{ label: '采收量', value: '2600kg' }, { label: '糖度', value: '12.4 Brix' }]),

    // B10 P02 另一批次
    rec('B10', 'sow', iso('2026-05-22', 7), '插秧', '7 号田机插 64 亩，品种稻花香二号。', '李长福', 'manual', [{ label: '面积', value: '64 亩' }]),
    rec('B10', 'harvest', iso('2026-10-15', 9), '收割', '收割 37900kg，含水率 20.1%。', '李长福', 'api', [{ label: '产量', value: '37900kg' }]),

    // B11 P06 另一批次
    rec('B11', 'pesticide', iso('2026-10-20', 10), '白粉病防治', '25% 乙嘧酚悬浮剂 1000 倍液，安全间隔期 7 天。', '孙立军', 'voice', [{ label: '安全间隔期', value: '7 天' }]),
    rec('B11', 'harvest', iso('2026-11-10', 6), '采摘', '采摘 540kg，当日发运。', '孙立军', 'manual', [{ label: '采收量', value: '540kg' }]),

    // B12 P08 另一批次
    rec('B12', 'harvest', iso('2026-11-02', 7), '采收', '12 号小区采收 7200kg，糖度 13.2 Brix。', '刘建国', 'manual', [{ label: '糖度', value: '13.2 Brix' }]),
    rec('B12', 'process', iso('2026-11-02', 14), '分选包装', '分选 7200kg，合格率 94.8%。', '建国果业分选线', 'api', [{ label: '合格率', value: '94.8%' }]),
  ];

  const tests = [
    {
      id: 'T01', batchId: 'B01', lab: '安徽省农产品质量安全检测中心', reportNo: 'AH-NJ-2026-0918-0421',
      at: iso('2026-09-16', 10), conclusion: '所检项目符合 GB 2763—2021 及 GB 2762—2022 限量要求',
      items: [
        { name: '毒死蜱', value: '未检出', limit: '0.01', unit: 'mg/kg', pass: true, safety: true, ratio: 0 },
        { name: '吡虫啉', value: '0.08', limit: '0.5', unit: 'mg/kg', pass: true, safety: true, ratio: 16 },
        { name: '氯虫苯甲酰胺', value: '0.03', limit: '0.5', unit: 'mg/kg', pass: true, safety: true, ratio: 6 },
        { name: '铅', value: '0.02', limit: '0.1', unit: 'mg/kg', pass: true, safety: true, ratio: 20 },
        { name: '镉', value: '0.003', limit: '0.05', unit: 'mg/kg', pass: true, safety: true, ratio: 6 },
      ],
    },
    {
      id: 'T02', batchId: 'B02', lab: '黑龙江省农产品质量安全检验检测中心', reportNo: 'HLJ-NJ-2026-1012-0088',
      at: iso('2026-10-12', 9), conclusion: '所检项目符合 GB 2763—2021、GB 2761—2017 限量要求',
      items: [
        { name: '三环唑', value: '0.11', limit: '0.5', unit: 'mg/kg', pass: true, safety: true, ratio: 22 },
        { name: '铅', value: '0.05', limit: '0.2', unit: 'mg/kg', pass: true, safety: true, ratio: 25 },
        { name: '镉', value: '0.01', limit: '0.2', unit: 'mg/kg', pass: true, safety: true, ratio: 5 },
        { name: '黄曲霉毒素 B1', value: '2.1', limit: '10', unit: 'μg/kg', pass: true, safety: true, ratio: 21 },
        { name: '水分', value: '15.2', limit: '15.5', unit: '%', pass: true, safety: false, ratio: 98 },
      ],
    },
    {
      id: 'T03', batchId: 'B03', lab: '宁夏回族自治区动物卫生监督所', reportNo: 'NX-DW-2026-1105-0113',
      at: iso('2026-11-05', 9), conclusion: '兽药残留与禁用物质均未检出，检疫合格',
      items: [
        { name: '恩诺沙星', value: '未检出', limit: '100', unit: 'μg/kg', pass: true, safety: true, ratio: 0 },
        { name: '克伦特罗', value: '未检出', limit: '不得检出', unit: 'μg/kg', pass: true, safety: true, ratio: 0 },
        { name: '磺胺类', value: '未检出', limit: '100', unit: 'μg/kg', pass: true, safety: true, ratio: 0 },
        { name: '铅', value: '0.01', limit: '0.2', unit: 'mg/kg', pass: true, safety: true, ratio: 5 },
      ],
    },
    {
      id: 'T04', batchId: 'B06', lab: '辽宁省农产品质量安全检测中心', reportNo: 'LN-NJ-2026-1121-0307',
      at: iso('2026-11-21', 10), conclusion: '所检项目合格；另发现采前用药间隔期不足，已触发平台预警',
      items: [
        { name: '嘧霉胺', value: '0.76', limit: '1.0', unit: 'mg/kg', pass: true, safety: true, ratio: 76 },
        { name: '铅', value: '0.01', limit: '0.1', unit: 'mg/kg', pass: true, safety: true, ratio: 10 },
        { name: '镉', value: '0.002', limit: '0.05', unit: 'mg/kg', pass: true, safety: true, ratio: 4 },
      ],
    },
    {
      id: 'T05', batchId: 'B05', lab: '宁夏回族自治区食品检测研究院', reportNo: 'NX-SP-2026-0829-0156',
      at: iso('2026-08-29', 9), conclusion: '二氧化硫未检出，农药残留符合限量要求',
      items: [
        { name: '二氧化硫', value: '未检出', limit: '0.05', unit: 'g/kg', pass: true, safety: true, ratio: 0 },
        { name: '啶虫脒', value: '0.04', limit: '2.0', unit: 'mg/kg', pass: true, safety: true, ratio: 2 },
        { name: '铅', value: '0.03', limit: '0.2', unit: 'mg/kg', pass: true, safety: true, ratio: 15 },
      ],
    },
    {
      id: 'T06', batchId: 'B08', lab: '江西省农产品质量安全检测中心', reportNo: 'JX-NJ-2026-1116-0198',
      at: iso('2026-11-16', 9), conclusion: '所检项目符合限量要求',
      items: [
        { name: '螺螨酯', value: '0.02', limit: '0.5', unit: 'mg/kg', pass: true, safety: true, ratio: 4 },
        { name: '铅', value: '0.01', limit: '0.1', unit: 'mg/kg', pass: true, safety: true, ratio: 10 },
        { name: '镉', value: '0.004', limit: '0.05', unit: 'mg/kg', pass: true, safety: true, ratio: 8 },
      ],
    },
  ];

  const orders = [
    {
      id: 'O01', no: 'DD2026112001', productId: 'P01', batchId: 'B01', qty: 2, unitPrice: 39.9, amount: 79.8,
      buyer: { name: '徐女士', phone: '136****2210', city: '上海市 徐汇区' },
      status: 'delivered', createdAt: iso('2026-11-20', 10), shipmentId: 'S01',
      afterSale: null, review: null,
    },
    {
      id: 'O02', no: 'DD2026112202', productId: 'P02', batchId: 'B02', qty: 1, unitPrice: 59.9, amount: 59.9,
      buyer: { name: '周先生', phone: '138****7731', city: '杭州市 西湖区' },
      status: 'shipping', createdAt: iso('2026-11-22', 14), shipmentId: 'S02',
    },
    {
      id: 'O03', no: 'DD2026112303', productId: 'P06', batchId: 'B06', qty: 1, unitPrice: 68, amount: 68,
      buyer: { name: '林女士', phone: '137****0092', city: '南京市 鼓楼区' },
      status: 'aftersale', createdAt: iso('2026-11-23', 9), shipmentId: 'S03',
      afterSale: { type: 'bad', note: '收到时下层 6 颗压伤出水', photos: 2, autoResult: '通过，按颗赔付 34.00 元', amount: 34, at: iso('2026-11-24', 10), status: 'approved' },
      review: null,
    },
    {
      id: 'O04', no: 'DD2026111504', productId: 'P03', batchId: 'B03', qty: 1, unitPrice: 128, amount: 128,
      buyer: { name: '陈先生', phone: '139****4412', city: '北京市 朝阳区' },
      status: 'done', createdAt: iso('2026-11-15', 11), shipmentId: 'S04',
      review: { rating: 5, text: '羊腿没有膻味，检疫证明和溯源码都在箱子里，扫了能看到防疫记录，放心。', at: iso('2026-11-18', 20), user: '陈先生', tags: ['新鲜', '溯源码清晰'] },
    },
    {
      id: 'O05', no: 'DD2026112405', productId: 'P08', batchId: 'B08', qty: 1, unitPrice: 36.9, amount: 36.9,
      buyer: { name: '王女士', phone: '135****6678', city: '成都市 武侯区' },
      status: 'paid', createdAt: iso('2026-11-24', 19), shipmentId: null,
    },
    {
      id: 'O06', no: 'DD2026110906', productId: 'P05', batchId: 'B05', qty: 2, unitPrice: 45.9, amount: 91.8,
      buyer: { name: '赵女士', phone: '133****8821', city: '广州市 天河区' },
      status: 'done', createdAt: iso('2026-11-09', 8), shipmentId: 'S05',
      review: { rating: 5, text: '粒大、不酸，泡水颜色是淡黄色不是红色，没有硫熏的味道。检测报告编号能在公众号查到。', at: iso('2026-11-12', 9), user: '赵女士', tags: ['无硫', '颗粒饱满'] },
    },
    {
      id: 'O07', no: 'DD2026112507', productId: 'P07', batchId: 'B07', qty: 1, unitPrice: 168, amount: 168,
      buyer: { name: '孙先生', phone: '136****3345', city: '深圳市 南山区' },
      status: 'packing', createdAt: iso('2026-11-25', 9), shipmentId: null,
    },
    {
      id: 'O08', no: 'DD2026112108', productId: 'P04', batchId: 'B04', qty: 3, unitPrice: 19.9, amount: 59.7,
      buyer: { name: '刘女士', phone: '139****1120', city: '武汉市 洪山区' },
      status: 'done', createdAt: iso('2026-11-21', 16), shipmentId: 'S06',
      review: { rating: 4, text: '到货有点青，放了两天刚好。价格比超市便宜三块多，就是箱子有点软。', at: iso('2026-11-23', 18), user: '刘女士', tags: ['价格实惠'] },
    },
    {
      id: 'O09', no: 'DD2026110509', productId: 'P02', batchId: 'B02', qty: 2, unitPrice: 59.9, amount: 119.8,
      buyer: { name: '郑先生', phone: '137****5590', city: '苏州市 工业园区' },
      status: 'done', createdAt: iso('2026-11-05', 10), shipmentId: 'S07',
      review: { rating: 5, text: '米粒完整，煮粥有一层米油。扫码能看到 4 号田的插秧和收割时间，不是拼配米。', at: iso('2026-11-08', 10), user: '郑先生', tags: ['米香浓', '单一品种'] },
    },
    {
      id: 'O10', no: 'DD20261112010', productId: 'P01', batchId: 'B09', qty: 1, unitPrice: 39.9, amount: 39.9,
      buyer: { name: '何女士', phone: '134****7788', city: '合肥市 蜀山区' },
      status: 'done', createdAt: iso('2026-11-12', 12), shipmentId: 'S08',
      review: { rating: 4, text: '梨很脆，水分足。个头比图片小一点，但甜度没问题。', at: iso('2026-11-15', 9), user: '何女士', tags: ['脆甜'] },
    },
  ];

  const shipments = [
    {
      id: 'S01', orderId: 'O01', batchId: 'B01', carrier: '顺丰冷运', waybill: 'SF7382016459',
      from: '安徽砀山', to: '上海徐汇', promisedAt: iso('2026-11-22', 18), deliveredAt: iso('2026-11-21', 15),
      checkpoints: [
        { at: iso('2026-11-20', 18), place: '砀山冷库 C-03 出库', temp: 2.4, status: 'ok' },
        { at: iso('2026-11-20', 23), place: '徐州中转场', temp: 4.1, status: 'ok' },
        { at: iso('2026-11-21', 6), place: '南京分拨中心', temp: 12.8, status: 'warn' },
        { at: iso('2026-11-21', 11), place: '上海徐汇营业点', temp: 5.2, status: 'ok' },
        { at: iso('2026-11-21', 15), place: '已签收', temp: 5.6, status: 'ok' },
      ],
    },
    {
      id: 'S02', orderId: 'O02', batchId: 'B02', carrier: '京东冷链', waybill: 'JD9920137745',
      from: '黑龙江五常', to: '杭州西湖', promisedAt: iso('2026-11-25', 18), deliveredAt: null,
      checkpoints: [
        { at: iso('2026-11-23', 9), place: '五常恒温仓出库', temp: 15.1, status: 'ok' },
        { at: iso('2026-11-24', 3), place: '沈阳分拨中心', temp: 14.6, status: 'ok' },
        { at: iso('2026-11-24', 22), place: '杭州转运中心', temp: 15.3, status: 'ok' },
      ],
    },
    {
      id: 'S03', orderId: 'O03', batchId: 'B06', carrier: '顺丰冷运', waybill: 'SF7391180226',
      from: '辽宁东港', to: '南京鼓楼', promisedAt: iso('2026-11-24', 18), deliveredAt: iso('2026-11-24', 14),
      checkpoints: [
        { at: iso('2026-11-23', 14), place: '东港冷库出库', temp: 2.2, status: 'ok' },
        { at: iso('2026-11-24', 2), place: '大连中转场', temp: 3.6, status: 'ok' },
        { at: iso('2026-11-24', 14), place: '已签收', temp: 5.1, status: 'ok' },
      ],
    },
    {
      id: 'S04', orderId: 'O04', batchId: 'B03', carrier: '顺丰冷运', waybill: 'SF7386602187',
      from: '宁夏盐池', to: '北京朝阳', promisedAt: iso('2026-11-17', 18), deliveredAt: iso('2026-11-17', 12),
      checkpoints: [
        { at: iso('2026-11-15', 16), place: '盐池冷链仓出库', temp: -18.2, status: 'ok' },
        { at: iso('2026-11-16', 8), place: '银川中转场', temp: -17.6, status: 'ok' },
        { at: iso('2026-11-17', 12), place: '已签收', temp: -12.1, status: 'ok' },
      ],
    },
    {
      id: 'S05', orderId: 'O06', batchId: 'B05', carrier: '中通快递', waybill: 'ZT7712093355',
      from: '宁夏中宁', to: '广州天河', promisedAt: iso('2026-11-12', 18), deliveredAt: iso('2026-11-12', 10),
      checkpoints: [
        { at: iso('2026-11-09', 15), place: '中宁发货仓', temp: 22.4, status: 'ok' },
        { at: iso('2026-11-12', 10), place: '已签收', temp: 23.1, status: 'ok' },
      ],
    },
    {
      id: 'S06', orderId: 'O08', batchId: 'B04', carrier: '圆通速递', waybill: 'YT6602917741',
      from: '广东徐闻', to: '武汉洪山', promisedAt: iso('2026-11-23', 18), deliveredAt: iso('2026-11-23', 11),
      checkpoints: [
        { at: iso('2026-11-21', 18), place: '徐闻发货仓', temp: 14.6, status: 'ok' },
        { at: iso('2026-11-22', 20), place: '广州转运中心', temp: 15.2, status: 'ok' },
        { at: iso('2026-11-23', 11), place: '已签收', temp: 16.4, status: 'ok' },
      ],
    },
    {
      id: 'S07', orderId: 'O09', batchId: 'B02', carrier: '京东冷链', waybill: 'JD9918230117',
      from: '黑龙江五常', to: '苏州工业园', promisedAt: iso('2026-11-08', 18), deliveredAt: iso('2026-11-07', 16),
      checkpoints: [
        { at: iso('2026-11-05', 18), place: '五常恒温仓出库', temp: 15.0, status: 'ok' },
        { at: iso('2026-11-07', 16), place: '已签收', temp: 16.2, status: 'ok' },
      ],
    },
    {
      id: 'S08', orderId: 'O10', batchId: 'B09', carrier: '顺丰冷运', waybill: 'SF7384491023',
      from: '安徽砀山', to: '合肥蜀山', promisedAt: iso('2026-11-14', 18), deliveredAt: iso('2026-11-13', 18),
      checkpoints: [
        { at: iso('2026-11-12', 20), place: '砀山冷库出库', temp: 2.6, status: 'ok' },
        { at: iso('2026-11-13', 18), place: '已签收', temp: 6.1, status: 'ok' },
      ],
    },
  ];

  const reviews = orders.filter((o) => o.review).map((o) => ({
    id: 'V' + o.id.slice(1), orderId: o.id, productId: o.productId,
    rating: o.review.rating, text: o.review.text, at: o.review.at, user: o.review.user, tags: o.review.tags,
  }));

  const alerts = [
    {
      id: 'A01', level: 'high', type: '冷链超温', status: 'open', at: iso('2026-11-21', 6),
      title: '订单 DD2026112001 运输途中超温 46 分钟', batchId: 'B01',
      detail: '南京分拨中心记录 12.8℃，超出砀山酥梨 0—8℃ 温区上限，持续 46 分钟。建议对该单用户主动补偿并复检。',
    },
    {
      id: 'A02', level: 'high', type: '间隔期不足', status: 'open', at: iso('2026-11-20', 8),
      title: '批次 TY-2026-1120-DD 施药距采收仅 4 天', batchId: 'B06',
      detail: '嘧霉胺安全间隔期 7 天，实际间隔 4 天。检测值 0.76mg/kg（限值 1.0），虽合格但存在合规风险，建议暂缓发货并复检。',
    },
    {
      id: 'A03', level: 'mid', type: '扫码异常', status: 'open', at: iso('2026-11-23', 21),
      title: '溯源码 TY-2026-0912-DS 1 小时内被扫 87 次', batchId: 'B01',
      detail: '同一溯源码在上海、郑州、成都三地累计扫码 87 次，超出正常复核频次，疑似标签被复制，建议核验经销商。',
    },
    {
      id: 'A04', level: 'low', type: '资料待补', status: 'open', at: iso('2026-11-20', 10),
      title: '商品「洛川红富士」缺少检测报告', batchId: null,
      detail: '新入驻农户赵明的商品待审，农残检测报告与合格证未上传，按规则不可上架。',
    },
  ];

  const geos = [
    { name: '砀山酥梨', code: 'AGI2010-05-00312', holder: '砀山县梨源果业合作社', region: '安徽省宿州市砀山县', quota: '年授权 1.2 万吨', registeredAt: iso('2010-05-20') },
    { name: '五常大米', code: 'AGI2003-01-00017', holder: '五常市长福家庭农场', region: '黑龙江省哈尔滨市五常市', quota: '年授权 6.8 万吨', registeredAt: iso('2003-01-14') },
    { name: '盐池滩羊', code: 'AGI2010-12-00421', holder: '盐池县滩羊产业联合社', region: '宁夏回族自治区吴忠市盐池县', quota: '年授权 32 万只', registeredAt: iso('2010-12-03') },
    { name: '中宁枸杞', code: 'AGI2004-06-00103', holder: '中宁县雪原枸杞合作社', region: '宁夏回族自治区中卫市中宁县', quota: '年授权 4.6 万吨', registeredAt: iso('2004-06-18') },
    { name: '赣南脐橙', code: 'AGI2004-09-00126', holder: '信丰县建国果业家庭农场', region: '江西省赣州市信丰县', quota: '年授权 28 万吨', registeredAt: iso('2004-09-06') },
    { name: '高青黑牛', code: 'AGI2011-08-00358', holder: '高青县黑牛养殖联合社', region: '山东省淄博市高青县', quota: '年授权 3.4 万头', registeredAt: iso('2011-08-22') },
  ];

  const kb = [
    { id: 'KB01', title: '溯源码与扫码结果的正确读法', tags: ['溯源', '扫码'], content: '一物一码中的“码”对应一个采收批次，而不是单独一颗果实。扫码后可看到地块、农事、检测、冷链四类记录。记录按时间排序，每条都带操作人、方式（物联网自动采集/扫码/语音/人工）和链上哈希。若某个环节缺失，页面会明确标注“该环节未上传记录”，不会用默认值填充。' },
    { id: 'KB02', title: '“未检出”是什么意思', tags: ['检测', '农残'], content: '“未检出”指检测值低于方法检出限，不等于绝对为零。以毒死蜱为例，方法检出限 0.01mg/kg，检测结果低于该值即记为未检出。国标 GB 2763—2021 对不同作物的限量不同，判断合格与否要看“检测值/限量值”的比值，而不是是否有数值。' },
    { id: 'KB03', title: '安全间隔期与休药期规则', tags: ['农事', '合规'], content: '安全间隔期指最后一次施药到采收的最短间隔，叶菜一般 7—14 天，果树 14—30 天，具体以农药标签为准。畜禽使用兽药后有休药期，猪禽一般 7—28 天，牛羊更长。平台在记录用药时必须选择农药登记证号，系统按标签间隔期自动校验采收日期，间隔不足会触发预警并暂缓发货。' },
    { id: 'KB04', title: '生鲜坏果的赔付规则', tags: ['售后', '赔付'], content: '签收 24 小时内拍照上传，系统按坏果比例自动核赔：坏果率 5% 以下补 5 元无门槛券；5%—20% 按比例退款；20% 以上全额退款且无需寄回。叶菜、浆果、草莓按颗/按把计赔。冷链超温导致的腐坏，平台先行赔付，再向承运方追偿。' },
    { id: 'KB05', title: '冷链温区与超温处理', tags: ['冷链', '物流'], content: '浆果与叶菜 0—4℃，热带水果 12—15℃，冷冻肉品 -18℃ 以下，大米等粮油 15℃ 恒温避光。运输途中每 30 分钟记录一次温度，连续两次超出温区即判超温。超温订单自动进入售后绿色通道，同时通知发货方复检。' },
    { id: 'KB06', title: '平台佣金与结算周期', tags: ['结算', '商业模式'], content: '平台按成交额收取 3% 服务费，首年优惠至 1.5%，无入驻费与年费。订单签收且售后期（7 天）结束后 T+1 结算至合作社账户，合作社按成员交售量二次分账。检测、赋码、冷链等成本在结算单中逐项列明，农户可核对每一笔扣费。' },
    { id: 'KB07', title: '地理标志使用的合规边界', tags: ['地标', '合规'], content: '地理标志产品须在授权名录内，使用专用标志须经持有人许可。平台要求上传地理标志使用授权书与产地证明，并按批次记录产地范围。未获授权的商品不得在标题、主图使用地理标志名称，违规将被下架并计入信用记录。' },
    { id: 'KB08', title: '农户数据归属与授权', tags: ['数据', '隐私'], content: '农事记录归农户所有，平台在授权范围内使用。上链只写哈希与关键节点凭证，不上传身份证、银行卡、精确住址。消费者扫码只看到村级产地与农事记录，看不到农户手机号与详细地址。农户可在农户端导出自己的全部数据。' },
    { id: 'KB09', title: '助农真实性如何核验', tags: ['助农', '治理'], content: '平台对“助农”标签实行三查：查主体（是否建档立卡农户或合作社成员）、查交易（订单资金是否结算到农户账户）、查数据（是否有连续农事记录）。虚假助农宣传一经查实，取消标签并公示。消费者可在商品页查看农户故事与结算凭证摘要。' },
    { id: 'KB10', title: '退款与运费承担', tags: ['售后'], content: '质量问题（腐坏、缺斤少两、与描述不符）由商家承担来回运费并全额退款；非质量问题（不喜欢、买多了）在生鲜品类不支持无理由退货，但可申请部分补偿。定制、预售类商品在发货前可随时取消。' },
    { id: 'KB11', title: '预订与预售的履约保障', tags: ['交易'], content: '预售商品须标注预计发货时间，逾期未发货系统自动赔付订单金额 5% 的违约金。预售期间价格下调，按低价结算。产地受灾导致无法履约的，平台协助改期或全额退款。' },
    { id: 'KB12', title: '区块链存证能证明什么', tags: ['区块链', '存证'], content: '存证能证明“这条记录在某时刻之后没有被修改”，不能证明“记录内容在录入时就是真的”。因此平台要求关键节点由物联网设备自动采集，人工录入的记录必须带照片或扫码凭证，并接受抽检。链上哈希可用交易哈希在链浏览器复核。' },
    { id: 'KB13', title: '智能体回答的能力边界', tags: ['智能体'], content: '智能体只基于平台内的批次档案、检测报告、规则库回答，不提供疾病诊断、保健功效或投资建议。遇到功效类问题会明确说明无法判断并建议咨询专业人士。回答末尾附引用来源，便于核对。' },
    { id: 'KB14', title: '合作社代农户操作的规范', tags: ['入驻', '合作社'], content: '合作社可代为注册与录入，但须取得农户书面授权，并在系统中标注“代办人”。代录记录同样需要照片或语音凭证。农户可随时在手机上查看、纠正或撤回授权。平台按代办笔数向合作社支付服务补贴，不向农户收费。' },
  ];

  // 建链
  batches.forEach((b) => {
    const rs = records.filter((r) => r.batchId === b.id).sort((a, c) => a.at.localeCompare(c.at));
    chain.build(rs);
  });
  const ledger = records
    .slice()
    .sort((a, c) => a.at.localeCompare(c.at))
    .map((r, i) => ({
      height: i + 1, batchId: r.batchId, recordId: r.id, type: r.type,
      dataHash: r.hash, prevHash: r.prevHash, hash: r.hash, at: r.at, tx: r.tx,
      writer: r.method === 'iot' ? 'IoT 网关' : r.method === 'api' ? '第三方系统' : '农户端',
    }));

  ledger.forEach((l) => {
    const r = records.find((x) => x.id === l.recordId);
    if (r) r.height = l.height;
  });

  const scans = {};
  batches.forEach((b, i) => {
    scans[b.code] = [1284, 962, 418, 736, 521, 388, 204, 1105, 642, 730, 296, 864][i] || 120;
  });

  // ===== 预置账号：每次种子生成随机口令，口令加盐 sha256 存储 =====
  // 说明：这里只是为了课堂演示方便，正式环境应改为手机验证码注册 + 强口令策略。
  const SEED_PASSWORD = crypto.randomBytes(12).toString('hex');
  const mkUser = (id, phone, name, role, farmerId) => {
    const salt = crypto.randomBytes(8).toString('hex');
    return {
      id, phone, name, nickname: name, role, farmerId: farmerId || null, salt,
      status: 'active',
      password: crypto.createHash('sha256').update(salt + '|' + SEED_PASSWORD).digest('hex'),
      createdAt: iso('2026-01-01'),
    };
  };
  const users = [
    // 消费者：3 个演示账号
    mkUser('U1001', '13800000001', '张女士', 'consumer'),
    mkUser('U1002', '13800000002', '李先生', 'consumer'),
    mkUser('U1003', '13800000003', '王女士', 'consumer'),
    // 农户：与 F01—F09 一一对应，手机号 13900000001—13900000009
    ...farmers.map((f, i) => mkUser('UF' + String(i + 1).padStart(2, '0'), '1390000000' + (i + 1), f.name, 'farmer', f.id)),
    // 待审核农户演示账号：登录后只能看到入驻申请状态
    Object.assign(mkUser('UF10', '13900000010', '周成', 'farmer'), { status: 'pending', farmerId: null }),
    // 运营/监管
    mkUser('UA001', '13900000000', '平台运营', 'admin'),
  ];

  // 一条待审核入驻申请（对应 UF10），供运营后台演示审核
  const applications = [{
    id: 'FA20261125001', userId: 'UF10', status: 'pending',
    orgType: '家庭农场', orgName: '周成家庭农场', region: '安徽省宿州市砀山县良梨镇',
    contact: '周成', mainCategory: '水果', description: '自家 12 亩梨园，愿意按批次记录农事并接受抽检。',
    materials: [{ name: '营业执照.jpg', type: 'image/jpeg', size: 184320, demo: true, note: '演示：仅记录文件元数据，未真实存储文件' }],
    submittedAt: iso('2026-11-24', 10), reviewedAt: null, reviewer: null, rejectReason: '',
  }];

  return {
    version: 3,
    createdAt: new Date().toISOString(),
    farmers, products, batches, records, tests, shipments, orders, reviews, alerts, geos, kb, users, applications,
    breakdown, ledger, scans, carts: {},
    scanLog: [
      { code: 'TY-2026-0912-DS', at: iso('2026-11-23', 21), city: '上海市', ip: '116.226.**.**' },
      { code: 'TY-2026-0912-DS', at: iso('2026-11-23', 21), city: '郑州市', ip: '123.15.**.**' },
      { code: 'TY-2026-0912-DS', at: iso('2026-11-23', 21), city: '成都市', ip: '171.88.**.**' },
    ],
    demo: { tamper: { batchId: null, recordId: null, originalDetail: null } },
    settings: {
      llm: {
        enabled: false,
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        apiKey: '',
        temperature: 0.2,
      },
    },
    counters: { farmerSigned: 9, households: 128, batches: batches.length, ledgerHeight: ledger.length },
  };
}

module.exports = seed;
