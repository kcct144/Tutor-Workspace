# 登录验证与权限管理技术设计（S8 MVP）

- 状态：已确认
- 负责人：产品经理兼技术设计负责人
- 创建日期：2026-09-07
- 最后更新日期：2026-09-07
- 关联需求：登录验证、账号管理、学生归属权限、操作审计、现有 API 鉴权改造

## 1. 设计结论

S8 推荐采用以下最小架构：

- `users` 继续保存人员身份；新增一对一 `user_accounts` 保存登录账号，不把密码或角色混入业务 DTO。
- 浏览器使用 MySQL 持久化的不透明会话和 HttpOnly Cookie，不使用 JWT，不使用 localStorage，不引入 Redis。
- 角色固定为 `admin`、`advisor`，权限由服务端代码中的明确策略实现，不建动态 RBAC 表。
- 管理员拥有全局数据范围；学管师的数据范围由 `students.owner_user_id = 当前用户 ID` 决定。
- 所有业务 API 默认需要身份；公开白名单只有登录和最小健康检查。
- 当前用户 ID 从会话得到；浏览器不能声明操作人。
- 关键业务写入和审计插入处于同一 MySQL 事务；审计只记录脱敏差异。

该架构适配当前 Nuxt SPA + Nitro API + MySQL 连接池。登录模块不会放宽回环地址限制，也不构成公网部署批准。

## 2. 现状与兼容边界

### 2.1 当前结构

- `users` 只有 `id、name、created_at、updated_at`。
- `students.owner_user_id` 可空并引用 `users.id`。
- 合同 `created_by/updated_by`、学习记录 `author_user_id`、学习计划与任务定义 `owner_user_id`、任务分配 `assigned_by` 均引用 `users.id`，外键为 RESTRICT。
- 当前 POST/PATCH API 由认证中间件建立请求上下文；读接口也受会话保护。
- 当前学生、合同、记录、计划、任务和分配查询均未追加负责人权限谓词。

### 2.2 兼容原则

1. 不改写现有业务主键和人员外键，不为历史数据伪造账号或审计事件。
2. 现有 `users` 行可以没有登录账号；没有 `user_accounts` 行的人员不能登录，但历史引用继续可读。
3. 鉴权切换后，业务 API 不保留 DEV_ACTOR 回退；配置仍存在也不会授予权限。
4. 现有未分配学生保持原值，不在迁移中自动分配。
5. 任务定义现有 `owner_user_id` 在切换后冻结为负责用户；普通更新不再覆盖 owner，真实修改人改由审计记录。
6. 合同的 `updated_by` 继续更新为当前登录用户；学习记录原 `author_user_id` 不变，编辑者由审计记录。

## 3. 服务端认证架构

### 3.1 请求上下文

新增统一认证中间件，放在 `server/middleware/`，对非白名单 `/api/**` 执行：

1. 读取唯一允许的会话 Cookie。
2. 校验格式并计算 SHA-256 摘要。
3. 查询 `auth_sessions JOIN user_accounts JOIN users`。
4. 校验未撤销、未超过空闲/绝对期限、账号启用。
5. 写入只读服务端上下文：

```text
AuthContext {
  userId: string
  name: string
  username: string
  role: 'admin' | 'advisor'
  mustChangePassword: boolean
  sessionId: string       // 仅服务端数据库行 ID，不是 Cookie 原值
}
```

任何 API 都不得从 body、query、header 接受 actor 身份。业务事务开始后还要以当前 `userId` 重新确认账号启用和角色，防止“中间件通过后账号被停用”的竞争窗口。

### 3.2 公开白名单

- `POST /api/auth/login`
- `GET /api/health`

`GET /api/auth/me` 需要有效会话。未知 `/api/**` 仍由统一 404 处理，不因白名单规则泄露路由。

现有 `/api/health` 在实施时改为只返回应用是否存活，不再暴露 `mysqlConfigured`、`redisConfigured` 等内部配置状态。

### 3.3 角色策略函数

