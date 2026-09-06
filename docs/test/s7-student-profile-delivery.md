# S7 学生档案维护交付报告

> 2026-09-06 验收修复补充：总指挥已裁决沿用 NOT_FOUND、VERSION_CONFLICT、PAYLOAD_TOO_LARGE、DEV_ACTOR_UNAVAILABLE、STORAGE_UNAVAILABLE 及 STUDENT_POSSIBLE_DUPLICATE。学生列表无任何联系方式字段；详情和写成功响应仅 guardianPhoneMasked，编辑回填才含原值。修复结果另见 `s7-audit-remediation-delivery.md`，独立报告原文不变。

- 状态：已实现（开发自测，待总指挥验收）
- 负责人：开发
- 创建日期：2026-09-06
- 最后更新日期：2026-09-06
- 关联需求：student-management / student-detail / student-data-model / student-profile-maintenance-plan

## 1. 范围与基线

基线为 `92b59d7 fix: address mvp audit findings`。开始前完整阅读七份指定文档，先建立 `docs/design/s7-student-profile-implementation.md` 登记步骤及最多四名固定验收学生，再实施。产品提供的三个已修改文档和未跟踪的档案维护计划保留原有内容；本报告与开发记录单独记录实现，不改写独立审查报告及其结论。

本次实现学生新增、基础档案编辑、独立状态变更、专用编辑回填、联系方式脱敏以及学生查询失效。没有学生删除、软删除、关系解绑、负责人分配、导入导出、鉴权、审计或范围外能力。没有依赖、`.env`、旧 SQL 或旧迁移台账改写，也没有 Git 提交。

## 2. 文件与用途

| 文件                                                                                                                               | 用途                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `database/migrations/007_students_version.sql`                                                                                     | 仅增加 students.version 与正数 CHECK                                                           |
| `database/migrate.mjs`、`database/student-version.mjs`、`server/db/safety.ts`                                                      | 显式 007 manifest、精确单条 ALTER 白名单、前后元数据核对、重复跳过；原通用迁移解析仍拒绝 ALTER |
| `server/db/student-profile-rules.ts`                                                                                               | 字段白名单、Unicode 长度、上海日期、电话、版本校验及脱敏                                       |
| `server/db/student-profile.ts`                                                                                                     | 最小投影回填、有限重复候选、仅 students 写入、共享乐观锁及同状态无副作用                       |
| `server/db/students.ts`、`server/db/student-query.ts`                                                                              | 详情 version/脱敏投影；有界已选 ID 标签查询；同状态成功响应使用当前读，避免事务旧快照          |
| `server/api/students/create.post.ts`、`edit.get.ts`、`update.patch.ts`、`status.patch.ts`                                          | 四个 S7 API，统一 no-store envelope、事务、开发操作人校验                                      |
| `server/api/students/options.get.ts`                                                                                               | 保留原分页搜索；补充已选 ID 批量刷新模式                                                       |
| `server/middleware/dev-actor.ts`、`server/utils/api.ts`                                                                            | 复用学生写上下文；仅增加受控重复候选错误，不暴露任意错误数据                                   |
| `types/api/students.ts`                                                                                                            | 编辑/写入/状态/候选 DTO，详情仅 guardianPhoneMasked，列表继续不含联系方式                      |
| `app/services/students.ts`、`http.ts`、`contracts.ts`                                                                              | 请求集中封装；重复错误识别；远程学生标签批量解析                                               |
| `app/composables/useStudentProfile.ts`、`useStudentStatus.ts`                                                                      | 保存禁用、失败/冲突草稿、明确重载、未知结果阻止直接重发                                        |
| `app/components/StudentProfileDrawer.vue`、`StudentStatusDialog.vue`                                                               | 新增/编辑复用侧栏；离开确认、结课和恢复在读二次确认                                            |
| `app/components/BasicInfoPanel.vue`                                                                                                | 两个维护入口、脱敏联系、独立入学/建档日期、空负责人显示                                        |
| `app/pages/students/index.vue`、`app/pages/students/[id].vue`、`app/pages/index.vue`                                               | 列表新增、详情维护、成功提示与跳转；首页原添加学生占位改为进入学员管理                         |
| `app/composables/useContracts.ts`、`useAssignments.ts`、`useRemoteOptions.ts`                                                      | 订阅现有学生失效/焦点通知，仅刷新查询，不替换其他表单草稿                                      |
| `app/components/RemoteSelect.vue`、`RemoteMultiSelect.vue`                                                                         | 已选 ID 保留，搜索/当前页外的学生名称也从真实接口刷新                                          |
| `app/types/components.d.ts`                                                                                                        | 现有组件自动导入生成的两项声明                                                                 |
| `tests/unit/student-profile.test.ts`、`student-profile-state.test.ts`、`student-profile-refresh.test.ts`、`contract-state.test.ts` | 新规则、迁移范围、版本/投影/草稿/失效覆盖，更新既有失效 mock                                   |
| `tests/integration/student-profiles.mjs`                                                                                           | 严格固定数据验收，不累积随机数据；首次创建跳过逐项标注                                         |
| `tests/integration/student-profile-boundary.mjs`、`student-profile-actor.mjs`                                                      | 数据保护指纹、构建产物空/无效 DEV_ACTOR 验证                                                   |
| `docs/design/s7-student-profile-implementation.md`、本报告                                                                         | 实施进度、样例预算、交付证据与限制                                                             |

