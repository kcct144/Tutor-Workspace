# 任务数据模型（S5任务定义）

- 状态：已实现（待验收）
- 负责人：开发负责人（同步总指挥裁决）
- 创建日期：2026-09-05
- 最后更新日期：2026-09-06
- 关联需求：S5任务定义；不实施S6

005_tasks只建tasks，InnoDB/utf8mb4。id BIGINT UNSIGNED自增PK；owner_user_id非空FK users.id，ON DELETE/UPDATE RESTRICT；title VARCHAR(160)、subject VARCHAR(64)、description TEXT均非空；status VARCHAR(16)默认enabled，CHECK仅enabled/disabled；version INT UNSIGNED默认1且>0；created_at/updated_at DATETIME(3) UTC。title/subject CHECK trim后非空，description CHECK长度1–10000；完整Unicode空白/码点校验在服务端，SQL TRIM作基础保护。标题不唯一、无软删除。

索引：(updated_at,id)、(status,updated_at,id)、(subject,status,id)，覆盖默认/状态分页及科目筛选；owner FK索引由MySQL建立。不建task_assignments、系列或审计表。

每次写入由有效DEV_ACTOR_ID更新owner_user_id（创建/最近维护人）；更新/启停WHERE id+expectedVersion原子递增版本，0行区分404/409。复用事务、每次DML/commit前校验批准库；DTO不返回内部操作人，assignmentCount固定0。查询参数化且LIMIT，不读取分配mock。

迁移按manifest/版本/校验和显式执行，旧SQL不变。MySQL DDL隐式提交，部分失败停止，不自动删表或补造台账。回退应用保留tasks/数据/台账，结构修复或清理另行审批。

固定数据上限2条种子+1条API+1条浏览器，重复识别复用，不依靠标题唯一约束，不读mock、不覆盖未知数据、不自动执行；约束测试插入仅在未提交事务内回滚。S1–S4只读指纹比对。详见[任务PRD](../prd/tasks.md)。S6分配模型以实施计划为准，本次不预建。
