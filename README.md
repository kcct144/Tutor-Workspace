# 学管师工作台

- 状态：S1–S6已实现；S8.2 登录、会话、CSRF 与全局 API 鉴权已实现，待后续权限与账号维护切片
- 负责人：开发负责人
- 创建日期：2026-09-05
- 最后更新日期：2026-09-06
- 关联需求：S1学生基础、S2合同

S1学生基础、S2合同聚合、S3学习记录及最近跟进、S4学习计划与只读关联、S5任务定义、S6任务分配与首页聚合均已接入真实 MySQL。S8.2 已启用本机账号密码登录、MySQL 不透明会话和同源 CSRF；学生负责人范围、账号管理、密码修改和审计业务接入仍在后续切片。**不得公网部署或导入真实人员/学生数据**。

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
pnpm db:migrate                 # 显式迁移，当前到010_authorization_audit
pnpm db:seed                    # 可选合成数据装载，非空表不写入
pnpm dev --host 127.0.0.1       # 仅本机访问，默认3000；被占用时查看启动输出
```

打开 `/login`，由已授权操作者在本机登录后使用业务页面。安装、启动、构建、测试都不会自动迁移或装载数据。每个数据库连接使用前都验证当前库，不匹配立即停止。

`/api/health` 只报告应用可用性，不返回数据库、Redis 或账号配置。业务 API 必须先登录；失败只返回安全错误，不返回配置或驱动错误。

## 环境变量

将 `.env.example` 复制为 `.env` 后，由用户填写已有云端 MySQL 的连接信息：

- `NUXT_PUBLIC_APP_URL`：浏览器可访问的应用地址。
- `NUXT_MYSQL_HOST`、`PORT`、`DATABASE`、`USER`、`PASSWORD`：云端 MySQL 连接参数，必须由用户填写。
- `NUXT_MYSQL_SSL`：云服务要求 TLS 时填 `true`，使用系统信任链验证证书；不支持忽略证书校验。私有 CA 场景先单独配置，不应关闭验证。
- `DEV_ACTOR_ID`：S8.2 起不再是 HTTP API 身份来源；浏览器业务读写只认当前会话用户。遗留数据操作脚本将在 S8.7 改为本机会话复用，当前不得以此变量绕过登录。
- `NUXT_REDIS_URL`：可选 Redis URL；设置后优先于分项参数。
- `NUXT_REDIS_HOST`、`PORT`、`PASSWORD`、`DB`：可选 Redis 分项参数；未配置时应用不会尝试连接 Redis。

`.env` 已被 Git 忽略。不要把真实配置值粘贴到聊天、文档、截图、日志或提交记录。种子脚本不会修改 `.env`。`DEV_ACTOR_ID` 不是认证，无论是否填值均不得公网开放。Redis位置由环境变量决定，S1不使用Redis。

S1建users、students、schema_migrations；S2新增contracts；S3新增student_learning_records；S4新增study_plan_documents、study_plan_students；S5新增tasks；S6仅新增task_assignments；S8.1新增user_accounts、auth_sessions、audit_logs及students负责人范围索引。S8.2 不新增迁移，只启用登录 API、Cookie、会话、CSRF 与全局鉴权。使用 Node 原生能力和已有 mysql2 显式迁移，不增加 ORM/迁移框架。操作权限、失败恢复、数据保留回退详见 [数据库说明](database/README.md)。

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
pnpm db:init-admin  # 仅预检批准库与启用管理员，不写入
pnpm db:init-admin -- --apply --confirm # 本机TTY隐藏输入，手工建立唯一初始管理员
pnpm db:seed        # 显式合成装载
pnpm db:seed:contracts  # 显式为已有S1合成学生装载合同；先由用户填写DEV_ACTOR_ID
pnpm db:seed:records    # 显式最多6条固定学习记录，重复跳过已有记录学生
pnpm db:seed:plans      # 显式3份固定计划、4条只读关联；已完整装载则不写入
pnpm db:seed:tasks      # 显式2条固定任务定义，不覆盖已有数据
# 先启动服务，端口须与启动输出一致；此命令显式只读访问批准库
$env:S1_API_BASE_URL = 'http://127.0.0.1:3000'
pnpm test:s1:api
$env:S2_API_BASE_URL = 'http://127.0.0.1:3000'
pnpm test:s2:api     # 显式真实合同写测试，仅合成数据，结束保留失效测试合同
$env:S3_API_BASE_URL = 'http://127.0.0.1:3000'
pnpm test:s3:api     # 显式真实学习记录测试，仅复用2条固定验收记录；不删除
$env:S4_API_BASE_URL = 'http://127.0.0.1:3000'
pnpm test:s4:api     # 显式复用固定计划正文验收；不创建持久调试文档、不删除
$env:S5_API_BASE_URL = 'http://127.0.0.1:3000'
pnpm test:s5:api     # 最多1条固定API验收任务，重复复用；不删除
node tests/integration/task-actor-api.mjs # 先build；独立本机进程验证无效操作人拒写
pnpm test:s8:foundation # 事务内验证S8.1数据库约束，结束回滚，不保留账号或人员
```

