# 溯源助农平台 · 工程约定（所有协作方必读）

## 1. 运行方式
- 纯 Node.js（v24），**零第三方依赖**。启动：`node platform/server.js`（或 `启动平台.bat`）。
- 默认端口 `8848`，地址 `http://127.0.0.1:8848`。
- 数据落在 `platform/data/db.json`（首次启动由 `data/seed.js` 生成）。删除该文件即可重置演示数据。
- 静态资源目录 `platform/public`，由 server 直接托管。

## 2. 目录与文件归属（不要越界改别人的文件）
```
platform/
  server.js            路由与静态托管（lead）
  lib/store.js         JSON 持久化（lead）
  lib/chain.js         哈希链（lead）
  lib/agent.js         智能体引擎 + 大模型适配（lead）
  lib/qr.js            QR 码 SVG 生成（lead）
  data/seed.js         种子数据（lead）
  public/assets/design.css   设计系统（lead，只读）
  public/assets/app.js       UI 套件与图标（lead，只读）
  public/index.html          消费端首页 + 商城（UI-A）
  public/js/home.js          （UI-A）
  public/trace.html          溯源码查询页（UI-B）
  public/js/trace.js         （UI-B）
  public/farmer.html         农户工作台（UI-C）
  public/js/farmer.js        （UI-C）
  public/admin.html          运营监管后台（UI-D）
  public/js/admin.js         （UI-D）
  public/agent.html          智能体工作台（lead）
  public/js/agent.js         （lead）
  public/js/mock.js          前端演示兜底数据（lead）
```

## 3. 设计系统（强制）
- 只用 `assets/design.css` 中的类与 CSS 变量；**不要新增颜色值、字号、间距**。
- 字号只能用 Text Style 类：`heading-1..6`、`title-1..5`、`body-1..6`、`btn-*`、`caption-1..5`。
  中文界面最常用：`heading-3/4/5` 作区标题，`heading-6` 作卡片大标题，`title-2/3` 作卡片标题，`body-3` 正文，`body-6` 次要正文，`caption-2` 元信息。
- 间距只用 `--s-25/50/75/100/200/300/400/500/600/700/800/900`，通过 `style="gap:var(--s-300)"` 或组件类使用。
- 圆角只用 `--r-sm(8) --r-md(12) --r-lg(16) --r-xl(24)`。
- **禁止**：背景渐变、单边边框卡片、斜体、900 字重、`#` 死链、`window.alert`、圆形 loading 转圈（用骨架屏）、Inter/Roboto/Arial/Helvetica 字体。
- 所有交互元素必须有 hover / active / focus-visible 状态；列表必须有骨架屏与空状态。
- 图标只用 `app.js` 的 `icon(name)`（Phosphor 风格线性图标），禁止 emoji 当图标。
- 动效：`--ease` + 300–500ms，只动 transform/opacity；滚动入场用 `data-reveal`（由 app.js 统一观察）。
- 文案：中文全角标点，句内不用连字符 "-"；标题与按钮用陈述句，不用感叹号；数字用真实数据（见种子数据）。
- 移动端 390px 不得横向溢出；表格在窄屏改为卡片式堆叠（`.table--stack`）。

## 4. API 契约（全部返回 JSON，失败 `{error:{code,message}}` + 4xx/5xx）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/meta` | `{categories,regions,stats,llm:{enabled,model}}` |
| GET | `/api/products?category=&q=&sort=&traceOnly=1` | 商品列表（含 farmer、batchCount、traceRate） |
| GET | `/api/products/:id` | 商品详情（batches、farmer、priceBreakdown、reviews、content） |
| GET | `/api/trace/:code` | 溯源码全量：product、farmer、batch、records、tests、shipment、verify、scanCount |
| GET | `/api/trace/:code/verify` | 链校验明细 `{ok,nodes[],tamperedIndex}` |
| POST | `/api/agent/ask` | `{question,code?}` → `{intent,steps[],answer,citations[],confidence,followups[]}` |
| POST | `/api/agent/content` | `{productId,batchId?,channel,tone?}` → `{title,points[],detail[],script,hashtags[]}` |
| POST | `/api/agent/service` | `{question,orderId?}` → `{answer,action,handoff,refs[]}` |
| GET | `/api/farmer/:id/dashboard` | KPI、7 日趋势、待办、最近订单 |
| GET | `/api/farmer/:id/batches` | 批次 + 记录数 + 溯码 |
| POST | `/api/farmer/:id/products` | 新建商品（pending，待运营审核） |
| POST | `/api/farmer/:id/batches` | `{productId,plot,area,qty,plantedAt,harvestAt}` → batch |
| POST | `/api/farmer/:id/records` | `{batchId,type,title,detail,method,at,evidence}` → record + chain tx |
| GET | `/api/orders?farmerId=` | 订单列表 |
| POST | `/api/orders` | `{productId,qty,buyer}` → order |
| POST | `/api/orders/:id/aftersale` | `{type,note,photos}` → 自动核赔结果 |
| POST | `/api/orders/:id/review` | `{rating,text,tags}` |
| GET | `/api/admin/overview` | KPI、预警、链统计、分布 |
| GET | `/api/admin/ledger?limit=50` | 最新区块 |
| POST | `/api/admin/alerts/:id/resolve` | 处置预警 |
| GET | `/api/admin/audit` | 待审商品 |
| POST | `/api/admin/products/:id/review` | `{action:'approve'|'reject',reason}` |
| POST | `/api/admin/demo/tamper` | `{batchId,on}` 篡改演示开关 |
| GET/POST | `/api/settings` | 大模型配置（GET 时 key 打码） |
| GET | `/api/qr?data=&size=` | SVG 二维码 |

