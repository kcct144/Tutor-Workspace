# S2 合同：实施交付与开发自测报告

- 状态：已实现（开发自测通过，待总指挥/测试验收）
- 负责人：开发负责人
- 创建日期：2026-09-06
- 最后更新日期：2026-09-06
- 关联需求：S2合同、学生列表与详情合同聚合

## 结论与边界

实现四种合同的列表、筛选、分页、详情、新增、编辑、科目选项及学生有效科目/最早有效到期日聚合。服务端生成UUID编号；版本号防覆盖；操作人只读服务端DEV_ACTOR_ID，缺失/无效拒绝写入。学生页面不再使用合同mock兜底；学习记录、计划、任务仍后续接入。

只在批准的tutor_workspace操作。连接白名单、每次DML/DDL前DATABASE()校验、提交前再次校验；不匹配停止。没有创建/删除数据库、切库、清库或操作其他库。没有查看/输出.env内容、修改.env或提交Git；脚本只在运行时加载环境供连接使用。未新增依赖，未实施Redis、登录、权限、自动业务流程。

## 迁移与数据结果

- 002_contracts.sql只创建contracts；合同编号唯一，学生/创建人/最后修改人FK采用RESTRICT，类型与日期/课时互斥CHECK，version正数，学生日期/科目类型索引。无软删除、删除接口或历史审计表。
- 使用显式迁移清单000→001→002，不在安装、开发启动或构建中迁移。已应用版本校验和不符即停，未登记同名表不覆盖。
- 开工发现S1两份迁移文件丢失空行，SHA-256与台账不符；执行在任何S2 DDL前停止。只读比较证明恢复原空行与LF后的字节精确匹配原登记值。仅恢复该格式，未改SQL语义、S1结构或台账；新增.gitattributes固定迁移LF。再次校验后S1跳过、002成功。随后重复迁移全部跳过。
- 显式合同种子新增6条，覆盖月卡/半年卡/年卡/课时、未来/到期/耗尽/科目去重/最早到期；重复执行新增0条。只选标识匹配的S1合成学生01/02，已有任何合同的目标学生跳过，不覆盖、不读mock。
- 首次交付时核对共有35条合成合同：种子6条、接口测试28条、浏览器验收1条。接口测试有两次调试中断留下14条，其余两次成功测试的14条在结束时改为失效并保留；浏览器验收合同已改为课时耗尽。当时未删除数据。后经总指挥定向授权，已清理全部29条测试合同，当前保留6条标准种子合同，详见下方清理记录。
- 数据库约束/失败回滚测试的未提交插入已rollback，无持久残留；自增ID空洞正常。禁止把测试数据清理扩大为清库。

## API与规则落地

API详情以[合同PRD](../prd/contracts.md)为准：

| 接口                        | 功能                                                        |
| --------------------------- | ----------------------------------------------------------- |
| GET /api/contracts/list     | 编号/学生名/科目关键词及学生/科目/类型/状态筛选；服务端分页 |
| GET /api/contracts/detail   | 编辑前重新加载详情、编号和版本                              |
| POST /api/contracts/create  | 服务端randomUUID；返回201及安全投影                         |
| PATCH /api/contracts/update | expectedVersion条件更新，递增版本；不匹配409                |
| GET /api/contracts/subjects | 全部合同科目去重、远程搜索和分页，不以当前页当完整字典      |

成功/错误均{status,msg,data}；学生/合同响应no-store。请求白名单拒绝编号和操作人字段；写请求拒绝query、非JSON、非法JSON及超过16KiB正文。页面只经service/composable访问API。

时间合同start≤Asia/Shanghai今天≤end为有效；课时已上<总数为有效。共享一份SQL状态表达式用于状态投影、状态筛选、学生聚合；前端不计算权威状态。学生当前页ID批量聚合，科目去重、MIN有效时间合同到期日；无有效合同[]/null，课时不贡献到期。无学生冗余字段、N+1或Redis缓存。

