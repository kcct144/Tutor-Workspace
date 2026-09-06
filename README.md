# 学管师工作台

- 状态：S1–S5已实现，待测试验收
- 负责人：开发负责人
- 创建日期：2026-09-05
- 最后更新日期：2026-09-06
- 关联需求：S1学生基础、S2合同

S1学生基础、S2合同聚合、S3学习记录及最近跟进、S4学习计划与只读关联、S5任务定义已接入真实MySQL。仅受控开发/测试使用，无登录和权限隔离，**不得公网部署或导入真实人员/学生数据**。任务分配和首页真实数据接入仍待S6授权。

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
pnpm db:migrate                 # 显式迁移，当前到005_tasks
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
- `DEV_ACTOR_ID`：默认空，由用户把S1种子脚本输出的演示人员ID手工填入。S2–S5写接口从服务端读取并校验人员存在；缺失/无效返回503，不接受浏览器传入，读取接口不依赖此值。
- `NUXT_REDIS_URL`：可选 Redis URL；设置后优先于分项参数。
- `NUXT_REDIS_HOST`、`PORT`、`PASSWORD`、`DB`：可选 Redis 分项参数；未配置时应用不会尝试连接 Redis。

`.env` 已被 Git 忽略。不要把真实配置值粘贴到聊天、文档、截图、日志或提交记录。种子脚本不会修改 `.env`。`DEV_ACTOR_ID` 不是认证，无论是否填值均不得公网开放。Redis位置由环境变量决定，S1不使用Redis。

S1建users、students、schema_migrations；S2新增contracts；S3新增student_learning_records；S4新增study_plan_documents、study_plan_students；S5仅新增tasks。使用Node原生能力和已有mysql2显式迁移，不增加ORM/迁移框架。S2–S5写请求均要求有效的服务端DEV_ACTOR_ID。操作权限、失败恢复、数据保留回退详见 [数据库说明](database/README.md)。

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

TODO（开发负责人；S6验收时结束）：首页和任务分配仍是独立原型；旧学生和任务mock仍供分配原型使用，不供/tasks真实定义页读取。首页计划区明确后续接入，不使用名称数组兜底。S6未授权，不提前实施。

S5任务定义已接入真实列表/详情/新增/编辑/启停，默认启用且只有启用/停用；分配人数API固定0，无分配表。科目选项独立分页搜索，写操作必须有服务端DEV_ACTOR_ID。文件清单、测试及回退见[S5交付报告](docs/test/s5-task-definitions-delivery.md)。

S4保留计划左右布局，支持搜索分页、按需详情、安全Markdown预览及仅正文编辑；学生标签使用真实计划ID。同名计划不合并，无新建/删除/关系管理。详见[S4交付报告](docs/test/s4-study-plans-delivery.md)。真实API测试会修改固定演示正文并恢复，应独占执行；种子和测试均不读取mock JSON、不修改.env。

学习记录契约见[学生详情PRD](docs/prd/student-detail.md)，S3文件清单、固定合成数据边界与复验说明见[S3交付报告](docs/test/s3-learning-records-delivery.md)。真实测试会编辑指定验收记录，应独占执行，发生异常不删除数据；清理须另行授权。

API契约、变更清单及验证记录见 [S1自测报告](docs/test/s1-students-verification.md)。正式验收由总指挥/测试确认。

合同API契约见[合同PRD](docs/prd/contracts.md)，S2文件清单、真实测试范围和已知限制见[S2交付报告](docs/test/s2-contracts-delivery.md)。本次实际验证地址为 http://127.0.0.1:3001/contracts；按启动输出设置测试端口。
