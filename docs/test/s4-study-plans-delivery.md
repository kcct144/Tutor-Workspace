# S4 学习计划交付与自测报告

- 状态：已实现（开发自测通过，待总指挥/测试验收）
- 负责人：开发负责人
- 创建日期：2026-09-06
- 最后更新日期：2026-09-06
- 关联需求：S4学习计划、学生只读多对多关联

## 范围与安全边界

完成文档分页/搜索/详情/仅正文编辑及学生真实计划标签。没有新建/删除计划、标题/摘要编辑、关系管理、历史版本、协作、任务、Redis、登录、权限或审计系统。版本号只用于乐观锁，不是版本历史。

仅使用总指挥批准的tutor_workspace；连接和每次DDL/DML/提交前校验DATABASE()。未查看/输出.env内容、未修改.env、未索取凭据、未安装依赖、未创建Git提交。运行时由既有加载机制读取私有配置；DEV_ACTOR_ID须有效，只验证存在，不作为登录认证。不得公网部署或导入真实人员/学生数据。

## 交付内容与文件清单

| 文件                                                                                            | 用途                                                                 |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| database/migrations/004_study_plans.sql                                                         | 仅文档、关联两表；FK、CHECK、版本、分页/反向关系索引                 |
| database/migrate.mjs                                                                            | 固定迁移清单加入004；保留旧迁移原字节与校验和                        |
| database/seeds/study-plan-fixtures.mjs、study-plans.mjs                                         | 有限固定3份文档/4条关系，合成身份核对、执行锁、事务、重复跳过        |
| types/api/study-plans.ts                                                                        | 列表/详情/标签/更新输入共享DTO                                       |
| server/db/study-plan-rules.ts、study-plans.ts                                                   | 参数白名单、Unicode正文校验、分页搜索、投影、乐观锁、批量关联        |
| server/api/study-plans/list.get.ts、detail.get.ts、update.patch.ts                              | 三个统一响应API，安全错误和受控写入                                  |
| server/middleware/dev-actor.ts、server/db/students.ts                                           | 复用服务端操作人校验；学生列表/详情批量真实计划标签                  |
| app/services/study-plans.ts、app/composables/useStudyPlans.ts                                   | 集中HTTP、请求取消/过期响应隔离、分页搜索、编辑草稿与冲突处理        |
| app/utils/markdown.ts、app/components/PlanMarkdown.vue                                          | 原型Markdown规则提取为纯函数，先转义再生成固定标签；唯一受控HTML入口 |
| app/components/PlanTags.vue、BasicInfoPanel.vue                                                 | 真实{id,title}标签，按ID跳转，不按同名合并                           |
| app/pages/plans/index.vue                                                                       | 保留左右布局，真实API阅读/搜索/分页/编辑/取消/保存                   |
| app/pages/students/index.vue、[id].vue                                                          | 真实计划标签与阶段提示，不改变S2/S3规则                              |
| app/pages/index.vue、app/mocks/services/home.ts、app/types/home.ts                              | 首页尚未真实接入，移除计划名称mock兜底并明确后续接入                 |
| app/types/components.d.ts                                                                       | 组件自动导入声明同步                                                 |
| tests/unit/study-plans.test.ts、study-plan-state.test.ts                                        | 校验、安全渲染、查询投影与异步草稿/竞态回归                          |
| tests/unit/students.test.ts                                                                     | 学生测试隔离新增批量关联依赖                                         |
| tests/integration/study-plans.mjs                                                               | 显式真实库/API验证，复用固定文档，无持久调试新增或删除               |
| package.json                                                                                    | 仅增加db:seed:plans和test:s4:api命令，依赖版本不变                   |
| README.md、database/README.md                                                                   | 操作命令、权限、固定数据和回退说明                                   |
| docs/design/mvp-backend-implementation-plan.md、study-plan-data-model.md、student-data-model.md | 实现状态、数据模型、学生真实聚合与S5/S6边界                          |
| docs/prd/study-plans.md、student-detail.md、student-management.md                               | S4接口和页面验收契约                                                 |
| docs/test/s4-study-plans-delivery.md                                                            | 本报告                                                               |

移除过期文件app/mocks/data/plans.json、app/mocks/services/plans.ts、app/types/plans.ts；仅删除旧mock入口，可从既有Git历史恢复。未删除数据库记录。

## 关键实现