## 5. 数据结构（db.json）
```js
farmers:[{id,name,type:'A|B|C|D',region:{province,city,county,village},phone,joinedAt,
          story,acreage,certs[],rating,orders,avatarHue}]
products:[{id,name,category,unit,price,originalPrice,spec,grade,organic,greenFood,geoIndication,
           farmerId,summary,highlights[],priceBreakdown:[{label,amount}],
           status:'on|pending',createdAt,monthlySales,repurchaseRate,ratingAvg,ratingCount}]
batches:[{id,productId,code,plot,area,plantedAt,harvestedAt,qty,status,grade}]
records:[{id,batchId,type,at,title,detail,operator,method,evidence[],hash,prevHash,tx,height}]
tests:[{id,batchId,lab,reportNo,at,items:[{name,value,limit,unit,pass}],conclusion}]
shipments:[{id,orderId,batchId,carrier,waybill,from,to,checkpoints:[{at,place,temp,status}],
            promisedAt,deliveredAt}]
orders:[{id,no,productId,batchId,qty,unitPrice,amount,buyer:{name,phone,city},
         status,createdAt,shipmentId,afterSale,review}]
reviews:[{id,orderId,productId,rating,text,at,user,tags[]}]
alerts:[{id,level,type,title,detail,at,status,batchId}]
ledger:[{height,batchId,recordId,dataHash,prevHash,hash,at,tx}]
geos:[{name,code,holder,region,quota,registeredAt}]
settings:{llm:{enabled,baseUrl,model,apiKey}}
```
- 溯源码格式 `TY-<年>-<月日>-<产品缩写><序号>`，例：`TY-2026-0912-DS`。
- 记录类型：`sow|fertilize|pesticide|irrigate|prune|harvest|process|store|ship`。
- 链：`hash = sha256(prevHash + '|' + canonical(recordCore))`，`tx = '0x'+hash.slice(0,16)`。

## 6. 页面信息架构
- **消费端 `/`**：悬浮导航（首页/商城/溯源/智能体/农户端）、Hero、数据条、痛点、三步流程、标语揭示、商城（筛选+商品卡）、溯源演示、双边价值、智能体三能力、案例证明、商业模式、FAQ、尾 CTA、页脚。
- **溯源页 `/trace.html?code=`**：溯码检索、真伪校验、链上时间线、分级展示（基础/进阶/深度）、质检报告、冷链轨迹、AI 问答侧栏、农户故事、扫码次数。
- **农户端 `/farmer.html`**：KPI、待办、新建商品、批次与赋码、农事记录（语音/拍照/扫码）、AI 文案、订单结算、看板。
- **后台 `/admin.html`**：总览 KPI、链账本、预警处置、商品审核、地标库、数据分布、大模型设置。
- **智能体 `/agent.html`**：溯源问答、内容生成、客服三个工作台 + 工作流可视化 + 引用来源。

## 7. 验收
- `node platform/server.js` 启动无报错；所有页面 200；核心 API 有数据。
- 390px、768px、1440px 三档截图无溢出、无遮挡。
- 每页 console 无 error。

## 8 鉴权与角色（2026-11 增量）

- 角色：`consumer` 消费者 / `farmer` 农户 / `admin` 运营监管。
- 口令：`sha256(salt + "|" + password)`，salt 每人随机 8 字节，存 `db.users`。
- Token：`base64url(payload).base64url(HMAC-SHA256(secret, payload))`，payload 含 `uid/role/exp/sid`，有效期 24h；`sid` 存进程内 Map，登出即删；服务重启全部失效。
- 接口：`POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me`。
- 守卫：
  - `/api/farmer/*`：`farmer` 或 `admin`；`farmer` 只能访问自己的 `farmerId`，否则 403。
  - `/api/admin/*`、`/api/settings`：仅 `admin`。
  - `POST /api/orders`、`/orders/:id/aftersale`、`/orders/:id/review`：任意已登录角色。
  - `GET /api/orders`：匿名可读但脱敏（无姓名、手机号、userId）；农户强制只看自己，消费者只看自己。
  - 商品、溯源、智能体、meta 等只读接口保持公开。
- 演示账号（密码见 `.acceptance.env`（员工）或项目负责人保管的旧账号）：消费者 `13800000001/2/3`；农户 `13900000001—09`（F01—F09，王秀兰为 `13900000001`）；运营 `13900000000`。
- 前端：`public/js/auth.js` 统一封装 `getToken / getUser / requireRole / logout / requirePage / openLogin`，`assets/app.js` 的 `api()` 自动带 Bearer，401 触发登录门或登录弹窗。
