# S8.7 本机日常数据操作会话交付记录

- 状态：已实现，等待受控本机会话手工复验
- 完成日期：2026-09-07
- 范围：日常数据操作脚本的本机短期会话复用；不包含权限模型扩展、账号创建、业务数据写入或迁移

## 改动范围

- 新增 `scripts/session.mjs`：仅本机 TTY 的隐藏账号/密码登录，以及 `whoami`、服务端退出 `logout`、本地紧急清理 `clear`。
- 新增 `scripts/lib/local-session.mjs`：工作区外会话状态、原子写入、严格值校验、Windows 当前用户 ACL（及 `SYSTEM`）和非 Windows `0700/0600` 权限。
- `scripts/lib/data-api.mjs`：每个 API 请求读取会话，携带 `tws_session`、`tws_csrf`；写请求附带回环 `Origin` 与 CSRF 头。`401 UNAUTHENTICATED` 或 `403 CSRF_INVALID` 清除本地状态并停止。
- `scripts/lib/data-cli.mjs`：保留 `tutor_workspace` 数据库预检，但不再将历史 `DEV_ACTOR_ID` / `actorReady` 当作日常写入资格。
- `scripts/README.md`、`skills/student-data-operations/SKILL.md`、`package.json`：同步安全边界、命令、存储位置、清理方式与会话限制。
- `tests/unit/local-data-session.test.ts` 及既有脚本测试：覆盖会话与客户端接入。

未新增依赖、迁移、种子、账号、学生或其他业务数据；未修改 `.env`。

## 使用方式

在仅回环地址启动 Nuxt 后，由实际账号持有人在本机交互式终端运行：

```powershell
node scripts/session.mjs login
node scripts/session.mjs whoami
node scripts/student-data.mjs list --page 1 --page-size 20
node scripts/session.mjs logout
```

也可使用 `pnpm data:login`、`pnpm data:whoami`、`pnpm data:logout`、`pnpm data:clear-session`。`login` 不接受账号或密码参数；账号和密码均隐藏输入。会话文件位于 `%LOCALAPPDATA%\Tutor-Workspace\data-operation-session.json`，不在工作区或 Git 中，且不存密码、用户名、用户 ID 或业务数据。

服务器判定空闲 8 小时与绝对 7 天；退出、停用、改密、角色变化、过期或 CSRF 失效时，脚本会停止并提示重新登录。网络错误和写入结果不明不自动重试。`clear` 只删除本机文件，不能确认或替代服务端撤销。

## 自动验证证据

| 项目                                                  | 结果   | 证据                                                                                 |
| ----------------------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| 登录成功/失败、无会话、过期/CSRF 失效、退出、本地清理 | PASS   | `tests/unit/local-data-session.test.ts` 的隔离临时目录与回环 HTTP 夹具               |
| Cookie、Origin、CSRF 写请求与无 `DEV_ACTOR_ID` 旁路   | PASS   | 同一单元测试；普通数据客户端仅在有效会话后发请求                                     |
| 原有预览、冲突、结果不明不重试和回读逻辑              | PASS   | `tests/unit/data-operations.test.ts`、`tests/unit/data-api-http.test.ts`             |
| S8.2 会话基础回归                                     | PASS   | `tests/unit/auth-session.test.ts`                                                    |
| 真实管理员登录 / 真实 API 角色边界                    | SKIP   | 开发未读取、索取或使用手工管理员凭据，也未创建测试账号；本机 3001 在本轮检查时不可达 |
| 真实业务数据写入                                      | 未执行 | 本切片禁止创建测试账号或写入真实业务数据                                             |

最终质量检查：`pnpm format:check`、`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 全部 PASS；全量 Vitest 为 26 文件、144 项通过。S8.7 定向与 S8.2 回归为 4 文件、33 项通过。

## 手工复验

1. 由账号持有人在回环 Nuxt 服务地址执行 `node scripts/session.mjs login`，确认账号与密码不回显。
2. 执行 `whoami`，确认仅显示用户名与角色；不要复制 Cookie/CSRF。
3. 执行允许的只读脚本，确认不再依赖 `DEV_ACTOR_ID`。对已确认的日常写入，沿用现有预览与 `--apply --confirm`，并核对服务端权限范围。
4. 执行 `logout` 后再次运行 `whoami` 或任意业务脚本，确认停止并提示登录；可另行使会话失效，确认脚本清理本地状态。

## 数据与安全边界

- 业务脚本仍先通过批准的 `tutor_workspace` 只读预检，业务访问只经本机 API；未添加直连业务 SQL 或身份伪造路径。
- ACL 只能防止其他 OS 用户读取文件；当前 Windows 用户权限内的恶意进程仍可读取短期 bearer 会话。因此禁止共享 OS 账号、复制文件、远程开放服务或把终端输出写入日志。
- 失败响应只输出静态安全消息，不输出密码、Cookie、CSRF、连接配置、原始响应或栈。

## 回退与已知限制

回退仅撤回脚本会话接入与文档；保留服务端 S8.2 会话表和既有业务数据，不提供自动删库、删表或清空会话 SQL。清除本地会话文件可用 `node scripts/session.mjs clear`；它不会撤销服务端会话。

当前没有无人值守/远程 Token、跨域访问、批量不可逆操作或 SQL 旁路。真实管理员登录及角色隔离仍须由账号持有人按上述步骤复验。
