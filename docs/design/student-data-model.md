# 学生相关数据模型设计（第一版）

- 状态：待确认
- 负责人：产品经理兼数据库设计负责人
- 创建日期：2026-09-05
- 最后更新日期：2026-09-05
- 关联需求：P0-学员管理、P0-学生详情

## 设计范围

本版只确定学管师与学生的基础关系，并为学生详情页的学习记录提供数据模型。任务和学习计划涉及更多业务规则，本版只保留 mock 展示，不确定真实表结构。

## 实体关系

```text
user 1 ──────── N students
user 1 ──────── N student_learning_records（记录人）
students 1 ──── N student_learning_records
```

## `user` 表（学管师）

| 字段       | 类型            | 约束               | 说明                     |
| ---------- | --------------- | ------------------ | ------------------------ |
| id         | BIGINT UNSIGNED | PK                 | 学管师主键               |
| name       | VARCHAR(64)     | NOT NULL           | 姓名                     |
| phone      | VARCHAR(32)     | NULL               | 联系电话，是否必填待确认 |
| email      | VARCHAR(128)    | NULL               | 邮箱，是否需要待确认     |
| status     | TINYINT         | NOT NULL DEFAULT 1 | 1 在职，0 停用           |
| created_at | DATETIME        | NOT NULL           | 创建时间                 |
| updated_at | DATETIME        | NOT NULL           | 更新时间                 |

## `students` 表（学生）

| 字段              | 类型            | 约束     | 说明                                 |
| ----------------- | --------------- | -------- | ------------------------------------ |
| id                | BIGINT UNSIGNED | PK       | 学生主键                             |
| owner_user_id     | BIGINT UNSIGNED | NOT NULL | 当前负责学管师，关联 `user.id`       |
| name              | VARCHAR(64)     | NOT NULL | 学生姓名                             |
| grade             | VARCHAR(16)     | NOT NULL | 年级，枚举值待确认                   |
| class_name        | VARCHAR(32)     | NULL     | 班级                                 |
| school            | VARCHAR(128)    | NULL     | 学校                                 |
| gender            | VARCHAR(8)      | NULL     | 性别                                 |
| expiry_date       | DATE            | NULL     | 服务或学习计划到期日期               |
| enrolled_at       | DATE            | NULL     | 建档时间                             |
| guardian_name     | VARCHAR(64)     | NULL     | 主要监护人                           |
| guardian_phone    | VARCHAR(32)     | NULL     | 监护人联系方式，需按隐私策略保护     |
| note              | VARCHAR(500)    | NULL     | 学生备注                             |
| status            | VARCHAR(16)     | NOT NULL | 在读 / 待分配 / 已结课               |
| last_follow_up_at | DATETIME        | NULL     | 最近跟进时间，可由记录聚合或冗余维护 |
| created_at        | DATETIME        | NOT NULL | 建档时间                             |
| updated_at        | DATETIME        | NOT NULL | 更新时间                             |

建议索引：`idx_students_owner_status (owner_user_id, status)`、`idx_students_grade (grade)`、`idx_students_last_follow_up (last_follow_up_at)`。

## `student_learning_records` 表（学习记录）

| 字段           | 类型            | 约束     | 说明                   |
| -------------- | --------------- | -------- | ---------------------- |
| id             | BIGINT UNSIGNED | PK       | 记录主键               |
| student_id     | BIGINT UNSIGNED | NOT NULL | 关联 `students.id`     |
| author_user_id | BIGINT UNSIGNED | NOT NULL | 记录人，关联 `user.id` |
| category       | VARCHAR(8)      | NOT NULL | 缺 / 补 / 强           |
| content        | TEXT            | NOT NULL | 学习表现或沟通内容     |
| occurred_on    | DATE            | NOT NULL | 事情发生日期           |
| created_at     | DATETIME        | NOT NULL | 记录创建时间           |
| updated_at     | DATETIME        | NOT NULL | 修改时间               |

建议索引：`idx_learning_records_student_date (student_id, occurred_on)`、`idx_learning_records_student_category (student_id, category)`。

## 暂不定案

- 物理表名使用 `user` 还是改为更明确的 `users`；若使用 `user`，SQL 中统一加反引号。
- 一个学生是否允许多个学管师共同负责，当前按单一 `owner_user_id` 设计。
- 学习记录是否允许编辑、删除，以及是否需要软删除和操作审计。
- 年级和记录分类是否使用字典表，而不是代码枚举。
- 任务、学习计划与学生的关系、归属和状态规则暂不设计。
