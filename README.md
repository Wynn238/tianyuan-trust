# 田源可信 · 农产品溯源与助农电商智能服务平台

田源可信是一个可运行的教学原型：消费者可以逛商城、查批次、扫码溯源；农户可以管理商品、批次、农事记录和订单；运营人员可以审核、处置预警、查看链账本、画像和审计。

> 这是一个课程演示项目，不是生产系统。支付、物流、短信、真实区块链和真实大模型调用都没有接入；演示数据中的人物、订单和报告信息均为虚构或脱敏数据。

## 最快查看

在同学电脑上，先安装 **Node.js 22+、npm 和 Git**，然后执行：

```bash
git clone https://github.com/Wynn238/tianyuan-trust.git
cd tianyuan-trust
node scripts/bootstrap-demo.mjs
```

脚本会自动安装依赖、生成演示数据库、初始化演示口令、启动服务并打开 <http://127.0.0.1:8848>。

登录账号见 [ACCOUNTS.md](ACCOUNTS.md)。给 AI Agent 的一句话和手动启动方式见下方「快速启动」。

## 功能

- **消费者**：商城搜索、筛选、商品详情、收藏、购物车、结算、订单、评价、再次购买、隐私授权、客服工单、扫码溯源、智能体问答。
- **农户**：入驻申请、商品、批次与赋码、农事记录上链、AI 文案、订单与结算、经营看板、消息。
- **运营后台**：总览、订单、客服 360、客服工单、消费者画像、农户画像、审批历史、商品审核、农户审核、预警、链账本、地理标志库、分账与对账、账号与角色、角色权限、审计日志、大模型设置。
- **智能体**：溯源问答、内容生成、智能客服；没有配置大模型时使用本地规则引擎。
- **溯源链**：SHA-256 哈希链、链上校验、篡改演示、3D 旅程、批次档案。

## 技术栈

- Node.js 22+
- 原生 Node HTTP，无前端框架、无构建步骤
- SQLite（WAL）+ `better-sqlite3`
- Argon2 密码哈希
- HttpOnly Cookie 会话
- 原生 HTML / CSS / JavaScript
- 本地 Three.js、GSAP 和图片资源，不依赖 CDN

## 快速启动

### 一条命令（推荐）

已安装 Git 和 Node.js 22+ 的电脑，在终端执行：

```bash
git clone https://github.com/Wynn238/tianyuan-trust.git
cd tianyuan-trust
node scripts/bootstrap-demo.mjs
```

脚本会自动：

1. 安装 `platform` 依赖；
2. 首次生成演示数据库；
3. 把演示账号口令初始化为公开演示口令；
4. 启动服务并打开 <http://127.0.0.1:8848>。

Windows PowerShell 如果不支持 `&&`，就分三行执行上面的命令。

### 直接交给 AI Agent 的一句话

```text
请在本机安装并运行 https://github.com/Wynn238/tianyuan-trust：先检查 Node.js 22+、npm 和 Git，克隆仓库，执行 node scripts/bootstrap-demo.mjs，等 http://127.0.0.1:8848/api/health 返回 200 后告诉我打开地址和 ACCOUNTS.md 的位置。不要修改代码，不要提交，不要上传任何数据。
```

如果本机没有 Git，可以下载仓库 ZIP，解压后进入目录执行：

```powershell
node scripts/bootstrap-demo.mjs
```

### 手动启动

```powershell
cd platform
npm install
```

第一次启动会创建本地 SQLite 数据库，并用随机口令初始化种子账号：

```powershell
node server.js
```

服务启动后浏览器打开 <http://127.0.0.1:8848>，先停止服务（Ctrl+C），把演示账号口令重置为你自己的本地口令：

```powershell
$env:DEMO_PASSWORD = "请换成一个至少 6 位的本地口令"
node scripts/set-local-demo-passwords.mjs
node server.js
```

Linux/macOS：

```bash
cd platform
npm install
node server.js
# Ctrl+C 停止后
DEMO_PASSWORD='请换成一个至少 6 位的本地口令' node scripts/set-local-demo-passwords.mjs
node server.js
```

