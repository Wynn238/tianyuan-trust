# 田源可信 · 农产品溯源与助农电商平台

一个可运行的教学原型：消费者逛商城、查批次、扫码溯源；农户管理商品、批次、农事记录和订单；员工在后台完成审核、客服、财务、风控和权限管理。

> 这是课程演示项目，不是生产系统。支付、物流、短信、真实区块链和真实大模型调用都没有接入；演示数据均为虚构或脱敏数据。

## 快速开始

### 方式一：一条命令（推荐）

需要先安装 **Node.js 22+、npm 和 Git**：

```bash
git clone https://github.com/Wynn238/tianyuan-trust.git
cd tianyuan-trust
node scripts/bootstrap-demo.mjs
```

脚本会自动完成：

1. 安装 `platform` 依赖
2. 首次生成演示数据库
3. 初始化演示账号口令
4. 启动服务并打开 <http://127.0.0.1:8848>

登录账号见 [ACCOUNTS.md](ACCOUNTS.md)。

没有 Git 也可以：下载仓库 ZIP，解压后进入目录，执行：

```bash
node scripts/bootstrap-demo.mjs
```

### 方式二：手动启动（开发调试）

```bash
cd platform
npm install
node server.js
```

第一次启动会生成 SQLite 数据库，但账号口令是随机的。停止服务后，设置自己的本地演示口令：

```powershell
# Windows PowerShell
$env:DEMO_PASSWORD = "你自己的本地口令"
node scripts/set-local-demo-passwords.mjs
node server.js
```

```bash
# macOS / Linux
DEMO_PASSWORD='你自己的本地口令' node scripts/set-local-demo-passwords.mjs
node server.js
```

然后打开 <http://127.0.0.1:8848>。

Windows 也可以直接双击根目录的 `启动平台.bat`。它使用系统安装的 Node.js 22+。

### 方式三：交给 AI Agent

把下面这段直接发给对方的 Agent：

```text
请在本机安装并运行 https://github.com/Wynn238/tianyuan-trust：
先检查 Node.js 22+、npm 和 Git，克隆仓库，执行 node scripts/bootstrap-demo.mjs，
等 http://127.0.0.1:8848/api/health 返回 200 后告诉我打开地址和 ACCOUNTS.md 的位置。
不要修改代码，不要提交，不要上传任何数据。
```

## 功能

| 模块 | 能力 |
|---|---|
| 消费者 | 搜索、筛选、商品详情、收藏、购物车、结算、订单、评价、再次购买、隐私授权、客服工单、扫码溯源、智能体问答 |
| 农户 | 入驻、商品、批次与赋码、农事记录上链、AI 文案、订单、结算单、消息 |
| 运营后台 | 总览、订单、客服 360、客服工单、消费者/农户画像、审批历史、商品/农户审核、预警、链账本、地标、分账与对账、账号与角色、角色权限、审计日志、大模型设置 |
| 智能体 | 溯源问答、内容生成、智能客服；未配置大模型时使用本地规则引擎 |
| 溯源链 | SHA-256 哈希链、链上校验、篡改演示、3D 旅程、批次档案 |

## 技术栈

- Node.js 22+，原生 Node HTTP，无前端框架、无构建步骤
- SQLite WAL + `better-sqlite3`
- Argon2 密码哈希
- HttpOnly Cookie 会话
- 原生 HTML / CSS / JavaScript
- 本地 Three.js、GSAP、图片和视频，不依赖 CDN

## 角色与账号

平台有三类使用主体：

| 主体 | 入口 | 说明 |
|---|---|---|
| 消费者 | 首页、商城、个人中心 | 下单、评价、隐私、工单、溯源 |
| 农户 | `/farmer.html` | 只能访问自己的农户编号、商品、批次和订单 |
| 员工 | `/admin.html` | 七类员工角色，按权限点显示不同菜单 |

员工角色：平台超管、审核专员、质检溯源专员、客服、财务、产地运营、系统管理员。

完整权限矩阵和菜单见 [platform/FUNCTIONS.md](platform/FUNCTIONS.md)。

公开演示账号表见 [ACCOUNTS.md](ACCOUNTS.md)。

> 这是课程演示口令，任何拿到账号表的人都能登录后台。不要输入真实订单、手机号或个人信息；上线前必须换随机强密码。

## 演示数据

首次启动由 `platform/data/seed.js` 生成：

- 9 位正常农户 + 1 位待审核农户
- 9 款商品、12 个批次、56 条链上记录
- 13 笔订单、4 条预警
- 正例：`TY-2026-0912-DS` 链上校验通过
- 反例：`TY-2026-1120-DD` 间隔期不足；`DD2026112001` 冷链超温；`P09` 缺检测报告

运行时数据库是 `platform/data/tianyuan.sqlite`，不提交到 Git。

## 项目结构

```text
platform/
  server.js                 HTTP 服务、API、静态托管
  lib/                      数据库、认证、链、智能体、二维码
  data/seed.js              演示数据
  public/                   12 个页面与本地资源
  scripts/                  初始化、演示口令脚本
  FUNCTIONS.md              功能、角色、流程、状态
  SPEC.md                   数据模型与 API 约定
  DEPLOY_CLOUDBASE.md       云托管部署
scripts/bootstrap-demo.mjs  一条命令本地启动
tests/acceptance/           验收测试与快照
ACCOUNTS.md                 公开演示账号表
```

## 测试

先启动服务，然后：

```powershell
Copy-Item .acceptance.env.example .acceptance.env
# 编辑 .acceptance.env，填入本地账号
node --test tests/acceptance/phase0.test.mjs
node tests/acceptance/snapshot.mjs --check
```

`.acceptance.env` 已被 `.gitignore` 排除，不能提交。

## 已知限制

- 支付、退款、物流、短信、邮件和真实打款未接入；后台“标记已结”只是演示状态。
- 链是本地 SHA-256 哈希链，不是联盟链。
- 未配置大模型 Key 时，智能体只使用本地规则引擎。
- 农户端「确认发货」只给演示提示，不生成真实运单。
- 商品主图和资质材料只记录元数据/内置图片，没有对象存储上传。
- 历史评价有少量记录缺少 `userId`，未做不可靠归因。
- 运行时数据库和账号口令不在仓库内；公开演示前请重新生成随机密码。

## 部署

GitHub Pages 不能运行 Node 后端。可使用 `platform/Dockerfile` 部署到 CloudBase、Render、Railway 或自己的服务器，步骤见 [platform/DEPLOY_CLOUDBASE.md](platform/DEPLOY_CLOUDBASE.md)。

云托管容器磁盘通常是临时的；需要保留数据时挂载文件存储或改用云数据库。

## 许可与素材

- 自写代码：MIT，见 [LICENSE](LICENSE)。
- 第三方素材：照片、Three.js、GSAP 等许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- 后台视觉方向参考 VibeFather `e-commerce-admin-dashboard`（CC BY-NC 4.0，非商业）；本仓库不包含其模板目录。
