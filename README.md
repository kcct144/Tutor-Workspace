# 学管师工作台

- 状态：S1已实现，待测试验收
- 负责人：开发负责人
- 创建日期：2026-09-05
- 最后更新日期：2026-09-06
- 关联需求：S1学生基础

S1「学生基础」已接入真实 MySQL：学生列表、详情基本信息、选择器。仅受控开发/测试使用，无登录和权限隔离，**不得公网部署或导入真实人员/学生数据**。其他模块仍是未接入原型，不属于本次交付。

## 前置依赖

- Node.js 24（建议使用当前 LTS）
- pnpm 11
- 用户已有云端 MySQL 8.0.16+（CHECK、InnoDB、外键）；本项目不安装或启动 MySQL 服务。
- 仅允许总指挥批准的 `tutor_workspace`。该名称是授权边界；实际连接配置仍只由用户在 `.env` 中填写。

## 首次启动

```powershell
pnpm install
# 仅首次且 .env 尚不存在时复制；不要覆盖已有文件
Copy-Item .env.example .env
```

复制后，由用户在本机编辑 `.env`，填写已有云端 MySQL 的连接信息，再执行：

```powershell
pnpm db:migrate                 # 显式S1迁移
pnpm db:seed                    # 可选合成数据装载，非空表不写入
pnpm dev --host 127.0.0.1       # 仅本机访问，默认3000；被占用时查看启动输出
```

打开 `/students`，而非仍使用原型数据的首页。安装、启动、构建、测试都不会自动迁移或装载数据。每个数据库连接使用前都验证当前库，不匹配立即停止。

`/api/health` 只报告配置是否存在，不代表数据库或 Redis 连通。实际 MySQL 读取可用 `/api/students/options?pageSize=1` 验证；失败返回安全503，不返回配置或驱动错误。

## 环境变量

将 `.env.example` 复制为 `.env` 后，由用户填写已有云端 MySQL 的连接信息：

- `NUXT_PUBLIC_APP_URL`：浏览器可访问的应用地址。
- `NUXT_MYSQL_HOST`、`PORT`、`DATABASE`、`USER`、`PASSWORD`：云端 MySQL 连接参数，必须由用户填写。
- `NUXT_MYSQL_SSL`：云服务要求 TLS 时填 `true`，使用系统信任链验证证书；不支持忽略证书校验。私有 CA 场景先单独配置，不应关闭验证。
- `DEV_ACTOR_ID`：默认空，由用户把种子脚本输出的演示人员 ID 手工填入。S1只有读取接口，不依赖此值；未来写接口只允许服务端读取并校验，不接受浏览器传入。
- `NUXT_REDIS_URL`：可选 Redis URL；设置后优先于分项参数。
- `NUXT_REDIS_HOST`、`PORT`、`PASSWORD`、`DB`：可选 Redis 分项参数；未配置时应用不会尝试连接 Redis。

`.env` 已被 Git 忽略。不要把真实配置值粘贴到聊天、文档、截图、日志或提交记录。种子脚本不会修改 `.env`。`DEV_ACTOR_ID` 不是认证，无论是否填值均不得公网开放。Redis位置由环境变量决定，S1不使用Redis。

S1只建users、students、schema_migrations；使用Node原生能力和已有mysql2显式迁移，不增加ORM/迁移框架。操作权限、失败恢复、数据保留回退详见 [数据库说明](database/README.md)。

## 常用命令

```powershell
pnpm dev --host 127.0.0.1   # 仅本机开发服务器
pnpm build          # 生产构建
pnpm preview --host 127.0.0.1  # 仅本机预览
pnpm typecheck      # TypeScript / Vue 类型检查
pnpm lint           # ESLint
pnpm format:check   # Prettier 格式检查
pnpm test           # Vitest 单元测试
pnpm db:migrate     # 显式迁移
pnpm db:seed        # 显式合成装载
# 先启动服务，端口须与启动输出一致；此命令显式只读访问批准库
$env:S1_API_BASE_URL = 'http://127.0.0.1:3000'
pnpm test:s1:api
```

`pnpm test` 不连接数据库。需要格式化时只对当前改动文件运行 Prettier，不顺带格式化无关文件；SQL保持人工审核，不增加格式化依赖。

## 目录约定

```text
app/pages/          路由页面
app/components/     可复用 Vue 组件
app/layouts/        页面布局
app/services/       HTTP统一入口与学生service
app/composables/    请求状态、筛选分页与过期请求取消
server/api/         Nitro 服务端 API
server/db/          MySQL池、查询、事务、边界和输入校验
server/plugins/     应用关闭时释放连接池
server/utils/       统一API响应及其他基础工具
database/           显式迁移与合成数据装载
types/              跨端 TypeScript 类型
docs/               产品、设计与测试文档
tests/              自动化测试
```

TODO（开发负责人；对应切片授权并验收时结束）：首页、合同、计划、任务仍使用原型服务；旧 `app/types/students.ts` 与 `app/mocks/services/students.ts` 仍被这些模块依赖，不混入S1学生页面，不以原型ID证明真实数据存在。S2–S6不提前实施。

API契约、变更清单及验证记录见 [S1自测报告](docs/test/s1-students-verification.md)。正式验收由总指挥/测试确认。
