# 功能与业务逻辑说明

本文回答三个问题：**有哪些功能、谁能用、关键规则是什么**。  
数据字段与接口细节以 `SPEC.md` 和代码为准；启动与演示见根目录 `README.md`；按角色拆分的运行链见 `USER-FLOWS.md`。

> `SPEC.md` 是早期工程约定，个别示例已落后于当前实现（例如溯源码现为 `TY-...`，商城/订单接口有增补）。字段、状态与权限以本文件和 `server.js` 为准。

当前版本：2026-11-27  
对应代码：`platform/server.js`、`platform/lib/commerce.js`、`platform/lib/auth.js`、`platform/lib/chain.js`、`platform/lib/agent.js`

---

## 1. 角色与权限

### 1.1 三种角色

| 角色 | 代码 | 典型入口 | 说明 |
|---|---|---|---|
| 消费者 | `consumer` | 首页、商城、个人中心 | 下单、售后、评价、查看自己的订单 |
| 农户 | `farmer` | `/farmer.html` | 管理自己的批次、农事记录、订单 |
| 运营 / 监管 | `admin` | `/admin.html` | 审核、预警、链账本、大模型设置、篡改演示 |

农户账号有状态：

- `pending`：刚注册，未通过入驻审核，不能进入工作台；
- `active`：已通过审核，有 `farmerId`，可进入工作台；
- `rejected`：审核被驳回，可修改资料后重新提交。

### 1.2 权限矩阵

| 能力 | 未登录 | 消费者 | 农户（active） | 运营 |
|---|---|---|---|---|
| 浏览首页 / 商城 / 商品详情 | 可以 | 可以 | 可以 | 可以 |
| 查溯源 / 链校验 / 智能体问答 | 可以 | 可以 | 可以 | 可以 |
| 游客购物车 | 可以（需 `x-guest-id`） | 可以 | 可以 | 可以 |
| 登录后合并游客购物车 | 不可以 | 可以 | 可以 | 可以 |
| 结算下单 | 不可以 | 可以 | 不可以 | 不可以 |
| 查看自己的订单 | 不可以 | 可以 | 只看到自己商品的订单行 | 脱敏全量 |
| 售后 / 评价 / 再次购买 | 不可以 | 仅自己的订单 | 不可以 | 不可以 |
| 农户工作台 `dashboard` / `batches` | 不可以 | 不可以 | 仅自己的 `farmerId` | 不可以（接口只允许 farmer） |
| 新建批次 / 写农事记录 | 不可以 | 不可以 | 仅自己的 `farmerId` | 可以（代写） |
| 提交农户入驻申请 | 不可以 | 不可以 | 仅 `farmer` 角色，且未通过审核 | 不可以 |
| 审核农户 / 商品 / 预警 | 不可以 | 不可以 | 不可以 | 可以 |
| 链账本 / 大模型设置 | 不可以 | 不可以 | 不可以 | 可以 |

关键守卫：

- 未登录访问受保护接口：`401 UNAUTHORIZED`；
- 角色不符：`403 FORBIDDEN`；
- 农户未激活：`403 FARMER_PENDING`；
- 农户访问别人的 `farmerId`：`403 FORBIDDEN`；
- 订单越权：`403 FORBIDDEN`。

### 1.3 登录态

- 密码：`sha256(salt + "|" + password)`，每人随机 salt，存 `db.users`；
- Token：`base64url(payload).base64url(HMAC-SHA256(secret, payload))`；
- payload 含 `uid / role / exp / sid`，有效期 24 小时；
- `sid` 存在服务进程内的 `TOKENS` Map，登出立即删除；
- 服务重启后所有 token 失效，需要重新登录；
- 前端把 token 放 `localStorage`，请求自动带 `Authorization: Bearer ...`；
- 401 时前端触发登录弹窗或登录门。

---

## 2. 页面与功能

共 13 个 HTML 页面。

### 2.1 消费者侧

