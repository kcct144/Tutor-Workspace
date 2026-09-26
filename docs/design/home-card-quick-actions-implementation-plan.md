# 首页卡片悬浮任务列表与快速添加学习记录：实施计划

- 状态：已实现，待验收
- 负责人：开发负责人
- 创建日期：2026-09-26
- 关联模块：首页工作台、任务分配、学习记录、学生详情

## 目标与边界

在既有学生卡片（510px 固定高度、只在读、权限范围内、服务端分页）上增加两个高频入口：

1. 悬浮“待办任务”区域或点击“全部任务”，查看该学生全部任务分配，待办与已完成分组、可滚动。
2. 点击卡片右上角“＋”，快速新增该学生的学习记录，分类默认“缺”、科目默认“英语”、发生日期默认 Asia/Shanghai 今天。

不新增数据表、迁移、审计事件或首页 DTO 字段；不改变任务分配、学习记录、合同、计划和学生详情的既有写入与权限规则；不改变卡片点击进入详情、待办复选框完成、计划标签跳转等既有交互。

## 数据与查询

- 悬浮列表复用 `GET /api/task-assignments/list`，按 `studentId` 固定为单学生、`page=1`、`pageSize=100`，返回顺序沿用 `assignmentOrder`（待办按截止日期升序，已完成按完成时间降序）。
- 不在首页分页查询中预取全部任务，避免扩大 `HomeStudent` DTO 和首屏查询；仅在某张卡片悬浮/展开时按需请求，组件卸载或作用域停止时中止请求。
- 学习记录写入复用 `POST /api/learning-records/create` 与既有 `RecordCreate` 契约；科目可为 `null`（综合/通用），正文 1–10000 字，发生日期沿用服务端 Asia/Shanghai 判定。

## 前端结构

| 关注点         | 实现                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| 单学生任务读取 | `useStudentTasks(studentId)`：`tasks/pending/completed/loading/error/refresh`      |
| 悬浮浮层       | `StudentTasksPopover.vue`：`APopover` `trigger="hover"`，受控 `open`，内部滚动列表 |
| 快速添加表单   | `QuickRecordDialog.vue`：`AModal` + 分类/科目/日期/正文，默认值与校验              |
| 卡片触发       | `HomeStudentCard.vue`：待办区包裹浮层，新增“全部任务”按钮与“＋”按钮                |
| 页面状态与反馈 | `pages/index.vue`：持有弹窗学生与开关，保存成功后 toast 提示并依赖学生失效刷新     |

## 手机端折叠

`HomeStudentCard.vue` 用 `matchMedia("(max-width: 600px)")` 判定移动端，并维护组件本地 `expanded` 状态：

- `≤600px` 时卡片默认折叠，附加 `mobile-collapsed` 类并隐藏标签/任务/动态区，仅显示头部、`N 项待办 · M 条动态` 摘要和“点击展开”提示；卡片高度在移动端改为自适应。
- 移动端点击卡片或按 Enter/Space 切换 `expanded`，不跳转；展开后底部提供“查看详情”按钮进入 `/students/:id`，折叠时“＋”快速添加仍可用。
- `>600px` 保持原样：固定 510px、点击进入详情、悬浮查看全部任务。
- `matchMedia` 变化时刷新 `mobile`；不新增请求、后端字段或持久化状态。

## 不分页与紧凑头部

- 首页移除分页控件。`useHome` 固定 `page=1`、`pageSize=homeStudentsPageSize`（1000）；共享常量定义在 `types/api/home.ts`，`server/db/assignment-rules.ts` 用它作为首页 `pageSize` 上限传入 `parseStudentQuery`（其他查询仍为 100）。超过上限的 `pageSize` 按既有规则返回 400，不做静默截断；如需支持更多学生再单独评估。
- `HomeStudentCard.vue` 把年级与科目移入姓名所在 `<h2>`，与 7 天内到期标签同行；姓名与年级科目均单行省略并保留 `title`，桌面与移动端一致，减少头部高度。

## 交互与无障碍

- 浮层仅展示，不写任务状态；待办复选框仍走既有 `completion` 接口。
- “全部任务”按钮和“＋”按钮 `@click.stop`，避免触发卡片跳转；键盘操作时卡片跳转逻辑要求 `event.target === event.currentTarget`，嵌套控件不会误跳转。
- 悬浮触发保留点击展开入口，保证键盘/触屏可用；浮层不可用时仍可通过卡片进入学生详情查看任务。
- 快速添加弹窗保存中禁用确认/取消/遮罩关闭，失败保留草稿并提示。

## 验证

自动化覆盖 `useStudentTasks` 的加载/拆分/错误分支，以及卡片、浮层、弹窗、页面的接线断言；完整回归见 `tests/unit/home-card-quick-actions.test.ts` 与 [验收记录](../test/home-card-quick-actions-acceptance.md)。不涉及迁移、真实写入或生产数据。

## 回退

移除两个入口组件、`useStudentTasks` 与页面接线即可恢复原卡片；不产生持久化结构，无需数据清理或 down migration。