服务端提供少量可测试的明确函数，不建立动态权限配置：

- `requireAuthenticated(context)`
- `requireRole(context, 'admin')`
- `studentScope(context, alias)`：管理员无附加条件；学管师追加 `alias.owner_user_id = ?`
- `requireStudentAccess(connection, context, studentId, lock?)`
- `requireOwnedTask(connection, context, taskId)`
- `requirePasswordReady(context)`

必须修改密码的用户只允许调用 `GET /api/auth/me`、`POST /api/auth/change-password` 和 `POST /api/auth/logout`；其余接口返回 403 `PASSWORD_CHANGE_REQUIRED`。

## 4. 会话与 Cookie 设计

### 4.1 为什么不使用 JWT

本项目是同源浏览器应用，账号停用、角色改变和密码重置需要立即生效。不透明会话可以在每次请求读取服务端状态并即时撤销，而 JWT 会增加签名密钥、刷新令牌、撤销列表和过期声明同步成本。MVP 因此使用 MySQL 会话表，不引入 Redis。

### 4.2 会话标识

- 登录成功生成 32 字节 CSPRNG 随机值，以 base64url 放入 Cookie。
- 数据库只存 `SHA-256(sessionToken)` 的 32 字节结果，不保存或记录原 Token。
- 只接受服务端实际签发且表中存在的 Token；登录前后不会复用客户端提供的会话 ID。
- Cookie、日志、错误响应和审计均不得包含会话原值；结构化日志最多记录会话表 ID 或不可逆关联摘要。

### 4.3 Cookie 属性

| 环境                | Cookie 名称与属性                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 当前本机 HTTP 开发  | `tws_session`；HttpOnly、SameSite=Strict、Path=/、无 Domain、Secure=false；仅当 Host 为 `127.0.0.1` 或 `localhost` 时允许 |
| HTTPS 验收/真实试用 | `__Host-tws_session`；Secure、HttpOnly、SameSite=Strict、Path=/、无 Domain                                                |

会话绝对有效期 7 天，空闲有效期 8 小时，不提供“记住我”。服务端使用 UTC 时间判定，Cookie Max-Age 不得超过绝对期限。`last_seen_at` 最多每 5 分钟更新一次，避免每次读取都写数据库。

### 4.4 CSRF

- 登录时另生成至少 16 字节随机 CSRF Token，把摘要绑定到 `auth_sessions.csrf_token_hash`。
- 明文放入可读的 `tws_csrf` Cookie，使用 SameSite=Strict、Path=/、无 Domain；HTTPS 时设置 Secure。它不是身份凭据。
- 所有 POST/PATCH/DELETE 请求必须同时满足精确同源 `Origin` 校验，并携带 `X-CSRF-Token`，其摘要与当前会话记录一致。
- 登录接口没有现有会话，但仍要求 Origin/Host 是批准的同源回环地址；不接受跨域请求。
- Token 轮换、退出和会话撤销时同时清除两个 Cookie。Token 不写入 localStorage/sessionStorage。

### 4.5 撤销与清理

- 退出：将当前会话标记 revoked，清 Cookie。
- 停用账号、管理员重置密码：同事务撤销该用户全部会话。
- 本人修改密码：撤销其他会话并轮换当前会话 Token 与 CSRF Token。
- 角色变更：撤销全部会话，用户重新登录取得新角色。
- 请求发现会话过期、撤销或账号停用：返回 401 并清 Cookie。
- 过期/撤销会话允许由本机受控维护命令按主键小批量物理清理；不在普通请求中执行无界 DELETE。

## 5. 密码设计

### 5.1 存储

- 使用 Argon2id，最低参数 `memory=19456 KiB、iterations=2、parallelism=1`，输出长度至少 32 字节，盐至少 16 字节随机生成。
- `password_hash` 保存包含算法、参数和盐的 PHC 字符串，便于未来登录时渐进升级参数。
- 实现阶段只选择一个维护活跃、支持当前 Node 的 Argon2 库；这是 S8 唯一预期新增的安全依赖，安装需在开发任务中单独说明。
- 不使用 SHA-256、可逆加密或无盐哈希存密码；比较使用库提供的安全校验。