| 页面 | 地址 | 功能 |
|---|---|---|
| 首页 | `/` | 品牌主张、搜索、热门品类、商品卡、品牌片、产地证据、农户入口 |
| 产地商城 | `/shop.html` | 关键词搜索、分类、排序、商品卡、快速加购 |
| 商品详情 | `/product.html?id=P01` | 实拍主图、分级溯源信息、批次、检测报告、价格构成、评价、加购/立即购买 |
| 购物车 | `/cart.html` | 游客/登录购物车、数量修改、删除、合并、结算 |
| 个人中心 | `/account.html` | 资料、订单统计、订单列表、售后、评价、再次购买、农户申请入口 |
| 注册 | `/register.html` | 消费者手机号注册，注册后自动登录 |
| 溯源码页 | `/trace.html?code=TY-2026-0912-DS` | 溯码查询、批次摘要、链校验、3D 旅程、二维码、分级信息、AI 答疑 |
| 品牌片 | `/brand.html` | 12 秒品牌片、播放/暂停、声音开关、全屏、低动态回退 |
| 智能体 | `/agent.html` | 溯源问答、内容生成、智能客服三个工作台 |
| 方向对比 | `/compare.html` | 三套首页视觉方向对比，仅用于设计决策 |

### 2.2 农户 / 运营侧

| 页面 | 地址 | 功能 |
|---|---|---|
| 农户工作台 | `/farmer.html` | KPI、待办、批次与赋码、农事记录、AI 文案、订单结算 |
| 农户入驻 | `/farmer-apply.html` | 提交资料、查看审核状态、被驳回后重新提交 |
| 运营后台 | `/admin.html` | 总览、链账本、预警处置、商品审核、农户审核、地标库、大模型设置、篡改演示 |

### 2.3 页面通用行为

- 导航、页脚、购物车角标、登录态由 `assets/app.js` 统一渲染；
- 登录是弹窗，不是单独页面；
- 手机端（≤900px）导航收进全屏菜单，菜单项支持触摸；
- 所有页面有骨架屏 / 空状态；
- 页面 HTML 不缓存，CSS/JS 缓存 60 秒；样式引用带版本号，避免手机旧缓存。

---

## 3. 核心业务流程

### 3.1 注册 / 登录

**消费者注册**

1. `POST /api/auth/register`；
2. 校验手机号 11 位、密码至少 6 位、同意演示协议；
3. 手机号重复返回 `409 PHONE_TAKEN`；
4. 创建 `consumer`，状态 `active`；
5. 返回 token 和用户信息，前端自动登录。

**登录**

1. `POST /api/auth/login`；
2. 校验手机号 / 密码；
3. 返回 token、`publicUser`；
4. 前端写入 `ty_token`、`ty_user`；
5. 401 时清除本地会话并弹出登录。

**登出**

`POST /api/auth/logout`，服务端删除 `sid`，前端清 localStorage。

### 3.2 游客购物车 → 登录合并 → 结算

1. 未登录时前端生成 `guestId`，请求头带 `x-guest-id`；
2. 游客可加购、改数量、删除；
3. 登录后 `POST /api/cart/merge`，把游客购物车合并到用户购物车；
4. 同一商品同一批次合并数量，受 `MAX_QTY` 和库存限制；
5. 结算必须登录且角色为 `consumer`；
6. `POST /api/checkout` 校验收货人、手机号、城市、详细地址；
7. 服务端扣减批次 `soldQty`，写订单和商品/批次快照；
8. 清除已购买购物车行；
9. 返回订单，提示“演示订单，未发起真实支付”。

### 3.3 商品 → 加购 / 立即购买 → 订单

- 商品可售条件：`product.status === 'on'`，存在批次，批次不是 `shipped`，可用库存 > 0；
- 可用库存 = 批次总量 − `soldQty`；
- 立即购买走 `POST /api/orders`，只允许消费者；
- 订单写入：
  - `items[]`（商品行、数量、单价、行金额）；
  - `productSnapshot`、`batchSnapshot`（防商品改价影响历史订单）；
  - `buyer`、`address`；
  - `status: 'paid'`、`payment: 'demo'`；
