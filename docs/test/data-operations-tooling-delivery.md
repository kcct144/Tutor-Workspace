# 自然语言数据操作工具开发交付

- 日期：2026-09-06
- 角色：开发自测；工具开发不代表任何业务已执行
- 基线：`6ea3eac`；开始时工作区干净，未创建 Git commit
- 依据：[实施计划](../design/data-operations-tooling-plan.md)、[脚本指南](../../scripts/README.md)、工作区规范及学生/记录/任务/合同/计划已确认文档

## 1. 交付范围与根因

旧学生脚本将省略的可选字段作为空值提交，而既有 update API 接收完整基础档案，导致未指定字段可能被清空。此次不改服务端业务契约：脚本按稳定 ID 读取 edit 视图、校验用户指定版本、在内存中合并显式字段后发送完整合法档案。未指定的明文联系方式仅在进程内保留与核对，不从脱敏字段回填。显式清空采用 `--clear` 或 stdin null；空文本不会意外清空。

已增加记录读取/新增/编辑，任务定义读取、任务分配读取/批量分配/显式完成状态，以及合同/计划只读查询。未增加任务定义写入、合同/计划维护、删除、操作人建立、权限、审计或业务规则。

| 文件                                          | 用途                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `scripts/student-data.mjs`                    | 原学生入口改为复用公共安全流程，保留 list/get/create/update/status       |
| `scripts/db-preflight.mjs`                    | 只读边界、计数、操作人存在性检查；JSON 与 require-actor；不输出操作人 ID |
| `scripts/learning-record-data.mjs`            | list/get/create/update；学生+记录 ID 绑定、版本与具体日期                |
| `scripts/task-data.mjs`                       | 定义/分配查询、assign、completion；固定目标状态、整批预览                |
| `scripts/contract-data.mjs`                   | 合同 list/get，只读，隐藏合同编号                                        |
| `scripts/study-plan-data.mjs`                 | 计划 list/get，只读                                                      |
| `scripts/lib/data-api.mjs`                    | 回环 HTTP、禁重定向、超时/响应上限、安全错误/投影、有界分页、预检        |
| `scripts/lib/data-operations.mjs`             | 已有校验复用、部分字段合并、定位/预览、单次写请求、回读与关联核对        |
| `scripts/lib/data-cli.mjs`                    | 参数白名单、stdin、预览确认入口、保存/冲突/结果不明输出                  |
| `scripts/README.md`                           | 全部命令参数、明确清空、联系方式渠道、启动/操作人解决路径、启用关卡      |
| `tests/unit/data-operations.test.ts`          | 15项隔离 API/内存工作流测试，不连接数据库                                |
| `tests/unit/data-api-http.test.ts`            | 1项实际回环 HTTP 夹具测试，断连/错误/重定向，不连接数据库                |
| `docs/design/data-operations-tooling-plan.md` | 开发顺序、前置审批问题和进度                                             |
| 本文件                                        | 交付证据、PASS/SKIP、限制与回退                                          |

无 API、UI、schema、迁移、种子、依赖、`.env` 或既有独立报告修改。

## 2. 自测证据与验收矩阵

### 隔离测试（PASS，不是 MySQL 写入验收）

2026-09-06，最终全量 `pnpm test`：23文件、116测试通过；基线97项，本轮新增19项。固定内存对象使用学生101/102（同名不同校）、新建103、记录201/202、任务301、分配401/410、计划501和合同601等测试 ID。它们从未装载到真实库；不属于任何获准持久样例。

| 验收点                 | 证据/边界                                                                        | 结论                                   |
| ---------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| 同名定位准确           | 内存同名101/102，指定102仅修改102                                                | 单元 PASS；真实 SKIP                   |
| 单字段编辑保留其他字段 | 全字段比较；原电话原值保留，未提交脱敏串                                         | 单元 PASS；真实 SKIP                   |
| 明确清空               | school/guardianPhone 明确 null；其他字段不变，空字符串拒绝                       | 单元 PASS；真实 SKIP                   |
| 旧版本冲突             | 预检版本不符无写；服务端409仅回读，不换版本重发                                  | 单元 PASS；真实 SKIP                   |
| 学生新增默认值         | 默认待分配、无负责人、版本1；脚本不发送权威字段；回读核实                        | 单元 PASS；真实首次创建 SKIP           |
| 结课关联保护           | 内存合同/记录/任务/计划前后比较，状态接口仅更新状态                              | 单元 PASS；真实 SKIP                   |
| 学习记录绑定与部分编辑 | 修改正文保留分类/日期/归属/作者，跨学生 ID 拒绝；新增后回读                      | 单元 PASS；真实 SKIP                   |
| 重复待完成分配         | 预检拒绝无 POST；服务端 ASSIGNMENT_CONFLICT 一次拒绝后核对，不部分成功           | 单元 PASS；真实并发/唯一约束 SKIP      |
| 批量分配及完成         | 内存另一个学生分配，回读ID/人数/日期，完成与恢复目标明确                         | 单元 PASS；真实 SKIP                   |
| 提交结果不明           | 模拟已提交后断连，仅一次写请求，回读后仍明确未证实，不打印 saved                 | 单元 PASS；真实故障注入 SKIP           |
| 回读失败               | saved-unverified、impactCount=null、retry=false；不报全部通过                    | 单元 PASS                              |
| 操作人不可用           | actorReady=false 时 API 从未调用                                                 | 单元 PASS；真实只读预检拒绝 PASS       |
| 敏感信息               | 明文 CLI 电话拒绝、stdin/内部回填不输出；固定安全错误，不回显SQL/对象            | 单元 PASS                              |
| 合同/计划只读          | 查询路径；修改命令拒绝                                                           | 单元 PASS；真实空列表 PASS             |
| 参数/网络边界          | 未知/重复/权威字段与单开关拒绝；分页上限；外部URL/URL凭据拒绝                    | 单元 PASS                              |
| 实际 HTTP 传输         | 原生 localhost 夹具 GET envelope；404两种既有码；302不跟随；POST socket断连仅1次 | 回环 HTTP 夹具 PASS，不是业务 API 写入 |