## 3. 契约与实现口径

- 新建仅基础字段，服务端固定待分配、空负责人、version=1；不创建占位关联。新增 201 返回脱敏详情并跳转详情，编辑留在详情。
- 编辑仅基础字段，状态独立更新。三状态互转不检查有效合同/待完成任务、不写关联表。先锁学生当前行，再校验共享版本；原子条件更新带版本上界。旧版本即便目标状态相同仍 409；当前版本同状态不更新版本/时间。
- 重复判断姓名/学校/班级均非空且完全相同，参数化查询最多 5 个安全摘要；首次 409 不插入，显式确认才再提交。修改三个匹配字段即清除候选确认。该提示不保证并发唯一或请求幂等。
- 详情及所有成功写响应只含 `guardianPhoneMasked`；列表/首页/普通选项不需要电话，继续最小投影。仅打开编辑侧栏请求 edit DTO 原值，禁止用脱敏字符串回填；服务端亦拒绝星号联系方式。明文只保存在侧栏内存和请求体，关闭清空，无 URL/持久存储/日志输出。
- 编辑 DTO 分离和 DEV_ACTOR **不等于身份授权**，仍只允许无登录的受控合成环境，不能进入真实试用或公网。
- 复用 400 VALIDATION_ERROR / 404 NOT_FOUND / 409 VERSION_CONFLICT / 413 / 503 DEV_ACTOR_UNAVAILABLE 或 STORAGE_UNAVAILABLE；仅增加所需 STUDENT_POSSIBLE_DUPLICATE。
- 选择器在既有 `/api/students/options` 增加互斥只读 `ids=1,2` 模式：1–100 个不重复合法 ID，不与 keyword/page 混用，一条有 LIMIT 的参数化查询、仅 id/name/grade，仍返回分页 envelope。无新增业务筛选控件，用于已选且不在搜索页中的标签刷新，避免逐 ID 请求。

## 4. 执行命令及结果

均在项目根目录，使用现有环境，不安装依赖、不修改环境文件。应用保持本机现有回环服务。

```powershell
node database/migrate.mjs
node tests/integration/student-profile-boundary.mjs
node tests/integration/student-profiles.mjs
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
node tests/integration/student-profile-actor.mjs
node tests/integration/api-route-boundary.mjs
node tests/integration/api-route-built.mjs
```

真实 S7 脚本默认访问 `http://127.0.0.1:3001`，可用 `S7_API_BASE_URL` 指定另一个本机回环端口。actor/built 脚本需先 build，自行起停临时回环进程，只在子进程覆盖空/不存在的 actor，不修改 `.env`。

| 验证                | 实际结果                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| 007 迁移首次 / 复跑 | PASS：首次成功，第二次 000–007 均跳过；列类型、default、CHECK 元数据通过                                      |
| 格式 / 类型 / Lint  | PASS：退出 0                                                                                                  |
| 全量单元测试        | PASS：19 文件、86 项；数据库隔离 mock，不冒充真实 MySQL 覆盖                                                  |
| 构建                | PASS：现有 Nuxt 4.5.2 / Nitro 2.13.4 / Vue 3.5.42 构建；已有 PLUGIN_TIMINGS、DEP0155 非阻断提示               |
| 真实 API 首轮       | PASS 10 个分组、SKIP 0；创建 3 名固定学生，含重复先拒绝再确认                                                 |
| 真实 API 最终复跑   | PASS 7 个分组、SKIP 3 个首次创建分组；固定学生仍 4 名，明确不把首次 SKIP 计通过                               |
| 空 / 无效 DEV_ACTOR | PASS：构建产物三种写路由 × 两种上下文，共 6 次 503；伪造请求头无效；学生/关联全字段不变                       |
| D01 HTTP 回归       | PASS：开发与构建各 8 个实际断言，错误路径/方法 404 JSON、业务正常 200、缺失 ID 404、非法分页 400，均 no-store |
| 数据边界            | PASS：总学生 16、迁移记录 8、原学生 version=1 共 12；9 张表无范围外新增                                       |