- 订单号 `DD + 日期 + 序号`；
- 下单后批次 `soldQty` 增加。

### 3.4 溯源查询与链校验

1. `GET /api/trace/:code` 按溯源码查批次（大小写不敏感）；
2. 返回商品、农户、批次、记录、检测、运输、校验结果、扫码次数；
3. `GET /api/trace/:code/verify` 只返回链校验：
   - 按 `at` 排序；
   - 逐条重算 `hash = SHA-256(prevHash + "|" + canonical(recordCore))`；
   - 返回 `{ok, nodes, tamperedIndex}`；
4. 前端展示每条记录的交易哈希、区块高度、校验状态；
5. 后台“篡改演示”修改某条记录的 `detail` 但不重算哈希，校验会定位到该条；
6. 关闭篡改后恢复原文；
7. 二维码指向 `/t?c=溯源码`，302 到 `/trace.html?code=...`；
8. 扫码计数用于识别仿冒。

### 3.5 农户入驻与审核

1. 农户注册：`POST /api/farmer/register`，创建 `role=farmer, status=pending`；
2. 登录后进入 `/farmer-apply.html`；
3. `POST /api/farmer/application` 提交：
   - 组织类型、名称、地区、联系人、主营品类、描述；
   - 材料只记录元数据，不真实上传文件；
4. 提交后 `user.status = 'pending'`；
5. 运营在后台审核：
   - 通过：生成 `Fxx`，写 `db.farmers`，申请 `approved`，用户 `active` 并绑定 `farmerId`；
   - 驳回：申请 `rejected`，用户 `rejected`，记录原因；
6. 被驳回后可修改资料重新提交；已通过不能重复提交。

### 3.6 批次与农事记录

**新建批次**

`POST /api/farmer/:farmerId/batches`：

- 农户只能写自己的 `farmerId`，运营可代写；
- 生成溯源码：`TY-年份-月日-产品缩写+序号`；
- 新批次状态 `growing`，记录地块、面积、种植/采收时间、数量、等级。

**写农事记录**

`POST /api/farmer/:farmerId/records`：

- 记录类型：`sow / fertilize / pesticide / irrigate / prune / harvest / process / store / ship`；
- 写入后调用 `rebuildLedger()`，重算该批次哈希链和全局 ledger；
- 返回记录和“记录已上链存证”；
- 记录出现在溯源页时间线。

### 3.6.1 新农户新建商品与平台审核

先区分两个对象：

- **商品 / SKU**：例如“砀山酥梨 · 头茬采摘”，是商城里的展示与定价单位；
- **批次**：例如 `TY-2026-0912-DS`，是同一商品的一次生产/采收，挂农事记录和溯源码。

当前完整链路：

```text
农户 active
  → 新建商品
  → 商品 status = pending
  → 平台后台待审
  → 通过：status = on，进入商城
  → 驳回：status = rejected，记录原因
  → 农户修改后重新提交：status = pending
  → 商品 on 后，才能新建批次
  → 写农事记录 → 上链 → 消费者扫码
```

**新建商品**

```text
POST /api/farmer/:farmerId/products
body: {
  name, category, price, unit, spec, grade,
  summary, geo, art, highlights?,
  organic?, greenFood?, geoIndication?
}
```

规则：

- 农户只能写自己的 `farmerId`；运营可代建，但必须显式传 `body.farmerId`；
- 商品 `farmerId` 由服务端决定，不信任请求体；
- 名称 2–40 字，同一农户不能重名；
- 品类必须属于现有品类（水果 / 粮油 / 肉禽蛋 / 滋补）；
- 售价 0.01–99999 元；
- 商品简介必填，最多 200 字；
- 主图从内置实拍图库选择（`pear / apple / orange / strawberry / rice / banana / beef / lamb / goji`），校验文件存在；
- 新商品状态固定为 `pending`；
- 自动生成价格构成：地头收购、分选包装、冷链运输、平台服务、农户收益，合计等于售价。