### 5.2 输入规则

- 15–128 个 Unicode 字符，UTF-8 最多 512 字节，不 trim、不截断。
- 允许空格、Unicode 和粘贴，不要求固定字符组合。
- 禁止与规范化用户名完全相同，并拒绝仓库内固定的高频弱密码表；弱密码表不包含用户数据且可版本化测试。
- 登录时未知用户名也执行一次固定 dummy Argon2id 校验，降低用户名枚举的时序差异。

### 5.3 登录失败限制

账号级失败窗口存入 `user_accounts`：15 分钟内累计 5 次失败后 `locked_until` 设置为服务端时间 +15 分钟。登录成功清零。不存在账号、密码错误、停用和锁定均返回相同 401 code/msg；服务端不得在响应中回显剩余次数。

当前仍仅允许回环访问，因此不增加 Redis、IP 分布式限流或 CAPTCHA。若以后允许网络访问，必须在部署评审中补充入口层速率限制和 HTTPS。

## 6. 数据模型

以下迁移编号和表结构为已确认设计；本轮只确认设计，不创建 SQL 文件、不执行数据库。

### 6.1 `user_accounts`

与 `users` 一对一；业务表仍只引用 `users.id`。

| 字段                     | 类型与约束                               | 说明                         |
| ------------------------ | ---------------------------------------- | ---------------------------- |
| user_id                  | BIGINT UNSIGNED PK，FK users.id RESTRICT | 登录用户身份                 |
| username                 | VARCHAR(64) ASCII BINARY，UNIQUE         | 服务端小写规范化后的登录账号 |
| password_hash            | VARCHAR(255) ASCII BINARY NOT NULL       | Argon2id PHC 字符串          |
| role                     | VARCHAR(16) NOT NULL CHECK               | `admin` / `advisor`          |
| status                   | VARCHAR(16) NOT NULL CHECK               | `enabled` / `disabled`       |
| must_change_password     | TINYINT(1) NOT NULL DEFAULT 1 CHECK      | 临时密码强制修改             |
| failed_login_count       | SMALLINT UNSIGNED NOT NULL DEFAULT 0     | 当前失败窗口计数             |
| failed_window_started_at | DATETIME(3) NULL                         | 失败窗口起点，UTC            |
| locked_until             | DATETIME(3) NULL                         | 临时锁定截止，UTC            |
| password_changed_at      | DATETIME(3) NOT NULL                     | 最近密码变更，UTC            |
| last_login_at            | DATETIME(3) NULL                         | 最近成功登录，UTC            |
| version                  | INT UNSIGNED NOT NULL DEFAULT 1 CHECK >0 | 管理员并发维护账号           |
| created_at / updated_at  | DATETIME(3) NOT NULL                     | UTC                          |

索引：唯一 `username`；`(status,role,user_id)` 支持账号筛选与最后管理员校验；`(locked_until,user_id)` 支持锁定检查。账号不提供删除，`ON DELETE RESTRICT`。

### 6.2 `auth_sessions`

| 字段                                  | 类型与约束                                                  | 说明                                                               |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| id                                    | BIGINT UNSIGNED AUTO_INCREMENT PK                           | 服务端会话行 ID                                                    |
| user_id                               | BIGINT UNSIGNED NOT NULL，FK user_accounts.user_id RESTRICT | 会话所属账号                                                       |
| token_hash                            | BINARY(32) NOT NULL UNIQUE                                  | 会话 Token 的 SHA-256                                              |
| csrf_token_hash                       | BINARY(32) NOT NULL                                         | CSRF Token 的 SHA-256                                              |
| created_at / last_seen_at             | DATETIME(3) NOT NULL                                        | UTC                                                                |
| idle_expires_at / absolute_expires_at | DATETIME(3) NOT NULL                                        | 双重期限                                                           |
| revoked_at                            | DATETIME(3) NULL                                            | 撤销时间                                                           |
| revoke_reason                         | VARCHAR(32) NULL                                            | logout/password_reset/password_change/role_change/account_disabled |

