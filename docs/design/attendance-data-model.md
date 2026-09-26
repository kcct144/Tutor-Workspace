# 出勤数据模型（S10 已实现）

## `attendance_records`

迁移：`015_attendance_records.sql`。只允许由显式迁移器在 `tutor_workspace` 应用。

| 字段                        | 说明                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `id`                        | `BIGINT UNSIGNED` 主键，对外为十进制字符串                           |
| `student_id`                | 学生外键，`RESTRICT`                                                 |
| `attendance_date`           | `DATE`，数据库下限为 `1900-01-01`                                    |
| `period`                    | `morning` / `afternoon` / `evening`                                  |
| `status`                    | `scheduled` / `present` / `sick_leave` / `personal_leave` / `absent` |
| `created_by` / `updated_by` | 当前登录人员外键，`RESTRICT`                                         |
| `version`                   | 无符号正整数乐观锁，初始为 1                                         |
| `created_at` / `updated_at` | `DATETIME(3)`                                                        |

数据库约束包括固定时段和状态检查、正版本检查，以及唯一键 `(student_id, attendance_date, period)`。索引包括月度/时段/状态组合、学生日期和更新时间。过去、当天与未来日期均使用同一组固定状态，不按日期改变状态选项。

“无课”是空单元格而不是第六种 `status`：没有 `attendance_records` 行即表示无课或未安排。任意已保存状态都可以在乐观锁版本匹配时清除并恢复为空；陈旧版本返回冲突，不删除当前记录。

## 审计

迁移 `016_audit_attendance_record.sql` 将 `attendance_record` 加入现有 `audit_logs.entity_type` 白名单。出勤创建、更新与清空均在同一数据库事务内写审计，摘要只包含日期、时段和状态；清空操作使用 `attendance_record.clear`，审计后值为 `status: null`。不会写入联系方式、Cookie、CSRF 或登录秘密。

## 并发

新建使用唯一键阻止同一格重复创建，并把并发重复映射为版本冲突。更新先进行非锁定读取以形成审计前值，再以学生、日期、时段、版本和“目标状态不同”作为单条原子更新条件；不会发生共享锁升级。条件不满足后仅作独占当前读：同版本且同目标状态原样成功返回，不增加版本、更新时间或审计；其余情况返回版本冲突。版本达到无符号上限安全返回冲突，不发生溢出。
