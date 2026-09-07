# 工作区数据操作脚本

状态：S8.7 已接入 S8.2 本机短期登录会话。工具由开发对话维护并完成相关自测后供学管助理使用；工具开发不代表任何业务已执行。

依据：[工具计划](../docs/design/data-operations-tooling-plan.md)、[交付与证据](../docs/test/data-operations-tooling-delivery.md)、各领域已确认 PRD。脚本不替代服务端校验、身份授权或用户确认。

## 前置条件与启动故障处理

- 使用项目现有 Node.js 24、pnpm 和已安装依赖；脚本复用仓库 TypeScript 纯校验函数，需要 Node 原生类型擦除支持。
- 用户只在本机 `.env` 配置已批准的 `tutor_workspace`。不要读取、展示、复制 `.env` 或连接信息到聊天/日志，不修改它。
- 数据库预检是工作区批准的唯一只读 SQL 前置入口；业务脚本只调用本机 API，不直接执行 SQL。

```powershell
node scripts/db-preflight.mjs
node scripts/db-preflight.mjs --json
```

每次数据操作自动重做预检；边界不匹配或预检失败立即停止，只报告安全错误。预检中的 `actorReady` 是历史兼容信息，既不授予 HTTP 身份，也不再是写入条件。输出只有批准边界标志、迁移/学生/人员数量和 actorReady，不输出实际操作人 ID。

## 本机登录会话（S8.7）

在另一个仅回环终端启动应用后，先由实际账号持有人交互登录。账号与密码均为隐藏输入；不接受命令参数、环境变量、`.env`、文件、聊天文本或标准输入中的密码。

```powershell
pnpm dev --host 127.0.0.1 --port 3000

# 另一个本机 TTY；首次使用或会话失效后执行
node scripts/session.mjs login
node scripts/session.mjs whoami
node scripts/student-data.mjs list --page 1 --page-size 20

# 已确认退出：先撤销服务端会话，再清除本地状态
node scripts/session.mjs logout
# 服务端不可用但必须丢弃本机状态时：只清本地文件，服务端会话会在其期限内自然失效
node scripts/session.mjs clear
```

- 会话文件固定在工作区外：Windows 为 `%LOCALAPPDATA%\Tutor-Workspace\data-operation-session.json`。它不是 Git 工作区的一部分，绝不会被提交；文件不保存密码、用户名、用户 ID 或业务数据。
- 脚本用 Windows ACL 移除继承，仅授予当前系统用户和 `SYSTEM` 访问；非 Windows 环境使用目录 `0700`、文件 `0600`。目录权限无法建立时，脚本拒绝保存或使用会话。
- 文件中的 Cookie/CSRF 是短期 bearer 凭据：能以当前系统用户身份读取该文件或运行其进程的本地恶意程序仍可能在失效前冒用会话。本机单人、回环访问是前提，不能复制会话、共享 Windows 账号或公开服务。
- 服务端是期限的唯一裁决：空闲 8 小时、绝对 7 天，以及退出、账号停用、改密、角色变化或 CSRF 失效后，下一次脚本调用会停止并清除本地状态，提示重新登录。脚本不自动重试。
- `logout` 网络结果不明时会保留本地状态并停止；不要猜测退出是否完成。仅在用户确认需要丢弃本机状态时使用 `clear`。

若 3000 无监听，不应把连接失败理解成空列表，也不启动数据库或恢复种子。端口已占用时先确认服务归属；不要停止他人服务。可为该终端显式选择空闲本机端口（例如 3001），再以相同地址重新登录：`$env:STUDENT_DATA_BASE_URL = 'http://127.0.0.1:3001'`。只允许 HTTP 的 127.0.0.1、localhost（归一到回环 IP）、[::1]；禁止远端、URL 凭据、路径/查询串和重定向。HTTP 每请求 10 秒、最大响应 2 MiB。不得以 `DEV_ACTOR_ID`、伪造头、直连 SQL 或临时 curl 绕过登录。

## 必须遵循的自然语言操作流程

