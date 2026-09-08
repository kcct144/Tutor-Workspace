# 成绩记录数据模型

- 状态：已实现
- 迁移：`013_score_records.sql`、`014_audit_score_record.sql`

## 表

`score_records` 为学生一对多的独立表：

| 字段                        | 说明                                     |
| --------------------------- | ---------------------------------------- |
| `id`                        | BIGINT UNSIGNED 主键；DTO 为十进制字符串 |
| `student_id`                | 必填，外键至 `students.id`，RESTRICT     |
| `exam_date`                 | DATE，服务端限制为 1900-01-01 至上海当天 |
| `subject`                   | VARCHAR(64)，统一科目校验                |
| `record_type`               | `quiz` 或 `exam`                         |
| `exam_name`                 | VARCHAR(160)                             |
| `score` / `full_score`      | DECIMAL(10,2)                            |
| `created_by` / `updated_by` | 必填，外键至 `users.id`，RESTRICT        |
| `version`                   | 无符号整数乐观锁，初始 1                 |
| `created_at` / `updated_at` | UTC DATETIME(3)                          |

数据库 CHECK 约束科目、类型、考试名称、分数范围和版本；得分率不落表。索引覆盖学生日期、学生科目日期、科目类型日期和更新时间。没有备注、状态、作废、排名、学期或得分率字段。

## 查询与写入

列表与详情 JOIN 当前 `students` 取得学生名称，不保存名称快照。关键词仅匹配学生姓名及考试名称，LIKE 参数化并转义通配符；所有列表均带 LIMIT。

写入先验证学生，再以 `id + expectedVersion` 原子更新。创建、编辑和相应 `audit_logs` 写入使用同一个事务；审计实体类型为 `score_record`，仅记录非敏感业务摘要。审计失败会回滚成绩写入。

旧业务数据不回填；迁移后的空成绩表是预期状态。回退只撤回页面/API 接入，保留表、数据及迁移台账；无自动 DROP 或 down 迁移。
