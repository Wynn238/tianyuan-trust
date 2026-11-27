# 功能与业务逻辑说明

本文说明当前原型**已经实现**的功能、角色、页面、跨角色流程和数据规则。字段与接口细节见 `SPEC.md`，启动方式见仓库根目录 `README.md`。

当前版本：2026-11-27  
对应代码：`platform/server.js`、`platform/lib/`、`platform/public/`

---

## 1. 主体与角色

### 1.1 三类使用主体

| 主体 | 入口 | 说明 |
|---|---|---|
| 消费者 `consumer` | 首页、商城、个人中心 | 浏览、收藏、购物车、下单、订单、评价、隐私、工单、溯源 |
| 农户 `farmer` | `/farmer.html` | 入驻申请、商品、批次、农事记录、AI 文案、订单、结算单 |
| 员工 `staff` | `/admin.html` | 七类员工角色，按权限点看到不同菜单 |

农户状态：

```text
pending → 审核通过 → active
   └──── 驳回 ───→ rejected → 修改重提 → pending
```

未激活的农户不能读取工作台数据，但可以读取自己的审核通知和申请状态。

### 1.2 七类员工角色

| 角色代码 | 名称 | 主要职责 | 数据范围 |
|---|---|---|---|
| `super_admin` | 平台超管 | 除大模型设置和篡改演示外的全部业务 | 全部 |
| `auditor` | 审核专员 | 商品审核、农户审核、订单、审批历史、农户画像 | 全部 |
| `qa` | 质检溯源专员 | 预警处置、链账本、地标、订单 | 全部 |
| `cs` | 客服 | 订单、客服 360、客服工单、消费者画像 | 全部；手机号脱敏 |
| `finance` | 财务 | 订单、分账与对账、标记已结 | 全部 |
| `origin_ops` | 产地运营 | 所辖产地商品/农户审核、订单、审批历史、农户画像 | 安徽省 |
| `sys_admin` | 系统管理员 | 账号与角色、角色权限、审计日志、大模型设置、链账本 | 全部 |

### 1.3 权限矩阵与菜单