1. 查询定位：姓名仅用于搜索；同名时展示 ID、姓名、年级、学校、班级等允许摘要，让用户选定稳定 ID。不能选第一条同名结果代替确认。
2. 转为明确指令：学生 ID、记录/任务/分配 ID、指定字段、最新 expectedVersion、具体 YYYY-MM-DD 日期。不能将“上周”“下次”等未确认日期擅自写入。任务完成时间由服务端设置，不能伪造。
3. 用户的明确、单义指令就是本次写入授权。学管助理可直接使用 `--apply --confirm` 执行；两个开关是脚本保护，不是第二次向用户确认。省略字段保留；明确清空才设 null。
4. 同名、目标范围不清、脚本定位的对象与描述不一致、预计影响数量异常时，先展示脱敏摘要并询问最小必要信息。批量分配以用户明确的学生范围和人数为准；结课/恢复在读说明关联不会删除后执行。
5. 保存后脚本回读核对。只有 `phase=saved, verified=true` 才可报告保存并核实；同时展示新版本和实际核对结果。关联保护比对有并发变化时会停止，不宣称完全一致。
6. `VERSION_CONFLICT` 保留用户指定改动，重新读取最新版本并请用户核对，禁止仅替换版本直接重发。重复待完成整批拒绝，不静默跳过。
7. `result-unknown` / `saved-unverified` 只做有界回读或停止待人工核对，`retry=false`，不得自动重发。相似姓名/同日记录候选不证明本次创建已成功；不能把查询到相似数据当幂等回执。

输出为逐行 JSON（保留 `--json` 兼容开关，但不再区分两种输出格式）。成功退出 0；错误退出 1，仅静态安全消息。`impactCount`：预览为预计目标数，saved 为已核实目标数（同状态无副作用操作也核实 1 个目标，并非 SQL 修改行数），未知结果为 null。不会输出原始异常、请求体、连接配置或合同编号；所有联系方式隐藏，自由文本屏蔽疑似电话号码并去控制字符。真实联系方式仍不得进入聊天、命令参数、日志或持久文件。

## 命令与参数

以下命令中的 ID 与日期只是占位示范，不是当前库样例。先查询替换成确切 ID、版本和用户给出的日期。每个脚本支持 `help`；未知命令、未知/重复字段、非法值会拒绝。

### 学生档案

```powershell
node scripts/student-data.mjs list --keyword 合成同名 --page 1 --page-size 20
node scripts/student-data.mjs get --id 101
node scripts/student-data.mjs create --name 合成新同学 --grade 初一
# 只改学校：先从 edit 视图在内存取得原值，再合并指定字段
node scripts/student-data.mjs update --id 101 --expected-version 3 --school 合成学校
# 明确清空；不能清空必填 name / grade
node scripts/student-data.mjs update --id 101 --expected-version 3 --clear school,note
node scripts/student-data.mjs status --id 101 --expected-version 3 --status 已结课
```

- list：page、page-size、keyword、grade、status；get：id。
- create：name、grade 必填；可选 school、class-name、gender、enrolled-at、guardian-name、guardianPhone（仅 stdin）、note。默认待分配/无负责人/版本 1 由服务端设置。
- update：id、expected-version + 至少一个上述基础字段；可选 clear，逗号列出可空字段。全量 PUT 式后端契约不变，脚本负责保留原值。若旧原值无法原样通过校验，停止，不擅自修正未指定字段。
- `--clear` 允许 school、class-name、gender、enrolled-at、guardian-name、guardian-phone、note；不得同时设置同一字段。空字符串/纯空白不作为清空指令。
- status：仅在读 / 待分配 / 已结课；独立版本保护。脚本只提交状态，不改合同、学习记录、计划或任务；前后有界读取关联结果比对。
- 重复学生返回安全候选，绝不自动重发。用户明确表示仍要创建后，使用 `--confirm-possible-duplicate --apply --confirm` 执行。更改姓名/学校/班级后取消旧重复确认，重新走首次流程；不是并发唯一保证。

### 联系方式与多行输入

`--guardian-phone` 命令行明文被拒绝，避免进程参数和 shell 历史泄露。仅允许用户在本机受控输入渠道提供 UTF-8 JSON 到 stdin，配合 `--input-stdin`（128 KiB/10 秒上限）；字段名使用 DTO 的 camelCase。不得把真实号码发到聊天、shell 字面量、持久文件、日志或浏览器存储。输出始终隐藏电话。

例如 stdin 对象形状（此处仅描述，不执行）：