中间检查发现并修正了表单 nullable 绑定类型、旧测试失效 mock、编辑请求中切换为新增后的 loading 清理和格式/Lint 问题；最终检查通过，不把中途失败隐去。执行过程中未因断言失败修改未知样例或清理数据。

## 5. 场景证据

### API / 单元

- PASS（真实）：最小与完整创建、默认空负责人/待分配/version1、重复首拒与确认插入、候选白名单；姓名/学校/班级/备注/监护人长度异常、电话非法、非法/越界日期、枚举与权威字段、413、404。
- PASS（真实）：编辑和状态同时提交同一版本，一成功一 409；三状态往返、同版本同状态时间/版本不变、旧版本同状态 409；首页在读人数随状态准确增减。
- PASS（真实）：完整字段编辑含 Unicode 上界、编辑接口原电话与脱敏详情分离，列表最小投影；分页空页、SQL 注入式关键词按字面无结果；选择器批量 ID 白名单/重复 ID 拒绝。
- PASS（真实）：只对 S7 样例在事务内触发 CHECK 拒绝与强制回滚，原行全字段不变。原学生/所有关联表及旧台账完整指纹一致；合同和分配页返回的学生姓名与真实目录只读比对一致。
- PASS（单元）：所有 Unicode/日期/电话边界、版本上限安全拒绝、禁止任意 ALTER、数据库边界；冲突不覆盖草稿、明确重载、重复确认重置、快速切换旧响应忽略、未知网络结果阻止重发、重复提交禁用。
- PASS（事件级）：真实 student-data-changed 订阅刷新合同、分配、首页和页外已选标签，不改变选中 ID/关键词/合同编辑对象；既有 D03 的 focus/失效事件测试继续验证学习记录与基本信息刷新且草稿/筛选/分页/旧版本保留。

### 浏览器（实际截图、可访问性树及 DOM 尺寸留在本次工具记录）

1. PASS：320×812 新增侧栏全宽、主体纵滚，底部取消/保存可见；空姓名保存显示错误。填写固定第四样例后跳转 `/students/16`，负责人未分配、日期/科目/计划为空，学习记录和任务各 0。
2. PASS：375×812 编辑侧栏。写入全零合成联系方式后详情仅显示 `000****0000`；再次打开编辑回填原值，不是星号。关闭时出现放弃草稿确认，选择保留后原内容仍在。
3. PASS：两页同一固定学生：A 打开编辑并清空联系方式草稿，B 独立变更状态；A 保存得到 409、草稿保留、保存禁用。重载确认先取消保留，再明确确认后回填最新原值；随后成功清空联系方式，仍停留详情。
4. PASS：结课、结课恢复在读均有二次确认及关联不受影响说明；在读后首页总数 5 且显示该学生；最终恢复待分配，重新读取首页总数 4、卡片移除。
5. PASS：重复学生表单返回两个摘要及“仍要创建”，摘要不含联系方式；修改班级后按钮/候选消失，普通保存恢复。该浏览器步骤取消，不创建第 5 名；实际确认插入已经 API 首轮验证，前端 confirmed 参数由单元验证。
6. PASS：分配弹窗真实学生选项显示新档案；选中固定浏览器学生后输入无结果关键词，页外选中标签仍显示真实姓名；取消弹窗，未创建任何分配。
7. PASS（D02）：320px / 375px 六个导航保持单行、文本 top=15.5 / bottom=31.5，在 64px 页头内；320px 导航宽174、内容341，键盘 Tab 可达“任务分配”、横滚167。375px 导航宽214；1280px 宽424且内容424、无横滚，文本22–39。Logo 可辨认，原桌面顺序保持。临时视口已 reset，两个自建标签页已关闭，用户原标签页保留。

## 6. 样例与数据保护

| ID  | 固定样例                          | 用途及最终状态                                                                            |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| 13  | S7固定最小档案                    | 最小新增/共享版本/状态/回滚；最终初一、待分配、其余可选字段空                             |
| 14  | S7固定重复档案，备注 S7固定重复甲 | 完整字段/重复候选；S7合成学校、S7合成班、女、入学1900-01-01、合成监护人及全零电话；待分配 |
| 15  | S7固定重复档案，备注 S7固定重复乙 | 显式确认创建，其余同甲；待分配                                                            |
| 16  | S7固定浏览器档案                  | 浏览器创建/编辑/冲突/状态；最终初一、待分配、备注 S7浏览器验收、其余可选字段空            |

