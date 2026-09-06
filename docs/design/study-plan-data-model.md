# 学习计划文档数据模型（S4 MVP）

- 状态：已实现（开发自测通过，待验收）
- 负责人：开发负责人
- 创建日期：2026-09-05
- 最后更新日期：2026-09-06
- 关联需求：S4学习计划及学生只读关联

## 迁移与表

显式004_study_plans，仅建立以下两表；不在启动、安装、构建中迁移。InnoDB/utf8mb4，BIGINT UNSIGNED ID在API为string，时间DATETIME(3)/UTC。

study_plan_documents：id自增PK；owner_user_id非空FK users.id，RESTRICT；title VARCHAR(128)非空且trim非空，不唯一；summary VARCHAR(300)可空；content MEDIUMTEXT非空；version INT UNSIGNED默认1且CHECK>0；created_at/updated_at默认当前UTC会话时间。索引(updated_at,id)，owner外键索引由MySQL维护。

content原文保留；服务端按trim后Unicode码点1–100000校验。为避免SQL TRIM与JavaScript trim对换行的差异造成合法Markdown被拒绝，DB CHECK只强制原始内容非空及最多2MiB字节；权威trim长度规则由服务端执行。JSON请求也有2MiB传输限制。未来直接维护数据库仍应遵循同一服务端规则。

study_plan_students：plan_id、student_id非空，组合PK(plan_id,student_id)，反向索引(student_id,plan_id)，两端FK RESTRICT；created_at DATETIME(3)。关系仅代表进行中，无状态、取消、删除、历史或管理API。

## 查询、更新与投影

列表只选择id/title/summary/updated_at/version，有LIMIT/OFFSET及稳定排序，不带全文。搜索以参数化LIKE匹配title/summary/content，转义用户通配符；详情WHERE id LIMIT 1，显式JOIN负责人姓名，无敏感字段。COUNT是单行聚合且LIMIT 1。

学生关联按当前页学生ID单次JOIN两表、JSON聚合{id,title}，GROUP BY student_id，LIMIT当前页学生数。此LIMIT限制聚合行而非截断某学生的关联，不能默默丢标签；组合PK负责去重，排序用真实plan.id，不按名称合并。详情同工具传单个ID，无N+1；可供后续首页复用。

编辑仅SET content、updated_at、version=version+1，WHERE id+expectedVersion，版本上限保护，冲突409；负责人、标题、摘要、创建时间与关系不可经API变更。服务器DEV_ACTOR_ID存在校验只确认受控开发操作人，不作为登录或权限方案、不追加审计字段。

## 安全与装载

仅tutor_workspace，每次连接、DDL/DML及提交前校验DATABASE()，错库即停。连接配置只由用户.env在运行时加载，不读取/展示文件内容或输出驱动异常。所有SQL参数化；没有DELETE、DROP、USE或自动down。

固定标准种子3份文档4条关系，以S1明确合成人员/学生为引用，独立显式执行；已有表数据不匹配则停止，不覆盖、不补齐。API与浏览器测试复用既有文档，固定允许内容集合/数量检查，异常不清理持久数据；事务内约束测试回滚。

回退先停正文更新入口，退应用/学生计划聚合代码，保留两表和迁移记录。DDL隐式提交，部分建表或台账失败时停止人工核对；不自动重建或改历史校验和，任何删除须另行授权。
