# S6 任务分配与首页联动交付报告

- 状态：已实现，自测通过，待总指挥验收
- 负责人：开发负责人
- 创建日期：2026-09-06
- 最后更新日期：2026-09-06
- 关联需求：任务PRD、首页PRD、任务数据模型、MVP实施计划S6

## 交付范围

仅新增task_assignments，接入任务分配页、学生详情任务、首页任务摘要与任务定义分配人数。严格按总指挥最新裁决：不存任务快照，显示/搜索/科目筛选JOIN当前tasks；定义编辑不修改分配记录。无登录、权限、提醒、风险、系列、派发、删除、审计或合同扩展，无新增依赖，无Git提交。

批量1–100名不同学生、仅启用定义、截止日不早于服务端Asia/Shanghai当天；事务锁定定义、确认学生和待完成冲突、批量插入。任何失败整批回滚，唯一冲突409，不自动重试。完成接口是目标布尔值+expectedVersion；同版本同目标无副作用，旧版本409，恢复撞唯一约束409并保留完成记录。

首页只列在读学生，顶部全部在读数不受年级筛选影响；先分页再批量聚合合同、计划、任务，无逐卡N+1。摘要每组最多3条，COUNT窗口函数返回真实总数/剩余数。人数COUNT(DISTINCT student_id)，不是记录数。三个任务区共享完成逻辑，禁用对应提交项、失败保持确认状态、刷新读取，不回退mock。

## 文件清单与用途

以下路径相对项目根目录。

| 文件                                                                                                              | 用途                                                                    |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| database/migrations/006_task_assignments.sql                                                                      | 唯一新增领域表，RESTRICT外键、两态与时间CHECK、生成列唯一约束及分页索引 |
| database/migrate.mjs                                                                                              | 在已有白名单显式登记006；未修改000–005迁移                              |
| database/seeds/assignment-fixtures.mjs                                                                            | 固定合成集合识别、9条历史样例、14条上限、S1–S5指纹                      |
| database/seeds/task-assignments.mjs                                                                               | 显式事务装载、重复验证跳过、执行锁                                      |
| server/db/assignment-rules.ts                                                                                     | 字段白名单、ID/分页/日期/状态/批量输入校验                              |
| server/db/task-assignments.ts                                                                                     | 参数化查询、批量事务内写入、乐观锁完成、当前定义JOIN、人数和摘要聚合    |
| server/db/home.ts                                                                                                 | 在读学生分页及合同/计划/任务批量组装                                    |
| server/db/tasks.ts                                                                                                | 替换固定0为真实分配人数统计                                             |
| server/api/task-assignments/list.get.ts                                                                           | 筛选分页统一envelope                                                    |
| server/api/task-assignments/create-batch.post.ts                                                                  | 操作人校验、整批事务、201响应                                           |
| server/api/task-assignments/completion.patch.ts                                                                   | 操作人校验、目标完成状态事务                                            |
| server/api/home/list.get.ts                                                                                       | 同一读取事务中的首页分页聚合                                            |
| types/api/task-assignments.ts、types/api/home.ts、types/api/tasks.ts                                              | 十进制字符串ID、跨端DTO、数字人数                                       |
| app/services/task-assignments.ts                                                                                  | HTTP集中入口，复用任务/学生远程选项                                     |
| app/composables/useAssignments.ts                                                                                 | 列表状态、筛选、分页、旧响应取消                                        |
| app/composables/useAssignmentCompletion.ts                                                                        | 三处共享完成写入、按ID禁用、成功/冲突反馈                               |
| app/composables/useAssignmentCreate.ts                                                                            | 新建弹窗编排、提交禁用、失败保留选择                                    |
| app/composables/useHome.ts                                                                                        | 首页异步分页、年级筛选、摘要刷新                                        |
| app/composables/useTaskInvalidation.ts、app/composables/useTasks.ts                                               | 定义/分配变更事件及聚焦重读，无缓存或状态库                             |
| app/components/AssignmentCheckbox.vue                                                                             | 受控完成复选框                                                          |
| app/components/AssignmentCreate.vue                                                                               | 定义+多学生+日期的新建流程                                              |
| app/components/AssignmentsSection.vue                                                                             | 分配页和学生详情共享表格/筛选/分页                                      |
| app/components/RemoteMultiSelect.vue                                                                              | 真实远程学生多选、搜索与加载更多、保留已选标签                          |
| app/components/HomeTaskGroup.vue                                                                                  | 三条摘要、准确余量和状态入口                                            |
| app/pages/tasks/assignments.vue、app/pages/students/[id].vue、app/pages/index.vue、app/pages/tasks/index.vue      | 仅数据接入与阶段说明，保留页面结构                                      |
| tests/unit/assignments.test.ts、tests/unit/assignment-state.test.ts                                               | S6规则、数据库编排、异步UI状态测试                                      |
| tests/unit/task-state.test.ts                                                                                     | 适配新增失效通知边界的mock，不修改原有业务断言                          |
| tests/integration/task-assignments.mjs                                                                            | 真实API、约束/回滚、并发、聚合、固定样例和保护指纹                      |
| package.json                                                                                                      | 显式db:seed:assignments、test:s6:api命令                                |
| README.md、database/README.md                                                                                     | 执行步骤、边界、回退及旧阶段测试限制                                    |
| docs/design/mvp-backend-implementation-plan.md、docs/design/task-data-model.md、docs/design/student-data-model.md | 同步S6状态和聚合模型                                                    |
| docs/prd/tasks.md、docs/prd/home-dashboard.md、docs/prd/student-detail.md                                         | 同步已确认交互、当前定义展示和验收口径                                  |
| docs/test/s6-task-assignments-home-delivery.md                                                                    | 本报告                                                                  |

