# 任务数据模型（S5定义与S6分配）

- 状态：已实现（待验收）
- 负责人：开发负责人（同步总指挥裁决）
- 创建日期：2026-09-05
- 最后更新日期：2026-09-08
- 关联需求：S5任务定义、S6任务分配与首页联动、任务关联学习计划与计划任务完成度

005_tasks只建tasks，InnoDB/utf8mb4。id BIGINT UNSIGNED自增PK；owner_user_id非空FK users.id，ON DELETE/UPDATE RESTRICT；title VARCHAR(160)、subject VARCHAR(64)、description TEXT均非空；status VARCHAR(16)默认enabled，CHECK仅enabled/disabled；version INT UNSIGNED默认1且>0；created_at/updated_at DATETIME(3) UTC。title/subject CHECK trim后非空，description CHECK长度1–10000；完整Unicode空白/码点校验在服务端，SQL TRIM作基础保护。标题不唯一、无软删除。

索引：(updated_at,id)、(status,updated_at,id)、(subject,status,id)，覆盖默认/状态分页及科目筛选；owner FK索引由MySQL建立。S6独立迁移创建task_assignments，不建系列或审计表。

每次写入由当前会话操作人更新owner_user_id（创建/最近维护人）；更新/启停WHERE id+expectedVersion原子递增版本，0行区分404/409。复用事务、每次DML/commit前校验批准库；DTO不返回内部操作人，assignmentCount按task_id批量聚合COUNT(DISTINCT student_id)。查询参数化且LIMIT，不读取分配mock。

迁移按manifest/版本/校验和显式执行，旧SQL不变。MySQL DDL隐式提交，部分失败停止，不自动删表或补造台账。回退应用保留tasks/数据/台账，结构修复或清理另行审批。

固定数据上限2条种子+1条API+1条浏览器，重复识别复用，不依靠标题唯一约束，不读mock、不覆盖未知数据、不自动执行；约束测试插入仅在未提交事务内回滚。S1–S4只读指纹比对。详见[任务PRD](../prd/tasks.md)。S6分配模型如下；本次只读S1–S5数据并核对指纹。

## S6 最小分配模型（已实现，待验收）

006_task_assignments只创建task_assignments。id/task_id/student_id/assigned_by BIGINT UNSIGNED，后三者FK tasks/students/users均RESTRICT；status VARCHAR(16)默认pending且CHECK pending/completed；due_date DATE；assigned_at/created_at/updated_at DATETIME(3)默认当前时间，completed_at DATETIME(3)可空；version INT UNSIGNED默认1且>0。完成状态与completed_at显式一致性CHECK。pending_marker TINYINT生成列：pending为1，其余NULL；UNIQUE(task_id,student_id,pending_marker)允许完成历史但最多一条待完成。

索引(student_id,status,due_date,id)、(student_id,status,completed_at,id)、(status,due_date,id)、(status,completed_at,id)，唯一索引前缀同时支持任务人数去重。无快照/开始时间/软删除/备注/审计字段。

批量事务先SELECT tasks FOR UPDATE，与S5任务UPDATE行锁串行；学生批量存在查询与待完成冲突查询均LIMIT；一次多行INSERT，唯一约束处理竞争，任何失败回滚。completion原子UPDATE匹配id/version/非目标状态，0行后锁定读取区分不存在、版本冲突、同目标幂等；任何重复唯一键409。不改assigned_by及S1–S5数据。

首页先分页在读学生，批量合同/计划/任务读取；任务用ROW_NUMBER和COUNT OVER按学生+状态分区，rn<=3并总LIMIT最多学生数*6，避免逐卡查询或全量返回。读取事务保证计数/分页/摘要同一快照。任务名称科目说明始终JOIN当前tasks，无任务文本副本。

S5人数按当页任务ID一次GROUP BY task_id COUNT(DISTINCT student_id)聚合。GET详情同样真实人数，后续任务编辑不会写分配记录。

数据库校验、显式迁移、固定合成数据、保留数据回退按本轮授权及任务PRD；无自动down。

## 计划关联与进度快照（S11 已实现）

计划以单个显式 `018_task_plan_progress.sql` 扩展既有真实表；该序号承接 017，不重写 005/006，旧任务和旧分配保持空关联/空快照。

| 表                 | 新列/索引                                                                                                                                                                           | 语义                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `tasks`            | `study_plan_id BIGINT UNSIGNED NULL`、`KEY idx_tasks_study_plan_status_updated (study_plan_id,status,updated_at,id)`、FK -> `study_plan_documents(id)` `RESTRICT`                   | 当前任务定义关联的 0/1 份计划。`NULL` 表示未关联。               |
| `task_assignments` | `study_plan_id_snapshot BIGINT UNSIGNED NULL`、`KEY idx_assignments_plan_student_status (study_plan_id_snapshot,student_id,status,id)`、FK -> `study_plan_documents(id)` `RESTRICT` | 创建分配时由服务端写入的不可变计划归属快照，只供计划完成度统计。 |

两列均不冗余计划标题。计划实体已被所有相关外键 RESTRICT 引用，因此不可物理删除，历史快照始终可解释。旧任务默认 `study_plan_id=NULL`；旧分配默认快照 `NULL`，不尝试从当前任务关系倒灌，避免把未知历史错误归到计划。没有快照的旧分配不计入任何计划完成度。

跨表约束“快照必须等于创建时的任务当前计划”无法仅靠 MySQL CHECK 表达，必须由同一写事务服务端保证：客户端创建批次不接受 snapshot；锁定任务读取当前 `study_plan_id`；若非空，批量验证 `study_plan_students(plan_id, student_id)` 覆盖全部目标学生；随后 INSERT 分配及快照。任何一名不在当前计划关系内即 `409 STUDENT_PLAN_NOT_LINKED` 并整体回滚。任务定义改计划只更新 `tasks.study_plan_id` 与任务版本，绝不 UPDATE 既有 `task_assignments.study_plan_id_snapshot`。

查询语义刻意分离：计划“关联任务”按 `tasks.study_plan_id` 的当前值读取；学生/计划“任务完成度”按 assignment snapshot 读取。进度为 `COUNT(status=completed) / COUNT(*)`，总数0返回 nullable/progressState=`empty`，前端显示“暂无任务”而非0%。两个计数均须在同一参数化 GROUP BY 查询生成，不做逐学生 N+1。