**平台审核**

```text
GET  /api/admin/overview          → audit[] 包含 pending 商品
POST /api/admin/products/:id/review
body: { action: 'approve' | 'reject', reason? }
```

- 通过：`status = on`，进入商城，可建批次；
- 驳回：`status = rejected`，写 `reviewNote` 与 `reviewedAt`；
- 农户可在工作台看到驳回原因，点「修改重提」编辑后重新提交，商品回到 `pending`。

**展示约束**

- 公开 `GET /api/products` 只返回 `status === 'on'`；
- 待审/驳回商品详情只允许货主和运营预览，其他人 404；
- 农户工作台显示商品审核状态（待审核 / 已上架 / 已驳回）；
- 新农户没有已上架商品时，批次区引导先“新建商品”，不显示新建批次入口。

**建批次约束**

```text
POST /api/farmer/:farmerId/batches
```

- 商品必须存在且 `status === 'on'`；
- 农户只能为自己的商品建批次；
- 运营可代建；
- 建批次后生成 `TY-...` 溯源码，状态 `growing`。

**前端入口**

- `/farmer.html` → 批次与赋码 → 「新建商品」；
- 表单字段：名称、品类、售价、规格、等级、主图、产地、详细规格、简介；
- 提交后提示“已提交审核”，商品以“待审核”状态出现在批次区顶部；
- 运营在 `/admin.html` → 商品审核中通过后，商品出现在 `/shop.html`。

> 说明：当前“主图”是从内置实拍图库选择，不是真实文件上传；对象存储/图片上传仍未实现。

### 3.7 售后 / 评价 / 再次购买

**售后**

`POST /api/orders/:id/aftersale`：

- 只能操作自己的订单；
- 类型：`bad`（坏果）/ `missing`（少件）/ 其他；
- 自动核赔比例：坏果 50%、少件 30%、其他 15%；
- 写 `afterSale`，订单状态置 `aftersale`；
- 提示“演示自动核赔，未发起真实退款”。

**评价**

`POST /api/orders/:id/review`：

- 只能评价自己的订单；
- 同一订单同一商品只能评价一次，重复返回 `409 ALREADY_REVIEWED`；
- 评分 1–5，文本最多 500 字，标签最多 5 个；
- 更新商品 `ratingAvg / ratingCount`。

**再次购买**

`POST /api/orders/:id/buy-again`：

- 把订单中仍可售的商品加入购物车；
- 不可售的跳过，返回 `added / skipped`。

### 3.8 智能体

三个入口：

| 接口 | 用途 | 输入 | 输出 |
|---|---|---|---|
| `POST /api/agent/ask` | 溯源问答 | `question`，可选 `code` | 意图、工具步骤、回答、引用、置信度、追问 |
| `POST /api/agent/content` | 内容生成 | 商品/批次、渠道、语气 | 标题、卖点、详情、脚本、话题 |
| `POST /api/agent/service` | 智能客服 | 问题、可选订单号 | 回答、动作、是否转人工、引用 |

逻辑：

1. 识别意图与槽位；
2. 调用只读工具（批次、记录、检测、运输、订单等）；
3. 知识库 Top 3 召回；
4. 先结论后依据，附记录编号 / 交易哈希；
5. 如果后台启用大模型，先走模型（温度默认 0.2、20 秒超时）；
6. 模型失败或未配置，回退本地确定性引擎；
7. 匿名客服只能使用完全脱敏的演示订单。

### 3.9「一箱货的旅程」3D

1. 溯源页渲染结果后，`Journey3D.mount(data)` 读取当前批次四站数据；
2. 四站：梨园 → 分选打包 → 冷链 → 餐桌；
3. 点击编号或右侧步骤：
   - 右侧详情切换；
   - 相机平滑推近该站；
   - 选中标记放大变色；
