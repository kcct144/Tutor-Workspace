# 学习记录科目字段：开发交付说明

- 状态：已实现，迁移已应用，待页面验收
- 日期：2026-09-07
- 范围：学习记录的可空科目、统一校验、筛选与详情页展示；不改变合同、任务、计划或学生聚合规则。

## 数据契约

`student_learning_records.subject` 为可空 `VARCHAR(64)`。`NULL` 表示“综合/通用跟进”；非空值复用合同与任务定义的科目规则：去除首尾空白后为 1–64 个 Unicode 字符。学习记录不关联特定合同，不能因保存记录修改合同、任务或学习计划；现有记录不回填，迁移后仍保持 `NULL`。

`GET /api/learning-records/list` 新增可选 `subject` 筛选参数。新增、编辑和列表 DTO 均包含 `subject: string | null`；筛选未指定时同时返回有科目和综合记录。科目选择器复用现有合同科目选项接口；当前值不在选项页中时仍以原值回填，避免编辑时丢失历史值。

## 迁移与回退

新增显式迁移 `012_learning_record_subject`：仅在 `student_learning_records` 增加可空字段、`chk_records_subject` 与 `(student_id, subject, occurred_on, id)` 索引。迁移器在执行每项 DDL 前后校验 `DATABASE() = 'tutor_workspace'`，并校验迁移台账、字段、CHECK 与索引；重复运行按 checksum 跳过。

执行命令：

```powershell
pnpm db:migrate
```

回退仅回退应用读写入口，保留字段、索引和现有数据；不提供自动删列或数据回填/清理。

## 自测范围

- 单元测试覆盖有科目、无科目、空白/超长/类型非法科目、科目筛选的参数化绑定、DTO 投影、编辑保留与迁移白名单。
- 固定学习记录种子增加有科目与综合记录样例；不在本次开发中执行种子或写入业务数据。
- 浏览器页增加科目列、科目筛选和可清空选择器；保存沿用既有 loading、冲突草稿和刷新机制。

## 本次验证记录

- `pnpm db:migrate`：通过批准数据库边界校验，旧迁移均按 checksum 跳过，`012_learning_record_subject` 应用成功。
- 再次执行 `pnpm db:migrate`：通过相同边界校验，`012_learning_record_subject` 按 checksum 跳过，确认可重复安全。
- 记录领域定向 Vitest：3 个文件、11 项通过，覆盖有科目、无科目、非法科目、参数化科目筛选、编辑草稿和迁移白名单。
- `pnpm test`：22 个文件、115 项通过；`pnpm typecheck` 与本次文件的定向 ESLint 均通过；`pnpm build` 通过。
- 全仓 `pnpm lint` 和 `pnpm format:check` 未通过，原因仅为开发开始前已存在的未跟踪业务种子脚本：`database/seeds/reading-composition-plan.mjs`（Lint 3 项未使用赋值），以及 `busuu-plan.mjs`、`duolingo-plan.mjs`、`reading-composition-plan.mjs`（Prettier）。这些文件不属于本次范围，未被修改。
- 未运行会写固定验收记录的 `test:s3:api`，以遵守本次“不创建真实业务测试数据”边界；也未运行种子。
- 浏览器交互仍待在有效登录会话下人工验收；本报告不将该项表述为已通过。