| 菜单 | 权限点 | 超管 | 审核 | 质检 | 客服 | 财务 | 产地运营 | 系统管理员 |
|---|---|---|---|---|---|---|---|---|
| 总览 | `admin.overview` | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |
| 订单 | `order.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |
| 客服 360 | `cs.view` | ✓ |  |  | ✓ |  |  |  |
| 客服工单 | `cs.view` | ✓ |  |  | ✓ |  |  |  |
| 消费者画像 | `cs.view` | ✓ |  |  | ✓ |  |  |  |
| 农户画像 | `farmer.review` | ✓ | ✓ |  |  |  | ✓ |  |
| 审批历史 | `farmer.review` | ✓ | ✓ |  |  |  | ✓ |  |
| 商品审核 | `product.review` | ✓ | ✓ |  |  |  | ✓ |  |
| 农户审核 | `farmer.review` | ✓ | ✓ |  |  |  | ✓ |  |
| 预警 | `alert.resolve` | ✓ |  | ✓ |  |  |  |  |
| 链账本 | `ledger.view` | ✓ |  | ✓ |  |  |  | ✓ |
| 地标 | `geos.view` | ✓ |  | ✓ |  |  |  | ✓ |
| 分账与对账 | `settlement.view` | ✓ |  |  |  | ✓ |  |  |
| 账号与角色 | `staff.manage` | ✓ |  |  |  |  |  | ✓ |
| 角色权限 | `role.manage` | ✓ |  |  |  |  |  | ✓ |
| 审计日志 | `audit.view` | ✓ |  |  |  |  |  | ✓ |
| 大模型设置 | `settings.llm` |  |  |  |  |  |  | ✓ |

说明：

- `super_admin` 没有 `settings.llm` 和 `demo.tamper`，避免超管既改权限又改演示数据。
- 角色权限可以在「角色权限」中编辑；初始化只在首次建库时写入，重启不会覆盖修改。
- `origin_ops` 的接口会按 `scope=安徽省` 过滤，总览 KPI、列表、订单、预警、画像都按辖区计算。
- 客服看到的手机号统一脱敏，例如 `138****0001`。

### 1.4 登录与会话

- 密码使用 **Argon2id**；旧 SHA-256 账号登录成功后自动升级。
- 会话使用 HttpOnly Cookie `ty_session`，SameSite=Lax；HTTPS 下加 Secure。
- 不使用 localStorage 保存认证 token。
- 连续登录失败会临时锁定；登录入口按消费者/农户/员工区分。
- 写请求校验 Origin；服务端校验角色、权限和农户归属。
- 停用、离职、已申请注销的账号不能继续登录。

---

## 2. 页面

当前共 **12 个 HTML 页面**：

| 页面 | 地址 | 说明 |
|---|---|---|
| 首页 | `/` | 品牌主张、搜索、热门品类、商品卡、品牌片、溯源演示 |
| 产地商城 | `/shop.html` | 搜索、分类、筛选、排序、商品卡、为你推荐 |
| 商品详情 | `/product.html?id=P01` | 详情、检测、价格构成、评价、收藏、加购、立即购买 |
| 购物车 | `/cart.html` | 游客/登录购物车、合并、数量、结算 |
| 个人中心 | `/account.html` | 资料、订单、评价、再次购买、隐私、导出、注销、工单 |
| 消费者注册 | `/register.html` | 手机号注册并登录 |
| 溯源码页 | `/trace.html?code=TY-2026-0912-DS` | 链校验、3D 旅程、记录、检测、AI 答疑 |
| 品牌片 | `/brand.html` | 12 秒品牌片、播放/声音、低动态回退 |
| 智能体工作台 | `/agent.html` | 溯源问答、内容生成、智能客服 |
| 农户工作台 | `/farmer.html` | 今日、批次与农事、订单与结算、经营、消息 |
| 农户入驻 | `/farmer-apply.html` | 注册、登录、提交资料、审核状态、重新提交 |
| 运营后台 | `/admin.html` | 17 个菜单视图 |

后台 17 个视图：

```text
总览 / 订单 / 客服 360 / 客服工单 / 消费者画像 / 农户画像 /
审批历史 / 商品审核 / 农户审核 / 预警 / 链账本 / 地标 /
分账与对账 / 账号与角色 / 角色权限 / 审计日志 / 大模型设置
```

---

## 3. 消费者流程

### 3.1 浏览、搜索、收藏

- 商城支持关键词、分类、产地、价格、只看可溯源和排序。
- 商品详情四个标签：`商品详情`、`检测报告`、`价格构成`、`评价`。
- 登录后可以「收藏」商品；收藏会记录 `favorite` 事件，收藏品类参与推荐排序。

### 3.2 购物车、结算、订单

1. 游客可加购，前端使用 guest id；登录后调用购物车合并。
2. `POST /api/checkout` 校验收货信息、库存、商品状态。
3. 订单金额写快照；批次 `soldQty` 增加；购物车已购行清除。
4. 订单为演示支付，不产生真实扣款。
5. 个人中心可查看、评价、再次购买、提交售后和工单。

### 3.3 隐私、工单、溯源

- 个人中心可开关个性化推荐和画像授权；可导出数据、申请注销。
- 客服工单类型：售后 / 溯源 / 订单 / 其他。
- 溯源页输入批次码，查看链校验、3D 旅程和 AI 问答；农户手机号、详细地址不展示。

---

## 4. 农户流程

### 4.1 入驻

1. `/farmer-apply.html` 注册农户账号，状态为 `pending`。
2. 填写经营主体、名称、地区、联系人、主营品类、说明和材料元数据。
3. 审核通过后生成农户编号（如 `F11`），账号变为 `active`。
4. 驳回后可在「今日 → 消息」看到原因，修改后重新提交。

### 4.2 工作台四个页签

| 页签 | 内容 |
|---|---|
| 今日 | 消息、今日概览、待处理事项（补记录/发货/补资料） |
| 批次与农事 | 新建商品、新建批次、赋码、农事记录、AI 文案 |
| 订单与结算 | 订单行、发货演示、结算单、平台服务费与成本明细 |
| 经营 | 经营趋势、商品/订单/收入概览 |

「消息」显示入驻审核、商品审核、结算等站内通知。

### 4.3 商品、批次、记录

- 新建商品后状态为 `pending`，平台通过后才进入商城。
- 只有 `on` 商品可建批次；批次生成 `TY-...` 溯源码。
- 农事记录支持语音、拍照、扫码、手动四种方式；提交即上链。
- 记录写入后不可删除，只能追加更正；用药记录校验安全间隔期。
- AI 文案选商品、批次、渠道后生成标题、卖点、分镜和话题标签。

### 4.4 订单与结算

- 农户看到自己商品行的订单；已付款/打包中的订单有「发货」按钮。
- 当前「确认发货」只给演示提示，不写入真实运单。
- 财务在后台「分账与对账」标记已结后，农户收到通知并可查看结算单。
- 结算单列出成交额、平台费、检测/赋码/冷链成本与农户应付。

---

## 5. 运营后台

### 5.1 审核与通知

- 农户审核：「通过并开通」或「驳回」，写通知和审计。
- 商品审核：「通过上架」或「驳回」，通过后商城可见。
- 审批历史展示农户/商品审核的事件时间线，包括驳回、重提、通过。

### 5.2 客服与工单

- 客服 360：客户、脱敏手机号、订单数、消费、售后数。
- 客服工单：查看并「解决」，填写处理结果后通知消费者。

### 5.3 预警、链账本、地标

- 预警按等级筛选，填写处置说明后 `resolved`。
- 链账本显示记录、写入方、时间、交易哈希；系统管理员可开关「篡改演示」。
- 篡改演示只改本地演示数据，关闭后恢复原文。
- 地标库只读，展示地理标志名称、登记号、产区、授权量。

### 5.4 分账与对账

- 按成交额演示 3% 平台服务费。
- 财务点「标记已结」，写 `settlement_state`，通知农户并写审计。
- 不是实际打款、银行回单或提现。

### 5.5 画像与推荐

- 消费者画像：样本、消费、订单、画像同意、标签、行为事件、推荐效果。
- 农户画像：产地、商品/批次/记录、档案完整度、预警、标签。
- 「生成快照」写入 `profile_snapshot`；产地运营只看到辖区数据。
- 推荐效果：曝光、点击、CTR、点击加购、点击后下单、CVR；按事件口统计。

### 5.6 账号、角色、审计、设置

- 账号与角色：改角色/状态后「保存」，服务端校验最后一个超管等规则。
- 角色权限：勾选权限点后「保存权限」，运行时和后续请求立即按新权限执行。
- 审计日志：审核、处置、设置、篡改、账号/角色、工单、结算、注销等动作留痕。
- 大模型设置：仅系统管理员；未配置时使用本地规则引擎。

---

## 6. 跨角色闭环

| 流程 | 链路 |
|---|---|
| 农户入驻 | 注册 → 提交 → 审核 → 开通/驳回 → 消息 → 重提 |
| 商品上架 | 新建商品 → 待审 → 商品审核 → 上架/驳回 → 商城/重提 |
| 一箱货溯源 | 建批次 → 记录上链 → 消费者扫码 → 链校验/3D/AI → 篡改失败演示 |
| 下单结算 | 加购 → 合并购物车 → 结算 → 农户订单 → 财务标记已结 → 农户结算单 |
| 质量风险 | 预警 → 质检/运营处置 → 工单/售后 → 客服解决 → 通知 |
| 权限审计 | 员工登录 → 权限点/范围 → 手机号脱敏 → 角色变更 → 审计日志 |
| 个性化推荐 | 隐私授权 → 行为事件 → 商城推荐 → 运营看推荐效果/快照 |

---

## 7. 数据与状态

### 7.1 存储

- SQLite：`platform/data/tianyuan.sqlite`，WAL 模式。
- 运行时数据库和 `.acceptance.env` 不进入 Git。
- 种子数据在 `platform/data/seed.js`；首次启动或空库时生成。

主要表：

```text
business / app_state
staff / staff_role / role / permission / role_permission
consumer / farmer_account / farmer / consent_record
favorite / event_log / profile_snapshot
notification / support_ticket / audit_log
settlement_state / id_mapping
```

`business` 以 JSON 行保存商品、批次、记录、订单、评价、预警、地标、申请、链账本、购物车等业务对象。

### 7.2 状态

| 对象 | 状态 |
|---|---|
| 农户账号 | `pending / active / rejected` |
| 农户申请 | `pending / approved / rejected` |
| 商品 | `pending / on / rejected` |
| 批次 | `growing / listed / shipped`（种子数据） |
| 订单 | `paid / aftersale`（代码写入）；`packing / shipping / delivered / done` 为种子展示 |
| 预警 | `open / resolved` |
| 工单 | `open / in_progress / resolved` |
| 结算 | 未结算 / `paid`（演示） |

### 7.3 关键不变量

- 商品可售：商品 `on`、有批次、批次非 `shipped`、可用库存大于 0。
- 库存：`soldQty` 只增；可用量 = 批次数量 − `soldQty`。
- 订单写商品/批次快照，后续改价不影响历史订单。
- 消费者只能看自己的订单；农户只看自己商品行且地址隐藏；运营看脱敏全量。
- 链：每条记录有 `prevHash / hash / tx / height`，按时间重算校验。

---

## 8. API 摘要

### 公开

```text
GET  /api/health
GET  /api/meta
GET  /api/products
GET  /api/products/:id
GET  /api/trace/:code
GET  /api/trace/:code/verify
GET  /api/kb
GET  /api/qr?data=&size=
POST /api/agent/ask
POST /api/agent/content
POST /api/agent/service
```

### 认证与账号

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/session
GET  /api/auth/me
GET  /api/account/profile
PATCH /api/account/profile
GET  /api/account/export
POST /api/account/delete
GET  /api/account/consent
POST /api/account/consent
POST /api/events
```