总计只新增 4 名；无关联记录、无随机新增、无清理。所有样例负责人为空。版本/更新时间按成功编辑正常递增，不伪造恢复旧时间或旧版本。真实脚本开始前验证所有已存在样例的固定业务字段和最终状态，发现重复标识/未知字段值停止，不覆盖。

迁移前、迁移后及最终的保护指纹如下（学生排除新 version 列及四名明确 S7 样例，台账排除唯一新增007；其余全字段）：

| 表                        | 保护数量 | 三阶段一致 SHA-256                                               |
| ------------------------- | -------- | ---------------------------------------------------------------- |
| users                     | 1        | c92ea03dcbe054e41a88c6cbccca65a0248312a462cf9d42988d5d36e73658e7 |
| students 原档案           | 12       | 22989928144df7710621a36f16e0c5048930808086b8406fd0cad81cdc63220e |
| contracts                 | 6        | f5854ec1a8ec07f9a9a376cf3e2051583fda3eadab155229aa9d325d5930be65 |
| student_learning_records  | 9        | 003e5f21a7381ef123c89f4a811ee9edae3a32bd8268aeef4287ec13009617ff |
| study_plan_documents      | 3        | 42ec1af30d0ebe28dc196cc61d8f7386c225689ada4192b70ac52710079df92d |
| study_plan_students       | 4        | 64576d5342290d6718ec411fb2eb353c1f6962dbe0cede3b15c533c750d03222 |
| tasks                     | 4        | 13ac639555803b0ecfbb8f5e69513c2629188b16e5261e5c41fe374a2768a7d3 |
| task_assignments          | 14       | 5011510aed72d0a1b8684e277fcb2e8d7e65468a5869b03ef7346adfb52c6e40 |
| schema_migrations 000–006 | 7        | 2714ed26eb9d1ac221cf535fc3884b240ca48609963ea2627b8e305954fc9d28 |

所有连接/事务写入/迁移/脚本开始均复用批准库校验；无创建/删除数据库、USE、删表删列或修改原12学生。没有读取或输出私有环境文件正文。旧迁移文件、依赖文件和独立审查报告 `git diff` 未变。

## 7. 未验证项与已知限制

- **未验证**：真实数据库断连、commit 后断网、DDL 中途失败恢复。未停用户服务或破坏结构；安全错误/草稿/回滚有单元或隔离事务证据，不宣称完整故障演练。
- **未验证**：真实库版本推进至 UINT 上限（仅单元验证），不人为篡改样例版本制造上限。
- **未验证**：给已有合同/任务的原12学生真实改名/改状态后页面变化。本轮禁止写这些学生；以只读名称/关联指纹、DAL 仅 students 写入和失效事件隔离测试验证，不宣称该组合已做真实关联写回归。
- **未验证**：跨窗口写学习记录后 OS focus 的完整 D03 E2E，及浏览器关闭/系统 beforeunload 的所有组合。本次未写学习记录，保留独立报告原限制；事件级覆盖不替代 OS 焦点验收。
- **SKIP**：重复运行的3个首次创建；浏览器不再次点击“仍要创建”，避免突破4人预算。未运行会修改关联数据的旧 S2–S6 写测试或种子。
- 目前无身份授权，DEV_ACTOR 与 DTO 分离均不构成权限；继续受控合成环境。重复提示不是唯一/幂等保证；网络结果不明时先刷新核对，不自动重发。
- 使用 S7 应用前须显式完成007；未迁移环境不能启用新接口。未做空库/大数据量/多浏览器专项，不能据此声称上线验收。

## 8. 回退与交接

### D09 计数追溯补充（2026-09-06）

本次在工作区检索 S7 日志/报告，没有找到可独立复核首轮汇总的原始执行日志。历史计数无法核实；修复前当前脚本首次路径静态计数为11，复跑实测PASS 7 / SKIP 3。原文首轮 PASS 10 属于历史交付记载，本次不将静态推算补写为历史实测。验收修复脚本已移除首次创建执行分支，只保留明确 SKIP，避免新建第17名学生；确认创建由隔离单元覆盖，未在真实库重造。

回退只撤回 S7 应用接入（恢复原读取入口、关闭新增/编辑/状态操作），保留 students.version、007 台账和四名样例；不要退回先前会在详情暴露明文联系方式的 DTO。没有自动 down 或删除命令，清理或结构撤回必须另行授权。

已完成本次实施与开发自测，停止等待总指挥验收。不提交 Git，不开启下一阶段。
