# S1 学生基础：开发自测与交付

- 状态：已实现（开发自测通过，待总指挥/测试验收）
- 负责人：开发负责人
- 创建日期：2026-09-06
- 最后更新日期：2026-09-06
- 关联需求：学生管理、学生详情、MVP实施计划S1

## 交付范围与数据库结果

本报告保留S1交付时的历史结果。S2现已将学生科目/到期时间接入合同聚合，最新行为及回归结果见[S2报告](s2-contracts-delivery.md)，S1当时的空聚合说明不再作为当前验收口径。

仅实现S1；计划和学生PRD/模型已同步为已确认。未提前实现合同、学习记录、计划、任务、Redis或写API；未安装依赖、未修改真实.env、未提交Git。此前已存在的AGENTS.md、pnpm-lock.yaml修改及全栈规则文件均保留。

数据库连接前校验配置白名单，连接后通过DATABASE()确认批准库 `tutor_workspace` 再进行操作。迁移成功登记000/001，仅创建schema_migrations、users、students；显式装载1名合成人员和12名合成学生。无清库、切库、数据库创建删除或其他库修改。未读取/展示真实配置值，仅脚本与应用运行时加载.env供连接使用。

重复迁移已验证：校验和匹配后跳过两版；重复种子已验证：检测非空表后不写入、不覆盖。回退和失败DDL处理见[数据库说明](../../database/README.md)。

## API契约

统一 `{status:'ok'|'error', msg, data}`；成功HTTP200，校验错误400、学生不存在404、数据库故障503。所有学生接口 `Cache-Control: no-store`，不返回SQL、驱动异常或连接值。无鉴权，不用于真实数据或公网。

| 路由                      | 参数                                                                              | 输出/调用者                                                       |
| ------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| GET /api/students/list    | page默认1、pageSize默认8最大100；keyword可选≤64字符，grade/status可选且须在枚举内 | data={items,total,page,pageSize}；学生列表                        |
| GET /api/students/detail  | id：正整数十进制字符串，最大无符号BIGINT；不存在404                               | StudentDetail；学生详情基本信息                                   |
| GET /api/students/options | page默认1、pageSize默认20最大100、keyword可选≤64字符                              | 分页列表，仅id/name/grade；供后续切片接入，S1不改合同/任务选择器  |
| GET /api/health           | 无                                                                                | app、mysqlConfigured、redisConfigured；仅配置存在性，不等于连通性 |

- 页码为1–1000000000整数；非法分页、数组值、非法枚举、未知参数（包括浏览器actorId）均400；越界页为空但total准确。
- 姓名采用参数化子串LIKE，转义 `%`、`_`、`!`；年级/状态等值组合筛选；稳定id倒序。列表与count在同一REPEATABLE READ事务内，无N+1。
- 列表投影：id/name/grade/className/school/status及空聚合；选择器只含三字段；详情额外为gender/enrolledAt/createdAt、guardianName/guardianPhone/note、owner{id,name}|null。
- 未实现聚合：subjects/plans=[]，expiryDate/lastFollowUp=null；页面明确显示“后续接入”，不假装已计算。未来记录接入后最近跟进取MAX(occurred_on)。

## 验证结果

| 检查                             | 结果                                                                     |
| -------------------------------- | ------------------------------------------------------------------------ |
| pnpm typecheck                   | 通过                                                                     |
| pnpm lint                        | 通过，0警告                                                              |
| pnpm format:check                | 全仓通过；未格式化无关文件                                               |
| pnpm test                        | 3个测试文件、13项通过，不连接云库                                        |
| pnpm build                       | 通过，产出Nuxt/Nitro node-server构建                                     |
| node database/migrate.mjs        | 边界验证通过、两版应用成功；重复执行跳过                                 |
| node database/seeds/students.mjs | 显式成功；重复执行不写入                                                 |
| pnpm test:s1:api                 | 真实API通过；同时只读核对迁移记录、索引、FK/CHECK存在，不输出DDL或行数据 |
| 浏览器 /students                 | 展示12条总数，第一页8条、第二页4条，空结果/重置正常                      |
| 浏览器详情                       | 合成学生08空性别、空负责人显示“—”；关联区域为空且禁用未接入操作          |
| 浏览器404/错误                   | 不存在ID显示“未找到学生”；无效ID显示查询错误与重试，无mock回退           |

单元覆盖：错误/空目标库、迁移语句范围、配置白名单、事务commit/rollback、连接释放、查询参数和分页边界、SQL通配符转义、投影白名单、不存在ID、安全错误envelope、异步loading/empty/error/retry、筛选重置页码和旧响应取消、详情路由切换。

接口测试只读，不清库、不生成额外测试数据；验证第一页/第二页无交集、越界、组合筛选、注入式输入、未知参数/重复参数、选择器和详情安全字段。S1无业务写接口，真实故障注入/并发写冲突测试未执行；事务失败分支目前用单元测试覆盖，后续写切片须增加真实连接事务与并发测试。