记录日期/正文、学生长度/日期、任务批量/状态等继续复用服务端纯校验函数；已有领域单测也随全量通过，不另造与服务端不同的规则。脚本确认开关不是安全令牌或身份授权；人工必须确认本次具体预览。

### 真实本机 API 与前置条件（只读）

本轮最初未发现3000/3001监听；`node scripts/student-data.mjs list` 安全退出1，SERVICE_UNAVAILABLE，没有回退空列表或 mock。随后显式运行：

```powershell
pnpm dev --host 127.0.0.1 --port 3000
```

实际监听127.0.0.1:3000（Nuxt 4.5.2 / Nitro 2.13.4），以下命令均通过版本化脚本，业务 API 请求只有 GET：

| 命令                                                                      | 实测结果                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `node scripts/db-preflight.mjs --json`                                    | 批准边界通过；迁移8、学生0、人员0、actorReady=false                     |
| `node scripts/student-data.mjs list --page 1 --page-size 20`              | exit0，query，items=[]、total=0、page1/pageSize20                       |
| `node scripts/task-data.mjs list`                                         | exit0，空列表、total0、pageSize8                                        |
| `node scripts/task-data.mjs assignments`                                  | exit0，空列表、total0、pageSize8                                        |
| `node scripts/contract-data.mjs list`                                     | exit0，空列表、total0、pageSize8                                        |
| `node scripts/study-plan-data.mjs list`                                   | exit0，空列表、total0、pageSize20                                       |
| `node scripts/learning-record-data.mjs list --student-id 1`               | 最终 exit1，STUDENT_NOT_FOUND，retry=false                              |
| `node scripts/student-data.mjs get --id 1`                                | exit1，NOT_FOUND，retry=false                                           |
| `node scripts/task-data.mjs assignment --student-id 1 --task-id 1 --id 1` | exit1，NOT_FOUND，retry=false                                           |
| `node scripts/contract-data.mjs get --id 1`                               | exit1，NOT_FOUND，retry=false                                           |
| `node scripts/study-plan-data.mjs get --id 1`                             | exit1，NOT_FOUND，retry=false                                           |
| `node scripts/student-data.mjs list --page 0`                             | 本地复用字段校验拒绝，exit1，VALIDATION_ERROR；不计真实API非法分页测试  |
| `node scripts/db-preflight.mjs --require-actor --json`                    | exit1，actorReady=false，只有脱敏前置条件提示                           |
| `node scripts/student-data.mjs create --name 合成预览未保存 --grade 初一` | 仅 preview，预计影响1、actorReady=false、applied=false；无 POST、无新增 |

开发过程曾漏映射既有学习记录 `STUDENT_NOT_FOUND`，将不存在学生误报为 SERVICE_UNAVAILABLE；真实只读验证发现后已修复并补 HTTP 夹具断言。另补齐现有 `ASSIGNMENT_CONFLICT`，保留 API 原契约，前者真实复验已得到上述正确输出，后者仅隔离验证，不伪称执行真实任务并发。

21:13 末次预检仍：迁移8、学生0、人员0、actorReady=false。测试自有开发服务已通过其终端 Ctrl+C 停止，未留下持续后台任务。未运行真实 POST/PATCH/DELETE、种子、迁移或历史写入集成测试。关联表未做全量数据指纹，不能将上述计数当作全表指纹证据；数据保护依据为本轮没有业务写请求、无 schema/种子变更，以及只读入口与代码审查。

### 工程检查

| 检查                          | 结果                                                                       |
| ----------------------------- | -------------------------------------------------------------------------- |
| `pnpm test`                   | PASS：23文件、116测试                                                      |
| `pnpm typecheck`              | PASS，exit0                                                                |
| `pnpm lint`                   | PASS；有意去除终端控制符的两处正则使用局部说明，未关闭其他检查             |
| `pnpm build`                  | PASS，exit0；保留构建器 PLUGIN_TIMINGS 和上游 DEP0155 非阻断警告，不改依赖 |
| `pnpm format:check`           | 最终检查结果见下方交付核对                                                 |
| `git diff --check` / 范围检查 | 最终检查结果见下方交付核对                                                 |
| 浏览器页面                    | 未验证：无页面/组件变更；本轮验证命令行工作流，不把HTTP查询写成UI验收      |

