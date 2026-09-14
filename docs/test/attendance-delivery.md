# S10 出勤管理交付记录

- 日期：2026-09-08
- 状态：实现与结构迁移完成，受控账号页面写入验收待补。

## 改动范围

- 新增 `attendance_records` 的版本化迁移及 `attendance_record` 审计实体白名单迁移。
- 新增出勤规则、查询/写入数据访问层和月度、今日汇总、单元格保存 API。
- 将 `/attendance` 接至真实服务与乐观锁保存；移除仅属于出勤的 mock、原型路由及匿名路由豁免。
- 更新出勤 PRD、模型、实施计划、验收标准，并新增单元测试。
- ATT-P2-01 / ATT-P3-01 已修复：更新改为原子版本条件写入，测试补齐并发与审计回滚覆盖；详细证据见 `s10-attendance-remediation-delivery.md`。

## 迁移证据

执行 `pnpm db:migrate` 时迁移器先报告数据库边界校验通过，随后 `015_attendance_records` 与 `016_audit_attendance_record` 应用成功。第二次执行时二者均报告“已应用，跳过”。迁移只创建结构和迁移台账记录，没有创建学生、账号、出勤或其他业务数据。

## 自动化验证

| 项目          | 结果            | 证据                                                                                                      |
| ------------- | --------------- | --------------------------------------------------------------------------------------------------------- |
| 出勤单元测试  | PASS            | `pnpm vitest run tests/unit/attendance.test.ts`：1 文件、5 测试通过                                       |
| 全量单元测试  | PASS            | `pnpm test`：24 文件、126 测试通过                                                                        |
| 类型检查      | PASS            | `pnpm typecheck` 通过                                                                                     |
| 生产构建      | PASS            | `pnpm build` 通过                                                                                         |
| S10 源码 Lint | PASS            | 仅检查 S10 及必要共享文件无错误                                                                           |
| 全仓 Lint     | BLOCKED（既有） | 仅未跟踪 `database/seeds/reading-composition-plan.mjs` 的 3 个 `no-useless-assignment`；未修改该脚本      |
| 全仓格式检查  | BLOCKED（既有） | 仅未跟踪的 `busuu-plan.mjs`、`duolingo-plan.mjs`、`reading-composition-plan.mjs` 未格式化；未修改这些脚本 |
| HTTP 鉴权     | PASS            | 未登录读取 `GET /api/attendance/month?month=2026-09` 返回 401 JSON `UNAUTHENTICATED`                      |
| 浏览器路由    | PASS            | 未登录访问 `/attendance` 安全跳转 `/login?redirect=/attendance`                                           |

规则测试覆盖固定状态/时段、未来日期限制、版本字段、未知字段、月份筛选、LIKE 参数转义、DTO 投影、迁移解析和审计实体白名单。

## 未验证项

当前未提供可用于浏览器验收的受控登录账号，也未创建学生或出勤数据（本切片禁止创建）。因此，真实授权后月度列表、单元格创建/更新、数据库唯一冲突、审计同事务、320px/375px/桌面已登录矩阵交互均标记为 **SKIP**，不是通过。后续应在批准的非业务验收数据上执行这些场景。

## 2026-09-13：取消排课补充

总指挥确认“无课”采用 `null` 空单元格，不新增第六种出勤状态或迁移。页面为现存“有课”单元格提供“取消排课（恢复无课）”；服务端 `DELETE /api/attendance/record` 仅在 `scheduled` 和 `expectedVersion` 同时匹配时删除记录。其他状态拒绝清空，陈旧或不存在记录返回 409。删除与 `attendance_record.cancel_schedule` 审计同事务，审计失败时记录回滚。

自动化验证：`pnpm vitest run tests/unit/attendance.test.ts` 为 **14/14 PASS**，覆盖取消成功、非“有课”拒绝、陈旧版本冲突和审计失败回滚；没有运行迁移或写入真实出勤数据。

## 数据边界与回退

所有数据库操作经迁移器的 `tutor_workspace` 校验；未读取或修改 `.env`，未执行业务数据写入。回退只撤回应用页面/API 接入，保留表、迁移台账与审计结构；不提供自动删表、清库或数据清理命令。