浏览器已使用真实本机服务器查看页面及截图，核对结构和反馈；加载态与过期请求竞态用可控Promise单元测试验证，不人为延迟云数据库。当前开发验证服务器为 `http://127.0.0.1:3001/students`，因为3000端口已被原有服务占用，未停止该服务。

## 复验命令

```powershell
pnpm db:migrate
pnpm db:seed
pnpm dev --host 127.0.0.1 --port 3001
# 另开终端
$env:S1_API_BASE_URL = 'http://127.0.0.1:3001'
pnpm test:s1:api
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

## 变更文件清单

| 文件                                                                                 | 用途                                                      |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| docs/design/mvp-backend-implementation-plan.md                                       | 已确认/S1授权、数据库白名单、切片边界与交付引用           |
| docs/prd/student-management.md、student-detail.md；docs/design/student-data-model.md | 同步学生只读、可空规则、字段投影及后续区域边界            |
| README.md、database/README.md、本报告                                                | 启动、环境配置、迁移/装载、回退与验证                     |
| database/connection.mjs                                                              | 仅运行时加载环境、受限连接、安全命令输出                  |
| database/migrate.mjs                                                                 | 固定顺序迁移、版本/校验和、执行锁、失败停止               |
| database/migrations/000_schema_migrations.sql、001_students.sql                      | 迁移台账和S1两张领域表                                    |
| database/seeds/students.mjs                                                          | 显式合成装载、事务与非空保护                              |
| server/db/config.ts、safety.ts、pool.ts                                              | MySQL配置、白名单/当前连接校验、迁移范围检查、连接池/事务 |
| server/db/student-query.ts、students.ts                                              | 学生输入校验、过滤条件、参数查询与安全投影                |
| server/api/students/list.get.ts、detail.get.ts、options.get.ts                       | 学生三项只读API                                           |
| server/utils/api.ts、server/api/health.get.ts                                        | 统一响应/错误脱敏；健康响应结构同步                       |
| server/plugins/database.ts                                                           | Nitro关闭时结束MySQL池                                    |
| types/api/students.ts                                                                | 共享DTO、分页、枚举和响应类型                             |
| app/services/http.ts、students.ts；app/composables/useStudents.ts                    | 统一请求、学生service、异步页面状态                       |
| app/pages/students/index.vue、[id].vue                                               | 列表/基本信息真实接入、服务端分页与三态                   |
| app/components/BaseDataTable.vue、BasicInfoPanel.vue、DeferredStudentSection.vue     | 受控分页、可空基本信息、复用后续区域占位                  |
| app/layouts/default.vue                                                              | 固定老师名改成“开发测试·无登录”，不伪装真实身份           |
| app/types/components.d.ts                                                            | 自动组件类型随实际使用更新                                |
| .env.example、nuxt.config.ts                                                         | 私有MySQL TLS开关，不写真实配置                           |
| package.json、vitest.config.ts                                                       | 显式命令及前端测试路径别名，无新增依赖                    |
| tests/unit/students.test.ts、database-pool.test.ts、student-state.test.ts            | 边界、查询、事务、投影与异步状态测试                      |
| tests/integration/students.mjs                                                       | 显式真实API和批准库结构只读检查                           |

删除失效文件：server/utils/mysql.ts（已迁往server/db）；app/mocks/services/student-detail.ts、app/mocks/data/student-detail.json、app/types/student-detail.ts（详情已切换真实源）；tests/unit/health.test.ts（true占位断言已由真实逻辑测试替代）。删除未涉及任何数据库数据；旧文件可从Git历史恢复，当前改动未提交。

补充同步 `docs/design/development-foundation.md`：移除已失效的MySQL旧目录和“尚无迁移”约定，指向S1实现与数据库说明。

## 限制与交接

- 无登录/权限隔离，不得公网部署；仅批准库、仅合成数据。云连接TLS由用户按服务要求配置，本次没有修改真实环境或证书设置。
- DDL不能整体事务回滚，不提供自动破坏性down；应用回退保留数据，结构修复须另行审批。
- 构建有依赖链的DEP0155弃用和插件耗时提示，未阻断构建；未为此升级依赖或扩大改动。
- 非学生模块保留已有“原型数据”标记。旧学生原型service/type仍被这些模块依赖，开发负责人在对应切片授权并验收后清理。
- 依赖未改变：Nuxt4.5.2、Vue3.5.42、Ant Design Vue4.2.6、mysql2 3.24.3、ioredis6.0.0、TypeScript6.0.3、Vitest4.1.11。
- S1无新增业务决策阻塞。请总指挥审阅并安排验收；未开始S2，后续切片仍需授权。
