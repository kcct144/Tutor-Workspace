# S7 学生档案维护独立验收报告

- 状态：复验通过（D01–D10 已关闭；原始发现与修复前证据保留，第 10 节为最新结论）
- 负责人：独立测试负责人
- 创建日期：2026-09-06
- 最后更新日期：2026-09-06
- 关联需求：S7 学生档案维护、student-management、student-detail、student-profile-maintenance-plan

> 第 1–9 节记录 2026-09-06 首轮独立验收的原始发现、当时结论和修复前证据；未追溯改写。第 10 节记录 D01–D10 修复后的独立复验，是当前有效结论。

## 1. 验收结论

| 判断范围                              | 结论                         | 依据                                                                                                                                                  |
| ------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 固定合成样例中本轮可安全执行的路径    | **PASS，可继续受控内部演示** | 重复首拒、联系方式隔离、共享版本、状态变化、跨页刷新和数据恢复的可安全执行部分均通过；当前首次创建相关 3 项明确为 SKIP，不计入 PASS                   |
| S7 完整功能验收                       | **FAIL，不得标记“已验收”**   | 存在 4 项 P2：确认创建未按已确认设计重新检查重复候选、API 错误码偏离已确认契约、合法最大长度内容导致 320px 详情页严重横向溢出、桌面导航键盘焦点不可见 |
| S1–S7 整体受控开发测试 / 合成演示验收 | **本报告不宣告通过**         | 本报告只验收 S7 并做 D01–D03 回归；`mvp-independent-audit.md` 的既有范围、结论和未验证项仍独立有效，且本轮 S7 尚有 P2                                 |
| 小范围真实用户试用                    | **不可进入**                 | 当前没有登录、身份认证、权限隔离、操作审计和应用层部署访问控制；明文编辑回填接口仅可用于受控合成环境                                                  |
| 公网 / 正式生产投用                   | **不可进入**                 | 上述 P1 上线门禁均未解除，也没有生产访问隔离、备份恢复和运行保障的验收证据                                                                            |

本轮没有发现已证实的 P0 数据破坏或新增的 S7 P1 业务缺陷。缺少登录、权限、审计和部署门禁是既有系统级 **P1 上线阻塞项**，不是因 S7 happy path 通过即可降级或豁免的测试缺陷。

本轮只新增本报告，没有修复、重构、暂存或提交 Git；没有修改业务代码、数据库结构、迁移、种子、配置、依赖或 `.env`。

## 2. 范围、基线与环境边界

### 2.1 文档与代码基线

开始前完整阅读：

- `docs/design/student-profile-maintenance-plan.md`
- `docs/prd/student-management.md`
- `docs/prd/student-detail.md`
- `docs/test/s7-student-profile-delivery.md`
- `docs/test/mvp-independent-audit.md`

本轮 HEAD 为 `92b59d7 fix: address mvp audit findings`。S1–S6 提交 `b8e9268`、`61e98ae`、`ae7feec`、`f147526`、`ccfc7c1`、`8fd7db8` 均在当前历史中。S7 是 HEAD 之上的未提交工作区实现；验收保留了全部既有修改。开始和结束均用 `git status --short --untracked-files=all` 核对，除新增本报告外没有由测试产生的源码、迁移、种子、配置或依赖文件变化。

工作区存在项目原有 `.env` 和已跟踪的 `.env.example`；本轮只核对文件是否存在，没有读取、显示或修改正文。Git 状态没有出现未追踪的敏感环境文件。

### 2.2 执行环境和数据控制

- Windows / PowerShell；Node.js 24.15.0；现有 Nuxt 4.5.2、Nitro 2.13.4、Vue 3.5.42、Vitest 4.1.11；未安装依赖。
- 浏览器只访问本机回环开发服务 `http://127.0.0.1:3001`。构建产物测试在随机本机回环端口启动临时进程，完成后自动关闭。
- 每次直接数据库核对及真实 API 脚本开始前均执行既有 `assertApprovedDatabase`；实际连接库为批准的 `tutor_workspace`。没有输出连接配置、凭据、操作人配置或原始隐私数据。
- 没有执行迁移、种子、CREATE/DROP DATABASE、USE、DDL、删除、清库、删表、删列或自定义持久化 DML。
- `student-profiles.mjs` 运行前先独立确认总学生 16、四名固定 S7 样例均存在且为约定业务状态，确保三个创建分支只会 SKIP。脚本只写固定最小样例并恢复业务字段。
- 浏览器只编辑固定样例 id=16；临时测试姓名、年级、学校、班级、联系方式、备注和状态均恢复到交付报告约定状态。version 与 updated_at 只合法递增，没有伪造回退。
- 原 12 名学生没有写操作；合同、记录、计划、任务及关系表没有写操作。

## 3. 实际执行命令与结果

以下命令均从 `D:\code\Tutor-Workspace` 执行：

