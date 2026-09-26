# 学管师工作台

Nuxt + Ant Design Vue + MySQL 学管工作台。已包含学生、合同、学习记录、学习计划、任务定义、任务分配、首页聚合，以及网页登录、会话、CSRF 和 API 鉴权。应用支持通过主机名、内网 IP 或公网域名部署。

## 前置依赖

- Node.js 24
- pnpm 11
- 用户已有的 MySQL 8.0.16+（InnoDB、外键、CHECK）

本项目不安装或启动 MySQL 服务。数据库连接配置仅由用户在本机 `.env` 填写；应用只允许批准的 `tutor_workspace` 数据库。

## 首次启动

```powershell
pnpm install
Copy-Item .env.example .env
pnpm db:migrate
pnpm dev --host 127.0.0.1
```

编辑 `.env` 填写 MySQL 连接信息后再运行迁移。迁移、种子、安装、启动、构建和测试都不会自动创建业务数据。打开 `/login`，由已建立的本机管理员登录使用工作台。

## 环境变量

- `NUXT_PUBLIC_APP_URL`：浏览器访问地址。
- `NUXT_MYSQL_HOST`、`NUXT_MYSQL_PORT`、`NUXT_MYSQL_DATABASE`、`NUXT_MYSQL_USER`、`NUXT_MYSQL_PASSWORD`：MySQL 连接参数。
- `NUXT_MYSQL_SSL`：需要 TLS 时填 `true`；应用不会跳过证书验证。

不要将真实配置、密码或完整联系方式放入 Git、日志、截图或文档。

## 常用命令

```powershell
pnpm dev --host 127.0.0.1
pnpm build
pnpm preview --host 127.0.0.1
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm db:migrate
pnpm db:init-admin -- --apply --confirm
```

`pnpm db:init-admin -- --apply --confirm` 仅允许本机交互式终端运行；它先验证批准库，并在没有启用管理员时以隐藏输入创建或绑定初始管理员。不会接受密码命令参数或自动执行。

## 云服务器启动

构建后可直接监听服务器网络端口：

```bash
pnpm install --frozen-lockfile
pnpm build
NITRO_HOST=0.0.0.0 NITRO_PORT=3000 node .output/server/index.mjs
```

应用不再限制请求必须来自 `localhost`。网页登录、会话、权限和同源 CSRF 校验仍然生效。HTTP 环境使用普通 Cookie；HTTPS 环境根据请求协议自动使用 `Secure` 与 `__Host-` Cookie。使用 HTTPS 反向代理时应保留原始 `Host`，并正确传递 `X-Forwarded-Proto`。

直接暴露 HTTP 端口虽然可运行，但账号密码和业务数据没有传输加密。正式使用仍建议由 Nginx、Caddy 或云负载均衡提供 HTTPS，并只向外开放代理端口。

## 数据库与业务边界

迁移记录位于 `database/migrations/`；当前包含体验学员与 `trial` 体验合同迁移。体验合同只需学生和科目，默认进行中、无日期和课时；只可终止，终止后不参与有效科目聚合。

应用所有数据库写入使用参数化 SQL、服务端校验、事务与版本冲突保护。合同、学习记录、计划、任务和任务分配的规则见 `docs/prd/` 与 `docs/design/`。

## 目录

```text
app/          Nuxt 页面、组件、服务与 composables
server/       API、鉴权、数据库访问与共享业务规则
database/     显式迁移、连接工具与合成开发数据
types/        跨端 TypeScript 类型
docs/         产品、设计与验收文档
tests/        自动化测试
```
