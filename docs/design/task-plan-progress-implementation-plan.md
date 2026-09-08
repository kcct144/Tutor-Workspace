# 任务关联学习计划与计划任务完成度实施计划

- 状态：已实现（待验收）
- 负责人：产品经理兼前端原型负责人
- 创建日期：2026-09-08
- 最后更新日期：2026-09-08
- 关联模块：任务定义、任务分配、学习计划、学生详情

## 已确认业务裁决

1. 一个任务定义可选关联 0 或 1 个计划；一份计划可关联多个任务。
2. 向已关联计划的任务分配学生时，全部目标学生必须是该计划的当前关联学生；否则整批 `409`，无部分写入。
3. 分配创建时写入不可变 `study_plan_id_snapshot`；后续任务定义改计划不追溯旧分配。
4. 某学生某计划的完成度是该计划快照分配中的 `completed / 全部`。没有分配返回 `empty`，前端显示“暂无任务”。
5. 不做任务系列、自动派发/顺延、计划正文解析进度或计划协作。

## 数据变更与迁移顺序

真实实施新增 `018_task_plan_progress.sql`，在已应用 017 后显式执行：

1. 为 `tasks` 加可空 `study_plan_id` 及 `RESTRICT` 外键、任务计划读取索引。
2. 为 `task_assignments` 加可空 `study_plan_id_snapshot` 及 `RESTRICT` 外键、`(study_plan_id_snapshot,student_id,status,id)` 聚合索引。
3. 既有记录保持 null；禁止根据“任务当前计划”回填旧分配。
4. 通过迁移器的批准库、checksum、manifest 校验后登记；MySQL DDL 隐式提交，失败即停，不能自动 down 或删除数据。

列定义与理由见 `task-data-model.md`；计划关联基础表语义见 `study-plan-data-model.md`。不新增 Redis、额外中间表或物化进度表。

## 写入事务与冲突处理

### 创建/编辑任务

`studyPlanId` 可省略或为 `null`。创建时确认计划存在且当前用户有读取/维护权限；编辑以 `id + expectedVersion` 条件更新 title、subject、description、status、study_plan_id 并原子加版本。计划不存在、无权限、版本旧分别映射 404、403、409。更新任务关系不读取或改写 assignment snapshot。

### 批量创建分配

单事务：锁定启用任务 (`SELECT ... FOR UPDATE`) → 得到当前 `study_plan_id` → 校验目标学生存在、访问权限、待完成唯一性 → 如果任务有关联计划，用一条 `study_plan_students` 查询覆盖全部目标学生 → 不足即回滚 409 → 带同一个 snapshot 批量插入。唯一冲突和版本/关系竞态不重试；返回后由客户端刷新列表、学生完成度和计划完成度。

锁定任务使“改任务计划”和“创建分配”串行：分配要么得到改前快照，要么得到改后快照，从不出现半批不同归属。`study_plan_students` 的关系被 RESTRICT 但可在未来变更；若未来有关系管理，也必须与该校验采用可重复读/锁定策略，且不得删除历史 snapshot。

## API 契约

统一现有 `{status,msg,data}`、`no-store` 和会话鉴权。

| 路由                                         | 变更/输出                                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /api/tasks/list`、`detail`              | 每项增加 `studyPlan:{id,title}                                                                            | null`。                 |
| `POST /api/tasks/create`                     | 接受 `title,subject,description,studyPlanId?`；默认 status enabled。                                      |
| `PATCH /api/tasks/update`                    | 接受既有字段加 `studyPlanId?: string                                                                      | null,expectedVersion`。 |
| `POST /api/task-assignments/create-batch`    | 客户端字段仍只有 `taskId,studentIds,dueDate`；201 data 增加 `planSnapshot:{id,title}                      | null`。                 |
| `GET /api/students/plan-progress?studentId=` | 当前学生关联计划的 `PlanTaskProgress[]`；每项 `plan,completedAssignments,totalAssignments,progressPercent | null,progressState`。   |
| `GET /api/study-plans/task-progress?id=`     | `{planId,tasks,studentProgress}`；tasks 为当前定义关联，studentProgress 为当前关联学生的快照聚合。        |

`STUDENT_PLAN_NOT_LINKED` 是 409 业务码，data 含计划摘要和在当前调用者权限内的 `invalidStudentIds`；不返回无权限学生资料。400 用于非法 ID/字段，401/403 继续由登录权限规范处理，404 为不存在，503 为存储异常。所有聚合限制页大小并以单查询或批量查询完成。

## 原型替换

已确认原型的交互将迁移到真实 `/tasks`、`/tasks/assignments`、`/plans`、`/students/:id`：

- `/tasks`：任务表和新增/编辑弹窗的计划选择。
- `/tasks/assignments`：选择任务、学生和截止日期，服务端校验计划关联并返回真实 409。
- `/students/:id`：学生计划卡及其真实任务完成度。
- `/plans`：左侧计划导航、当前关联任务及关联学生完成度。

原型的 sessionStorage、mock 数据、prototype 路由和服务已删除；页面不保留“不会永久保存”的提示或双轨数据源。

## 交付切片与回退

1. **P1 数据库**：018、规则和受权限保护的 SQL 查询；迁移前备份与人工审批。
2. **P2 任务接口**：任务关联字段、选项、版本冲突和 DTO。
3. **P3 分配事务**：计划校验、快照、409 与审计。
4. **P4 查询与页面**：学生/计划进度投影、真实页面替换 mock、无障碍和窄屏验收。
5. **P5 测试**：迁移、事务、权限、历史语义、浏览器端到端。

应用回退先关闭任务计划编辑和进度入口，保留真实迁移列与历史数据；不写 down、不清快照、不将快照转换回当前任务关系。S11 原型资产已被真实实现替代，不作为回退路径。

## 上线前置与开放问题

无阻塞性的业务裁决。本期真实写入必须接入已规划的登录、学生/计划/任务数据权限和审计；在此之前不得把 mock 写入通道暴露为真实 API。
