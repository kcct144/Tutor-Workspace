# 学习计划文档数据模型（第一版）

- 状态：待确认
- 负责人：产品经理兼数据库设计负责人
- 创建日期：2026-09-05
- 最后更新日期：2026-09-05
- 关联需求：P0-学习计划

## 设计结论

学习计划不是任务明细表，而是一份可阅读、可编辑的 Markdown 文档。原型阶段以 `StudyPlanDocument` 作为唯一数据结构，文档正文原样保存为 Markdown 字符串；页面渲染时再转换为阅读视图。

## `study_plan_documents` 概念实体

| 字段          | 类型            | 约束     | 说明                        |
| ------------- | --------------- | -------- | --------------------------- |
| id            | BIGINT UNSIGNED | PK       | 文档主键                    |
| owner_user_id | BIGINT UNSIGNED | NOT NULL | 创建/维护人，关联 `user.id` |
| title         | VARCHAR(128)    | NOT NULL | 文档标题                    |
| summary       | VARCHAR(300)    | NULL     | 列表摘要                    |
| content       | MEDIUMTEXT      | NOT NULL | Markdown 原文               |
| created_at    | DATETIME        | NOT NULL | 创建时间                    |
| updated_at    | DATETIME        | NOT NULL | 最近编辑时间                |

原型对应：`app/types/plans.ts`、`app/mocks/data/plans.json`、`app/mocks/services/plans.ts`。

## 关系与索引建议

- `user 1 ─── N study_plan_documents`：当前按单一维护人设计。
- 建议索引：`idx_plan_documents_owner_updated (owner_user_id, updated_at)`。
- 标题和摘要搜索可先使用数据库模糊查询；正文全文搜索是否启用待确认。
- 学习计划与学生的关联不在本版定案；如果一份计划可复用给多个学生，后续新增 `study_plan_students` 关联表，而不是在文档内硬编码学生 ID。

## 原型边界

- 当前只实现列表、搜索、阅读、编辑、取消和保存。
- 保存只更新当前浏览器会话中的 mock 状态，不写入数据库。
- 当前仅支持受控 Markdown 子集（标题、段落、列表、引用、粗体、行内代码、任务清单和简单表格），原始 Markdown 仍保存在编辑器中。

## 待总指挥确认的问题

1. 学习计划是否关联一个或多个学生；是否允许同一份计划复用给多个学生？
2. 正式环境是否需要新建、删除、复制、导入导出和版本历史？
3. 是否需要草稿、发布状态、审核流和自动保存？
4. Markdown 是否允许图片、链接、HTML、附件和外部资源；正文渲染放在服务端还是前端？
5. 文档访问权限按维护人、团队还是角色划分？
