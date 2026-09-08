# 真实后端与前端联调 MVP 实施计划（收敛版）

- 状态：已确认
- 负责人：开发负责人
- 创建日期：2026-09-05
- 最后更新日期：2026-09-06
- 关联需求：学生、合同、学习记录、学习计划、任务定义、任务分配与首页联动
- 当前授权：S1–S5已完成并提交；本轮仅S6任务分配与首页联动，显式006只建task_assignments，不改既有数据、不提交Git。展示与搜索JOIN当前tasks，不保存快照。
- 实施顺序：学生基础 → 合同 → 学习记录 → 学习计划 → 任务定义 → 任务分配与首页联动

## 1. 已确认的 MVP 边界

下表记录总指挥本轮裁决，作为本计划基线，不再列为开放问题。S1开工已同步学生PRD和数据模型；后续领域文档在对应切片授权后同步，不提前实现。

| 领域       | 已确认规则                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| 人员与环境 | 仅受控开发/测试库；写操作人由服务端会话取得，不接受浏览器传入；不得公网部署                                               |
| 学生       | 仅查询、详情、选择器；负责人/性别可空；最近跟进为该学生学习记录 occurred_on 最大值，无记录为 null                         |
| 合同       | 时间合同开始日≤今天≤到期日有效；课时合同已上课时<总课时有效；学生科目从有效合同去重聚合；到期提醒取有效时间合同最早到期日 |
| 编号       | 服务端生成、全局唯一、创建后不可修改，前端只展示                                                                          |
| 学习记录   | 新增、编辑；不可删除；发生日期不得晚于当天；正文最多10000字                                                               |
| 学习计划   | Markdown 文档读取/编辑；与学生多对多，关系只读；进行中的关系由初始测试数据维护，无管理 UI                                 |
| 任务定义   | 状态仅启用/停用，可互相切换                                                                                               |
| 任务分配   | 状态仅待完成/已完成；逾期由截止日派生，不落库；新建分配截止日不得早于当天                                                 |
| 重复与批量 | 同一学生+同一定义最多一条待完成分配；批量全有或全无，1–100人                                                              |
| 重试       | 不建技术幂等回执；以数据库唯一约束和明确重复提示处理重试，不承诺请求结果重放                                              |
| 分页       | 首页卡片正常分页；计划左侧采用分页（保持左右布局）                                                                        |
| 初始数据   | 独立、显式执行的演示数据装载脚本；仅合成数据，不自动运行、不导入真实数据、不将 mock JSON 原样入库                         |

不在本轮范围：学生新增/编辑、登录鉴权、权限隔离、账号管理、提醒、风险标记、任务系列、自动顺延/派发、合同金额/支付/附件/续签/作废、学习计划新建/删除/协作/版本历史、业务删除与操作审计系统。

保留现有页面结构、Nuxt 客户端渲染和 Ant Design Vue；仅增加已要求的编号只读展示、记录编辑、分页及真实请求反馈。首页两个尚无完整业务入口的快捷按钮保留现有提示，不扩展学生写接口。

## 2. 当前审查与需要替换的部分

### 2.1 文档依据

规划阶段已完整阅读 AGENTS.md、full-stack-development-rules.md，以及下列全部既有 PRD/设计文档。以下为规划时的代码快照；S1实施按授权执行迁移、合成装载与验证，不增加依赖。

- PRD：student-management.md、student-detail.md、contracts.md、study-plans.md、tasks.md、home-dashboard.md、README.md。
- 设计：student-data-model.md、study-plan-data-model.md、task-data-model.md、development-foundation.md。
- 学生管理、学生详情PRD及学生数据模型在S1开工时标为“已确认”；其他领域文档待对应切片同步。已裁定的内容不再重复请求确认；其余实质未决事项集中在第9节。

### 2.2 代码与差异

