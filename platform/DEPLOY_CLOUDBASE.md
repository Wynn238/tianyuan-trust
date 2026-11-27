# 部署到腾讯云 CloudBase 云托管

本项目是原生 Node.js HTTP 服务，使用 SQLite + Argon2，需要安装 npm 依赖；推荐用 Docker 镜像部署。

## 一、已准备好的文件

`platform/` 下已有：

- `package.json`：`start` 脚本 + Node 22 要求 + `better-sqlite3` / `argon2` 依赖
- `package-lock.json`：锁定依赖
- `Dockerfile`：Node 22 Bookworm Slim，`npm ci --omit=dev`，监听 `0.0.0.0:8080`
- `.dockerignore`：不把本地数据库、依赖、日志打进镜像
- `data/seed.js`：空库首次启动时生成演示数据

## 二、本地 Docker 验证

在 `platform/` 目录执行：

```bash
docker build -t tianyuan-trust .
docker run --rm -p 8080:8080 -v tianyuan-data:/app/data tianyuan-trust
```

浏览器打开：

```text
http://127.0.0.1:8080
```

`/app/data` 是 SQLite 数据目录；不挂载 volume 时，容器重建后数据会重置。

## 三、CloudBase 控制台部署

1. 打开腾讯云 **云开发 CloudBase** 控制台，选择环境。
2. 进入 **云托管** → **新建服务**。
3. 服务名称填 `tianyuan-trust`。
4. 部署方式选 **本地代码 / 代码包**，不要选纯静态网站。
5. 代码目录选 `platform`，即包含 `Dockerfile` 的目录。
6. 构建方式选 **Dockerfile**。
7. 端口填 `8080`。
8. 健康检查路径填 `/api/health`。
9. 部署完成后使用 CloudBase 提供的 HTTPS 域名访问。

## 四、环境变量

| 变量 | 说明 |
|---|---|
| `HOST=0.0.0.0` | 容器内监听所有网卡 |
| `PORT=8080` | 与 CloudBase 端口一致 |
| `NODE_ENV=production` | 生产模式；会阻止本地演示口令脚本 |

不要把演示口令、账号表、`.acceptance.env` 或任何 API Key 写进镜像。

## 五、数据持久化

SQLite 文件路径固定为：

```text
/app/data/tianyuan.sqlite
```

云托管容器磁盘通常是临时的。需要保留订单和账号时：

- 挂载文件存储到 `/app/data`；或
- 改用云数据库，并把 `lib/database.js` 的存储层替换掉。

单机 SQLite 不适合多实例并发；多副本部署前必须改为共享数据库。

## 六、首次账号

首次启动会用 `data/seed.js` 初始化演示数据，账号口令为随机值。上线前应：

1. 使用强随机密码创建管理员账号；
2. 不公开 `ACCOUNTS.md` 或演示口令；
3. 开启 HTTPS、登录限流和备份；
4. 不用演示数据接收真实订单或个人信息。

`platform/scripts/set-local-demo-passwords.mjs` 是本地演示脚本，`NODE_ENV=production` 下会拒绝执行。

## 七、检查

部署后访问：

```text
https://你的域名/api/health
```

返回类似：

```json
{"ok":true,"time":"...","llm":false}
```

再检查首页、商城、溯源页和后台登录页；数据库挂载和备份策略要在正式使用前确认。
