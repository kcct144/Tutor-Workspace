# S12 首页学生动态卡片实施计划

- 状态：已实现，待验收
- 负责人：产品经理兼前端原型负责人
- 创建日期：2026-09-14
- 最后更新日期：2026-09-14
- 关联模块：首页工作台、任务分配、学习记录、学生详情

## 目标与范围

将首页学生卡片从“未完成 / 已完成任务清单”调整为“待办任务 + 最新动态”。复用现有 `task_assignments` 与 `student_learning_records` 数据，不创建表、迁移、审计事件、Redis 或独立动态表；不改变任务、学习记录、合同、计划与学生详情的已有写入规则。

## 服务端读取设计

`GET /api/home/list` 在现有单次读取事务、学生权限过滤和学生分页后，以当前页学生 ID 集合进行两组批量聚合：

1. **待办任务**：沿用 `task_assignments JOIN tasks`，仅 `pending`，按 `due_date ASC,id ASC` 取每位学生3条，并计准确 `pendingCount` / `pendingRemaining`。
2. **动态**：将以下安全投影 `UNION ALL`，按 `student_id, occurred_at DESC, source_id DESC` 使用 `ROW_NUMBER()` 每位学生截取5条：
   - `task_assignments`：仅 `status='completed' AND completed_at IS NOT NULL`，连接当前 `tasks.title`；
   - `student_learning_records`：所有记录的 `created_at`，投影 category、subject（若有）和服务端截断后的纯文本 `recordSummary`。

完成与创建时间均为 UTC `DATETIME(3)`，DTO ISO输出；前端显示前使用固定 Asia/Shanghai formatter。记录 `updated_at`、`occurred_on` 不参与“添加学习记录”事件。若历史完成记录没有 `completed_at`，不生成完成动态。无动态返回空数组。

动态查询必须限定当前页学生 ID 且继承已登录用户的学生范围，不得先全库聚合再由前端过滤。任何查询出错应使首页按现有 error 状态失败，不返回部分伪造动态。现有详情和分配页读取路径不变。

## DTO、前端与刷新

更新 `types/api/home.ts`：删除不再消费的 completed task 字段，增加 `HomeActivity` 和最多5项 `activities`；保留 pending 摘要及准确计数。相应更新 `server/db/home.ts`、首页 service/composable 和页面，不能在页面硬编码活动样本。

首页卡片包含原基础信息、待办、动态。任务完成成功后以一次 `refresh()` 为准，确保待办计数和动态使用同一服务端快照；移除仅在本地移动 pending/completed 两组的旧 `updateStudentTasks` 逻辑。写失败沿用现有提交禁用与错误反馈。

卡片本体使用非嵌套链接的 `article role="link" tabindex="0"`，以点击 / Enter / Space 跳转学生详情；复选框、计划标签 `NuxtLink` 的 click 与 keydown 必须 stop propagation。不得将 checkbox 放入 `<a>`。卡片固定高度与单行省略通过 CSS 控制，桌面与320px均不横向溢出。

## 实施切片

实施记录（2026-09-14）：保留已有学生标签、出勤及工具改动。当前首页仅全局会话鉴权；本切片在首页分页前明确按会话角色过滤（admin 全部、advisor 仅 owner_user_id=当前人员），顶部人数使用相同权限范围。不修改其他模块权限。真实数据库仅只读验证，不写测试业务数据。跨来源时间/ID完全相同时追加来源类型作为稳定排序末项。

1. 更新共享 DTO 和首页查询单元测试，保持现有字段最小投影。
2. 更新 `server/db/home.ts` 的两组批量聚合和 API contract；不改迁移。
3. 更新 `useHome` 与首页卡片，去除已完成任务组并增加动态渲染、空状态和无障碍跳转。
4. 运行单元、集成、类型、ESLint、格式、构建和桌面/375px/320px浏览器验证。

## 实施结果（2026-09-14）

四步已完成。新增 `server/db/home-activities.ts`、`app/components/HomeStudentCard.vue`、`tests/unit/home-activities.test.ts`、`tests/integration/home-activities.mjs`。更新 DTO、首页 API/查询/composable/页面、共享完成函数的最小入参类型及相关测试，删除首页专用的旧 `HomeTaskGroup.vue` 和 `studentAssignmentSummaries`。共享完成函数仅缩减所需入参字段，不改变其他页面完成语义。

S6 集成脚本首页断言已适配新投影，但其业务写入路径本轮不运行。新增 S12 真实 MySQL 测试使用只读事务并回滚，核对现有数据，不新增验收数据。`tests/unit/student-tags.test.ts` 仅适配首页查询身份参数。

类型、定向 ESLint、全量 152 项单元测试、构建和只读 MySQL 核对通过；浏览器验证和限制详见验收记录。无新迁移、依赖、数据表、API 路由，无成绩/出勤模块修改，无 Git 提交。

## 回退

仅回退首页 DTO/查询和卡片渲染，保留所有既有任务分配与学习记录数据；没有新增持久化结构，所以不执行数据清理或 down migration。