| 现状                                                                                        | MVP 联调动作                                                                  |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| app/pages 下已有首页、students 列表/详情、contracts、plans、tasks 定义/assignments 七个页面 | 保持页面布局，按六个切片替换数据边界                                          |
| app/types/{students,student-detail,home,contracts,plans,tasks}.ts                           | 增请求/响应DTO和分页类型；统一任务两态，保留string ID；移除重复或失效类型     |
| app/mocks/services/*.ts 为同步读取/克隆JSON；页面内 submit/toggle 直接改数组                | 新建 app/services 的异步读写入口；页面编排进入 composable，服务端承担权威校验 |
| 首页、学生详情、任务分配独立保存任务数据；首页计数取静态数组长度                            | 统一来自 task_assignments；首页分组摘要与总数由服务端返回                     |
| contracts service 固定“今天”、聚合所有科目、取最晚到期日；学生 service 还有旧到期值兜底     | 改为有效合同科目、有效时间合同 MIN(end_date)，无值为null，删除原型兜底        |
| 合同类型没有contractNo；详情没有记录编辑入口；BasicInfoPanel写死老师名                      | 编号只读展示；复用记录弹窗编辑；负责人从数据库关系读取，可为空                |
| students模型有last_follow_up_at，原型有lastFollowUp固定值                                   | 新建students表不存冗余跟进字段；S3后从记录MAX(occurred_on)查询                |
| 学生plans为名称数组，计划文档无真实学生关系                                                 | study_plan_students提供多对多读取；标签使用计划ID作为key                      |
| BaseDataTable支持loading/empty/change，但分页无current/total                                | 接入受控服务端分页；详情两表仍各每页5条，普通列表默认8条                      |
| plans页面全量正文搜索/本地保存/页面内Markdown纯函数                                         | 导航分页、详情按需读、保存真实API；复用受控转义渲染，不新增Markdown能力       |
| 任务原型状态集合超出本轮；分配人数按分配记录数统计                                          | 实现时统一裁决后的两态；分配人数与历史内容展示口径见第9节                     |
| server/utils/mysql.ts已存在连接池                                                           | MySQL池/查询/事务按全栈规则归server/db                                        |
| /api/health只检测配置存在，响应未完整遵循统一envelope                                       | S1统一响应；不将配置存在当作数据库连通成功                                    |
| database/migrations、seeds只有占位文件；Vitest仅有true断言                                  | 后续每切片只建所需迁移/相关测试，不预铺全部表                                 |

依赖基础已具备：Nuxt ^4.5.2、Ant Design Vue ^4.2.6、mysql2 ^3.24.3、TypeScript ^6.0.3、vue-tsc、Vitest、ESLint、Prettier及现有Tailwind。无需预先增加ORM、迁移框架、校验框架或状态管理库。nuxt.config.ts的ssr:false保持。

审查时已存在AGENTS.md、pnpm-lock.yaml修改及未跟踪的全栈规则文件，本次不修改这些内容，也不读取真实.env。

## 3. 最少实施约定

### 3.1 分层与输入输出

- 页面/组件 → app/composables/use领域 → app/services/领域 → server/api/领域/动作.方法.ts → server/db/领域查询。API示例：server/api/students/list.get.ts。
- 复用Nuxt的$fetch封装一个小型http service；页面不散落请求/SQL/mock数据。composable只管理响应式状态、表单和请求编排；纯函数放utils。
- 连接池和事务统一在server/db；业务方法按需要拆分，不强制增加透传service层。
- 服务端所有SQL参数化；查询字段/排序使用白名单；禁止SELECT *直接返回或把body铺进SQL。
- 外部输入unknown，验证ID、枚举、真实日期、长度/范围、未知字段；组件/composable不使用any。
- 统一响应：成功HTTP200（创建201），{status:"ok",msg:"成功",data:T}；失败保留HTTP错误码，{status:"error",msg:安全提示,data:{code,fields?}}。
- 400输入错误、404不存在、409重复/版本冲突、413请求超限、503数据库/配置不可用；意外500不返回SQL、连接信息或堆栈。
- ID用BIGINT UNSIGNED，DTO用十进制string，mysql2防大整数精度丢失；日期为YYYY-MM-DD，时间戳为UTC。业务“今天”统一服务端Asia/Shanghai日期，不接受浏览器传asOfDate。
- 列表返回{items,total,page,pageSize}；page≥1，pageSize为1–100整数；默认8，详情两表默认5，首页/计划导航/选择器默认20。非法分页400，越界页返回空items及准确total。
- 列表、选择器和科目选项均LIMIT；关键词用参数化LIKE并转义通配符；每种排序加id稳定决胜，关联采用JOIN或当页ID批量查询，禁止N+1。

### 3.2 云端使用

用户自行在.env配置NUXT_MYSQL_HOST/PORT/DATABASE/USER/PASSWORD。计划、代码、文档、测试和Git中都不能包含真实主机、数据库名、账号、密码或连接串；不要求读取、展示或猜测这些值。

服务器请求上下文按规则放server/middleware。写请求不信任请求body/header里的作者或操作人。

全程仅受控开发/测试库，不得公网部署；不导入真实学生数据。列表与选择器只返回所需字段，详情可展示合成监护人信息。MySQL连接仅由服务端运行时加载.env，错误日志脱敏；云端TLS按实际要求配置并验证证书，不关闭校验绕过错误。

### 3.3 迁移与演示数据（S1–S5已授权）

数据库硬边界：连接参数仍由用户.env提供；当前连接必须先执行DATABASE()校验并确认结果等于批准的 tutor_workspace，才可迁移、装载或查询业务表。不匹配立即停止，不输出实际值。禁止CREATE/DROP DATABASE、USE切库、清库和修改其他数据库。数据库名在此仅作为用户明确批准的安全白名单，不是读取.env后公开的配置。

S1按本轮授权使用现有Node+mysql2和版本化SQL；后续切片另行授权：

- 每个切片在database/migrations新增自己的表/索引，记录版本、校验和与应用时间；按序显式执行，不在dev/build/postinstall时迁移。
- 每份迁移写清up、验证和回滚步骤。MySQL DDL不能当普通事务回滚；失败即停，核对实际结构后修复，不盲目重跑。
- 演示装载脚本在database/seeds单独维护，仅显式命令运行；按切片合成数据，先人员/学生，再合同、记录、计划/关系、任务/分配；不导入mock文件、不读取真实数据。
- 装载前检查目标和表；发现已有不匹配数据停止，不清库、不覆盖。
- FK均RESTRICT，无级联删除。回滚优先退应用保留数据；仅经授权的可丢弃测试数据可按依赖倒序删除。已有数据时删表/删列为不可逆损失，需备份或前向修复。
- 业务表当前不做物理/软删除，不预建deleted_at、恢复接口或历史审计表。
- S1执行时先做当前连接边界检查与版本检查；不读取或输出.env真实值，仅报告检查通过/不通过。

## 4. MVP表与约束

下述为后续最小模型。除关系表外各表有主键id；共用created_at、updated_at为DATETIME(3)，业务ID与FK为BIGINT UNSIGNED。表中name(64)等表示VARCHAR；未标可空的业务字段为NOT NULL。

可编辑的合同、学习记录、文档、任务定义、任务分配保留一个version整数用于防止覆盖；不建历史版本表。没有学生编辑功能，students不引入version。索引仅覆盖当前查询。

| 表/切片                       | 关键字段                                                                                                                                                                                   | 约束与索引                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| users / S1                    | id、name(64)；只作演示人员引用，无登录字段                                                                                                                                                 | PK(id)；供owner/author/assigned_by引用，不建账号管理                                                                                                  |
| students / S1                 | owner_user_id可空、name(64)、grade(16)、class_name(32)可空、school(128)可空、gender(8)可空、enrolled_at DATE可空、guardian_name(64)可空、guardian_phone(32)可空、note(500)可空、status(16) | FK owner→users；(grade,status,id)，(owner_user_id,id)；状态沿用在读/待分配/已结课；不存科目、到期日、最近跟进冗余字段                                 |
| contracts / S2                | student_id、contract_no(36)、subject(64)、contract_type(16)、start_date/end_date DATE可空、attended_lessons/total_lessons INT UNSIGNED可空、makeup_lessons INT UNSIGNED默认0、version      | UNIQUE(contract_no)、FK student；(student_id,start_date,end_date,id)、(subject,contract_type,id)；类型仅month/half_year/year/lessons，组合CHECK见下文 |
| student_learning_records / S3 | student_id、author_user_id、category(8)、content TEXT、occurred_on DATE、version                                                                                                           | FK student/users；category仅缺/补/强；(student_id,occurred_on,id)、(student_id,category,occurred_on,id)、(student_id,created_at,id)                   |
| study_plan_documents / S4     | owner_user_id、title(128)、summary(300)可空、content MEDIUMTEXT、version                                                                                                                   | FK owner→users；(updated_at,id)；仅正文可编辑，标题不唯一                                                                                             |
| study_plan_students / S4      | plan_id、student_id、created_at；每行表示一条进行中的关系，初始测试数据维护                                                                                                                | PK(plan_id,student_id)、(student_id,plan_id)，两端FK；不增加关系状态流转/历史/管理UI                                                                  |
| tasks / S5                    | owner_user_id、title(160)、subject(64)、description TEXT、status(16)、version                                                                                                              | FK owner→users；status仅启用/停用；(status,updated_at,id)、(subject,status,id)；标题不唯一，表单沿用原型必填科目/说明                                 |
| task_assignments / S6         | task_id、student_id、assigned_by、status(16)、assigned_at DATETIME(3)、due_date DATE、completed_at DATETIME(3)可空、version；不设started_at                                                | 三端FK；status仅待完成/已完成；(student_id,status,due_date,id)、(task_id,student_id)、(status,due_date,id)；待完成唯一键见下文                        |

合同组合约束：

- 时间型：start_date/end_date必须非空且end≥start；课时数字字段必须为NULL。
- 课时型：两个日期为NULL；attended/total必须非空、total>0、0≤attended≤total。沿用现有整数课时、人工填写、makeup≥0；不自动扣课或计算合同日期。
- CHECK显式包含IS NULL/IS NOT NULL，避免NULL绕过数值判断；动态“今天”校验在服务端，不把当前日期写成固定CHECK。

待完成唯一约束：生成列pending_marker在status=待完成时取1、已完成时为NULL，建立UNIQUE(task_id,student_id,pending_marker)。按本轮“仅限制待完成”的口径，已完成历史不阻止新分配，不增加全生命周期唯一限制。恢复待完成若占用唯一槽则409，原记录维持已完成。

字段上限：学习记录trim后1–10000个Unicode字符，新增/编辑同样校验；任务说明沿用必填且最多10000字符；计划正文非空，技术上限100000字符。输出DTO只取页面所需字段，不直接返回数据库完整行。

## 5. API与页面契约

GET使用query，POST/PATCH使用JSON body。P表示分页参数/结果；所有可编辑记录输出version，更新输入expectedVersion。未知字段拒绝，特别是contractNo、actorId、authorUserId、assignedBy等不得由浏览器写入。

### 5.1 DTO与写入字段

| DTO/输入            | 内容                                                                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| StudentListItem     | id,name,grade,className,school,status,subjects:string[],expiryDate,plans:{id,title}[],lastFollowUp；不含监护人字段                                                                                                     |
| StudentDetail       | 上述+gender,enrolledAt,createdAt,guardianName,guardianPhone,note,owner:{id,name}或null                                                                                                                                 |
| StudentOption       | id,name,grade                                                                                                                                                                                                          |
| Contract            | id,contractNo,studentId,studentName,subject,contractType,日期/课时/makeup字段,status,updatedAt,version                                                                                                                 |
| ContractWrite       | studentId,subject,contractType,startDate,endDate,attendedLessons,totalLessons,makeupLessons；更新额外id,expectedVersion；不接受contractNo                                                                              |
| LearningRecord      | id,studentId,category,content,occurredOn,author:{id,name},createdAt,updatedAt,version                                                                                                                                  |
| RecordWrite         | category,content,occurredOn；新增额外studentId，编辑额外id,expectedVersion；学生与原始记录人不可改                                                                                                                     |
| PlanListItem/Detail | id,title,summary,updatedAt,version；详情增加content，列表不带正文                                                                                                                                                      |
| TaskDefinition      | id,title,subject,description,status,createdAt,updatedAt,version,assignmentCount                                                                                                                                        |
| TaskWrite           | title,subject,description,status；更新额外id,expectedVersion；操作人由服务端取                                                                                                                                         |
| TaskAssignment      | id,taskId,taskTitle,studentId,studentName,subject,status,assignedAt,dueDate,completedAt,updatedAt,version,dueState                                                                                                     |
| HomePage            | items,total,page,pageSize,activeStudents,asOfDate；卡片含学生基本摘要、科目、计划、expiryDate/expiresInDays、pendingTasks/completedTasks各≤3、pendingCount/completedCount；任务摘要含assignmentId,title,status,version |

学生与首页DTO的expiryDate统一取有效时间合同最早到期日，无有效时间合同为null；lastFollowUp为MAX(occurred_on)，无记录为null。合同DTO仍保留自身startDate/endDate，不保留另一份学生“最晚到期日”字段。

### 5.2 路由清单

| 切片 | 方法与路由                              | 输入                                                      | 输出data / 调用页面                               |
| ---- | --------------------------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| S1   | GET /api/health                         | 无                                                        | {app,mysqlConfigured}；只检查配置                 |
| S1   | GET /api/students/list                  | P,keyword?,grade?,status?                                 | P<StudentListItem>；/students                     |
| S1   | GET /api/students/detail                | id                                                        | StudentDetail；/students/:id                      |
| S1   | GET /api/students/options               | P,keyword?                                                | P<StudentOption>；合同/任务分配选择器             |
| S2   | GET /api/contracts/list                 | P,keyword?,studentId?,subject?,contractType?,status?      | P<Contract>；/contracts，搜索编号/学生名/科目     |
| S2   | GET /api/contracts/detail               | id                                                        | Contract；编辑回填                                |
| S2   | POST /api/contracts/create              | ContractWrite                                             | Contract（含生成编号）；新增                      |
| S2   | PATCH /api/contracts/update             | ContractWrite+id,expectedVersion                          | Contract；编辑                                    |
| S2   | GET /api/contracts/subjects             | P,keyword?                                                | P<{value}>；科目选项                              |
| S3   | GET /api/learning-records/list          | P,studentId,category?,subject?,keyword?,dateFrom?,dateTo? | P<LearningRecord>；学生详情                       |
| S3   | POST /api/learning-records/create       | RecordWrite+studentId                                     | LearningRecord；新增                              |
| S3   | PATCH /api/learning-records/update      | RecordWrite+id,expectedVersion                            | LearningRecord；编辑                              |
| S4   | GET /api/study-plans/list               | P,keyword?                                                | P<PlanListItem>；左侧分页导航，搜索标题/摘要/正文 |
| S4   | GET /api/study-plans/detail             | id                                                        | PlanDetail；文档阅读                              |
| S4   | PATCH /api/study-plans/update           | id,content,expectedVersion                                | PlanDetail；正文保存                              |
| S5   | GET /api/tasks/list                     | P,keyword?,subject?,status?                               | P<TaskDefinition>；/tasks                         |
| S5   | GET /api/tasks/detail                   | id                                                        | TaskDefinition；编辑回填                          |
| S5   | POST /api/tasks/create                  | TaskWrite                                                 | TaskDefinition；新增，默认启用                    |
| S5   | PATCH /api/tasks/update                 | TaskWrite+id,expectedVersion                              | TaskDefinition；编辑                              |
| S5   | PATCH /api/tasks/status                 | id,status,expectedVersion                                 | TaskDefinition；启用/停用                         |
| S5   | GET /api/tasks/options                  | P,keyword?                                                | P<{id,title,subject}>；仅启用任务                 |
| S5   | GET /api/tasks/subjects                 | P,keyword?                                                | P<{value}>；定义/分配科目筛选                     |
| S6   | GET /api/task-assignments/list          | P,keyword?,studentId?,taskId?,subject?,status?,dueState?  | P<TaskAssignment>；分配页及学生详情               |
| S6   | POST /api/task-assignments/create-batch | taskId,studentIds:string[],dueDate                        | {assignmentIds,createdCount}；多选分配            |
| S6   | PATCH /api/task-assignments/completion  | id,completed:boolean,expectedVersion                      | TaskAssignment；分配页/首页勾选                   |
| S6   | GET /api/home/list                      | P,grade?                                                  | HomePage；首页卡片与在读数量                      |

通用错误沿用第3节；特殊场景：关联学生/任务不存在404；合同字段互斥错误、学习记录未来日期、分配截止日早于今天、空/超过100人/重复学生ID数组为400；未启用任务、重复待完成、恢复冲突、旧version为409。前端保留输入并展示具体业务提示，不把数据库不可用解释为空列表。

分页默认排序：学生lastFollowUp降序、无记录末尾、id降序（S3前按id降序）；合同id降序；学习记录created_at降序/id降序，确保新增在顶部；计划/定义updated_at降序/id降序；分配待完成逾期优先、due_date升序/id升序。首页保持两组各最多3条，计数由API返回，不能对摘要数组长度计总数。首页学生范围和分配统计待第9节裁决。

## 6. 必需的规则与事务

### 6.1 合同与学生聚合

编号实现建议使用Node原生crypto.randomUUID()，无需编号服务或新依赖。数据库UNIQUE兜底，极小概率生成冲突只针对该错误重新生成；其他失败不盲目重试创建。编号不赋予日期、分支等业务含义。更新白名单排除contract_no，前端列表/编辑弹窗只读展示，新建提交后取得编号。

时间合同有效谓词为start_date≤今天≤end_date；课时为attended_lessons<total_lessons。合同状态、学生subjects去重、MIN(有效时间合同end_date)使用同一服务端日期与规则。无匹配返回空科目/null到期日；课时合同不贡献到期提醒。首页仅在0≤expiresInDays≤7时显示标签。

students不冗余保存这些字段，按当前页学生ID批量聚合；合同保存后刷新相关列表/详情，首页切入重新读取。跨天后下一次请求自然更新，不加定时任务。

### 6.2 学习记录与最近跟进

新增/编辑均校验发生日期≤今天、分类合法、正文1–10000字。科目复用合同/任务统一的 trim 后 1–64 字符规则，允许 `null` 表示综合/通用跟进；不关联具体合同，也不修改合同、任务或计划。数据库保存原始作者、学生和创建时间；编辑只改分类/科目/正文/发生日期及updated_at/version，不提供删除。

最近跟进始终读MAX(occurred_on)，不写students.last_follow_up_at。编辑最晚记录至更早日期时要重新聚合，不能只保留曾经出现的最大日期。前端保存后刷新记录表与基本信息；并发编辑version不匹配则409，保留草稿。

### 6.3 批量分配

只保留一个数据库事务和唯一约束：

1. 校验学生数组1–100人、无重复ID、截止日≥今天。操作人来自服务端会话。
2. 事务内锁定当前任务行，检查启用；任务停用也锁同一行，保证停用/分配顺序明确。一次查询校验所选学生存在及已有待完成分配。
3. 为每个学生创建待完成记录；唯一键兜底并发重复。任意学生无效或冲突均整批回滚，不能静默跳过。
4. commit成功才报成功；任何失败rollback，finally释放连接；冲突409并提示已有待完成分配。锁超时/连接故障返回安全失败，不做后台自动重试。
5. 提交期间禁用按钮；网络结果不明先刷新分配列表核对，再由用户决定重试。不保留请求键、请求摘要、回放存储或自动补偿流程。

明确限制：唯一约束只保护“当前待完成唯一”，不是永久请求幂等。如果原分配已完成，旧请求再次提交可能创建新分配。界面不自动重发POST，也不承诺返回上次成功的ID。合同/记录/定义新增请求结果不明时同样先刷新核对，避免自动制造重复数据。

### 6.4 完成切换

只允许待完成↔已完成。API接收目标completed布尔值，禁止盲toggle或任意状态字符串。用单条条件UPDATE（id+version）原子修改status/completed_at/version；成功完成写当前时间，恢复清空completed_at。同一版本已达目标时返回当前值、不再次更新时间；旧版本409后刷新。

恢复待完成若违反唯一约束则409且仍保持已完成。前端按分配ID禁用正在提交的复选框；可即时显示选中，但失败恢复已确认状态并提示。成功刷新首页分组/计数、分配页及详情；不改其他学生、任务定义、合同课时，不派发下一任务。逾期只对待完成且due_date<今天成立，已完成没有逾期状态。

## 7. 六个垂直切片

S1–S5已交付；S6已单独授权并按本轮边界实施。公共能力随第一个需要它的切片加入，不先建全表或提前铺完所有API。

### S1 学生基础

- 迁移：users、students与最小迁移版本台账；可空负责人/性别；不建记录/合同表。
- 数据访问：整理MySQL池到server/db，学生分页/详情/选择器查询；安全投影。
- API：学生三接口、health统一envelope；连通性用真实学生查询验收，不依赖health配置布尔值。
- 前端：替换学生service及详情基本区，BaseDataTable受控分页，移除固定老师名；科目/到期/计划/最近跟进先明确为空，不借用mock伪装已接入。
- 测试：分页/筛选、空库、404、大ID、空负责人/性别、配置错误；演示脚本产生合成学生/人员，只有显式执行才装载。
- 验收：学生列表→筛选/翻页→详情→无效ID；数据来自MySQL，刷新一致。后续聚合不计入本切片验收。
- 回滚：先退应用保留数据；可丢弃测试范围才按students→users逆序处理。

### S2 合同（已实现，待验收）

- 迁移：contracts，编号UNIQUE、类型组合CHECK、FK及查询索引。
- 数据访问：新增/编辑与编号生成；有效科目去重和最早有效时间合同到期日，接入学生查询。
- API：contracts list/detail/create/update/subjects；沿用学生选择器；拒绝请求写编号。
- 前端：替换合同本地数组写；编号只读；合同状态由API返回，学生科目/到期字段同步刷新。
- 测试：四类型、编号唯一/不可改、开始/结束当天、未来/过期合同、课时耗尽、多个有效科目、最早有效到期及无有效合同。
- 验收：创建两份不同到期的有效时间合同→学生显示较早日期→编辑使其失效→显示另一份；课时用完后科目正确；刷新持久化。
- 回滚：保留合同数据，停用聚合代码；不以回滚为由删除学生。既有编号冲突先报告，不自动改已有业务编号。

S2交付细节和自测结果见[交付报告](../test/s2-contracts-delivery.md)。当前实现crypto.randomUUID编号、版本编辑、服务端DEV_ACTOR上下文、共享有效性SQL及学生批量聚合。S3复用基础工具，不修改合同数据。

### S3 学习记录（已实现，待验收）

本次只执行003_learning_records；标准种子限合成学生09/10共6条，API验收限学生11两条，浏览器验收限学生12一条。固定记录重复复用，发现不匹配数据停止；不建立技术回执/删除工具，不累计S3接口测试-*。数据库约束与事务失败插入回滚；持久合成数据的任何清理都须另行授权。新增studentId仅指定目标学生，编辑拒绝归属与作者字段；无登录/权限隔离，不承诺按学生授权访问。

- 迁移：student_learning_records，学生/作者FK与日期/分类索引，无删除字段；012 仅增加可空科目、CHECK 和学生科目日期索引，历史行保持空值。
- 数据访问：分页、新增、带version编辑；学生最近跟进接入MAX(occurred_on)，科目不影响该聚合。
- API：learning-records list/create/update，支持可空科目和科目筛选，校验未来日期、10000字上限和科目统一规则。
- 前端：移除unshift/固定作者，新增和编辑复用弹窗，详情两表分页独立；保存后刷新基本信息。
- 测试：今天/未来日期、空白及10000/10001字、作者伪造、编辑冲突、最新记录改早后最大日期回退。
- 验收：新增→刷新→编辑→刷新；分类/日期/关键词筛选正确，最近跟进匹配数据库，无删除入口。
- 回滚：回退记录接入并保留数据；测试范围删除表前先移除读取聚合，不能留悬空查询。

S3显式迁移、固定种子、真实API与浏览器自测已完成；保留9条固定合成学习记录，无删除和无界调试记录，详见[S3交付报告](../test/s3-learning-records-delivery.md)。本轮不修改S3数据。

### S4 学习计划（已实现，待验收）

授权边界：仅004两表，3份固定种子计划/4条关系；测试编辑既有种子，不新增随机调试计划。原始Markdown原样保存，trim后1–100000字符校验；只有正文可改。学生标签统一{id,title}且ID作key；首页仍未接入，不以mock名称或mock学生ID兜底，只标注后续接入，S6复用批量关联查询。

- 迁移：study_plan_documents及study_plan_students，多对多唯一关系和FK。
- 数据访问：导航分页/搜索、详情正文、version更新、学生计划标签批量查询。
- API：study-plans list/detail/update；不建关系管理接口或新建文档接口。
- 前端：保持左右布局，左侧分页；复用受控Markdown阅读、编辑/取消/未保存切换确认，保存后重查；标签使用计划ID。
- 测试：跨页搜索正文、取消不写入、空正文/超限、转义安全、保存失败草稿保留、关系不重复、同计划关联多个学生。
- 验收：演示数据文档→搜索/翻页/阅读→编辑保存刷新；返回学生页展示进行中的真实关系标签。
- 回退：先关闭正文写入口，回退S4应用与标签聚合，保留004两表、迁移台账及固定数据；无自动down。任何删表/清理必须另行授权。

显式迁移/重复运行、固定种子/重复跳过、真实API与浏览器自测已完成，详见[S4交付报告](../test/s4-study-plans-delivery.md)。S4交付时停止，S5由本次新授权实施。

### S5 任务定义（已实现，待验收）

- 迁移：tasks，仅启用/停用约束，不提前建分配表。
- 数据访问：分页、编辑和启停；字段必填沿用现有表单；操作人来自服务器。
- API：tasks list/detail/create/update/status/options/subjects。
- 前端：保留列表/弹窗/启停按钮，收敛类型、选项和校验；未到S6时分配人数为0，不能混用mock。
- 测试：两态切换、非法状态、字段上限、版本冲突、停用仍可读；任务选择器仅启用项。
- 验收：新建→编辑→停用→启用→刷新一致，历史定义不删除。
- 回退：停止定义写入口，回退S5应用并保留005表、台账与固定数据；不提供破坏性down。

已实现7个API、独立科目选项、真实/tasks及乐观锁。固定数据2条种子+最多1条API验收+最多1条浏览器验收，重复识别复用；未创建分配表，S6页面逻辑未动。详见[S5交付报告](../test/s5-task-definitions-delivery.md)。

### S6 任务分配与首页联动（已实现，待验收）

- 迁移：仅task_assignments，待完成唯一生成列/索引、FK和完成时间一致性CHECK。
- 数据访问：批量事务、完成原子更新；首页先分页学生，再批量聚合合同/计划/任务计数和每组三条摘要，禁止逐卡查询或全量任务历史返回。
- API：task-assignments list/create-batch/completion、home/list；学生详情任务复用分配列表接口；分配人数统计统一到数据库。
- 前端：分配页/home/详情共用同一任务来源；首页正常分页、两组各三条和准确余量，逾期派生展示；写后刷新，失败回退。
- 测试：100/101人、昨天/今天截止、并发重复、整批中途失败无残留、重复请求提示、完成恢复唯一冲突。
- 验收：启用定义→分给多学生→首页出现→勾选完成→详情/分配页刷新一致→恢复待完成；一名学生已有待完成时整批失败，其余学生无新增。
- 回滚：保留分配数据；不能删学生/定义；清理切片接入失败时的前端入口，避免误写。

S6自测已完成：006显式迁移、固定9条种子、最多4条API与1条浏览器验收分配；三处真实状态联动及人数聚合已验证。任务展示JOIN当前定义，不保存快照。S1–S5指纹未变；100人成功仅单元覆盖，真实库仅12名学生，100人不存在学生整批拒绝已测。详见[S6交付报告](../test/s6-task-assignments-home-delivery.md)，等待总指挥验收，不自动提交或清理数据。

每个切片结束提供改动范围、启动方式、迁移/回滚说明、相关测试及页面验证结果。S6最终验收必须完成所有聚合，不把中间阶段的空字段作为最终结果。

## 8. Service替换与验证

- 请求统一进app/services，Vue状态和刷新在composable；页面不读mock、不改数据库、不保留固定日期/作者。SQL与状态规则只在服务端权威执行。
- 同一区域只有一个数据源，API失败不得回退mock；未迁移区域可在联调阶段显式标识，最后一个依赖切片完成时删除旧mock/service/type。负责人：开发负责人；截止条件：S6验收。
- 所有请求有loading/empty/error，所有写操作有成功/失败反馈与提交禁用。筛选重置页码，切换学生/文档取消或忽略旧响应，保留失败草稿。
- options/subjects也做分页/远程搜索，不从当前页提取伪完整选项。显示total而非items.length；数据行key用稳定ID。
- 每切片运行typecheck、Lint、相关Vitest和build，必要时仅格式化本切片文件；手工验证对应页面。测试报告放docs/test，缺陷含步骤、预期/实际、影响级别及脱敏证据。
- 单元覆盖校验、日期/有效合同、两态流转、DTO、Markdown转义；接口覆盖错误envelope、404、字段超限、SQL注入式输入、分页0/整页/越界/非法参数。
- MySQL集成测试在受控测试库用两个独立连接验证唯一约束和事务失败；不是用串行mock代替。数据库不可用或超时时不得显示写成功。
- 跨页验证：合同更改后的科目/最早到期；学习记录日期更改后的最近跟进；计划关系标签；同一分配在首页/详情/分配页一致。
- 演示脚本必须独立显式执行、不自动清库，样例完全合成；不对真实数据执行测试或迁移。
- S1实施执行相关测试、类型检查、Lint、构建与关键页面浏览器验证，结果记录在docs/test/s1-students-verification.md。

## 9. 剩余事项与停止点

已删除上一版中人员来源、学生写范围、合同有效性/编号来源、记录编辑与日期、计划关联、任务状态、批量上限/原子性、分页和演示数据授权等已解决开放问题，不再要求重复裁决。

以下两项已由总指挥确认，不再阻塞S6：

| 事项                                         | 推荐MVP口径                                                                            | 阻塞位置                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------- |
| 任务编辑是否影响历史分配展示；“分配人数”统计 | 直接JOIN最新定义，不存快照；人数按task_id下去重student_id统计，不按分配次数            | S6关联查询/统计；S5定义CRUD可先做 |
| 首页卡片学生范围及顶部计数                   | 只列在读；顶部为全部在读数，年级只筛卡片；组内待完成按截止日升序、已完成按完成时间降序 | S6首页查询/验收                   |

S1–S5已交付，S6本轮已实现待验收；目标仅限批准库，每次写入前校验DATABASE()，不索取或输出凭据。任务编辑不修改分配记录，历史展示使用当前定义；人数去重学生。首页仅在读、顶部全在读数、年级只筛卡片。

自查结论：仅实施S6，完成后停止；不扩展登录、权限、提醒、风险、任务系列、派发、删除或审计。具体API/模型/验收以任务PRD和首页S6确认章节为准。
