# S5 任务定义交付与自测报告

- 状态：已实现（开发自测完成，待总指挥验收）
- 负责人：开发负责人
- 创建日期：2026-09-06
- 最后更新日期：2026-09-06
- 关联需求：S5任务定义

## 交付范围

仅/tasks从mock切换为真实MySQL，新增tasks及7个API；保留表格、筛选、弹窗及启停入口。分配人数由API固定0。没有创建task_assignments，没有修改/tasks/assignments、首页任务卡片或学生详情任务区的业务逻辑，没有鉴权、删除、系列、自动派发或审计扩展。

开工完整阅读AGENTS、全栈规则、实施计划、任务PRD与模型；工作区起始干净。旧草案的草稿状态、可空字段已按本轮明确裁决更新。任务mock/service/type仍被S6分配原型共同依赖，不是/tasks专用文件；保留并标注开发负责人/S6验收移除的TODO，真实/tasks不再导入它们。

## 文件清单

| 文件                                                                                                                           | 用途                                                              |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| database/migrations/005_tasks.sql                                                                                              | 单表版本迁移，人员FK RESTRICT、两态/非空/长度/版本CHECK及查询索引 |
| database/migrate.mjs                                                                                                           | 显式manifest追加005，旧SQL未修改                                  |
| database/seeds/tasks.mjs、task-fixtures.mjs                                                                                    | 2条固定种子、合成身份/固定验收集合核对、执行锁和只读S1–S4指纹     |
| server/db/task-rules.ts、tasks.ts                                                                                              | 输入白名单、Unicode长度、分页筛选、显式投影、固定人数、乐观锁读写 |
| server/api/tasks/list.get.ts、detail.get.ts、create.post.ts、update.patch.ts、status.patch.ts、options.get.ts、subjects.get.ts | 七个任务定义接口，统一响应和安全错误                              |
| types/api/tasks.ts                                                                                                             | 请求/响应/状态与选项DTO，十进制字符串ID                           |
| app/services/tasks.ts、app/composables/useTasks.ts                                                                             | 集中HTTP、请求取消、独立选项、草稿/冲突/提交状态                  |
| app/pages/tasks/index.vue                                                                                                      | 原有结构真实接入，异步反馈、服务端分页、详情回填和启停            |
| app/mocks/services/tasks.ts                                                                                                    | 仅增加S6原型保留边界TODO，原型逻辑不变                            |
| app/types/components.d.ts                                                                                                      | 自动导入声明同步                                                  |
| tests/unit/tasks.test.ts、task-state.test.ts                                                                                   | 规则、投影、迁移范围、操作人、并发UI状态回归                      |
| tests/integration/tasks.mjs                                                                                                    | 显式真实API/数据库约束/事务/固定数据与S1–S4一致性验证             |
| package.json                                                                                                                   | 新增db:seed:tasks、test:s5:api；依赖不变                          |
| README.md、database/README.md                                                                                                  | 命令、权限、数据边界、回退说明                                    |
| docs/prd/tasks.md、docs/design/task-data-model.md、docs/design/mvp-backend-implementation-plan.md                              | 已确认契约及S5实现状态、S6停止点                                  |
| docs/test/s5-task-definitions-delivery.md                                                                                      | 本报告                                                            |

## 命令与环境