4. 点「看全景」或再次点当前站，回到全局视角；
5. 拖动旋转，围绕当前站点查看；
6. 桌面端开启阴影；手机端关闭阴影、DPR 上限 1.35、关闭抗锯齿；
7. 手机端同样可拖动、点击站点，不是静态图；
8. 系统“减少动态效果”或浏览器无 WebGL：回退静态全景图，步骤按钮仍可切换；
9. Three.js 只在溯源页懒加载，本地文件，不走 CDN。

---

## 4. 状态机

### 4.1 订单

当前代码会写入的状态：

| 状态 | 含义 | 进入方式 |
|---|---|---|
| `paid` | 已支付（演示） | 结算或立即购买 |
| `aftersale` | 售后中 | 提交售后 |

种子数据还会出现：

| 状态 | 含义 |
|---|---|
| `packing` | 待打包 |
| `shipping` | 运输中 |
| `delivered` | 已送达 |
| `done` | 已完成 |

说明：当前没有“取消订单 / 发货 / 确认收货”接口，`packing / shipping / delivered / done` 主要用于演示展示；订单状态流转完整实现不在本原型范围内。

### 4.2 农户申请

```text
pending ──通过──> approved
   │
   └──驳回──> rejected ──修改后重新提交──> pending
```

### 4.3 农户账号

```text
pending ──审核通过──> active
   │
   └──驳回──> rejected ──重新提交──> pending
```

### 4.4 商品

```text
pending ──通过──> on
   │
   └──驳回──> rejected
```

### 4.5 批次

- 新建批次：`growing`；
- 种子数据：`listed`、`shipped`；
- `shipped` 批次不可再售；
- 当前没有批次状态流转接口。

### 4.6 预警

```text
open ──运营处置──> resolved
```

---

## 5. API 一览

只列主要接口；完整字段见 `SPEC.md` 与 `server.js`。

### 5.1 公开 / 基础

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/meta` | 分类、产地、平台统计、LLM 状态 |
| GET | `/api/products` | 商品列表，支持 `category / q / sort / traceOnly` |
| GET | `/api/products/:id` | 商品详情、批次、评价、价格构成、生成内容 |
| GET | `/api/trace/:code` | 溯源全量 |
| GET | `/api/trace/:code/verify` | 链校验 |
| POST | `/api/agent/ask` | 溯源问答 |
| POST | `/api/agent/content` | 内容生成 |
| POST | `/api/agent/service` | 客服 |
| GET | `/api/demo/orders` | 完全脱敏的演示订单 |
| GET | `/api/qr?data=&size=` | SVG 二维码 |
| GET | `/api/kb` | 知识库 |

### 5.2 登录 / 账号

| 方法 | 路径 | 权限 |
|---|---|---|
| POST | `/api/auth/register` | 公开 |
| POST | `/api/auth/login` | 公开 |
| POST | `/api/auth/logout` | 登录 |
| GET | `/api/auth/me` | 登录 |
| GET | `/api/account/profile` | consumer |
| PATCH | `/api/account/profile` | consumer |

### 5.3 购物车 / 结算

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/api/cart` | 游客或登录 |
| POST | `/api/cart/items` | 游客或登录 |
| PATCH | `/api/cart/items/:key` | 游客或登录 |
| DELETE | `/api/cart/items/:key` | 游客或登录 |
| POST | `/api/cart/merge` | 登录 |
| POST | `/api/checkout` | consumer |