也可以直接双击根目录的 `启动平台.bat`，它会优先使用系统 Node；没有安装 Node 时会尝试使用本机运行时路径。

### 演示数据

运行时数据库文件是 `platform/data/tianyuan.sqlite`，不要提交到 Git。首次启动时由 `platform/data/seed.js` 生成：

- 9 位正常农户 + 1 位待审核农户
- 9 款商品、12 个批次、56 条链上记录
- 12 笔订单、4 条预警
- 预置正例和反例：`TY-2026-0912-DS` 链上校验通过，`TY-2026-1120-DD` 存在间隔期不足，`DD2026112001` 冷链超温，`P09` 缺检测报告。

`scripts/set-local-demo-passwords.mjs` 会把员工、消费者、农户账号统一重置为同一个本地演示口令。它是演示脚本，遇到 `NODE_ENV=production` 会拒绝执行；正式部署必须改为随机强密码。

## 角色

| 主体 | 说明 |
|---|---|
| 消费者 | 商城、订单、隐私、工单、溯源 |
| 农户 | 只能访问自己的农户编号与商品/批次/订单 |
| 员工 | 七个角色：平台超管、审核专员、质检溯源专员、客服、财务、产地运营、系统管理员 |

员工菜单由权限点决定。`origin_ops` 只看到安徽省范围；客服没有经营总览；财务不进入审核；系统管理员管理账号、角色、审计和大模型设置。完整矩阵见 `platform/FUNCTIONS.md`。

### 演示账号

公开的演示账号表见 [ACCOUNTS.md](ACCOUNTS.md)，包含七类员工、3 个种子消费者和 10 个农户账号。

> 这是课程演示口令，任何拿到账号表的人都能登录后台。只用于课程演示，不要输入真实订单、手机号或个人信息。上线前必须换随机强密码。

## 目录

```text
platform/
  server.js                 HTTP 服务与 API
  lib/                      数据库、认证、哈希链、智能体、二维码
  data/seed.js              种子数据
  public/                   12 个页面与本地静态资源
  scripts/                  本地演示口令脚本
  FUNCTIONS.md              功能、角色权限、流程与状态机
  SPEC.md                   数据模型与 API 约定
  DEPLOY_CLOUDBASE.md       云托管部署说明
ACCOUNTS.md                 公开演示账号表
tests/acceptance/           验收测试与快照检查
```

## 测试

复制环境变量模板，填入本地演示账号的手机号和口令：

```powershell
Copy-Item .acceptance.env.example .acceptance.env
# 编辑 .acceptance.env，填入本地账号
node --test tests/acceptance/phase0.test.mjs
node tests/acceptance/snapshot.mjs --check
```

`.acceptance.env` 已被 `.gitignore` 排除，不能提交。

## 已知限制

- 支付、物流、短信、邮件和真实打款未接入；后台“标记已结”只是演示状态。
- 链是本地 SHA-256 哈希链，不是 FISCO BCOS / Fabric 等联盟链。
- 没有配置大模型 Key 时，智能体只使用本地规则引擎；API Key 需要管理员在后台配置，不能提交到仓库。
- 农户端「确认发货」目前只给出演示提示，不生成真实运单。
- 历史评价中有少量记录缺少 `userId`，未做不可靠的归属回填。
- 运行数据库和账号口令不在仓库内；公开演示前请重新生成随机密码，并只使用虚构数据。

## 部署

GitHub Pages 不能运行 Node 后端。可使用 `platform/Dockerfile` 部署到 CloudBase 云托管、Render、Railway 或自己的服务器；具体步骤见 `platform/DEPLOY_CLOUDBASE.md`。

云托管容器磁盘通常是临时的，SQLite 可能随重启重置；需要持久化时挂载文件存储或改用云数据库。

## 素材许可

- 自写代码：MIT，见 [LICENSE](LICENSE)。
- 商品照片、Three.js、GSAP 等第三方素材的许可与署名见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- 运营后台视觉方向参考 VibeFather `e-commerce-admin-dashboard`（CC BY-NC 4.0，非商业）；本仓库不包含其模板目录。