编号唯一由数据库兜底、不可修改由API写入白名单保证；原生randomUUID生成发生唯一冲突时最多三次，仅该错误重试，不重试其他失败。编辑SQL不包含编号。数据库维护者直接操作表不属于业务API安全边界，账号应由用户限制在批准库内。

合同保存成功刷新列表、通知已挂载学生查询失效；跨页学生列表/详情重新加载，页面重新聚焦也刷新。保存失败保留草稿，409须主动重载；网络结果不明先核对列表，不自动重试POST。远程选项提供搜索、加载更多、loading/empty/error与重试。表格新增编号后提供横向滚动，避免列重叠。

## 验证结果

| 检查              | 结果及覆盖                                                                  |
| ----------------- | --------------------------------------------------------------------------- |
| pnpm typecheck    | 通过                                                                        |
| pnpm lint         | 通过，无警告                                                                |
| pnpm format:check | 通过，SQL不送格式化器                                                       |
| pnpm test         | 6个文件、23项通过，包含S1回归                                               |
| pnpm test:s1:api  | 通过，学生分页/筛选/详情/投影及S1结构回归                                   |
| pnpm test:s2:api  | 最终两次完整通过；四类型、边界、聚合、并发版本、数据库约束/事务失败         |
| pnpm build        | 通过，Nuxt/Nitro node-server产物                                            |
| 浏览器            | 真实新增/编辑、只读编号、提交禁用、列表刷新、学生科目变化及后续区域验证通过 |

单元覆盖：四类型及互斥字段、数值上下限/小数、日期合法性/闰年、上海跨日、未知字段/编号/操作人拒绝、分页与参数化过滤、迁移表范围、每次写入前目标校验、DEV_ACTOR缺失/非法/不存在、重复提交拦截、409保留编辑上下文和主动重载、请求失败及筛选分页复位。

真实测试覆盖：

- 今天开始/今天到期、未来、过期、课时可用/耗尽、无有效合同。
- 同一学生重复科目去重；最早有效到期逐次失效后回退到下一份；列表、详情、数据库聚合三方一致。
- UUID格式与唯一、传入原编号也400、编辑后编号不变；非法参数/日期/课时/伪造操作人、超大正文、不存在学生和合同。
- 组合筛选、分页0/101/超远页、跨页无交集、科目选项分页、SQL注入式关键词、中文搜索。
- 两个并发PATCH使用同一版本，结果恰为一个200、一个409，版本只增加一次。
- 两个真实连接：事务内插入在另一连接不可见；唯一键、FK、CHECK、负数约束拒绝；模拟后续失败rollback后总数恢复，非mock替代。

浏览器验收：给S1合成学生08新建“S2浏览器验收科目”按课时合同0/1，保存产生只读UUID，学生详情出现该科目且到期为空；编辑为1/1后科目消失，列表与详情一致。保存期间表单/取消/关闭受控禁用；实际看到详情loading。学习记录、任务仍空且禁用；未接入学习计划仍“后续接入”。

已修复的联调问题：中文关键词匹配ASCII编号列时MySQL转换失败导致503；现查询显式CONVERT编号为utf8mb4，保持编号存储和唯一约束不变，真实中文筛选测试通过。

## 启动与复验

用户自行在现有.env配置云端连接及DEV_ACTOR_ID，不发送或展示值。S1已执行时不要重置环境，也不要重新装载人员/学生。