## 3. 前置条件解决路径与未验证项

1. **服务已定位**：原失败原因是本机端口无服务。显式回环启动后可读；使用同一 STUDENT_DATA_BASE_URL，不能访问远端API或猜测占用端口归属。交付后按指南由用户重新启动，不自动常驻。
2. **操作人初始化（后续开发补齐，尚未执行）**：新增 `database/init-dev-actor.mjs` 只允许在 users 为空时显式建立或复用唯一的保留本机合成人员；它不恢复种子、不创建学生，也不写 `.env`。用户在本机运行并私下填写脚本输出的 ID 后重启服务、重跑预检；学管助理不得执行该初始化脚本。
3. **真实写入全部 SKIP**：无学生/任务和经批准样例预算。需另行指定有限固定合成样例、具体字段/日期、允许写入操作及结束核对要求；每次预览确认后才执行，不能借测试自行补数据。不得使用历史样例ID13–16、删除重建或追加随机调试数据。
4. **日常助理范围**：skill 已同步支持的学生、记录、任务分配和合同/计划查询脚本。没有登录/权限/审计，始终不允许公网或共享访问；写入仍由 `actorReady`、明确用户指令、稳定 ID/版本与回读保护。
5. **有界定位限制**：记录/分配无单条API，按ID所在学生/任务范围最多2000条，单响应2 MiB；超过或分页变化停止，可能需更窄查询/后续审批接口，不能擅自加SQL。回读非数据库快照，并发变化可能导致未证实结果，需要人工核对。
6. **隐私限制**：自由文本清洗只屏蔽疑似数字联系方式/控制字符，不是完整隐私识别或加密；stdin不落盘但仍须受控本机输入，不向聊天/命令参数提供真实电话。

## 4. 回退

停止使用新脚本，保留数据库与全部既有数据；本轮无数据库回退动作。按文件清单审阅撤回本次工具/文档改动即可，无自动回退命令、不删除表或数据、不重置他人文件。**旧学生脚本省略字段清空的问题仍存在，撤回后必须停用旧 update 入口，不能恢复日常写入。** 不提供自动重试、种子恢复或绕过操作人的后备路径。

## 5. 最终交付核对

- 续交付（2026-09-06）：已新增 `database/init-dev-actor.mjs` 与 `pnpm db:init-dev-actor`。`--help` 不连接数据库；默认执行是只读预检，实测批准库通过、人员表为空，可显式创建1名保留合成人员。未执行 `--apply --confirm`，末次预检仍迁移8、学生0、人员0、actorReady=false。
- 初始化脚本的隔离测试与数据工具相关测试：PASS，3文件、19测试；覆盖空表创建计划、唯一保留操作人复用、未知/重复人员停止、内部写开关配对和不连接 help 路径。真实初始化写入 SKIP，原因是本次只交付方案，用户尚未亲自执行显式写命令。
- 最终工程检查：`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、全量 `pnpm test`（23文件、116测试）和 `pnpm build` 均 PASS。首次连续检查留下的 Nuxt 构建锁对应进程已不存在；复验构建使用临时进程环境变量绕过该遗留锁，未改 `.env`。构建仍有既有 PLUGIN_TIMINGS 与上游 DEP0155 非阻断警告。
- `pnpm format:check`：PASS，All matched files use Prettier code style。
- 最终 `pnpm lint`：PASS，exit0。
- `git diff --check`：PASS，无空白错误；Git 提示部分 LF/CRLF 转换和用户全局 ignore 不可访问，未改动全局 Git 配置。
- 已核对14个交付文件；仅脚本、2份工具文档和2个隔离测试。未跟踪的新文件也已纳入 Prettier/Lint/单测检查，不把 `git diff --stat` 的3个已跟踪文件当完整清单。
- 无3000监听残留；不承诺启动后持续服务。真实业务写入始终为0，未提交Git。无需单独测试对话；后续由开发按风险相称自测，学管助理只调用已交付脚本。

## S8.7 会话接入补充（2026-09-07）

本节不改写上述 S8.2 前的原始证据。S8.7 已以本机 TTY 隐藏登录、工作区外短期 Cookie/CSRF 存储替代 `DEV_ACTOR_ID` / `actorReady` 写入资格；`actorReady` 现仅为预检历史信息。脚本仍先执行 `tutor_workspace` 范围预检，业务请求只经本机 API。

会话存储、401/CSRF 失效清理、退出、无会话、错误登录、无自动重试和权限头由隔离临时目录/回环 HTTP 夹具验证；本补充不读取管理员凭据、不创建账号、不写真实业务数据。具体命令、威胁边界、实测结果和手工复验见 [S8.7 交付记录](s8-7-local-data-session-delivery.md)。