### 5.4 订单

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/api/orders` | 登录，按角色裁剪 |
| GET | `/api/orders/:id` | 登录，`canView` |
| POST | `/api/orders` | consumer |
| POST | `/api/orders/:id/aftersale` | 订单所有者 |
| POST | `/api/orders/:id/review` | 订单所有者 |
| POST | `/api/orders/:id/buy-again` | 登录，订单所有者 |

### 5.5 农户

| 方法 | 路径 | 权限 |
|---|---|---|
| POST | `/api/farmer/register` | 公开 |
| GET / POST | `/api/farmer/application` | farmer |
| GET | `/api/farmer/:id/dashboard` | farmer，仅自己 |
| GET | `/api/farmer/:id/batches` | farmer，仅自己 |
| POST | `/api/farmer/:id/products` | farmer（自己）/ admin（指定 farmerId） |
| PATCH | `/api/farmer/:id/products/:productId` | farmer（自己）/ admin，待审或驳回商品 |
| POST | `/api/farmer/:id/batches` | farmer（自己）/ admin |
| POST | `/api/farmer/:id/records` | farmer（自己）/ admin |

### 5.6 运营

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/api/admin/overview` | admin |
| GET | `/api/admin/ledger` | admin |
| GET | `/api/admin/applications` | admin |
| POST | `/api/admin/applications/:id/review` | admin |
| POST | `/api/admin/alerts/:id/resolve` | admin |
| POST | `/api/admin/products/:id/review` | admin |
| POST | `/api/admin/demo/tamper` | admin |
| GET / POST | `/api/settings` | admin |

---

## 6. 数据与关键不变量

- 数据文件：`platform/data/db.json`；删除后重启恢复种子数据。
- 用户：`db.users`，密码只存 hash + salt。
- 商品/批次：订单写入快照，后续改价不影响历史订单。
- 库存：`soldQty` 只增不减；可用量 = `qty - soldQty`；`shipped` 批次不可售。
- 购物车：登录用 `u:<userId>`，游客用 `g:<guestId>`；合并时按商品+批次去重。
- 订单可见性：
  - 消费者：自己的订单，完整地址；
  - 农户：自己商品行，买家手机号脱敏，详细地址隐藏；
  - 运营：全量但脱敏。
- 链：每条记录有 `prevHash / hash / tx / height`；`rebuildLedger` 按时间重算。
- 二维码：`/api/qr` 生成 SVG；溯源页二维码指向 `/t?c=...`。
- Token：内存存储，重启失效；不适合多实例共享。

---

## 7. 失败与降级

| 场景 | 行为 |
|---|---|
| 未登录访问受保护接口 | 401，前端弹登录 |
| 角色不符 | 403 |
| 农户待审核访问工作台 | 403 `FARMER_PENDING` |
| 商品下架 / 批次售罄 / 库存不足 | 409，返回原因 |
| 重复评价 | 409 `ALREADY_REVIEWED` |
| 重复手机号注册 | 409 `PHONE_TAKEN` |
| 大模型未配置或超时 | 回退本地确定性引擎 |
| 无 WebGL / 减少动态 | 3D 回退静态全景，步骤仍可切换 |
| 视频 Range 请求 | 206，支持 iOS/Safari |
| 静态资源不存在 | 404 JSON |

---

## 8. 未实现 / 边界

- 未接真实支付、退款、物流接口；
- 商品主图从内置实拍图库选择，未接真实文件上传/对象存储；
- 没有取消订单、发货、确认收货的完整状态流转 API；
- 农户材料只记录文件元数据，没有真实上传与存储；
- 没有地址簿，结算地址只写订单快照；
- 没有短信验证码、找回密码、刷新 token；
- 没有限流、防刷、CSRF、审计日志；
- 单机 JSON 存储，不适合多实例并发；
- 3D 为示意沙盘，不是真实地块边界或 GPS 地图；
- NATAPP 免费隧道为 HTTP，仅适合课程演示。

---

## 9. 验收清单

- `node --check server.js` 通过；
- `/api/health` 返回 200；
- 13 个页面均 200；
- 消费者可注册、登录、加购、结算；
- 农户待审核不能进工作台，审核通过后可写记录；
- 农户可新建商品；待审商品不进商城；运营通过后可建批次；
- 建批次会校验商品归属，跨农户返回 403；
- 溯源页可查批次、链校验、3D 四站切换；
- 后台可审核、处置预警、篡改演示；
- 390 / 768 / 1024 / 1440 无横向溢出；
- 每页 console 无 error。