```json
{ "id": "101", "expectedVersion": 3, "school": "合成学校", "note": null }
```

交给 `node scripts/student-data.mjs update --input-stdin` 进行预览；只由受控本机输入渠道补充 guardianPhone，不在这里示范明文电话。stdin 的显式 null 与 clear 同义；省略依然保留。不能将详情中的 guardianPhoneMasked 当原值输入，校验会拒绝；edit 明文仅在进程内用于保留/核对，不输出。没有受控输入渠道则先停止联系方式变更，不临时落盘绕过。

### 学习记录

```powershell
node scripts/learning-record-data.mjs list --student-id 101 --category 缺 --date-from 2026-09-01 --date-to 2026-09-06 --keyword 合成 --page 1 --page-size 5
node scripts/learning-record-data.mjs get --student-id 101 --id 201
node scripts/learning-record-data.mjs create --student-id 101 --category 补 --occurred-on 2026-09-06 --content 合成记录正文
node scripts/learning-record-data.mjs update --student-id 101 --id 201 --expected-version 2 --content 合成修订正文
```

分类仅缺/补/强，正文 trim 后 1–10,000 Unicode 字符，日期不晚于服务端上海当天。create 必填 student-id、category、occurred-on、content；update 必须绑定 student-id + id + expected-version，仅指定 category/content/occurred-on，其余保留。作者只由服务端取得，归属不可修改；没有删除、清空正文或历史版本命令。保存回读记录和学生最近跟进；多行正文可用 stdin content。

### 任务与任务分配

```powershell
node scripts/task-data.mjs list --keyword 合成 --subject 数学 --status enabled --page 1 --page-size 8
node scripts/task-data.mjs get --id 301
node scripts/task-data.mjs assignments --student-id 101 --status pending --due-state overdue --page 1 --page-size 8
node scripts/task-data.mjs assignment --student-id 101 --task-id 301 --id 401
node scripts/task-data.mjs assign --task-id 301 --student-ids 101,102 --due-date 2026-09-10
node scripts/task-data.mjs completion --student-id 101 --task-id 301 --id 401 --expected-version 1 --completed true
```

- 任务定义只查询，不新增/编辑/停用定义；list 支持 page、page-size、keyword、subject、status(enabled/disabled)。
- assignments 支持 page、page-size、keyword、student-id、task-id、subject、status(pending/completed)、due-state(overdue/today/upcoming)。标题与科目始终取当前任务定义，不是快照。
- assign 为一个启用任务分配 1–100 个不重复学生 ID，日期不得早于上海当天。脚本核对具体名单、任务、日期、人数；整批单次 POST，服务端事务全有或全无；待完成重复预检或并发 409 都停止。
- completion 使用学生 ID + 任务 ID + 分配 ID 定位，目标 true/false 和最新版本；不是盲目 toggle。版本或恢复待完成唯一冲突不覆盖；同目标返回当前记录不新增版本。
- 无单条 API 的记录/分配定位和关联核对最多扫描相应范围 20 页×100 条；总数超界、分页变化或重复 ID 均停止，不能把截断结果当不存在。当前 MVP 范围不足以定位时交总指挥，不临时加 API/SQL。

### 合同与学习计划（只读）

```powershell
node scripts/contract-data.mjs list --student-id 101 --status 生效中 --page 1 --page-size 8
node scripts/contract-data.mjs get --id 601
node scripts/study-plan-data.mjs list --keyword 合成 --page 1 --page-size 8
node scripts/study-plan-data.mjs get --id 501
```

合同 list 另支持 keyword、subject、contract-type(month/half_year/year/lessons)、status(未开始/生效中/已到期/已用完)。计划 list 支持 keyword/分页，get 按稳定 ID 读取正文；学生当前计划关联从 student get 的 plans 获取。脚本没有合同维护、计划编辑或关系管理能力。

## 验证和启用关卡

```powershell
pnpm test -- tests/unit/local-data-session.test.ts tests/unit/data-operations.test.ts tests/unit/data-api-http.test.ts
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

上述新增测试是隔离内存/本机 HTTP 夹具，不写数据库、不创建真实验收数据。开发在改动脚本后执行与改动相称的检查；禁止运行会建立历史测试数据的种子或集成测试来“补环境”。当前系统仅限用户控制的本机单人会话，禁止公网或共享访问。
