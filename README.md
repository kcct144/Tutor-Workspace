# 学管师工作台

学管师工作台的 MVP 开发基础。当前只提供 Nuxt、Ant Design Vue、MySQL、Redis 和代码质量工具的可运行验证，不实现任何业务规则或业务数据模型。

## 前置依赖

- Node.js 24（建议使用当前 LTS）
- pnpm 11

## 首次启动

```bash
pnpm install
Copy-Item .env.example .env
pnpm dev
```

打开 `http://localhost:3000`。`app/pages/index.vue` 是 Ant Design Vue 自动组件解析和运行时配置的最小验证页；`/api/health` 只报告连接配置是否存在，不会访问数据库或 Redis。

## 环境变量

将 `.env.example` 复制为 `.env` 后，由用户填写已有云端 MySQL 的连接信息：

- `NUXT_PUBLIC_APP_URL`：浏览器可访问的应用地址。
- `NUXT_MYSQL_HOST`、`PORT`、`DATABASE`、`USER`、`PASSWORD`：云端 MySQL 连接参数，必须由用户填写。
- `NUXT_REDIS_URL`：可选 Redis URL；设置后优先于分项参数。
- `NUXT_REDIS_HOST`、`PORT`、`PASSWORD`、`DB`：可选 Redis 分项参数；未配置时应用不会尝试连接 Redis。

`.env` 已被 Git 忽略。禁止把真实账号、密码或连接串写入代码、文档和提交记录。

当前不引入数据库迁移工具或真实数据表；待产品和数据设计文档确认后再单独实施。

## 常用命令

```bash
pnpm dev            # 本地开发服务器
pnpm build          # 生产构建
pnpm preview        # 预览构建产物
pnpm typecheck      # TypeScript / Vue 类型检查
pnpm lint           # ESLint
pnpm format:check   # Prettier 格式检查
pnpm format         # 修复格式
pnpm test           # Vitest 单元测试
```

## 目录约定

```text
app/pages/          路由页面
app/components/     可复用 Vue 组件
app/layouts/        页面布局
server/api/         Nitro 服务端 API
server/utils/       服务端连接与通用能力
database/           后续迁移与种子数据的预留目录
types/              跨端 TypeScript 类型
docs/               产品、设计与测试文档
tests/              自动化测试
```

正式业务接口、数据模型、权限策略以及数据库迁移，必须先完成并确认对应产品/设计文档后再加入。
