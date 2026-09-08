# 成绩记录 S9 交付记录

- 日期：2026-09-08
- 状态：代码、迁移与自动化验证完成；受控真实写入验收待执行

## 交付范围

- 新增 `score_records` 表及 `score_record` 审计实体约束迁移。
- 新增成绩记录规则、DAL、真实 API、service、composable 与复用页面区域。
- `/scores` 已纳入主导航；学生详情可读取同一真实数据源。
- 删除成绩专用 JSON mock、浏览器 sessionStorage service 与 `/prototype/scores`。

## 迁移验证

在迁移器的批准库边界校验通过后：

- `013_score_records` 首次应用成功；
- `014_audit_score_record` 首次应用成功；
- 第二次执行均按 checksum 安全跳过；
- 未创建任何成绩、学生、账号或其他业务测试数据。

## 自动化与只读验证

| 项目                                 | 结果                       |
| ------------------------------------ | -------------------------- |
| 成绩规则单元测试                     | PASS，6 项                 |
| 全量单元测试                         | PASS，23 文件、121 项      |
| 类型检查                             | PASS                       |
| 生产构建                             | PASS                       |
| 未登录 `GET /api/score-records/list` | PASS，401 且 JSON envelope |
| 浏览器访问 `/scores`                 | PASS，跳转至安全站内登录页 |
| 迁移重复执行                         | PASS                       |

全仓格式与 Lint 未完全通过的唯一已知原因是未跟踪且本次未修改的计划种子脚本：`database/seeds/busuu-plan.mjs`、`database/seeds/duolingo-plan.mjs`、`database/seeds/reading-composition-plan.mjs`；其中最后一个还包含三个既有 ESLint `no-useless-assignment` 错误。

## 未执行项

未登录真实管理员，未写入成绩，因此新增、编辑、审计同事务、版本冲突、CSRF 写入拒绝及 320/375px 已登录交互需在获准的受控验收数据下继续验证。不得将这些项表述为已通过。

## 回退

优先关闭成绩页面与 API 接入，保留 `score_records`、审计记录和迁移台账；不提供自动删表、清库或数据回退。