```powershell
pnpm db:migrate
pnpm db:seed:contracts
pnpm dev --host 127.0.0.1 --port 3001
# 另开终端，端口与当前服务一致
$env:S1_API_BASE_URL = 'http://127.0.0.1:3001'
$env:S2_API_BASE_URL = 'http://127.0.0.1:3001'
pnpm test:s1:api
pnpm test:s2:api
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

本次复用现有本机3001服务，没有停止用户其他服务。访问 /contracts 和 /students。真实API测试会写入合成合同，不在普通pnpm test中自动执行；测试失败会保留已提交数据，成功也不删除历史。

## 变更文件及用途

| 文件                                                                                              | 用途                                                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| .gitattributes；database/migrations/000_schema_migrations.sql、001_students.sql                   | 固定LF；仅恢复与原台账一致的空行格式                    |
| database/migrations/002_contracts.sql                                                             | 合同表、索引、唯一/FK/CHECK约束                         |
| database/migrate.mjs；server/db/safety.ts                                                         | 迁移按版本限制表/引用，002顺序执行，失败停止            |
| database/seeds/contracts.mjs                                                                      | 显式且可重复安全的合同合成装载                          |
| database/seeds/students.mjs；server/db/pool.ts                                                    | 补充每次DML/提交前目标校验                              |
| server/db/contracts-rules.ts、contracts.ts                                                        | 输入校验、上海日期、共享状态SQL、合同查询写入和学生聚合 |
| server/db/write.ts、dev-actor.ts；server/middleware/dev-actor.ts                                  | 写入边界保护、服务端开发操作人上下文/存在校验           |
| server/utils/contract-body.ts                                                                     | 有界JSON读取和安全输入错误                              |
| server/api/contracts/list.get.ts、detail.get.ts、subjects.get.ts、create.post.ts、update.patch.ts | 五个合同API，统一响应与事务                             |
| server/db/students.ts                                                                             | 学生列表/详情批量聚合真实合同                           |
| types/api/contracts.ts                                                                            | 合同DTO、写入类型、分页查询、枚举                       |
| app/services/http.ts、contracts.ts                                                                | 统一写请求与合同/选项service                            |
| app/composables/useContracts.ts、useRemoteOptions.ts、useStudentInvalidation.ts、useStudents.ts   | 异步表单/分页/远程选项/学生刷新                         |
| app/components/ContractEditor.vue、RemoteSelect.vue                                               | 复用编辑表单与远程分页选择器                            |
| app/components/BasicInfoPanel.vue、BaseDataTable.vue                                              | 科目/到期展示；可选横向滚动                             |
| app/pages/contracts/index.vue；app/pages/students/index.vue、[id].vue                             | 真实合同页面、学生聚合展示与阶段标记                    |
| app/mocks/services/home.ts、students.ts                                                           | 仅移除已失效合同mock派生和到期兜底，不实现首页/任务     |
| tests/unit/contracts.test.ts、contract-security.test.ts、contract-state.test.ts                   | 合同输入、范围、身份、异步状态与版本相关测试            |
| tests/unit/students.test.ts、student-state.test.ts；tests/integration/students.mjs                | S1回归适配S2聚合和迁移台账                              |
| tests/integration/contracts.mjs                                                                   | 显式真实API、双连接约束/事务及并发版本测试              |
| package.json                                                                                      | 合同种子和S2真实测试命令，无新依赖                      |
| README.md、database/README.md                                                                     | 配置/运行/种子/测试/回退说明                            |
| docs/design/mvp-backend-implementation-plan.md、student-data-model.md                             | S2实现状态与学生聚合模型                                |
| docs/prd/contracts.md、student-management.md、student-detail.md                                   | 已确认规则、当前页面边界及验收                          |
| docs/test/s1-students-verification.md、本报告                                                     | 历史结果标注与S2交付证据                                |

删除：app/mocks/data/contracts.json、app/mocks/services/contracts.ts、app/types/contracts.ts；由真实API/DTO替代。首次交付时没有删除数据库数据；后续授权清理见下节。源文件可从Git历史恢复，本次未提交。

## 总指挥授权的一次性定向清理（2026-09-06）

总指挥明确授权仅删除 tutor_workspace 中 subject 以 `S2接口测试-` 开头，或精确等于 `S2浏览器验收科目` 的合同；要求目标数量必须为29，否则停止。本次授权不构成新增业务删除接口或日常清理机制。

执行与审计记录：

- 连接建立后校验 `DATABASE() = 'tutor_workspace'`，只读统计接口测试28条、浏览器验收1条，合计29条；合同总数35条。
- 只读确认当前仅有已知四张表，无触发器、无引用合同表的入向外键；删除不会级联到人员、学生、迁移记录或其他数据。
- 单个事务内锁定现有合同，重新核对数量；确认其余6条为S1合成学生01/02的标准合同种子；保存仅在内存中的保留合同字段、人员/学生ID集合及完整迁移台账快照用于比较，不输出编号、隐私或环境配置。
- 删除前再次校验目标库，执行唯一一条参数化 DELETE：`WHERE (subject LIKE ? OR BINARY subject = BINARY ?)`，绑定值仅为 `S2接口测试-%`、`S2浏览器验收科目`。没有扩大范围，没有写入其他表。
- 实际 affectedRows 为29；事务内验证合同剩6条、两类目标均为0、种子字段不变、学生12条、人员集合不变、三条迁移记录及校验和/时间完全不变。提交前再次校验目标库，随后提交；提交后同连接只读复验通过。
- 临时清理和只读复验脚本执行后已移除，不留下可误触发的清理命令。没有创建迁移、修改真实 `.env`、运行种子或创建 Git commit。

清理后复验结果：

| 检查                      | 结果                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| 删除与保留数量            | 删除29，保留6条标准合成种子合同                                       |
| 学生/人员/迁移记录        | 学生仍为12条；人员与迁移记录不变                                      |
| 真实合同列表API           | 总数6；两类测试科目不存在                                             |
| 关键词筛选及科目选项API   | 两类测试标记分别查询均为0                                             |
| 学生列表与全部12个详情API | 与独立按Asia/Shanghai当天、剩余合同计算的去重科目及最早有效到期日一致 |
| 合同页浏览器验证          | 显示6条标准种子记录，无两类测试标记；观测输出隐藏合同编号             |
| 种子学生详情浏览器验证    | 数学/英语正确展示且数学去重，最早有效到期日为2026-09-11，无测试科目   |

本次仅执行定向数据清理和文档更新，未改应用代码；未重跑会新增合同的 `test:s2:api`，避免重新产生测试数据。此前类型检查、Lint、单元测试和构建结果仍为上一节所列；本次追加的是数据库、只读API及浏览器复验。

恢复说明：29条测试合同已物理删除并提交，应用没有撤销/回收站，不提供自动恢复或重建；如需恢复原记录，须另行授权并依赖用户已有的数据库备份或时间点恢复能力（本次未确认该能力，也未创建备份）。没有清库、删表、切库或修改其他数据库。

## 回退与限制

1. 回退时停止合同写入口、退回S2应用和学生聚合代码，保留contracts及S1表/数据，不提供自动down。不能把旧mock回退宣称为真实合同结果。
2. DDL隐式提交，建表成功但台账登记失败时必须人工核对；不自动drop、重建或补造校验和。任何表/数据删除需另行明确审批。
3. 无登录/权限隔离，不得公网部署、不得导入真实数据。TLS仍由用户按云服务要求配置，未修改真实环境或证书校验。
4. 构建仅有依赖链DEP0155弃用与插件耗时提示，未阻断；不为此升级依赖。当前无本机阻塞项。
5. 测试不是幂等业务创建系统，网络结果不明需先核对；重跑真实测试会保留更多带标记合成历史。样例日期以显式装载时的上海当天生成，种子重跑不自动刷新旧样例日期。
6. 依赖未改变：Nuxt4.5.2、Vue3.5.42、Ant Design Vue4.2.6、mysql2 3.24.3、ioredis6.0.0、TypeScript6.0.3、Vitest4.1.11。Redis不参与本切片。

补充：git diff --check会提示S1两份SQL末尾空行；这些空行是恢复原台账SHA-256所必需，刻意保留，不是SQL语义变更。不能为消除提示再次修改已登记文件。Prettier格式检查已通过。

S2无新增产品决策阻塞。停止在本切片，等待总指挥审阅/测试验收；未开始S3或后续领域。
