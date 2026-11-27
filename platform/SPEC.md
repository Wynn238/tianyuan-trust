# 工程约定与数据/API 摘要

本文记录当前原型的运行方式、目录、SQLite 数据模型、认证和 API 约定。功能与角色说明见 `FUNCTIONS.md`，启动方式见仓库根目录 `README.md`。

当前版本：2026-11-27。

---

## 1. 运行方式

- Node.js **22+**。
- 原生 Node HTTP 服务，无前端构建步骤。
- 依赖：`better-sqlite3`、`argon2`。
- 默认端口 `8848`；可用 `PORT`、`HOST` 环境变量覆盖。
- 启动：

```bash
cd platform
npm install
node server.js
```

- 首次启动创建 `platform/data/tianyuan.sqlite`，从 `data/seed.js` 导入演示数据。
- 推荐使用根目录 `scripts/bootstrap-demo.mjs` 完成依赖安装、初始化、演示口令设置和启动。
- 静态资源目录：`platform/public`。

---

## 2. 目录

```text
platform/
  server.js                 路由、静态托管、权限检查
  lib/database.js           SQLite 建表、账户/业务数据、审计、通知、工单、画像
  lib/store.js              异步加载与保存入口
  lib/auth.js               Argon2、旧 SHA 升级、Cookie 会话
  lib/commerce.js           商品、购物车、订单、库存
  lib/chain.js              SHA-256 哈希链
  lib/agent.js              意图、工具、知识库、回答合成、LLM 适配
  lib/secrets.js            API Key 加密
  data/seed.js              演示数据
  data/tianyuan.sqlite      运行时数据库（不提交）
  scripts/init-db.mjs       初始化数据库
  scripts/set-local-demo-passwords.mjs  本地演示口令
  public/                   12 个页面与本地静态资源
  FUNCTIONS.md              功能、角色、流程、状态
  SPEC.md                   本文
  DEPLOY_CLOUDBASE.md       CloudBase 部署
  Dockerfile / .dockerignore
tests/acceptance/           验收测试与快照检查
scripts/bootstrap-demo.mjs  一条命令本地启动
```

---

## 3. 数据存储

### 3.1 SQLite

- 路径：`platform/data/tianyuan.sqlite`
- WAL 模式；`foreign_keys=ON`；`busy_timeout=5000`
- 运行时数据库由 `.gitignore` 排除，不能提交账号数据、口令哈希或 API Key。

### 3.2 表

| 表 | 作用 |
|---|---|
| `business` | 以 `table_name + row_id + JSON` 保存业务对象：商品、批次、记录、检测、运输、订单、评价、预警、地标、知识库、申请、链账本、购物车、扫码日志 |
| `app_state` | 版本、设置、计数器、角色初始化标记等 |
| `staff` | 员工账号、工号、手机号、Argon2 哈希、状态 |
| `staff_role` | 员工与角色映射 |
| `role` | 角色定义 |
| `permission` | 权限点 |
| `role_permission` | 角色权限矩阵 |
| `consumer` | 消费者账号 |
| `farmer_account` | 农户登录账号、状态、farmerId |
| `farmer` | 农户档案 |
| `consent_record` | 隐私/画像同意记录 |
| `favorite` | 消费者收藏 |
| `event_log` | 行为事件：浏览、搜索、加购、结算、评价、收藏、推荐曝光/点击 |
| `profile_snapshot` | 消费者/农户画像快照 |
| `notification` | 站内通知 |
| `support_ticket` | 客服工单 |
| `audit_log` | 敏感操作审计 |
| `settlement_state` | 订单结算状态（演示） |
| `id_mapping` | 旧 ID 与新 ID 的迁移映射 |

业务对象仍由 `business` 的 JSON 行承载；新增关系型表用于账号、审计、工单、通知、画像等需要独立查询的数据。

### 3.3 种子和重置

- `data/seed.js` 生成演示农户、商品、批次、记录、订单、预警、地标等。
- 空库启动时自动导入；已有业务行时不会覆盖。
- 重置演示数据：停止服务，删除 `platform/data/tianyuan.sqlite*`，再启动；不要删除正在使用的数据库。
- 演示账号口令重置：`platform/scripts/set-local-demo-passwords.mjs`，仅限本地，`NODE_ENV=production` 会拒绝执行。

