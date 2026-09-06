# 学生数据模型与档案维护（S1–S6 查询 + S7 档案维护）

- 状态：已确认（现有 S1–S6 数据模型已实现；S7 学生档案写模型已裁决）
- 负责人：产品经理兼数据库设计负责人
- 创建日期：2026-09-05
- 最后更新日期：2026-09-06
- 关联需求：S1 学生基础、S2 合同聚合、S3 学习记录、S4 学习计划、S6 任务分配、S7 学生档案维护

## 1. 当前 students 表基线

学生表使用 InnoDB、utf8mb4，BIGINT UNSIGNED 主键，API 以十进制 string 传输；日期为 DATE，时间为 UTC `DATETIME(3)`。不存在软删除字段、删除接口或级联删除；所有外键采用 `ON DELETE/UPDATE RESTRICT`。

| 字段           | 类型与约束                                  | 档案维护说明                       |
| -------------- | ------------------------------------------- | ---------------------------------- |
| id             | BIGINT UNSIGNED，自增 PK                    | 服务端生成，只读                   |
| owner_user_id  | BIGINT UNSIGNED NULL，FK users.id，RESTRICT | 当前负责人，只读；新增为空         |
| name           | VARCHAR(64) NOT NULL                        | trim 后 1–64 个 Unicode 字符       |
| grade          | VARCHAR(16) NOT NULL                        | 仅初一、初二、初三、高一、高二     |
| class_name     | VARCHAR(32) NULL                            | 可空                               |
| school         | VARCHAR(128) NULL                           | 可空                               |
| gender         | VARCHAR(8) NULL                             | 非空时仅男/女                      |
| enrolled_at    | DATE NULL                                   | 可空；服务端校验合法日期           |
| guardian_name  | VARCHAR(64) NULL                            | 可空                               |
| guardian_phone | VARCHAR(32) NULL                            | 可空；服务端校验格式，原值保存     |
| note           | VARCHAR(500) NULL                           | 可空                               |
| status         | VARCHAR(16) NOT NULL                        | 仅在读、待分配、已结课             |
| created_at     | DATETIME(3) NOT NULL                        | 服务端生成，只读                   |
| updated_at     | DATETIME(3) NOT NULL                        | 每次成功档案/状态修改更新          |
| version        | INT UNSIGNED NOT NULL DEFAULT 1，CHECK > 0  | 乐观锁版本，新增/更新/状态更新返回 |

现有索引 `(grade,status,id)`、`(owner_user_id,id)` 和主键继续保留。姓名、学校、班级和联系方式不建立唯一约束，允许同名学生、兄弟姐妹和转学生共存。新增 `version` 不改变外键关系，也不新增 owner 或审计字段。

## 2. 派生字段与投影边界

学生表不保存以下冗余字段：科目、到期时间、最近跟进、学习计划、任务数量或任务状态。

- 科目：从有效合同按学生批量去重聚合。
- 到期时间：从有效时间合同取最早 `end_date`；无有效时间合同为 null。
- 最近跟进：从学习记录取 `MAX(occurred_on)`；无记录为 null。
- 学习计划：从 `study_plan_students` 与文档表按 `{id,title}` 聚合；无关联为空数组。
- 任务：从 `task_assignments` 读取；学生状态变化不修改任务记录。

列表不查询或返回任何联系方式字段（包括 `guardianPhoneMasked`）；详情及写成功响应只返回 `guardianPhoneMasked`；列表不返回监护人姓名和备注，详情返回监护人姓名和备注。仅编辑侧栏打开时调用独立 `GET /api/students/edit`，在当前无登录的受控合成环境返回明文 `guardianPhone`。新增/编辑档案请求不得传入上述派生字段、owner 或其他关联表字段。

## 3. S7 写入模型

### 3.1 新增

`POST /api/students/create` 只写 `students` 一行。请求允许：

```text
name, grade, school?, className?, gender?, enrolledAt?,
guardianName?, guardianPhone?, note?, confirmPossibleDuplicate?
```

服务端始终以“待分配”创建；客户端不得传入 `status`，即使传入也按未知/禁止字段返回 400。`ownerUserId` 永远由服务端置空，不接受浏览器传入。完全相同姓名、学校、班级首次创建返回 409；用户带 `confirmPossibleDuplicate: true` 后才允许继续。成功返回 201 和完整 `StudentDetail`（含 `version=1` 及派生字段空状态）。不创建合同、记录、计划关系或任务分配。

### 3.2 编辑回填视图

`GET /api/students/edit?id=<id>` 仅在用户打开编辑侧栏时调用，返回 `StudentEditView`：

```text
id, name, grade, className, school, gender, enrolledAt,
guardianName, guardianPhone, note, version
```

该 DTO 不包含合同、学习记录、计划、任务或 owner 写入字段；`guardianPhone` 明文仅限当前无登录的受控合成环境。未来真实试用必须先由鉴权方案替换该边界，再允许返回明文编辑值。

### 3.3 编辑基础档案

`PATCH /api/students/update` 请求为 `id + expectedVersion` 加姓名、年级、学校、班级、性别、入学日期、监护人姓名、联系方式和备注。状态、负责人、建档时间、version、科目、到期时间、最近跟进、计划和任务均拒绝写入。

服务端使用 `UPDATE students SET ..., version=version+1, updated_at=... WHERE id=? AND version=?`；影响行数为 0 时再查询区分 404 和 409。成功返回更新后的 `StudentDetail`。

### 3.4 状态变更

`PATCH /api/students/status` 请求为 `id,status,expectedVersion`，状态仅三种枚举。状态写入与基础档案编辑分离，使用同样的版本条件更新；不修改任何合同、学习记录、计划关系或任务分配。目标状态与当前状态相同视为幂等，不增加 version。

