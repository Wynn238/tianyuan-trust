# 部署到腾讯云 CloudBase 云托管

本项目是原生 Node.js HTTP 服务，零第三方依赖，不需要 `npm install`，用 Docker 镜像部署最稳。

## 一、已准备好的文件

`platform/` 下已新增：

- `package.json`：`start` 脚本 + Node 22 要求
- `Dockerfile`：Node 22 Alpine，监听 `0.0.0.0:8080`
- `.dockerignore`：不把本地 `data/db.json`、`_work` 等打进镜像

镜像首次启动时，`data/seed.js` 会自动生成演示数据。

## 二、控制台部署步骤

> CloudBase 控制台版本会更新，下面的字段名以你看到的界面为准。

1. 打开腾讯云 **云开发 CloudBase** 控制台，选择一个环境（没有就新建）。
2. 进入 **云托管** → **新建服务**。
3. 服务名称填：`tianyuan-trust`。
4. 部署方式选 **本地代码 / 代码包**（不要选纯静态网站）。
5. 代码目录选：`platform`（就是包含 `Dockerfile` 的目录）。
6. 构建方式选 **Dockerfile**，路径保持 `Dockerfile`。
7. 端口填：`8080`。
8. 实例规格：演示用最小规格即可，例如 0.5 核 / 1 GB。
9. 最小实例数：`0`（省钱，但首次访问会冷启动）；最大实例数：`1`。
10. 健康检查路径：`/api/health`。
11. 公网访问：**开启**。
12. 环境变量（如果控制台没有自动带入 Dockerfile 的 ENV，就手动加）：

```text
HOST=0.0.0.0
PORT=8080
NODE_ENV=production
```

13. 点击部署，等待构建完成。

## 三、拿到访问地址

部署成功后，在服务详情里找到 **默认域名**，一般是 HTTPS 地址，类似：

```text
https://xxxx.service.tcloudbase.com
```

打开验证：

```text
https://你的默认域名/
https://你的默认域名/brand.html
https://你的默认域名/trace.html?code=TY-2026-0912-DS
https://你的默认域名/shop.html
```

默认域名国内可访问，不用备案；绑定自己的域名才涉及备案。

## 四、重要：数据持久化

CloudBase 云托管的容器本地磁盘是**临时的**：

- 首次启动：`seed.js` 生成种子数据；
- 重新部署 / 实例重建 / 缩容到 0 再启动：`data/db.json` 可能被重置；
- 新注册用户、购物车、订单、审核记录可能丢失。

对课程演示通常可以接受。如果要保留数据：

1. 在 CloudBase 控制台给服务挂载 **文件存储 / CFS** 到 `/app/data`（是否支持、是否收费以控制台为准）；
2. 或把 `data/db.json` 改造成云数据库（MongoDB/MySQL），这需要改 `lib/store.js`，工作量较大。

> 不要指望免费容器的本地磁盘长期保存数据。

## 五、公开前必须处理

1. **改演示密码**

   `data/seed.js` 里的 种子脚本使用随机口令；员工测试账号见 `.acceptance.env`，不要提交。

2. **不要公开运营后台**

   如果只是给老师/同学看，建议不要在公开链接里宣传 `/admin.html`；或者临时去掉后台入口。

3. **清空本地数据**

   部署时 `.dockerignore` 已排除 `data/db.json`，不会把本地测试订单带上去；如果你手动上传代码包，确认不要包含这个文件。

4. **视频体积**

   宣传片 5.5 MB、3D 场景 633 KB，首次加载需要几秒；CloudBase 默认域名带宽一般够用，但冷启动会更慢。

5. **没有限流和审计**

   这是课程原型，不适合真正公开运营；临时演示没问题。

## 六、常见问题

**构建失败：找不到 package.json**
确认代码目录选的是 `platform`，不是项目根目录。

**部署后 502 / 无法访问**
- 端口必须是 `8080`；
- 容器必须监听 `0.0.0.0`（Dockerfile 已设置）；
- 健康检查路径用 `/api/health`。

**页面能开，但接口 404**
确认代码目录包含 `lib/`、`data/`、`public/`，不要只上传 `public`。

**二维码指向内网地址**
用默认域名访问时，溯源页会用当前域名生成二维码；如果你用内网 IP 访问，二维码就是内网 IP，这是正常的。

**重启后订单没了**
容器本地磁盘不持久，见第四节。

## 七、可选：本地先验证镜像

如果本机装了 Docker：

```bash
cd platform
docker build -t tianyuan-trust .
docker run --rm -p 8080:8080 tianyuan-trust
```

打开 `http://127.0.0.1:8080` 验证，再部署到 CloudBase。
