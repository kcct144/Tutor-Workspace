# 成绩记录实施计划（S9）

- 状态：S9.1–S9.4 已完成，等待受控环境验收
- 最后更新：2026-09-08

## 已完成切片

1. 迁移：新增 `013_score_records` 与 `014_audit_score_record`，迁移器按固定 manifest、校验和和 `tutor_workspace` 边界执行。
2. 服务端：实现规则、参数化 DAL、分页列表、详情、科目读取、新增、编辑、乐观锁和同事务审计。
3. 前端：`/scores` 与学生详情复用 `ScoreRecordsSection`，经 composable 与 service 调用真实 API；删除原型路由、JSON mock 和 sessionStorage service。
4. 测试：覆盖字段边界、派生率、筛选、分页、SQL LIKE 转义、迁移解析、版本冲突路径、审计白名单和匿名 API 边界。

## API

| 路由                                | 用途                                     |
| ----------------------------------- | ---------------------------------------- |
| `GET /api/score-records/list`       | 分页、关键词、学生、科目、类型、日期筛选 |
| `GET /api/score-records/detail?id=` | 单条回读/冲突重载                        |
| `GET /api/score-records/subjects`   | 历史成绩科目分页读取                     |
| `POST /api/score-records/create`    | 创建，HTTP 201                           |
| `PATCH /api/score-records/update`   | 编辑，须 `expectedVersion`               |

统一响应为 `{ status, msg, data }`。未知字段、非法 ID/分页/枚举/日期/小数均为 400；不存在对象为 404；版本冲突为 409；未登录或 CSRF 无效由全局鉴权返回 401/403。

## 明确延期

负责人范围授权、趋势图表、删除/作废、导入导出、批量录入、排名、学期、家长报告和任何跨领域自动联动不属于 S9。