### 消费者

```text
GET/POST/PATCH/DELETE /api/cart*
POST /api/cart/merge
POST /api/checkout
GET  /api/orders
GET  /api/orders/:id
POST /api/orders/:id/aftersale
POST /api/orders/:id/review
POST /api/orders/:id/buy-again
GET  /api/favorites
POST /api/products/:id/favorite
GET  /api/support/tickets
POST /api/support/tickets
GET  /api/notifications
POST /api/notifications/:id/read
POST /api/notifications/read-all
```

### 农户

```text
POST /api/farmer/register
GET/POST /api/farmer/application
GET  /api/farmer/me/dashboard
GET  /api/farmer/me/batches
POST /api/farmer/me/products
PATCH /api/farmer/me/products/:id
POST /api/farmer/me/batches
POST /api/farmer/me/records
GET  /api/orders          # 农户同样走统一订单接口，自动裁剪为自己的商品行
```

### 运营

```text
GET  /api/admin/overview
GET  /api/admin/orders
GET  /api/admin/customers
GET  /api/support/tickets
POST /api/support/tickets/:id/resolve
GET  /api/admin/profiles/consumers
GET  /api/admin/profiles/farmers
GET/POST /api/admin/profiles/snapshot
GET  /api/admin/recommendations/stats
GET  /api/admin/approvals
GET  /api/admin/applications
POST /api/admin/applications/:id/review
GET  /api/admin/products
POST /api/admin/products/:id/review
POST /api/admin/alerts/:id/resolve
GET  /api/admin/ledger
GET  /api/admin/geos
GET  /api/admin/settlement
POST /api/admin/settlement/:id/pay
GET  /api/admin/staff
PATCH /api/admin/staff/:id
GET  /api/admin/roles
PATCH /api/admin/roles/:code
GET  /api/admin/audit
GET/POST /api/settings
POST /api/admin/demo/tamper
```