---

## 4. 认证与会话

- 密码：Argon2id；旧 SHA-256 账号登录成功后自动升级并补盐。
- 会话：HttpOnly Cookie `ty_session`，SameSite=Lax；HTTPS 下 Secure。
- 不使用 localStorage 保存认证信息。
- 登录入口：消费者、农户、员工分开校验。
- 登录失败计数与临时锁定；停用、离职、注销申请中的账号不能登录。
- 写请求检查 Origin；服务端按角色、权限点、农户归属校验。
- 员工权限点与数据范围：

```text
super_admin / auditor / qa / cs / finance / origin_ops / sys_admin
```

- `origin_ops` 使用 `origin.scope` 限制为安徽省；总览、列表、画像都按范围过滤。
- 客服手机号脱敏；农户订单隐藏买家详细地址。

---

## 5. API 约定

### 5.1 通用

- 请求/响应 JSON；静态页面由同一服务托管。
- 成功响应通常包含 `ok: true`；列表使用 `items`。
- 错误响应包含错误码和中文消息；常见状态：
  - 400 参数不合法
  - 401 未登录
  - 403 无权限/角色不符
  - 404 资源不存在
  - 409 冲突（重复手机号、重复评价、库存不足等）
- 写请求校验 `Origin` 与 `Host`；不接受跨站写请求。
- 受保护接口同时校验登录、角色、权限点和数据范围。

### 5.2 主要接口分组

公开：

```text
GET  /api/health
GET  /api/meta
GET  /api/products
GET  /api/products/:id
GET  /api/trace/:code
GET  /api/trace/:code/verify
GET  /api/kb
GET  /api/qr
POST /api/agent/ask
POST /api/agent/content
POST /api/agent/service
```

认证与账号：

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/session
GET  /api/auth/me
GET  /api/account/profile
PATCH /api/account/profile
GET  /api/account/export
POST /api/account/delete-request
GET  /api/consents
POST /api/consents
POST /api/events
```

消费者：

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

农户：

```text
POST /api/farmer/register
GET/POST /api/farmer/application
GET  /api/farmer/me/dashboard
GET  /api/farmer/me/batches
POST /api/farmer/me/products
PATCH /api/farmer/me/products/:id
POST /api/farmer/me/batches
POST /api/farmer/me/records
GET  /api/farmer/me/orders
GET  /api/farmer/me/settlements
```

运营：

```text
GET  /api/admin/overview
GET  /api/admin/orders
GET  /api/admin/customers
GET  /api/admin/tickets
POST /api/admin/tickets/:id/resolve
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
GET/POST /api/admin/settings
POST /api/admin/demo/tamper
```

字段和响应细节以 `server.js` 为准；本文件只约定分组和权限边界。

---

## 6. 静态页面与缓存

- 12 个页面：首页、商城、商品、购物车、个人中心、注册、溯源、品牌片、智能体、农户工作台、农户入驻、运营后台。
- 管理后台是单页 `admin.html`，通过左侧路由切换 17 个视图。
- HTML 不缓存；CSS/JS 缓存 60 秒，引用带版本号。
- 移动端 ≤900px 导航折叠；表格使用 `table--stack` 卡片化。
- Three.js 只在溯源页按需加载；本地静态资源，不走 CDN。

---

## 7. 测试

```bash
node --test tests/acceptance/phase0.test.mjs
node tests/acceptance/snapshot.mjs --check
```

测试需要从 `.acceptance.env.example` 复制并填写本地账号的 `.acceptance.env`；该文件被 Git 忽略。

快照测试核对 13 张业务表的行数与基线；修改种子数据后应同步更新基线，不能为了通过测试伪造数据。

---

## 8. 工程约定

- 后端保持原生 Node HTTP，不引入不必要框架。
- 前端保持原生 HTML/CSS/JS，无构建步骤。
- 服务端必须做权限、角色、数据范围校验，不能只隐藏菜单。
- 审核、处置、结算、权限、账号、工单、注销等写操作写审计。
- 金额、库存、订单快照使用服务端计算；不信任前端金额。
- 演示数据中的姓名、手机号、订单、检测报告均为虚构或脱敏。
- 不提交运行时数据库、`.acceptance.env`、`_private/`、`_work/`、`_backups/`、`deliverables/`。