## 4. 约束与校验

- 姓名 trim 后非空且最多 64 个 Unicode 字符。
- 年级为固定枚举；性别为空或男/女。
- 学校最多 128、班级最多 32、监护人姓名最多 64、备注最多 500 个 Unicode 字符。
- 联系方式 trim 后为空或最多 32 字符；允许数字、空格、`+`、`-`、括号，至少包含 6 位数字；不强制限定为大陆手机号。
- 入学日期为空或 `1900-01-01` 至服务端 Asia/Shanghai 当天；不接受浏览器日期作为权威“今天”。
- 新增请求不接受 status，服务端固定写入待分配；状态更新请求必须显式传入合法状态。
- JSON 请求体设置有界大小，超限返回 413；未知字段返回 400，不静默忽略。
- 可能重复检查使用姓名、学校、班级 trim 后的完全相同组合；首次返回 409 候选提示，不建立唯一约束。确认后服务端重新校验并执行插入。

## 5. version 字段迁移策略（已确认）

S7 批准使用 `version`，新增迁移文件 `database/migrations/007_students_version.sql`：

1. 执行前校验批准数据库、迁移台账和 students 当前结构；不切库、不清库。
2. 执行 `ALTER TABLE students ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1`，并增加 `CHECK (version > 0)`；不修改既有数据值。
3. 迁移后查询列定义、非空约束和全部历史行，确认 version 均为 1 或合法正整数，再写入迁移台账 checksum。
4. 应用先部署读兼容（缺失 version 时不启用写入口），迁移确认后再开放写接口，避免旧应用覆盖新版本。
5. 回滚优先回退应用并保留 version 列；删除列属于不可逆结构变更，不作为自动 down，需总指挥另行批准并确认没有新版本消费者。

该迁移只触及 students 表，不新增或修改合同、记录、计划、任务及其外键。单行写入使用事务，提交前后按规则复核数据库边界；失败回滚并返回安全错误，不自动重试。

## 6. 并发、操作人与安全

- 编辑和状态更新使用 `expectedVersion` 乐观锁；旧版本统一 409，前端保留草稿并提示重载，不自动覆盖。
- 同一学生的档案编辑和状态更新共享 version，任一成功都会使另一窗口的旧草稿冲突。
- 无登录阶段由服务端环境变量 `DEV_ACTOR_ID` 产生开发操作上下文，用于请求校验和结构化日志；浏览器不得传 actorId、ownerUserId 或 author 字段。
- 本模块不新增 `created_by/updated_by` 和审计表，不能把 DEV_ACTOR_ID 解释为真实权限。未来接入鉴权时替换上下文来源并映射现有 users；操作历史归后续权限/审计模块，不在本轮处理。
- 联系方式原值仅在受控环境通过 `StudentEditView` 用于编辑；列表与详情只返回脱敏值。真实用户试用前必须由鉴权方案替换该明文回填边界。

## 7. 关系保护与状态影响

学生表与合同、学习记录、计划关系、任务分配的外键均为 RESTRICT。本模块不提供删除、解除关联、迁移或级联操作。学生改为已结课仅改变 `students.status`：

- 合同有效性仍按合同自身日期/课时规则计算，不自动作废；即使存在有效合同，服务端也不因结课或恢复在读而阻断状态更新。
- 学习记录、学习计划和任务分配完整保留；已结课学生仍可从列表筛选并进入详情。
- 首页只展示在读学生；列表默认展示全部状态；详情聚合历史关联照常读取。
- 新学生无关联数据时，所有聚合查询返回空数组或 null，不创建占位行。

## 8. 已确认基线与上线前置条件

- `students.version` 和 `007_students_version.sql` 已批准；迁移失败时停止并人工核对，回滚优先回退应用并保留 version 列。
- 新增成功后跳转 `/students/:id`；服务端固定以待分配创建，客户端不传 status。
- 同名同校同班首次创建返回 `409 STUDENT_POSSIBLE_DUPLICATE`，确认后带 `confirmPossibleDuplicate: true` 才能继续；候选不含联系方式。
- 列表不查询或返回任何联系方式字段；详情及写成功响应只返回 `guardianPhoneMasked`；编辑侧栏单独请求 `StudentEditView`，明文仅限当前无登录的受控合成环境。
- 入学日期固定为 `1900-01-01` 至服务端 Asia/Shanghai 当天。
- 结课与恢复在读均允许，服务端不因有效合同或待完成任务额外阻断；不删除、软删除或解绑任何关联数据，已结课→在读仅是状态变更而非删除恢复。
- 当前负责人只读；本轮不增加操作人字段、审计历史或负责人分配。
- 真实用户试用前必须补齐登录鉴权、权限隔离和操作审计，并替换受控无登录明文回填边界。

## 2026-09-06 总指挥验收修复裁决（D01 / D08）

- 沿用公共错误码：404 `NOT_FOUND`、409 `VERSION_CONFLICT`、413 `PAYLOAD_TOO_LARGE`、503 `DEV_ACTOR_UNAVAILABLE` / `STORAGE_UNAVAILABLE`；400 仍为 `VALIDATION_ERROR`，重复提示为 `STUDENT_POSSIBLE_DUPLICATE`。不新增等价错误体系。
- 学生列表不查询或返回联系方式，包括脱敏字段；详情及创建/更新/状态成功响应返回 `guardianPhoneMasked`。仅编辑回填 `GET /api/students/edit` 返回原值 `guardianPhone`，维持 no-store。DTO 分离不是身份授权，只限受控合成环境。
- 独立验收报告保留原始证据，以上为本次契约裁决，不追溯篡改测试结论。