具体请求体、响应字段和状态码以 `platform/server.js` 为准。

---

## 9. 安全规则

- 未登录访问受保护接口返回 401；角色不符返回 403。
- 写请求检查 Origin。
- 后台菜单隐藏只是展示，服务端仍逐请求校验权限点。
- 农户只能访问自己的 farmerId；客服手机号脱敏；产地运营按 `origin.scope` 裁剪。
- 最后一个超管不能降级/停用；不能停用自己。
- 敏感动作写 `audit_log`。
- 密码只存 Argon2 哈希；API Key 加密存储，只回显掩码。

---

## 10. 未实现与已知边界

- 无真实支付、退款、银行打款、物流接口；结算只是状态标记。
- 无短信/微信/邮件通知，只有站内通知。
- 农户「确认发货」目前只提示，不生成真实运单。
- 商品主图和资质材料只记录元数据/内置图片，没有对象存储上传。
- 链是本地 SHA-256 哈希链，不是联盟链。
- 历史评价有少量缺少 `userId`，未做不可靠归因。
- 没有定时画像快照任务；快照需手动生成。
- 没有限流、验证码、密码找回、刷新 token。
- 当前是单机 SQLite，不适合多实例并发。

## 11. 验收

```text
node --check platform/server.js
GET /api/health → 200
node --test tests/acceptance/phase0.test.mjs
node tests/acceptance/snapshot.mjs --check
```

页面清单：12 个 HTML 页面；后台 17 个视图；桌面与 390px 宽移动端无横向溢出。