约束确保空闲期限不晚于绝对期限。索引：唯一 `token_hash`；`(user_id,revoked_at,absolute_expires_at,id)` 支持按用户撤销；`(absolute_expires_at,id)` 支持小批量清理。

### 6.3 `audit_logs`

| 字段          | 类型与约束                                     | 说明                                                               |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| id            | BIGINT UNSIGNED AUTO_INCREMENT PK              | 审计事件 ID                                                        |
| request_id    | CHAR(36) ASCII BINARY NOT NULL                 | 同一批次/请求关联标识，不唯一                                      |
| actor_user_id | BIGINT UNSIGNED NOT NULL，FK users.id RESTRICT | 当前登录用户                                                       |
| action        | VARCHAR(64) ASCII BINARY NOT NULL              | 固定动作码                                                         |
| entity_type   | VARCHAR(32) ASCII BINARY NOT NULL              | student/contract/learning_record/task/task_assignment/user_account |
| entity_id     | BIGINT UNSIGNED NOT NULL                       | 目标业务 ID                                                        |
| student_id    | BIGINT UNSIGNED NULL，FK students.id RESTRICT  | 可按学生追踪；账号/任务定义可空                                    |
| before_json   | JSON NULL                                      | 脱敏前值摘要                                                       |
| after_json    | JSON NULL                                      | 脱敏后值摘要                                                       |
| metadata_json | JSON NULL                                      | 批次 ID、变更字段名等非敏感元数据                                  |
| occurred_at   | DATETIME(3) NOT NULL                           | 服务端 UTC 时间                                                    |

索引：`(occurred_at,id)`、`(actor_user_id,occurred_at,id)`、`(student_id,occurred_at,id)`、`(entity_type,entity_id,occurred_at,id)`。应用不提供 UPDATE/DELETE 接口；审计保留期和归档在真实部署前另行制定。

### 6.4 现有表调整

- `students` 新增 `(owner_user_id,status,id)` 索引，支持学管师列表、首页和未分配查询。现有 `(owner_user_id,id)` 暂不删除，是否冗余由实施时 `EXPLAIN` 后另开非破坏性优化。
- `students.owner_user_id` 继续可空；管理员创建学生时保持空值，学管师创建学生时由服务端固定写为当前会话用户，浏览器不得传入该字段。管理员负责人接口可写入它，认领以 `owner_user_id IS NULL AND version=?` 条件更新。
- `students.status` 保持既有 S7 业务状态与默认值；负责人归属不是状态字段的派生值。学管师创建时不得因为 owner 已写入而改变默认状态，管理员创建时也不得因为 owner 为 null 改变默认状态。
- `tasks.owner_user_id` 不改字段；切换为稳定负责人语义，update/status 不再写 owner。
- 合同、学习记录、学习计划和任务分配不为权限增加冗余学生负责人列，统一 JOIN `students` 判定当前归属。
- 不新增 `created_by/updated_by` 到学生和记录表，真实修改人由 `audit_logs` 记录。

## 7. 迁移与初始化顺序

推荐新增三条显式迁移：

1. `008_auth_accounts.sql`：创建 `user_accounts`，不自动为既有 users 开账号。
2. `009_auth_sessions.sql`：创建 `auth_sessions`，依赖 008。
3. `010_authorization_audit.sql`：创建 `audit_logs`，增加学生负责人复合索引，依赖现有 users/students。

随后再执行初始管理员引导。引导流程：

1. 使用现有数据库预检和受限迁移清单确认目标为 `tutor_workspace`。
2. 检查启用管理员数量必须为 0。
3. 显式选择既有 users 行，或在 users 为空时创建人员行。
4. 交互式读取并确认密码，完成 Argon2id 哈希。
5. 单事务创建账号、写 `user_account.bootstrap_admin` 审计并提交。
6. 再次执行必须因已有启用管理员而停止。