```powershell
pnpm db:migrate
pnpm db:seed:tasks
pnpm dev --host 127.0.0.1 --port 3001
# 另一个终端；端口按实际本机服务设置
$env:S5_API_BASE_URL = 'http://127.0.0.1:3001'
pnpm test:s5:api
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

每个迁移/种子/真实测试开始时校验DATABASE()；每次DML/DDL/事务提交前继续校验，仅允许tutor_workspace。凭据只经既有运行时加载，未查看/输出.env内容、未修改.env、未安装依赖、未提交Git。浏览器owner/actor字段拒绝，不信任伪造请求头。不得公网部署和真实人员数据。

复用既有mysql2和Nuxt；Nuxt4.5.2、Vue3.5.42、Ant Design Vue4.2.6、mysql2 3.24.3、TypeScript6.0.3、Vitest4.1.11未变。安装、启动、构建不自动迁移或种子。

## 实际验证证据

| 验证           | 结果                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| 005迁移        | 显式成功，仅tasks；再次运行全部跳过，旧版本校验和一致                                                        |
| 固定种子       | 首次2条，再次0条，不覆盖                                                                                     |
| 规则/API       | 必填、空白、长度上下界（含emoji）、未知字段、ID/状态/版本/分页非法、413、404均覆盖                           |
| 状态/乐观锁    | 启停双向、停用详情读取、旧版本409、同版本并发仅一200另一409                                                  |
| 查询           | 标题/科目/说明搜索、组合筛选、SQL注入式关键词、越界空页、pageSize=1跨页、subjects独立去重分页、options仅启用 |
| 数据库         | FK、空字段、超长说明、非法状态、version CHECK；独立观察连接确认未提交插入不可见，失败事务回滚无持久新增      |
| 敏感投影       | DTO键白名单，无内部人员字段；列表assignmentCount恒0，options仅id/title/subject                               |
| 真实API重复    | 两次完整通过，首次3条固定任务，浏览器新增后4条，重复复用无累积                                               |
| 单元测试       | 12文件54项通过，S5新增11项，覆盖草稿、详情竞态、提交禁用、失败/409与列表刷新                                 |
| 类型/Lint/格式 | 最终检查见本报告后续复验记录                                                                                 |
| 构建           | 成功生成.output；工具链PLUGIN_TIMINGS、DEP0155提示不阻断                                                     |

真实测试曾因SHOW TABLES不支持该预处理占位用法停止，改为只读元数据检查；随后修正选项投影断言预期键排序。均为测试脚本问题，不放宽API或数据库约束；保留固定数据复用，不执行删除。类型检查修正了表格插槽到领域类型的衔接，改用稳定ID在composable查找；未使用any。Lint发现测试启动轮询的空catch，已补充明确说明。

浏览器在127.0.0.1:3001/tasks验证：创建固定任务默认启用、详情API回填、独立窗口停用、旧版本保存409且草稿保留（已检查截图）、停用任务可编辑、保存固定说明、恢复启用、刷新仍正确，分配人数全部0。完整页和弹窗结构延续原型。

浏览器重载冲突草稿时已观察到“将替换当前草稿”确认提示，但该测试窗口的确认框句柄不可用、控制超时，未将确认后的重载操作宣称通过。新建独立窗口后继续完成编辑与持久化验证；确认接受/拒绝及重载草稿逻辑由单元测试通过，建议正式验收人工补验此一步。没有绕过确认、修改页面运行时或删除数据。快速旧详情响应隔离、错误/空结果状态及重复提交以composable测试覆盖；多页边界以真实API验证，不为分页增加演示行。

## 数据边界

最终质量复验：pnpm typecheck、pnpm lint、pnpm format:check均退出0；pnpm test为12文件54项通过；pnpm build成功。git diff --check通过。浏览器搜索无匹配结果与重置也已验证。

实际最终任务4条：2条种子、1条固定API、1条固定浏览器。API样例最终恢复固定说明/启用；浏览器样例固定编辑说明/启用。没有随机调试任务、没有删除，事务回滚可能导致自增空洞，正常且非数据丢失。

S1–S4六张业务表在迁移前保存只读分页行摘要，最终逐表指纹一致：users1、students12、contracts6、student_learning_records9、study_plan_documents3、study_plan_students4。不输出业务原始行；迁移台账由5变6，仅新增005，真实API测试前后台账指纹一致。核对task_assignments不存在。Git改动范围不含S6页面、已有迁移或.env。

种子/真实API共享执行锁，只维护约定固定样例；运行测试时不要人工并行编辑API样例。不匹配、部分或超量数据停止，不覆盖业务数据。若测试中断在极端字段验收阶段，保留现场并报告，不能为重跑删除或静默修复未知数据。

## 回退与停止

回退先停止任务定义写入口，回退S5页面/service/API，保留tasks、005台账和合成数据；不提供down，不删表/列/记录。MySQL DDL隐式提交，建表成功而登记失败时停止，由总指挥另批结构修复，不修改已应用SQL或伪造校验和。

没有新增业务裁决问题。正式验收前补验浏览器确认框操作；S6真实分配统计/首页等仍按实施计划待单独授权。当前完成后停止，不提交Git、不进入S6。