删除不再有消费者的旧文件：app/components/DeferredStudentSection.vue；app/mocks/data/{home,students,tasks}.json；app/mocks/services/{home,students,tasks}.ts；app/types/{home,students,tasks}.ts。仅删除仓库旧实现，可从既有Git历史恢复；没有删除任何数据库记录。

补充适配文件：tests/integration/tasks.mjs，仅把旧S5的无分配表/人数固定0断言改为S6真实去重人数；该脚本会写S5任务，本次未执行。

## 运行、迁移与种子

沿用既有Node/pnpm与锁文件依赖。凭据只由用户在本机.env配置；本次不查看、展示或修改文件内容。浏览器不能指定或伪造操作人。

```powershell
pnpm db:migrate
pnpm db:seed:assignments
pnpm dev --host 127.0.0.1 --port 3001
# 在另一终端，指向实际本机开发端口
$env:S6_API_BASE_URL = 'http://127.0.0.1:3001'
pnpm test:s6:api
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

没有自动迁移/种子钩子。既有开发服务已在本机3001，本次复用，不停止用户服务。006实际执行成功；再次执行全部版本安全跳过。种子首次新增9条，再次新增0条。遇未知或超量数据即停止，不覆盖、不删除。受控脚本应独占执行，避免同时人工编辑固定验收分配。

## 数据边界与证据

所有连接经DATABASE()边界校验；事务开始、DML和提交前复核。只允许批准库；不输出实际配置或实际连接数据库名。S6仅创建task_assignments及追加006台账，没有修改旧迁移校验和。实际表集合只有9张已批准表。

| 保护对象                 | 实施前后数量 | 校验                          |
| ------------------------ | ------------ | ----------------------------- |
| users                    | 1 → 1        | 全部投影行SHA-256一致         |
| students                 | 12 → 12      | 一致                          |
| contracts                | 6 → 6        | 一致                          |
| student_learning_records | 9 → 9        | 一致                          |
| study_plan_documents     | 3 → 3        | 一致                          |
| study_plan_students      | 4 → 4        | 一致                          |
| tasks                    | 4 → 4        | 一致，包括文本、版本和时间    |
| schema_migrations        | 6 → 7        | 仅追加006；旧版本重复校验通过 |

分配为9条标准种子+4条固定API验收+1条固定浏览器验收=14条。重复真实API测试仍14条，不累计随机调试记录。约束/失败事务插入全部未提交即回滚，允许自增ID出现空洞；没有清理已有记录。合成种子含历史截止日以验证逾期/完成历史，不代表新建接口允许过去日期。

## 自测结果

- 类型检查、Lint、格式检查、构建均通过；全量单元测试14文件、68项通过。
- 真实MySQL API：1人和2人成功；0/101人、重复ID、非法日期/分页/状态/未知操作人字段拒绝；昨天拒绝、今天与未来成功；停用定义409、不存在任务/学生404。
- 首次两个并发相同批量请求结果201/409；已有待完成+另一合法学生整批409，数量无变化。重复脚本复用固定行。SQL注入式关键词无越权结果，页外空结果、组合条件、完成记录不算逾期均验证。
- 完成/恢复、清空完成时间、同版本同目标保持时间和版本、旧版本409；并发完成同一旧版本200/409。恢复已完成历史撞唯一约束409，记录保持原样。
- 数据库外键（任务/学生/操作人）、状态CHECK、完成时间一致性、版本CHECK、待完成唯一约束均拒绝非法值；主动事务失败后数量无残留，完成历史不阻止唯一合法待完成行。
- 首页准确在读数4，按年级过滤仍保持顶部4；每卡任务分组与studentId列表一致；学生01有3条待完成、5条完成，摘要各最多3条，剩余完成2。当前任务文本JOIN及COUNT(DISTINCT student_id)与数据库/定义接口一致，安全DTO无内部操作人与联系方式。
- 浏览器实际验证：分配弹窗真实启用选项、多学生选择器、日期选择、创建1条固定样例；保存期间整个表单/提交按钮禁用。分配页完成→学生详情完成→首页1/1；首页恢复→0/1→详情待完成。详情完成后返回分配页可读取；冲突恢复提示明确且保留已完成选中态。
- 首页1280px截图检查：响应式卡片、5天合同到期、同名不同ID的两个计划标签、+2条完成剩余提示，均来自真实数据。年级高二筛到1卡、顶部仍4，无mock来源提示。

## 已知限制与回退

最终只读复验补充：000–005的6条迁移台账（含checksum、applied_at）与迁移前SHA-256一致；浏览器任务定义页显示4条定义的分配人数分别为2、3、0、4，与真实去重聚合一致。分配页不存在姓名搜索返回0条；固定浏览器样例最终恢复为待完成，未删除记录。

1. 受控库只有12名学生，本次禁止修改S1–S5，因此未创建100名学生做真实成功批量；100人成功编排/单条批量SQL由单元覆盖，真实API100个ID含不存在学生验证整批404且零残留。未声称完成100人真实成功压测。
2. S1–S5真实写入测试不在本次授权内，不执行。旧S5测试已适配分配表存在和真实人数断言，但因会修改既有任务，本次只做静态检查，不执行该写入脚本；S6真实测试已独立覆盖新的定义人数统计。全量单元测试已运行。
3. 未为验证“定义编辑影响历史展示”修改现有S5任务；以当前定义JOIN查询、无快照结构和只读DTO一致性验证该口径。任务文本按当前定义显示是已确认行为，不提供历史文本版本。
4. 这是无鉴权受控开发工作台，不能公网部署或导入真实学生数据。无实时推送；写成功触发本页刷新，同应用事件/重新导航/窗口聚焦重读。传输失败不自动重试写入，应先刷新核对。
5. 任务历史仅两态，没有删除。任何清理必须再获总指挥授权。跨天后固定历史种子的时效标签自然变化，不自动改种子日期。

回退只撤回S6应用接入、关闭S6写入口并保留task_assignments、006台账及全部数据；不执行或提供自动删表/清库命令。不把退回的旧mock页面当作真实数据。DDL部分失败停止，由总指挥另行审批修复。应用撤回不能撤销已提交的合法分配，后续数据处置必须单独授权。

自查：符合全栈开发规则与垂直切片流程，未提前扩展领域；凭据未输出，.env未修改，未删除持久数据，未创建Git commit。实施到此停止，等待总指挥验收。