回滚以退回应用为主，保留新增表、账号、会话和审计数据；不提供自动 DROP。若尚未启用业务鉴权且三表全空，是否移除仍需单独破坏性审批。

## 8. API 契约

所有接口继续使用 `{status,msg,data}`、no-store 和现有安全错误包装。认证接口不得返回 passwordHash、sessionToken、csrfTokenHash、失败计数或内部角色判断。

### 8.1 认证与本人账号

| 方法与路由                       | 请求                                   | 成功 data                                                          |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `POST /api/auth/login`           | `{username,password}`                  | `{user:CurrentUser,absoluteExpiresAt}`；同时设置会话和 CSRF Cookie |
| `GET /api/auth/me`               | 无                                     | `CurrentUser`                                                      |
| `POST /api/auth/logout`          | CSRF header                            | `{loggedOut:true}`                                                 |
| `POST /api/auth/change-password` | `{currentPassword,newPassword}` + CSRF | `{changed:true}`；轮换当前会话                                     |

`CurrentUser`：`{id,name,username,role,mustChangePassword}`。临时密码状态下不返回业务数据。

新增共享类型建议放在 `types/api/auth.ts` 和 `types/api/audit.ts`。当前通用 `ApiResponse` 定义位于 `types/api/students.ts`，S8 实施时应迁移到领域无关的 `types/api/common.ts` 并由现有业务类型复用；这属于类型归位，不改变 `{status,msg,data}` 契约。H3 事件上下文增加明确的 `AuthContext` 类型，删除业务代码对 `devActorId` 的依赖。

### 8.2 管理员账号

| 方法与路由                                | 请求                                                                | 成功 data                                            |
| ----------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| `GET /api/admin/accounts/list`            | page/pageSize/keyword?/role?/status?                                | 分页 `AccountSummary`                                |
| `POST /api/admin/accounts/create`         | `{existingUserId?,name?,username,role}`，existingUserId/name 二选一 | `AccountSummary + temporaryPassword`，密码只返回一次 |
| `PATCH /api/admin/accounts/status`        | `{userId,status,expectedVersion}`                                   | `AccountSummary`                                     |
| `PATCH /api/admin/accounts/role`          | `{userId,role,expectedVersion}`                                     | `AccountSummary`                                     |
| `POST /api/admin/accounts/reset-password` | `{userId,expectedVersion}`                                          | `{account,temporaryPassword}`，密码只返回一次        |

创建、重置和状态/角色变更均写审计。禁止停用或降级最后一个启用管理员。用户名创建后 MVP 不允许修改，避免登录标识和审计检索歧义。

### 8.3 学生负责人

| 方法与路由                     | 权限          | 请求/响应                                                       |
| ------------------------------ | ------------- | --------------------------------------------------------------- |
| `GET /api/students/unassigned` | admin/advisor | 分页最小摘要；仅 owner null + 待分配                            |
| `POST /api/students/claim`     | advisor       | `{id,expectedVersion}` → `StudentDetail`；只改 owner 和 version |
| `PATCH /api/students/owner`    | admin         | `{id,ownerUserId:null                                           | string,expectedVersion}`→`StudentDetail` |

管理员只能分配给存在且启用的账号。负责人变更不接受 actor 字段，不自动更改学生状态。

### 8.4 学生新增