## S8 登录（仅本机）

先显式应用 008–010 迁移，再在本机交互式终端执行：

```powershell
pnpm db:init-admin -- --apply --confirm
```

该命令先验证当前数据库为 `tutor_workspace`，并拒绝已有启用管理员的数据库。`users` 为空时，它在同一事务中创建人员与管理员账号；已有人员时，只允许操作者手工输入一个既有人员 ID 进行绑定，不会展示人员列表或自动猜测人员。账号和密码均从交互输入读取；密码隐藏输入且二次确认，不能通过命令参数或环境变量提供。成功只显示非敏感摘要，且同事务写入最小审计事件。

S8 使用 Node 24 原生 Argon2id（`memory=19456 KiB`、`iterations=2`、`parallelism=1`），未增加密码依赖，也不读取或信任 `DEV_ACTOR_ID`。此命令由授权操作者自行运行；本项目安装、迁移、种子、启动和测试均不会自动创建管理员。管理员已手工建立后，打开 `/login` 完成登录。会话 Cookie 为 HttpOnly、Strict、Path=/、无 Domain；本机 HTTP 回环环境固定 Secure=false，服务不会支持远端访问。所有写 API 还要求精确同源 Origin 和会话绑定 CSRF Cookie/header，且前端不将会话 Token 存入持久存储。

遗留 `scripts/` 日常数据工具在 S8.7 本机会话复用完成前会收到 `401 UNAUTHENTICATED`，这是预期安全边界，不能临时通过 `DEV_ACTOR_ID`、直连 SQL 或请求头旁路。

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

S6已删除不再使用的首页、学生选择及任务分配mock/service/type；真实接入区域不回退mock。首页仅在读学生，服务端分页，任务摘要每组最多3条并返回准确总数/剩余数。详见[S6交付报告](docs/test/s6-task-assignments-home-delivery.md)。

S6显式操作（只在受控合成验收数据集执行）：

```powershell
pnpm db:migrate             # 应用006；不在启动/安装/构建时运行
pnpm db:seed:assignments    # 9条固定历史分配；已有集合只验证、跳过
$env:S6_API_BASE_URL = 'http://127.0.0.1:3001'
pnpm test:s6:api            # 最多4条固定API验收分配，重复复用
pnpm build
node tests/integration/assignment-actor-api.mjs
```

测试仅增加或修改S6固定分配，S1–S5只读指纹比对；不得同时人工修改验收记录。旧S1–S5集成脚本可能编辑其领域的固定数据，不属于S6授权执行范围。S5脚本已更新为分配表存在/真实人数断言，但因会编辑既有任务，本次不执行；S6脚本已独立验证新的真实人数统计。

S5任务定义已接入真实列表/详情/新增/编辑/启停，默认启用且只有启用/停用；S6分配人数按历史去重学生统计。科目选项独立分页搜索，写操作必须有服务端DEV_ACTOR_ID。文件清单、测试及回退见[S5交付报告](docs/test/s5-task-definitions-delivery.md)。

S4保留计划左右布局，支持搜索分页、按需详情、安全Markdown预览及仅正文编辑；学生标签使用真实计划ID。同名计划不合并，无新建/删除/关系管理。详见[S4交付报告](docs/test/s4-study-plans-delivery.md)。真实API测试会修改固定演示正文并恢复，应独占执行；种子和测试均不读取mock JSON、不修改.env。

学习记录契约见[学生详情PRD](docs/prd/student-detail.md)，S3文件清单、固定合成数据边界与复验说明见[S3交付报告](docs/test/s3-learning-records-delivery.md)。真实测试会编辑指定验收记录，应独占执行，发生异常不删除数据；清理须另行授权。

API契约、变更清单及验证记录见 [S1自测报告](docs/test/s1-students-verification.md)。正式验收由总指挥/测试确认。

合同API契约见[合同PRD](docs/prd/contracts.md)，S2文件清单、真实测试范围和已知限制见[S2交付报告](docs/test/s2-contracts-delivery.md)。本次实际验证地址为 http://127.0.0.1:3001/contracts；按启动输出设置测试端口。