- GET /api/study-plans/list：page/pageSize（默认20，最大100）、keyword（最多64），参数化搜索标题/摘要/正文，转义LIKE通配符；返回items/total/page/pageSize，不返回全文。
- GET /api/study-plans/detail：id，显式投影正文及负责人{id,name}；不存在404。
- PATCH /api/study-plans/update：仅id/content/expectedVersion。正文按Unicode码点计数，trim后1–100000；原始字符串原样保存，JSON技术上限2MiB。未知/伪造字段400，过大413，版本冲突409，数据库/操作人不可用503；不自动重试写入。
- DB CHECK提供非空原文/2MiB基础保护。SQL TRIM与JavaScript trim空白语义不同，因此服务端负责精确业务长度，不用SQL TRIM错误拒绝可接受原文。
- 单条条件UPDATE匹配id/version并递增，事务失败回滚，不修改负责人/标题/摘要。外键RESTRICT，不提供删除路径。
- 学生关联一页仅一次批量查询；GROUP BY学生后LIMIT本页人数，JSON聚合保留该学生全部真实标签，避免N+1与静默截断。关系复合PK去重，同名不同ID保持独立。
- 搜索/翻页保留右侧当前文档；详情按需加载，旧响应不得覆盖新文档。切换未保存文档/离开路由有确认，取消编辑恢复原文；保存中禁止重复提交，失败/409保留草稿，重载最新需确认。修复并测试了“冲突重载尚未完成即切换到新文档”不能覆盖新草稿的竞态。
- 预览先转义全部用户文本，仅生成固定Markdown标签，无用户HTML/图片/链接URL执行入口。延续原型的基础Markdown子集，不引入完整CommonMark、富文本编辑器或协作能力。

## 执行与复验

```powershell
pnpm db:migrate
pnpm db:seed:plans
pnpm dev --host 127.0.0.1 --port 3001
# 另一个终端：仅指定本机服务地址，不打印任何环境配置
$env:S4_API_BASE_URL = 'http://127.0.0.1:3001'
pnpm test:s4:api
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

迁移已显式应用004；再次执行全部跳过。种子首次写3份计划、4条关系，再次完整核对后写入0。种子不覆盖已编辑正文；遇部分/不匹配数据停止，不补齐、不清库。运行/构建/安装不会自动执行迁移或种子。

| 验证            | 结果                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| 类型检查、Lint  | 通过                                                                                                               |
| 格式检查        | 通过；仅格式化本次新增交付报告                                                                                     |
| 单元测试        | 10个文件、43项全部通过；包含12项S4规则/渲染/异步状态测试                                                           |
| 真实S4 API      | 连续3次完整通过，第三次在浏览器编辑后复验；无其他领域写入                                                          |
| 数据库约束/事务 | 人员/学生/计划FK、重复关系、标题/正文/版本CHECK、事务失败回滚通过；未提交插入不产生持久数据                        |
| 分页/搜索/输入  | 页间无重复、超尾页空、标题/摘要/正文搜索、特殊通配输入、未知字段、详情404、空正文/超长/10万emoji及原文空白通过     |
| 并发/投影       | 同版本并发仅一成功另一409；元数据不可修改；列表不含全文；12位学生列表/详情关系与数据库逐一一致                     |
| 浏览器          | 左右布局、搜索命中/空结果、编辑/保存/取消、切换确认且保留草稿、固定安全预览、学生列表/详情同名不同ID标签及跳转通过 |
| 构建            | 成功生成.output；已有工具链PLUGIN_TIMINGS与DEP0155提示，不阻断构建                                                 |

首次真实API尝试时本机3001服务未运行，测试停在连接阶段，约束插入已回滚；启动本机开发服务后完成上述3次通过。未以失败结果冒充通过，未为恢复执行任何删除。

浏览器使用第三份固定演示文档，安全负载中的script/img事件/危险链接仅显示为文字；实际预览DOM中script、img、a、iframe及事件属性数量为0。最终正文恢复为固定“独立阅读”样例并保留固定保存校验句，无随机调试计划。第二份同名计划通过真实ID独立定位。

浏览器实际覆盖单页3条/搜索空结果；多页边界由真实API以pageSize=1验证。网络失败草稿、409重载、快速切换旧响应隔离由composable单元测试和真实并发API覆盖，不宣称全部场景都通过人工浏览器复现。

最终只读计数：users=1、students=12、contracts=6、student_learning_records=9、study_plan_documents=3、study_plan_students=4、schema_migrations=5。原有S1–S3数据未写入，台账仅新增004；真实测试会递增固定文档version/updated_at，自增ID可能有回滚空洞，均非业务数据丢失。

## 回退、限制与后续

回退先停止计划正文写入口，回退S4应用/service及学生计划聚合，保留004两表、关系、台账和固定数据。没有自动down、删表或清理命令；MySQL DDL隐式提交，部分失败必须停止并由总指挥另批结构修复，不能伪造校验和/登记或自动删除。

既有Nuxt4.5.2、Vue3.5.42、Ant Design Vue4.2.6、mysql2 3.24.3、TypeScript6.0.3、Vitest4.1.11保持不变。没有新增依赖、迁移框架或Redis调用。

没有新的业务裁决阻塞项。等待总指挥/测试正式验收；S5任务定义、S6任务分配与首页真实聚合仍需单独授权。首页学生/任务仍明确为原型，学习计划区标记后续接入，不用mock计划冒充真实关系。当前无登录/权限，仅受控开发测试使用。