| 方法与路由                  | 权限          | 请求/响应                                                                                                                           |
| --------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/students/create` | admin/advisor | 仅 S7 已允许的基础档案字段 → `StudentDetail`；服务端设置既有默认 status/version，admin 写 owner null，advisor 写 owner=current user |

请求体字段白名单不包含 `ownerUserId、actorId、status、version` 或任何聚合字段；这些字段出现时按既有未知字段规则拒绝。成功响应继续遵守 S7 联系方式投影，不因新增权限扩大明文联系方式范围。

### 8.5 审计查询

`GET /api/admin/audit/list` 仅管理员可用，支持 `page、pageSize、dateFrom?、dateTo?、actorUserId?、action?、studentId?、keyword?`，最大页大小 100；keyword 只匹配当前人员/学生展示名和动作码，不扫描 JSON 全文。输出脱敏 `AuditItem`，不返回数据库完整 JSON 中未允许的字段。

## 9. 各业务域授权改造

### 9.1 学生与首页

- `/api/home/list`：管理员查询全部在读；学管师在既有状态/年级条件上追加 owner 条件，`activeStudents` 和 total 同范围。
- `/api/students/list/detail/edit/options/update/status`：管理员全量；学管师仅本人学生。列表、聚合和 options 必须在 SQL 层过滤。
- `POST /api/students/create`：管理员创建时服务端保持 `owner_user_id=null`；学管师创建时服务端固定 `owner_user_id=当前会话用户 ID`。两种角色都沿用 S7 的默认学生业务状态；请求体不接受 owner、actor、status 或 version，负责人归属不推导或改变业务状态。
- `/api/students/unassigned` 是学管师唯一可读取非本人学生的入口，且使用独立最小 DTO。
- `GET /api/students/edit` 的明文联系方式边界由真实会话和学生范围保护；响应继续 no-store，不写日志或审计内容。

### 9.2 合同

- list/detail/subjects/create/update 均通过合同关联学生检查范围。
- 学管师的科目选项只从本人学生合同聚合；管理员为全量。
- 更新合同时若把合同改到另一学生，旧学生和新学生都必须在当前范围；学管师不能借修改 studentId 转移合同。
- `created_by/updated_by` 使用当前登录用户；创建/修改与审计同事务。

### 9.3 学习记录

- list/create 先验证目标学生范围；detail/update 通过记录 JOIN 学生验证范围。
- 学管师可编辑本人学生的既有记录，`author_user_id` 保持创建者不变；审计记录实际编辑人。
- 越权记录 ID 返回 404，不暴露正文或作者。

### 9.4 学习计划

- 管理员查看和编辑全部计划。
- 学管师列表包含 `owner_user_id=当前用户` 的计划，以及通过关系表关联到本人学生的计划；关联但非本人负责的计划只读。
- update 仅管理员或计划 owner；学生标签聚合仍按学生访问范围返回。

### 9.5 任务定义

- 管理员查看、创建、编辑、启停全部任务。
- 学管师可查看所有 enabled 任务和 owner 为自己的 disabled 任务；创建时 owner 为当前用户；编辑/启停只允许 owner 为自己。
- 任务 options 对所有已登录用户返回 enabled 任务，便于学管师复用公共定义。
- 学管师可将任意 owner 的 enabled 任务定义派发给本人学生；任务定义本身的维护权限不因可派发而放宽。
- 学管师看到的 `assignmentCount` 只统计本人学生；管理员统计全量，避免侧信道泄露他人学生数量。

### 9.6 任务分配

- list/detail/completion 通过 assignment JOIN student 检查 owner；管理员全量。
- create-batch 对所有 studentIds 在同一事务批量检查权限；只要一个不存在或越权，统一 404，整批不写。
- `assigned_by` 使用当前登录用户且不因完成/恢复而改写；完成/恢复的实际操作者进入审计。
- `task_assignments` 不新增标题、科目或说明快照；列表、学生详情和首页任务摘要 JOIN 当前 `tasks` 展示。任务定义编辑只改变后续和历史展示文本，不改写任何分配记录字段或版本。
- 首页摘要和学生详情任务区复用同一权限范围，不能因为聚合查询漏掉 owner 条件。

## 10. 审计动作与脱敏

固定动作码：

```text
student.create
student.update
student.status_change
student.owner_change
student.claim
contract.create
contract.update
learning_record.create
learning_record.update
task.create
task.update
task.status_change
task_assignment.create
task_assignment.complete
task_assignment.reopen
user_account.bootstrap_admin
user_account.create
user_account.status_change
user_account.role_change
user_account.password_reset
user_account.password_change
```

审计写入规则：

- 每次业务写请求生成 requestId；批量派发的每条 assignment 记录一条审计，共享 requestId。
- 学生联系方式只记录 `guardianPhoneChanged:true/false`，不记录原值、脱敏值或哈希。
- 学习记录正文只记录 `contentChanged` 和变更前后字符数，不保存正文。
- 密码只记录“已修改/已重置”和目标 userId，不记录密码、哈希或强度细节。
- Cookie、session token、CSRF token、数据库配置和错误堆栈绝不进入 JSON。
- before/after 只包含白名单字段；审计查询 DTO 再做一次显式投影。
- 审计 INSERT 失败时整个业务事务回滚；业务验证失败不写成功动作。

## 11. 前端接入

- 新增全局 `useAuth` 状态和路由中间件；首次进入受保护路由调用 `/api/auth/me`，不从 localStorage 恢复身份。
- 登录成功后只在内存保存 CurrentUser；会话由 HttpOnly Cookie 承载。
- API service 对写请求自动读取 `tws_csrf` Cookie并发送 `X-CSRF-Token`；页面组件不手写鉴权 Header。
- 菜单按角色隐藏账号/审计入口；服务端仍独立校验。
- 统一处理 401：清当前用户并跳转登录；403：保留登录态并展示无权限；404：沿用领域空状态。
- 账号管理和负责人选择器使用远程分页，只返回最小用户 DTO；停用账号不能作为新负责人。
- 临时密码结果只显示一次，提供一次复制按钮但不写浏览器持久存储；关闭后无法再次查看，只能重置。
- 所有异步界面具备 loading/empty/error，提交期间禁用；会话失效时不得把失败写操作显示为成功。

## 13. 失败、并发与恢复

- 账号状态、角色、学生负责人和原业务 version 均使用乐观锁；0 行更新后区分不存在、版本冲突和权限变化。
- 认领使用条件更新 `WHERE id=? AND owner_user_id IS NULL AND status='待分配' AND version=?`；竞争失败为 409。
- 管理员分配事务锁定学生和目标账号，确认账号启用后更新；不自动重试。
- 登录结果不明时前端调用 `/api/auth/me` 判断是否已有会话，不能自动重复创建无限会话。
- 数据库不可用时返回 503，不允许降级为匿名全量或 mock。
- 回退应用时保留新表和审计；若重新启用旧版无鉴权服务，只允许在回环受控合成环境短时排障，不能视为可上线状态。

## 14. 推荐开发切片

1. **S8.1 数据与引导**：008–010 迁移、迁移器白名单、Argon2id 封装、初始管理员命令和数据库约束测试。
2. **S8.2 登录闭环**：会话/CSRF、login/me/logout/change-password、中间件、登录页和 Header；默认先保护所有业务 API。
3. **S8.3 账号管理**：管理员账号列表、创建、启停、角色、重置密码、最后管理员保护及页面。
4. **S8.4 学生权限**：学生/首页 SQL 范围、未分配池、认领、管理员分配、联系方式回填边界和跨页验证。
5. **S8.5 关联业务权限**：合同、记录、计划、任务定义、任务分配的范围过滤与批量原子校验。
6. **S8.6 审计闭环**：各写服务同事务审计、管理员审计列表与敏感字段测试。

每个切片必须迁移/API/前端/测试形成可验证闭环；在 S8.2 开始保护 API 前，S8.1 的管理员账号必须已建立并验证，避免把本机操作者锁在系统外。

## 15. 已确认的实施边界

1. **学生新增**：管理员创建学生时保持未分配；学管师创建学生时服务端固定归属当前会话用户。两者均沿用既有默认业务状态，且负责人归属与学生状态独立。浏览器不能指定负责人、操作人、状态或版本。
2. **任务定义共享**：所有启用定义全员可见；管理员维护全部，学管师只维护本人负责的定义，并可将任意启用定义派发给本人学生。任务分配不保存定义快照，历史展示使用最新定义。

## 16. 安全参考

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [MDN Secure cookie configuration](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)
