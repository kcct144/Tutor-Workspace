# 任务定义与任务分配（S5–S6 MVP）

- 状态：已实现（待验收）
- 负责人：开发负责人（同步总指挥裁决）
- 创建日期：2026-09-05
- 最后更新日期：2026-09-06
- 关联需求：S5任务定义、S6任务分配与首页联动

## 范围与字段

/tasks、/tasks/assignments、首页及学生详情任务区均已真实接入。分配人数按任务历史去重学生统计。不提供删除、登录、权限、审计、系列或自动派发。S6只新增分配表，不修改既有任务定义记录。

title/subject/description必填，trim后Unicode码点分别1–160、1–64、1–10000，保存trim后的文本，说明纯文本展示。标题不唯一。status仅enabled/disabled，显示启用/停用；新建默认enabled，不接受创建时指定状态；编辑允许两态，停用仍可读取。id对外十进制字符串。owner_user_id为服务端创建/最近维护操作人，写入身份由当前网页登录会话取得，不接受浏览器owner/actor。version用于乐观锁，不是历史版本。

## API

统一{status,msg,data}；创建201其余200。非法/未知字段400、不存在404、冲突409、请求过大413、数据库/操作人不可用503，不输出SQL/配置。

| 路由                    | 输入                                                | data                             |
| ----------------------- | --------------------------------------------------- | -------------------------------- |
| GET /api/tasks/list     | page,pageSize,keyword,subject,status                | Page<TaskDefinition>             |
| GET /api/tasks/detail   | id                                                  | TaskDefinition                   |
| POST /api/tasks/create  | title,subject,description                           | TaskDefinition，默认启用         |
| PATCH /api/tasks/update | id,title,subject,description,status,expectedVersion | TaskDefinition                   |
| PATCH /api/tasks/status | id,status,expectedVersion                           | TaskDefinition，目标状态         |
| GET /api/tasks/options  | page,pageSize,keyword                               | Page<{id,title,subject}>，仅启用 |
| GET /api/tasks/subjects | page,pageSize,keyword                               | Page<{value}>，含停用科目去重    |

Page含items/total/page/pageSize；列表默认8，选项默认20，最大100；页≥1，越界空结果。keyword最多64，列表/options搜索标题/科目/说明，subjects搜科目；LIKE参数化且转义通配符。列表/options按updated_at DESC,id DESC，科目按value排序，均LIMIT。TaskDefinition仅id/title/subject/description/status/version/createdAt/updatedAt/assignmentCount（历史去重学生数）。

## 交互和验收

保留列表、筛选、弹窗和启停入口。页面→composable→service→API→server/db，无mock回退。科目独立远程分页搜索，不从当前页伪造选项。详情API回填，关闭/切换忽略旧响应。所有请求有loading/empty/error；提交禁用，失败/409保留草稿并明确提示，刷新列表不丢草稿，重载详情需确认放弃。新建结果不明先刷新核对，不自动重发。启停409刷新列表并保留提示。

验收：两态、必填/空白/长度、分页/组合筛选/注入式关键词、停用可读、options仅启用、科目分页、冲突草稿、伪造操作人拒绝、无效/缺失操作人拒绝、持久化、FK/CHECK/事务失败及S1–S4数据不变。

## 数据与停止点

仅tutor_workspace，显式005迁移。种子2条固定任务；真实API新增验收最多1条，浏览器新增验收最多1条，重复识别复用、总计最多4条。固定内容/合成身份不匹配停止，不覆盖未知数据，不读mock JSON，不自动执行、不累计随机调试数据、不删除。清理另行授权。

S6已确认：历史展示JOIN当前定义、不保存快照；统计历史去重学生人数。回退应用保留表/台账/数据，无自动down。

## S6 已确认实施契约（本轮授权）

S6将分配页、学生详情任务区、首页任务摘要接入同一task_assignments数据源。只新增该表，不保存快照。展示标题/科目/说明及关键词/科目筛选JOIN当前tasks；任务编辑影响展示文本，但不更新分配归属、截止日、状态、完成时间或版本。S5 assignmentCount改为历史COUNT(DISTINCT student_id)，不按次数统计。

GET /api/task-assignments/list支持page/pageSize/keyword/studentId/taskId/subject/status/dueState；默认8最大100，学生详情5。keyword最多64，搜索当前任务标题和学生姓名；status pending/completed，dueState overdue/today/upcoming只匹配待完成并按服务端Asia/Shanghai当天派生。列表待完成优先、due_date/id升序；已完成completed_at/id降序。学生/任务不存在404，越界空页，未知/非法参数400。

POST create-batch仅taskId/studentIds/dueDate：1–100个不同学生ID，截止日>=服务端今天，任务必须启用。服务端操作人取当前会话；单事务锁任务、确认学生与无待完成冲突、批量插入。任一失败整批回滚；重复/并发唯一冲突409、不重试。返回assignmentIds/createdCount，201。

PATCH completion仅id/completed:boolean/expectedVersion：同版本同目标返回原记录不改时间/版本；版本不符409。完成写服务端时间，恢复清空；恢复撞待完成唯一键409保持原完成状态。操作人只校验，不改原assigned_by。无删除、跳过、进行中、取消、提醒、审计或自动派发。

列表DTO显式id/taskId/taskTitle/description/studentId/studentName/subject/status/assignedAt/dueDate/completedAt/createdAt/updatedAt/version/dueState；所有查询参数化且LIMIT。JSON技术上限16KiB。错误统一envelope，400/404/409/413/503，不暴露配置。

分配页只保留关键词、科目、状态、时效过滤，不加学生/任务下拉筛选。新建弹窗才提供单任务、多学生、日期；选项远程分页，跨页保留选择。学生详情复用列表组件，关键词/状态/分页及完成切换一致，无批量创建入口。三处写操作按分配ID禁用、失败恢复确认状态并提示；写成功刷新当前数据，路由重进/窗口聚焦刷新其他区域，不用mock。

演示种子固定9条：学生01三条待完成（昨天/今天/未来）和五条完成历史、学生04一条待完成；仅用S5已启用的合成定义。重复核对后跳过，不覆盖。API最多4条固定验收（学生07/08、11、12），浏览器最多1条（学生10），合计上限14，不累计随机数据。种子日期随首次执行锚定，后续不重写日期。临时约束测试仅回滚未提交分配行，不改S1–S5。100人成功路径由单元测试覆盖；12名既有学生无法做100名真实成功分配，不为测试扩建学生。

回退只退应用并保留006表和数据。清理另行批准，不提交Git。
