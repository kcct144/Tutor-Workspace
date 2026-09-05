# 任务数据模型（第一版草案）

- 状态：待确认
- 负责人：产品经理兼数据库设计负责人
- 创建日期：2026-09-05
- 最后更新日期：2026-09-05
- 关联需求：P0-任务列表、P0-学生详情、P0-首页工作台

## 设计结论

当前只保留任务定义和任务分配两类实体。任务定义可复用，任务分配承载学生维度的执行状态；所有任务由学管师手动分配，不建立任务系列、系列进度或自动顺延相关表。

## 实体关系

```text
user 1 ──────── N tasks（创建/维护人）
tasks 1 ─────── N task_assignments
students 1 ──── N task_assignments
user 1 ──────── N task_assignments（分配人）
```

## `tasks` 表（任务定义）

| 字段          | 类型            | 约束     | 说明                        |
| ------------- | --------------- | -------- | --------------------------- |
| id            | BIGINT UNSIGNED | PK       | 任务主键                    |
| owner_user_id | BIGINT UNSIGNED | NOT NULL | 创建/维护人，关联 `user.id` |
| title         | VARCHAR(160)    | NOT NULL | 任务名称                    |
| description   | TEXT            | NULL     | 任务说明                    |
| subject       | VARCHAR(64)     | NULL     | 关联科目                    |
| status        | VARCHAR(16)     | NOT NULL | 草稿 / 启用 / 停用          |
| created_at    | DATETIME        | NOT NULL | 创建时间                    |
| updated_at    | DATETIME        | NOT NULL | 更新时间                    |

建议索引：`idx_tasks_owner_status (owner_user_id, status)`、`idx_tasks_subject (subject)`。

## `task_assignments` 表（任务分配）

| 字段            | 类型            | 约束     | 说明                                       |
| --------------- | --------------- | -------- | ------------------------------------------ |
| id              | BIGINT UNSIGNED | PK       | 分配记录主键                               |
| task_id         | BIGINT UNSIGNED | NOT NULL | 关联 `tasks.id`                            |
| student_id      | BIGINT UNSIGNED | NOT NULL | 关联 `students.id`                         |
| assigned_by     | BIGINT UNSIGNED | NOT NULL | 分配人，关联 `user.id`                     |
| status          | VARCHAR(16)     | NOT NULL | 待完成 / 进行中 / 已完成 / 已跳过 / 已取消 |
| assigned_at     | DATETIME        | NOT NULL | 分配时间                                   |
| due_date        | DATE            | NOT NULL | 该学生这条分配的截止日期                   |
| started_at      | DATETIME        | NULL     | 开始时间                                   |
| completed_at    | DATETIME        | NULL     | 完成时间                                   |
| completion_note | VARCHAR(500)    | NULL     | 完成备注                                   |
| updated_at      | DATETIME        | NOT NULL | 最近更新时间                               |

建议索引：`idx_assignments_student_status (student_id, status)`、`idx_assignments_task (task_id)`。首期建议限制同一学生同一任务最多存在一条未完成分配，是否允许历史完成后再次分配待确认。

## 一次批量手动分配

页面可以一次选择多个学生，但数据库仍为每个学生创建一条 `task_assignments` 记录。批量操作属于界面层便利，不引入批次实体；如果后续需要审计批次，再另行增加操作日志表。

## 一致性约束

- 只有启用状态的任务允许新建分配。
- 停用任务不删除历史定义和历史分配。
- 分配状态只影响单个学生，不影响任务定义或其他学生。
- 状态变更需要记录 `updated_at`；完成时写入 `completed_at`。
- 原型阶段由 mock service 在内存中完成校验；正式环境建议使用事务和唯一约束防止重复未完成分配。

## 后续扩展边界

如果未来重新需要连续任务，可在不破坏现有分配表的前提下增加任务组/系列表；当前不预留系列实体和自动推进字段，避免为尚未确认的规则增加复杂度。

## 待确认

- 任务是否需要截止日期、优先级、预计耗时、附件、验收人等字段。
- 任务定义编辑后，已分配任务是否同步更新，还是保存分配时的内容快照。
- 任务分配是否支持按年级、状态、科目或合同批量筛选学生。
- 任务完成由学生、学管师还是指定验收人操作。
- 首页和学生详情页展示所有分配任务，还是只展示未完成和最近完成任务。