| 命令 / 操作                                                                                                                                                                            | 实际结果                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git rev-parse --short HEAD`、`git log --oneline -8`、`git status --short --untracked-files=all`、`git diff --stat`                                                                    | HEAD `92b59d7`；确认 S7 为既有未提交实现，未暂存、未提交                                                                                                               |
| `pnpm format:check`                                                                                                                                                                    | 实现基线 PASS；新增报告首次检查仅该报告未格式化，执行限定于报告的 Prettier 后复跑 PASS，最终退出 0                                                                     |
| `pnpm typecheck`                                                                                                                                                                       | PASS，退出 0                                                                                                                                                           |
| `pnpm lint`                                                                                                                                                                            | PASS，退出 0                                                                                                                                                           |
| `pnpm test`                                                                                                                                                                            | PASS，19 个测试文件、86 项测试                                                                                                                                         |
| `pnpm build`                                                                                                                                                                           | 首次沙箱内因 Corepack 读取本机缓存被 EPERM 拒绝；按同一命令在允许环境重跑后 PASS。Nuxt / Nitro 构建完成；只有 `PLUGIN_TIMINGS` 与 Node `DEP0155` 非阻断警告            |
| `pnpm exec vitest run tests/unit/student-profile.test.ts tests/unit/student-profile-state.test.ts tests/unit/student-profile-refresh.test.ts tests/unit/learning-record-focus.test.ts` | PASS，4 个文件、15 项定向测试                                                                                                                                          |
| `node tests/integration/student-profile-boundary.mjs`                                                                                                                                  | PASS；真实 API 前后及浏览器结束后均重复执行，原 12 人、关联表和 000–006 台账指纹一致                                                                                   |
| `node tests/integration/student-profiles.mjs`                                                                                                                                          | PASS 7 / SKIP 3 / fixedStudents 4；三个首次创建分支明确 SKIP，未计入 PASS                                                                                              |
| `node tests/integration/api-route-boundary.mjs`                                                                                                                                        | PASS；开发服务 8 项 D01 只读断言通过                                                                                                                                   |
| `node tests/integration/api-route-built.mjs`                                                                                                                                           | PASS；构建产物 8 项 D01 只读断言通过，临时进程关闭                                                                                                                     |
| 会话内一次性 here-string 只读探针：`node --input-type=module`（台账 / `information_schema`）                                                                                           | PASS；只读核对 000–007 台账顺序、007 文件 checksum、version 列、CHECK 和无非法版本                                                                                     |
| 会话内一次性 here-string 响应扫描：`node --input-type=module`（list/detail/home/options）                                                                                              | PASS；对 list/detail/home/options 原始响应递归检查，明文值和明文字段键均只存在于 edit 回填响应                                                                         |
| 会话内一次性 here-string API 契约探针：`node --input-type=module`（404 / 409 / 413 / DTO）                                                                                             | FAIL（契约）；实测 404=`NOT_FOUND`、旧版本 409=`VERSION_CONFLICT`、413=`PAYLOAD_TOO_LARGE`，与已确认 S7 设计错误码不一致；列表没有 `guardianPhoneMasked`，详情有该字段 |
| 会话内一次性 here-string 数据保护探针：`node --input-type=module`（每段写后 / 最终边界）                                                                                               | PASS；每段写测试后只读核对总数、固定样例业务哈希、关联计数和原学生版本                                                                                                 |
| Computer Use 浏览器复验                                                                                                                                                                | 覆盖 320px、375px、1280px 桌面、三个独立标签页、真实表单、重复提示、档案 / 状态竞争、焦点刷新、联系方式生命周期和最终恢复                                              |

没有运行 `node database/migrate.mjs`。本轮明确禁止迁移，因此重复执行行为只做静态路径审查与实际台账 / 元数据只读核对，未冒充真实迁移复跑通过。

## 4. 测试矩阵

| 模块          | 场景                                                                                | 结果                        | 本轮证据                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新增          | 当前环境首次创建、201 响应和自动跳转详情                                            | **SKIP**                    | 四名固定样例均已存在；脚本输出三个首次创建 SKIP，浏览器没有删除再建或新增第 5 人                                                                   |
| 新增          | 服务端固定待分配、负责人为空、version=1；客户端不能写状态、负责人、版本、聚合字段   | **PASS / SKIP**             | 权威字段拒绝与既有样例状态为 PASS；首次创建后默认值动态验证随上一行记 SKIP                                                                         |
| 新增 / 空状态 | 无关联样例详情                                                                      | **PASS**                    | id=16 显示未分配、日期 / 科目 / 计划为“—”，学习记录 0、任务 0；四名 S7 样例的合同、记录、计划、任务关联数均为 0                                    |
| 重复          | 首次完全重复返回 409、最多 5 条安全候选                                             | **PASS**                    | 真实 API 409；浏览器显示 2 条候选，仅含 id、姓名、学校、班级、状态语义，无联系方式；文案明确不是并发唯一或幂等保证                                 |
| 重复          | “仍要创建”显式携带确认标记                                                          | **PASS（静态 / 单元）**     | 浏览器只有候选存在时显示按钮；单元验证仅 `save(true)` 发送 `confirmPossibleDuplicate:true`。为避免新增第 5 人，没有点击最终确认                    |
| 重复          | 确认后二次请求由服务端重新检查                                                      | **FAIL**                    | `confirmPossibleDuplicate=true` 时 DAL 完全跳过重复 SELECT，见 S7-D02                                                                              |
| 重复          | 修改姓名、学校或班级后取消旧确认                                                    | **部分 PASS / FAIL**        | 候选和“仍要创建”按钮同步消失，普通保存恢复；旧的红色重复错误文案仍残留，见 S7-D06                                                                  |
| 联系方式      | list/detail/home 与成功写响应不含明文；仅 edit 返回原值                             | **PASS / SKIP**             | 原始 list/detail/home/options 响应不含明文值或明文字段键；update/status 真实成功响应脱敏。当前 create 成功因首次创建 SKIP，未作为本轮动态 PASS     |
| 联系方式      | 不把脱敏串回写；关闭侧栏清空明文草稿                                                | **PASS**                    | 服务端拒绝星号格式；编辑仅用 edit DTO 回填。浏览器输入固定合成值后详情只显示脱敏值；取消并丢弃草稿后重开字段为空，最终数据库为空                   |
| 联系方式      | URL、日志、浏览器持久存储                                                           | **PASS（已检查范围）**      | 三个浏览器标签 URL 无联系方式；console 捕获无匹配；localStorage、sessionStorage、IndexedDB、cookie 均为 0；代码未见持久化或请求体日志              |
| 并发          | 档案编辑与状态竞争共享 version                                                      | **PASS**                    | 真实 API 两并发一项 200、一项 409；浏览器窗口 B 更新状态后，窗口 A 的旧版本档案保存 409                                                            |
| 并发          | 旧版本同目标状态也返回 409                                                          | **PASS**                    | 真实请求用旧 version 和当前状态得到 HTTP 409 / `VERSION_CONFLICT`                                                                                  |
| 幂等          | 当前版本同状态不更新时间或 version                                                  | **PASS**                    | 真实 API 脚本在写前后比较完整行；浏览器也执行同状态保存，最终合法版本证据一致                                                                      |
| 草稿          | 冲突、取消重新加载、保存失败保留草稿和旧版本                                        | **PASS**                    | 浏览器 409 后姓名、备注和联系方式草稿保留，保存禁用；取消重载仍保留；明确确认重载才替换。单元覆盖 transport/5xx 未知结果不重发和旧 version 保留    |
| 刷新          | 姓名、年级、状态后的列表、详情、首页                                                | **PASS**                    | 临时姓名 / 学校 / 班级在列表和详情刷新；临时在读后首页人数 5 并显示高二卡片；恢复待分配后首页人数 4 且卡片移除                                     |
| 刷新          | 页外已选学生标签与其他模块草稿                                                      | **PASS**                    | 合同学生筛选保留同一选中 ID，焦点后标签由临时名 / 高二刷新为最终名 / 初一；打开的合同科目草稿未被刷新替换                                          |
| D03           | focus / `student-data-changed` 刷新学习记录和基本信息且保留筛选、页码、草稿、旧版本 | **PASS**                    | 定向单元 4 文件 15 项通过；浏览器跨标签同状态写入后返回焦点，新建学习记录草稿和关键词筛选保持，记录数量仍为 0                                      |
| 状态保护      | 结课二次确认；不写关联表                                                            | **PASS**                    | 浏览器出现明确二次确认及关联不变说明；结课后恢复待分配。最终四个 S7 样例所有关联计数为 0，全部关联表指纹不变                                       |
| 状态反馈      | 保存成功反馈可见                                                                    | **FAIL**                    | 桌面页顶部保存后状态已刷新，但成功 Alert 顶部为 817px、当前视口高度 807px，用户看不到，见 S7-D07                                                   |
| 输入边界      | 服务端 Unicode、日期、联系方式、枚举、未知字段、413、404                            | **PASS**                    | 真实 API 组通过；SQL 注入式关键词按普通文本处理，无敏感错误泄漏                                                                                    |
| 输入体验      | 前端即时长度、日期和联系方式校验                                                    | **FAIL**                    | 375px 可输入 65 字姓名，输入框无 maxlength、保存仍可点击，提交后才收到服务端 400；日期无 max、联系方式无本地格式提示，见 S7-D05                    |
| 窄屏          | 320px / 375px 标准内容、表单、移动导航                                              | **PASS**                    | 侧栏全宽，标题和底部按钮未裁切，正文独立纵滚；导航 320px 为 174/341、375px 为 219/341，可 Tab 到末项且自动横滚 167/127px，焦点 2px 实线可见        |
| 窄屏          | 合法最大长度详情                                                                    | **FAIL**                    | 64 字姓名、128 字学校、500 字无断点备注均为服务端允许值；320px 时文档 scrollWidth=3595、clientWidth=305，见 S7-D03；测试后已恢复                   |
| 桌面          | 页面布局与导航                                                                      | **部分 PASS / FAIL**        | 1280px 无全局溢出、正文不与 64px 页头重叠，导航 424/424 无横滚；六项可 Tab 聚焦，但焦点无可见指示，见 S7-D04                                       |
| D01           | 缺失 `/api/**`、错误方法、正常 API、业务 404，开发及构建产物                        | **PASS**                    | 两种服务各 8 项：状态码、JSON envelope、`Cache-Control:no-store` 与安全错误信息全部通过                                                            |
| 迁移          | 007 文件、精确白名单、结构和台账                                                    | **PASS（静态 + 实库只读）** | 007 仅一条 ALTER；manifest 精确列出 000–007；实际台账 8 条有序、checksum 一致、`INT UNSIGNED NOT NULL DEFAULT 1` 与正数 CHECK 通过、非法 version=0 |
| 迁移          | 真实迁移首次 / 重复执行                                                             | **SKIP**                    | 本轮禁止执行迁移；没有把开发交付报告的历史执行结果计为独立 PASS                                                                                    |
| API 契约      | 已确认错误码                                                                        | **FAIL**                    | 实际 404 / 409 / 413 代码与已确认 S7 设计不同，见 S7-D01                                                                                           |
| 列表 DTO      | 脱敏联系方式字段                                                                    | **FAIL（契约）**            | 已确认设计定义列表含 `guardianPhoneMasked`；真实列表和类型均不含，详情包含，见 S7-D08                                                              |
| 操作人        | 只信任服务端 DEV_ACTOR，客户端伪造无效                                              | **PASS（受控开发边界）**    | 构建产物空 / 无效 actor 共 6 项 503，`X-Actor-Id` 无效；这不是登录或鉴权                                                                           |
| 工程回归      | format / typecheck / lint / test / build                                            | **PASS**                    | 全部退出 0；构建只有两类非阻断警告                                                                                                                 |
| 交付证据      | 首轮真实 API PASS 汇总                                                              | **FAIL（文档）**            | 交付报告写 PASS 10；按当前脚本空初始数据分支实际应累计 PASS 11，见 S7-D09                                                                          |

## 5. 数据完整性、迁移与访问层结论

### 5.1 007 与迁移执行器

- `database/migrations/007_students_version.sql` 只有批准的单条 `ALTER TABLE students`，文件 SHA-256 为 `2ee7e9dfcb5a7c6c1b9d8cbfb2af1ea844b9d080c84ce06b36aff05afbe8a133`。
- `database/migrate.mjs` 用固定 manifest 顺序列出 000–007；007 走 `parseStudentVersionMigration` 精确规范化白名单，旧通用解析仍不接受任意 ALTER。
- 实际 `schema_migrations` 共 8 条，顺序为 000–007；007 台账 checksum 与文件一致。
- 实际 `students.version` 为 `INT UNSIGNED NOT NULL DEFAULT 1`，`chk_students_version` 已启用且表达式为 `version > 0`；非法版本计数为 0。
- 迁移执行器对已登记 migration 比对 checksum，对 007 重复跳过前再核对结构；本轮没有执行该路径。

### 5.2 DAL 与事务

- create/update/status 三类请求使用独立字段白名单，拒绝客户端状态、负责人、版本、操作人、聚合与关联字段。
- 新增 SQL 固定写待分配、空负责人和 version 1；编辑和状态只更新 `students`。SQL 值均参数化，ID、分页和 options ids 都有边界与 LIMIT。
- 编辑和状态先 `FOR UPDATE` 读取，再校验共享 version；旧版本检查早于同状态 no-op。状态 / 编辑都使用事务，路由在 finally 中释放连接。
- 联系方式只有 edit 投影原值；list/home/options 不查询该列，detail 与写成功响应走脱敏映射。没有真实后端失败后回退 mock。
- **不符合**：确认创建跳过重复查询；错误码和列表 DTO 与已确认文档不一致，详见缺陷。

### 5.3 前后数据保护

最终只读核对：

| 对象                     | 最终证据                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| students                 | 总数 16；原学生 12 且 version=1 共 12；四名 S7 固定样例均待分配、负责人为空、业务字段哈希与前置一致 |
| 固定样例 version         | id=13 为 30，id=14 为 1，id=15 为 1，id=16 为 14；成功测试只合法递增，未回退                        |
| users                    | 1                                                                                                   |
| contracts                | 6                                                                                                   |
| student_learning_records | 9                                                                                                   |
| study_plan_documents     | 3                                                                                                   |
| study_plan_students      | 4                                                                                                   |
| tasks                    | 4                                                                                                   |
| task_assignments         | 14                                                                                                  |
| schema_migrations        | 8                                                                                                   |

四名固定 S7 样例排除 version / updated_at 后的业务哈希为 `c0b6695f862814aeee724673bbfc05f53f311e0b1c7158f782ce25e12855ae9a`，与测试前一致。四名样例在合同、记录、计划和任务分配中的关联数全部为 0。

保护对象最终指纹与前置一致：

| 保护对象                          | 数量 | SHA-256                                                            |
| --------------------------------- | ---: | ------------------------------------------------------------------ |
| users                             |    1 | `c92ea03dcbe054e41a88c6cbccca65a0248312a462cf9d42988d5d36e73658e7` |
| 原 12 名 students（排除 version） |   12 | `22989928144df7710621a36f16e0c5048930808086b8406fd0cad81cdc63220e` |
| contracts                         |    6 | `f5854ec1a8ec07f9a9a376cf3e2051583fda3eadab155229aa9d325d5930be65` |
| student_learning_records          |    9 | `003e5f21a7381ef123c89f4a811ee9edae3a32bd8268aeef4287ec13009617ff` |
| study_plan_documents              |    3 | `42ec1af30d0ebe28dc196cc61d8f7386c225689ada4192b70ac52710079df92d` |
| study_plan_students               |    4 | `64576d5342290d6718ec411fb2eb353c1f6962dbe0cede3b15c533c750d03222` |
| tasks                             |    4 | `13ac639555803b0ecfbb8f5e69513c2629188b16e5261e5c41fe374a2768a7d3` |
| task_assignments                  |   14 | `5011510aed72d0a1b8684e277fcb2e8d7e65468a5869b03ef7346adfb52c6e40` |
| schema_migrations 000–006         |    7 | `2714ed26eb9d1ac221cf535fc3884b240ca48609963ea2627b8e305954fc9d28` |

## 6. 安全与上线风险

### P1 系统级上线门禁（既有，未关闭）

1. **无登录和身份认证**：任何能访问应用的人都没有可验证的个人身份。
2. **无操作审计**：学生档案及状态变更没有满足真实使用要求的行为审计链。
3. **无部署访问控制**：未验收反向代理、网络白名单、TLS、会话与公网隔离。
4. **明文 edit 回填依赖上述门禁**：`GET /api/students/edit` 会返回原联系方式。在当前受控合成环境符合设计；进入真实试用前必须由鉴权与权限边界保护。

### 本轮安全结论

- 没有发现 list/detail/home/options 或 update/status 成功响应泄漏明文联系方式；create 成功动态路径本轮 SKIP。
- 错误响应为统一 JSON envelope、`Cache-Control:no-store`，没有栈、SQL、连接值或凭据。
- 浏览器 URL、console、Web Storage、IndexedDB 与 cookie 的已检查范围没有新增明文泄漏。
- 自动化脚本的失败断言可能展开固定合成联系方式或整行对象；本轮全部通过，报告没有复制这些值。后续执行仍应对失败输出做脱敏。

## 7. 缺陷清单

### P0

无。

### P1

没有新增 S7 P1 业务缺陷。第 6 节五项系统级门禁保持 P1 阻塞。

### P2

#### S7-D01：API 错误码偏离已确认 S7 契约

- **复现步骤**：请求不存在学生详情；以旧 version 提交同目标状态；提交超过 16KiB 的 create JSON；静态检查 actor 和存储异常映射。
- **预期**：按 `student-profile-maintenance-plan.md` 返回 `STUDENT_NOT_FOUND`、`STUDENT_VERSION_CONFLICT`、`REQUEST_TOO_LARGE`、`ACTOR_UNAVAILABLE` / `DATABASE_UNAVAILABLE`。
- **实际**：实测分别为 `NOT_FOUND`、`VERSION_CONFLICT`、`PAYLOAD_TOO_LARGE`；构建 actor 测试为 `DEV_ACTOR_UNAVAILABLE`；存储异常代码静态为 `STORAGE_UNAVAILABLE`。
- **影响**：按已确认契约分支处理错误的客户端、测试或后续集成会识别失败；交付报告自行改成“复用既有错误码”，但已确认设计未同步裁决。
- **脱敏证据**：404、409、413 状态码与上述 code；envelope/no-store 均正确，无响应正文或隐私数据进入报告。

#### S7-D02：显式重复确认跳过服务端二次检查

- **复现步骤**：提交姓名、学校、班级完全相同的 create，首次得到 409；检查确认请求 `confirmPossibleDuplicate:true` 在 `createStudent` 中的控制流。
- **预期**：确认后二次请求仍由服务端重新检查候选，并在同一事务内插入；重复提示不承担并发唯一约束。
- **实际**：重复查询仅在 `!input.confirmPossibleDuplicate` 时执行；确认请求直接跳过 SELECT 并插入。单元测试也明确断言 confirmation alone allows insert。
- **影响**：首次提示与确认提交之间候选集合发生变化时，服务端不会重新评估，偏离已确认的误建保护流程。该缺陷不等同于缺少数据库唯一约束，本报告没有把提示机制描述成并发唯一保证。
- **脱敏证据**：真实首次请求 409 和 2 条安全候选通过；为遵守 4 人上限，本轮未执行会新增第 5 人的确认插入。静态控制流足以确定二次检查被跳过。
- **涉及文件**：`docs/design/student-profile-maintenance-plan.md:78-87`、`server/db/student-profile.ts:66-95`、`tests/unit/student-profile.test.ts:210-241`。

#### S7-D03：合法最大长度档案导致 320px 详情页严重横向溢出

- **复现步骤**：仅对固定 id=16 临时保存服务端允许的 64 字无断点姓名、128 字无断点学校和 500 字无断点备注；将 CSS viewport 设为 320×800；测量文档和字段尺寸；随后恢复全部业务字段。
- **预期**：合法内容在窄屏内断行或受控滚动，不使整页横向扩张，不裁切页头或正文。
- **实际**：`documentElement.clientWidth=305`，`scrollWidth=3595`；姓名和学校内容宽约 881px，备注宽约 3554px；computed `overflow-wrap:normal`、`word-break:normal`。
- **影响**：合法边界数据会使移动端详情页主体扩展到十倍以上视口宽度，导航、字段和操作难以使用。
- **脱敏证据**：仅记录长度和 DOM 尺寸；测试数据为重复字母且已恢复，最终页面无溢出。
- **涉及文件**：`app/components/BasicInfoPanel.vue:9-14,26-27,69-71`、`app/assets/css/tailwind.css:618-665,1308-1319`。

#### S7-D04：桌面导航通过键盘聚焦时没有可见焦点指示

- **复现步骤**：reset 为 1280×720 桌面 viewport，从页面起点连续按 Tab 到六个主导航入口，读取当前焦点元素样式；同样在 320px、375px 比较。
- **预期**：六个入口均可通过键盘到达且当前焦点清晰可见，桌面与移动端一致。
- **实际**：六项确实可聚焦，但桌面“任务分配”焦点的 `outline:0px none`、`box-shadow:none`、底边透明且颜色不变；320px / 375px 才有 2px solid outline，因为规则写在 `max-width:760px` media 内。
- **影响**：桌面键盘用户无法判断当前位置，D02 的“可通过键盘访问”在可感知层面未满足。
- **脱敏证据**：1280px 导航 client/scrollWidth 均 424，无布局溢出；问题仅为焦点反馈。
- **涉及文件**：`app/assets/css/tailwind.css:59-75,1214-1239`。

### P3

#### S7-D05：档案表单缺少已确认的前端即时边界校验

- **复现步骤**：375px 新增侧栏输入 65 字姓名并选择年级；检查属性和保存状态后提交。静态检查学校、班级、监护人、联系方式、备注和日期控件。
- **预期**：前端即时提示长度 / 日期 / 联系方式问题，限制已知最大长度；服务端仍作为权威校验。
- **实际**：姓名输入接受 65 字，`maxlength` 为空、保存按钮可用，提交到服务端后才显示“不能超过64个字符”；其他文本框也无 maxlength，日期只有 min 没有 max，联系方式没有字符 / 位数 / 星号即时提示。
- **影响**：产生本可避免的失败请求，移动侧栏长表单顶部 Alert 反馈距离当前字段较远；数据安全仍由服务端 400 保护。
- **脱敏证据**：只记录输入长度、属性、按钮状态和安全错误文案，学生总数始终 16。
- **涉及文件**：`docs/prd/student-management.md:55-63`、`docs/design/student-profile-maintenance-plan.md:89-95`、`app/components/StudentProfileDrawer.vue:79-161`、`app/composables/useStudentProfile.ts:115-147`。

#### S7-D06：修改重复匹配字段后仍显示过期的红色重复警告

- **复现步骤**：新增表单填入固定重复档案三项，提交得到 409；把班级改为不同值。
- **预期**：旧候选、确认入口及对应的重复错误提示一起失效。
- **实际**：候选区和“仍要创建”按钮消失、普通保存恢复，但顶部仍显示“发现姓名、学校和班级相同”的旧红色 Alert。
- **影响**：用户会误以为修改后仍被判定重复，可能反复提交或放弃正确录入；确认标记本身不会误带。
- **脱敏证据**：浏览器只显示 2 条固定合成候选；没有点击确认或新增学生。
- **涉及文件**：`app/composables/useStudentProfile.ts:47-56,153-166`、`app/components/StudentProfileDrawer.vue:73-75,163-176`。

#### S7-D07：状态保存成功反馈位于当前视口之外

- **复现步骤**：桌面详情页保持 `scrollY=0`，从待分配切换为在读并保存；对话框关闭后测量成功 Alert。
- **预期**：状态刷新后用户立即看到成功反馈。
- **实际**：状态已正确更新，但成功 Alert `top=817px`、`bottom=857px`，当前 viewport 高度 807px，且页面不自动滚动。另有静态问题：冲突后成功“读取最新状态”的文案仍通过 error Alert 样式呈现。
- **影响**：用户可能误认为保存未完成并重复操作；不影响数据库正确性。
- **脱敏证据**：只记录状态和元素坐标；最终状态已恢复待分配。
- **涉及文件**：`app/components/StudentStatusDialog.vue:36-43,66-70`、`app/composables/useStudentStatus.ts:22-30,45-53`、`app/pages/students/[id].vue:59-63`。

#### S7-D08：列表联系方式 DTO 与已确认文档不一致

- **复现步骤**：请求 `/api/students/list?page=1&pageSize=1`，只检查首项字段名；再请求 detail 比较字段名。
- **预期**：已确认计划和 PRD 把 `guardianPhoneMasked` 列入 `StudentListItem`，列表与详情均只返回该脱敏字段。
- **实际**：真实列表项没有 `guardianPhoneMasked`，`StudentListItem` 类型和列表 SQL 也没有；详情包含。交付报告改称列表继续不含联系方式。
- **影响**：API / PRD / 类型口径不一致，按已确认 DTO 开发的消费者会缺字段。当前实现投影更小，未造成隐私泄漏。
- **脱敏证据**：仅记录字段存在布尔值：list=false、detail=true，没有输出字段值。
- **涉及文件**：`docs/design/student-profile-maintenance-plan.md:72-74,156-174,191`、`docs/prd/student-management.md:73,90,112`、`types/api/students.ts:19-39`、`server/db/students.ts:34-58`、`docs/test/s7-student-profile-delivery.md:27,46`。

#### S7-D09：开发交付报告的首次 API PASS 汇总与脚本计数不符

- **复现步骤**：按脚本空初始数据分支逐项统计 `passed()`：三次创建中的 4 个 PASS（第三次含先拒绝和确认创建），随后重复再拒绝 1 个，后续固定分组 6 个。
- **预期**：交付报告的汇总与脚本实际计数一致。
- **实际**：脚本空初始数据应为 PASS 11，交付报告记录 PASS 10。当前复跑实际输出 PASS 7 / SKIP 3，与脚本一致。
- **影响**：历史自测证据不可精确复核，容易把分组漏计或把 SKIP 混入通过结论；不影响运行时代码。
- **脱敏证据**：本轮原始输出为 `{"PASS":7,"SKIP":3,"fixedStudents":4}`。
- **涉及文件**：`tests/integration/student-profiles.mjs:124-170,242,281,344,370,408,420`、`docs/test/s7-student-profile-delivery.md:77`。

#### S7-D10：S7 真实 API 脚本异常中断时不保证恢复固定样例

- **复现步骤**：静态检查 `student-profiles.mjs` 的状态 / 编辑 / 并发写与最终恢复范围；恢复前的主流程没有覆盖整段的 outer `finally`。检查 actor 脚本在意外允许写入后的断言顺序。
- **预期**：任何断言或网络失败后，固定样例都能进入可验证恢复路径；失败日志不展开联系方式或完整学生行。
- **实际**：主脚本正常完成会恢复，但中途失败可留下 id=13 临时业务状态；部分 `assert.equal` / `deepEqual` 失败可能展开固定合成联系方式或整行。actor 缺陷路径也可能在最终全表比较前退出。
- **影响**：后续验收可能从非约定固定状态开始，并增加测试日志中出现合成联系方式的风险。本轮通过独立前置、每段写后检查和最终哈希消除了本次运行残留，未发生泄漏。
- **脱敏证据**：不人为制造会残留数据的失败；依据控制流静态审查。当前最终状态及指纹全部通过。

## 8. SKIP 与未验证项

- **SKIP**：三个首次创建分组；没有删除固定学生后重建，没有把历史开发结果或已有数据状态冒充本轮首次创建 PASS。
- **SKIP**：浏览器“仍要创建”的最终提交及 create 201 成功响应明文扫描，因为会突破四名样例 / 总数 16 的限制。显式参数由静态和单元验证，新增默认值由既有样例与 SQL 验证。
- **SKIP**：真实迁移首次执行和重复执行；本轮禁止执行迁移，只完成静态白名单和实际台账 / 结构核对。
- **未验证**：真实数据库断连、commit 后网络中断、DDL 中途失败、连接池耗尽；没有破坏环境来制造故障。
- **未验证**：真实数据库 version 推进至 UINT 上限；只做单元边界测试。
- **未验证**：对带合同、记录、计划或任务的原 12 名学生真实改名 / 改状态后的完整跨模块 E2E；本轮禁止修改原学生和关联数据。固定无关联样例和只读名称一致性、刷新事件及指纹均通过。
- **未验证**：浏览器网络面板的完整 HAR / 代理级请求日志。已检查实际 API 原始响应、当前 URL、console、浏览器持久存储和应用静态日志路径。
- **未验证**：真实登录、权限矩阵、审计检索、公网部署、备份恢复与灾难恢复；当前实现没有这些能力。

## 9. 建议与交接

S7 不能标记为已验收。应先处理四项 P2，并对以下场景独立复验：确认请求重新检查但不误当唯一约束；错误码契约统一；合法最大长度在 320px / 375px 断行；桌面键盘焦点可见。P3 可一并修复或进入明确的缺陷台账，但不得用文档改口替代已确认需求裁决。

固定合成样例当前已恢复，可继续用于受控开发测试。小范围真实用户试用及公网 / 生产继续被登录、权限隔离、审计和部署访问控制阻塞。本报告完成后停止，等待总指挥处理；不提交 Git。

## 10. 2026-09-06 D01–D10 修复独立复验

### 10.1 范围、基线与数据边界

本轮开始前重新完整阅读：

- `docs/design/student-profile-maintenance-plan.md`
- `docs/test/s7-student-profile-independent-verification.md`
- `docs/test/s7-audit-remediation-delivery.md`

HEAD 仍为 `92b59d7`。工作区保留总指挥已确认文档、既有 S7 实现和 D01–D10 修复；测试没有清理、暂存或提交这些改动。追加前本报告共 301 行，SHA-256 为 `261c20710f0124e484477d553d6f9d18d5033c7282a8a0c20f80abe90fa2bcd8`，与修复交付报告登记值一致，因此第 1–9 节的修复前证据可追溯。

本轮仍只连接批准的 `tutor_workspace`。每个真实数据库脚本和会话内只读探针均先调用既有 `assertApprovedDatabase`；未输出 `.env`、连接配置、操作人配置、凭据或明文联系方式。没有运行迁移或种子，没有新增、删除学生，没有修改原 12 名学生或任何关联数据。真实业务写只发生在 id=13、id=16 两名已登记 S7 固定样例；两者最终业务字段与状态均恢复，version / updated_at 仅由正常 API 合法递增。

### 10.2 实际命令与结果

以下命令均从 `D:\code\Tutor-Workspace` 执行：

| 命令 / 操作                                                                                                                                                          | 本轮实际结果                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                                                                                                                                                  | PASS；追加报告后再次格式化并复跑，退出 0                                                                                            |
| `pnpm typecheck`                                                                                                                                                     | PASS，退出 0                                                                                                                        |
| `pnpm lint`                                                                                                                                                          | PASS，退出 0                                                                                                                        |
| `pnpm test`                                                                                                                                                          | PASS，20 个测试文件、97 项测试                                                                                                      |
| `pnpm build`                                                                                                                                                         | PASS，Nuxt / Nitro 生产构建退出 0；仅有既有 `PLUGIN_TIMINGS` 与 Node `DEP0155` 非阻断警告                                           |
| `pnpm exec vitest run tests/unit/student-profile-remediation.test.ts tests/unit/student-profile-state.test.ts tests/unit/student-profile.test.ts --reporter=verbose` | PASS，3 个文件、23 项；其中 remediation 文件 D02 / D05 / D07 / D10 隔离场景 10 项通过                                               |
| `node tests/integration/api-route-boundary.mjs`                                                                                                                      | PASS；开发服务 8 项缺失路由、错误方法、正常 API、业务 404 / 400 均为 JSON envelope、no-store                                        |
| `node tests/integration/api-route-built.mjs`                                                                                                                         | PASS；当前构建产物重复上述 8 项，临时服务关闭                                                                                       |
| `node tests/integration/student-profiles.mjs`                                                                                                                        | PASS 7 / SKIP 3 / fixedStudents 4；三个首次创建场景单独计 SKIP，正常完成恢复和全数据核对后才输出汇总                                |
| `node tests/integration/student-profile-boundary.mjs`                                                                                                                | 真实 API 前、API 后和浏览器结束后均 PASS；三次保护对象数量与 SHA-256 一致                                                           |
| 会话内一次性 `node --input-type=module` DTO 探针                                                                                                                     | PASS；list / home / options 无联系方式字段，detail / status 仅 masked，edit 仅原值；同状态请求 version 不变；create 成功路径记 SKIP |
| 会话内一次性纯内存子进程故障探针                                                                                                                                     | PASS；不连接数据库；主测试与恢复同时失败时子进程退出码为 1，固定安全摘要存在，两个底层失败标记均未进入日志                          |
| `pnpm dev --host 127.0.0.1 --port 3001` + Computer Use                                                                                                               | 仅本机回环；完成 320px、375px、1280px 的 D03–D07 浏览器复验后关闭标签、重置视口并停止服务                                           |

开发服务在多次强制切换视口期间记录两次 `ResizeObserver loop completed with undelivered notifications`；两次均未伴随可见布局失败、请求失败或数据异常，当前生产构建也通过。该现象作为本轮附带观察保留，不用于替代 D03 的 DOM 尺寸证据，也不重新打开 D01–D10。

### 10.3 D01–D10 复验矩阵

| 缺陷                             | 原级别 | 本轮结果          | 独立复验证据                                                                                                                                                                                                                                                                                                                                                                                                             | 最新状态                                                                                     |
| -------------------------------- | ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| D01 API 错误码契约               | P2     | **PASS**          | 总指挥裁决后的计划、两份 PRD、数据模型、实现和脚本均统一为公共 `NOT_FOUND`、`VERSION_CONFLICT`、`PAYLOAD_TOO_LARGE`、`DEV_ACTOR_UNAVAILABLE`、`STORAGE_UNAVAILABLE`；重复保持 `STUDENT_POSSIBLE_DUPLICATE`。真实脚本通过 400 / 404 / 409 / 413 断言，构建产物操作人 6 项 503 通过；存储不可用映射只做静态核对，没有破坏数据库制造故障                                                                                    | **按契约裁决调整后关闭**；不追溯否定原发现                                                   |
| D02 确认请求跳过重复查询         | P2     | **PASS / SKIP**   | `createStudent` 对未确认和已确认请求都先执行参数化安全投影、`ORDER BY id LIMIT 5`；仅“命中且未确认”返回 409，明确确认后在同一事务继续插入。四组合隔离单元验证 begin→select→insert→commit 或 begin→select→rollback；真实未确认仍为 409 且候选不超过 5 条。禁止新增第 5 名样例，因此 confirmed create 201 真实路径为 SKIP                                                                                                  | **根因关闭**；确认创建真实 E2E 的 SKIP 单独保留，不把提示误称唯一约束或额外确认轮次          |
| D03 最大合法无断点内容整页溢出   | P2     | **PASS**          | 仅临时把 id=16 保存为 64 / 128 / 32 / 500 个无断点字符，覆盖姓名、学校、班级、备注；详情、列表、首页分别在 320 / 375 / 1280px 测量。三页的 document client/scroll 分别均为 305/305、360/360、1265/1265；相关详情字段自身 scrollWidth=clientWidth。列表只保留 `.ant-table-content` 局部横滚，320 / 375 / 桌面为 271/1420、326/1420、1191/1420，没有传递到整页                                                             | **关闭**                                                                                     |
| D04 导航键盘焦点不可见           | P2     | **PASS**          | 三视口均按 Tab 顺序经过工作台、学员管理、合同管理、学习计划、任务列表、任务分配，六项 computed outline 均为 2px solid。320px 导航 159/341，末项 scrollLeft=182；375px 为 214/341，末项 scrollLeft=127；桌面为 424/424                                                                                                                                                                                                    | **关闭**                                                                                     |
| D05 前端即时边界校验不足         | P3     | **PASS**          | 表单字段旁即时显示姓名必填、学校 / 班级 / 监护人 / 备注长度、联系方式和日期错误，错误时保存禁用；新增表单初始姓名与年级错误也就地显示。65 个 emoji 的 JS length=130、Unicode code point=65，显示超长并禁用；64 个 emoji 的 JS length=128、code point=64，无错误且保存可用；输入框没有 HTML `maxlength`。隔离单元对五个文本字段逐项对比客户端 / 服务端 Unicode 上下界；电话、日期等分别验证客户端即时规则及服务端权威规则 | **关闭**                                                                                     |
| D06 修改匹配字段后旧重复状态残留 | P3     | **PASS**          | 浏览器真实未确认请求得到 2 条安全候选、1 个“仍要创建”入口和 1 条重复错误；修改学校后计数同时变为 0/0/0，普通保存恢复可用，未提交确认。单元验证姓名 / 学校 / 班级均清理重复状态且 transport 错误保留；静态控制流确认仅重复 code 会被清除，其他错误不受影响                                                                                                                                                                | **关闭**                                                                                     |
| D07 成功与重载反馈               | P3     | **PASS**          | 状态保存 toast 动画稳定后位于当前视口：320px top/bottom=5.76/61.10，375px 与桌面均为 8/64。真实双窗口竞争后旧版本返回 409；“重新读取最新状态”显示 1 个 info、0 个 error，并保留用户目标状态，保存重新启用                                                                                                                                                                                                                | **关闭**                                                                                     |
| D08 列表联系方式 DTO             | P3     | **PASS / SKIP**   | 按总指挥裁决，文档和类型均定义列表不含任何联系方式。真实原始响应探针确认 list / home / options 无明文或 masked 字段，detail 和同状态 status 成功响应只有 `guardianPhoneMasked`，edit 只有 `guardianPhone`；真实 update 成功投影由主 API 脚本验证。create 201 因首次创建 SKIP，仅做静态 / 单元映射核对                                                                                                                    | **按契约裁决调整后关闭**；DTO 分离仍不等于身份授权                                           |
| D09 历史 PASS 计数               | P3     | **PASS**          | 原交付的历史 PASS 10 行保留；交付补充明确写出“原始日志不存在、历史无法核实”，并把修复前脚本静态 11 与本轮实测 PASS 7 / SKIP 3 分开。当前脚本使用独立 pass / skip 数组，三个首次创建只进入 SKIP                                                                                                                                                                                                                           | **证据口径纠正后关闭**；历史 PASS 10 继续标为不可核实，不改写成静态或本轮实测                |
| D10 异常恢复与日志脱敏           | P3     | **PASS / 未验证** | 隔离测试验证：已确认的自身写入在主断言失败后仍恢复；version / 业务字段外部变化、数据库不可达、结果不明均停止后续恢复写；恢复失败不掩盖主失败且最终 verify 始终执行；安全断言不展开对象。独立纯内存子进程验证恢复失败退出码为 1、无底层失败标记泄漏。真实 API 正常路径完成 outer finally 恢复和全边界核对                                                                                                                 | **根因关闭**；真实断连、commit 结果不明及真实恢复 API 故障继续记未验证，不破坏真实库制造失败 |

### 10.4 缺陷状态变更与涉及文件

D01、D08 的关闭依据是总指挥批准后的契约调整，含义是“当前文档、类型和实现已统一”，不是原报告当时判断错误。D02–D07、D09、D10 均在原发现保留的前提下按修复证据关闭。本轮没有仍开放的 D01–D10，也没有发现新的 P0 / P1 或足以阻塞 S7 受控验收的新缺陷。

| 项目      | 主要复验文件                                                                                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 / D08 | `docs/design/student-profile-maintenance-plan.md:164-202,291-292`、`docs/prd/student-management.md:73,88-121`、`docs/prd/student-detail.md:65-100`、`docs/design/student-data-model.md:43-71,123-133`、`types/api/students.ts:19-65`、`server/db/students.ts:34-61,73-137`、`server/utils/api.ts:17-63` |
| D02       | `server/db/student-profile.ts:64-92`、`server/api/students/create.post.ts:8-14`、`server/db/pool.ts:31-46`、`tests/unit/student-profile-remediation.test.ts:28-84`                                                                                                                                      |
| D03 / D04 | `app/assets/css/tailwind.css:13-16,196-237,609-685,1238-1259,1325-1339`、`app/components/BasicInfoPanel.vue:9-71`、`app/layouts/default.vue:12-49`、`app/pages/index.vue:73-101`、`app/pages/students/index.vue:98-135`                                                                                 |
| D05 / D06 | `app/utils/student-profile-validation.ts:17-56`、`app/components/StudentProfileDrawer.vue:87-232`、`app/composables/useStudentProfile.ts:50-166`、`tests/unit/student-profile-state.test.ts:30-134`、`tests/unit/student-profile-remediation.test.ts:86-125`                                            |
| D07       | `app/components/StudentStatusDialog.vue:1-66`、`app/composables/useStudentStatus.ts:20-68`、`tests/unit/student-profile-remediation.test.ts:126-147`                                                                                                                                                    |
| D09       | `docs/test/s7-student-profile-delivery.md:79-80,147-149`、`tests/integration/student-profiles.mjs:58-67,164-172,511-518`                                                                                                                                                                                |
| D10       | `tests/integration/student-profile-recovery.mjs:3-205`、`tests/integration/student-profiles.mjs:49-510`、`tests/unit/student-profile-remediation.test.ts:150-251`                                                                                                                                       |

### 10.5 SKIP 与未验证项

- **SKIP**：首次最小创建、首次完整创建、明确确认后创建。四名登记样例已存在，禁止删除重造或新增第 17 名学生；本轮真实脚本输出 SKIP 3，未计入 PASS。D02 的确认分支由事务四组合隔离单元验证，D08 的 create 201 投影只做静态 / 单元核对。
- **未验证**：真实数据库断连、commit 后结果不明、真实恢复 API 故障和连接池耗尽。D10 使用不连接数据库的隔离故障注入验证控制流、退出码和日志；没有为了制造错误而破坏受控库。该限制不阻塞 D10 根因关闭，但进入新的基础设施环境时仍需单独做可恢复性演练。
- **未验证**：真实 `STORAGE_UNAVAILABLE` HTTP 响应；只核对统一映射和安全错误处理，没有关闭或篡改数据库来制造 503。操作人 503 已在构建产物实测。
- **未验证**：真实登录、权限矩阵、操作审计、部署门禁、公网隔离、备份恢复。当前系统没有这些能力，本轮不得以 DTO 最小化或 DEV_ACTOR 测试代替。
- **SKIP**：007 迁移首次 / 重复执行；本轮明确禁止运行迁移，原报告的静态与实库只读结论保持有效。

以上 SKIP / 未验证不自动记为缺陷。前三个首次创建场景受当前固定样例保护规则约束，已有隔离事务和现有样例证据，故不阻塞本次 D01–D10 修复复验及当前受控合成环境下的 S7 模块验收；它们仍限制本报告对“全新空环境首次建档”和真实基础设施故障恢复的证明范围。

### 10.6 数据保护结果

| 对象             | 本轮最终证据                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 数据库边界       | 每次连接先通过批准库断言；未执行迁移、种子、删除、清库或新增学生                                                                                   |
| students         | 总数 16；四名 S7 样例均为约定业务字段、待分配、负责人为空；原 12 名学生 version 仍全为 1                                                           |
| 固定样例 version | id=13 为 51，id=14 为 1，id=15 为 1，id=16 为 22；测试写只合法递增，没有伪造回退                                                                   |
| 固定样例关联     | 四名样例的合同、学习记录、计划关系和任务分配计数均为 0                                                                                             |
| 全表数量         | users 1、contracts 6、student_learning_records 9、study_plan_documents 3、study_plan_students 4、tasks 4、task_assignments 14、schema_migrations 8 |
| 保护指纹         | 原 12 名 students、users、全部 S2–S6 关联表和 000–006 台账的最终数量与 SHA-256 均与本轮前置及第 5.3 节完全一致                                     |

浏览器长文本和状态复验只修改 id=16：保存最大合法字段、临时改为在读以检查首页、恢复原档案、再通过窗口 B 恢复待分配；窗口 A 旧版本请求只得到 409。真实 API 脚本只修改 id=13，并在汇总前完成恢复和全边界核对。两类写入均未触碰登记样例之外的数据；登记样例的临时联系方式已恢复，报告没有记录其原值。

### 10.7 最新验收结论

| 判断范围                             | 当前结论                       | 依据                                                                                                            |
| ------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| D01–D10 修复复验                     | **PASS**                       | D01、D08 按批准契约调整关闭；其余八项根因关闭。真实创建 201 与真实故障演练的 SKIP / 未验证已单列，没有冒充 PASS |
| S7 模块：受控开发测试 / 合成数据演示 | **PASS（带上述证明范围限制）** | 工程回归、真实 API 正常路径、三视口浏览器路径和数据恢复均通过；没有仍开放的 S7 P0–P3 缺陷                       |
| S1–S7 整体系统验收                   | **本报告不重新裁决**           | 本轮只复验 S7 D01–D10；`mvp-independent-audit.md` 的既有系统范围和未验证项仍独立有效                            |
| 小范围真实用户试用                   | **不可进入**                   | 登录、身份认证、权限隔离、操作审计和应用层部署访问控制仍缺失；明文 edit 回填仍只允许受控合成环境                |
| 公网 / 正式生产投用                  | **不可进入**                   | 上述系统级 P1 门禁及生产访问隔离、备份恢复和运行保障均未完成验收                                                |

本轮只更新本独立报告，不修改业务代码、数据库结构、迁移、种子、配置、依赖或 `.env`，不提交 Git。复验完成后停止，等待总指挥处理。
