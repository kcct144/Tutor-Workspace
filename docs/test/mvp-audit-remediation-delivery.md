# MVP 独立审查 D01–D04 开发修复交付报告

- 状态：已实现（开发自测完成，待总指挥验收）
- 负责人：开发负责人
- 创建日期：2026-09-06
- 最后更新日期：2026-09-06
- 关联需求：独立审查D01–D04；基线8fd7db8

## 1. 范围与文件

先建立[修复计划与进度](../design/mvp-audit-remediation-plan.md)，再实施。仅四项验收修复，无新业务、依赖或上线能力。未修改数据库、迁移、种子、.env、已有合成数据或Git提交。原始独立报告保持原文，不修改其结论、证据或未验证项。

| 文件                                        | 修复用途                                                         |
| ------------------------------------------- | ---------------------------------------------------------------- |
| server/api/[...].ts                         | D01 API局部通配兜底，复用apiResponse/ApiError                    |
| app/assets/css/tailwind.css                 | D02仅760px以下的Logo不收缩、导航横滚、不换行、行高和键盘焦点轮廓 |
| app/composables/useLearningRecords.ts       | D03列表订阅现有student失效与focus事件                            |
| tests/unit/learning-record-state.test.ts    | 原测试适配新增订阅边界                                           |
| tests/unit/learning-record-focus.test.ts    | 真实事件订阅、两个区域刷新、草稿与筛选分页保护及退订             |
| tests/unit/audit-remediation.test.ts        | 现有API状态/envelope脱敏、PASS/SKIP结果真实性                    |
| tests/integration/task-assignments.mjs      | D04逐场景执行/跳过，显式只读模式，禁止未知命令参数               |
| tests/integration/scenario-results.mjs      | 仅成功action计PASS，跳过不执行action，不计入通过汇总             |
| tests/integration/api-route-boundary.mjs    | D01本机HTTP探测，不调用业务写处理器                              |
| tests/integration/api-route-built.mjs       | 构建产物临时回环服务，执行相同HTTP探测，结束关闭自己的进程       |
| docs/design/mvp-audit-remediation-plan.md   | 计划、授权边界与完成进度                                         |
| docs/test/mvp-audit-remediation-delivery.md | 本报告                                                           |

初始工作区仅docs/test/mvp-independent-audit.md未跟踪，保持不变。其SHA-256为69B879A1DB6D7731863F9C403F0B13575879F92CFC05FA621F62C07E34394EF0；不对原报告运行格式化。

## 2. D01：API路径与方法边界

修复前本轮实际GET复现：/api/independent-audit-missing和/api/tasks/create均200、text/html;charset=utf-8、无Cache-Control；正常tasks/list为200 JSON/no-store，业务不存在ID为404 JSON/no-store。

先检查本机安装的Nuxt4.5.2、Nitro2.13.4和H3 1.15.11：Nitro runtime/internal/app.mjs以router.use(route,handler,method)注册；H3 createRouter先查精确路径对应方法，没有时matchAll反向查找匹配处理器。新增server/api/[...].ts限定/api通配边界，使请求不再进入Nuxt SPA renderer。更具体的业务方法优先，既有处理器不改。无需全局错误钩子或维护重复API清单。

未匹配路径和方法均约定404、data.code=API_NOT_FOUND、安全固定msg、Cache-Control:no-store；本次不强求405，也不返回路径、SQL或堆栈。已有业务404、400、409、413、503仍由原apiResponse处理，成功结构不变。

开发3001和本机临时启动的构建产物均实际通过下表：

| 请求                                          | 修复后                                           |
| --------------------------------------------- | ------------------------------------------------ |
| GET /api/independent-audit-missing            | 404 JSON envelope / no-store                     |
| GET /api/tasks/create                         | 404 JSON envelope / no-store                     |
| GET /api/tasks/update                         | 404 JSON envelope / no-store                     |
| POST /api/independent-audit-missing           | 404 JSON envelope / no-store；不进入业务写处理器 |
| OPTIONS /api/tasks/list                       | 404 JSON envelope / no-store                     |
| GET /api/tasks/list                           | 200 JSON envelope / no-store                     |
| GET /api/tasks/detail?id=18446744073709551615 | 业务404 JSON envelope / no-store                 |
| GET /api/tasks/list?page=0                    | 业务400 JSON envelope / no-store                 |

单元另验证apiResponse成功和400/404/409/413/503状态、安全envelope与未知错误脱敏。本轮未用真实写请求制造409/413/503，不能将单元结果说成这些状态的真实数据库复测。

## 3. D02：窄屏导航

修复前证据沿用独立报告原文：375px下文字多行，纵向范围-41到103px，超出64px页头。未覆盖或替换原截图证据。

修复后浏览器截图与只读DOM测量：

| 视口     | 实测结果                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| 320×812  | document.clientWidth=305（含系统滚动条影响），导航可视宽174、内容宽341；横向滚动到scrollLeft=167可见末尾；Logo独立可见    |
| 375×812  | document.clientWidth=360，导航可视宽214、内容宽341；scrollLeft最大127；Tab按原六项顺序移动，自动滚到末项，Enter打开分配页 |
| 1280×900 | 六项全部横排可见，导航链接x=120至544、y=0至64，桌面顺序及视觉未改                                                         |

320/375下全部六个名称只有一条文字行，top=15.5、bottom=31.5，完全在页头0–64内，无多行上下裁切或覆盖正文。保留可见原生横滚条，触控/鼠标可横向滚动；不把所有入口强行压进一屏。

截图保留在本轮浏览器工具记录中，分别展示375初始导航、320左端/右端和1280桌面；未另增截图文件。一次批量自动点击检查超时，恢复后先手动横向滚动，再通过可见入口成功打开/tasks/assignments；不把中断的批量循环全部计为通过。原有其他窄屏区域未纳入整改，也未顺手修改。

## 4. D03：焦点刷新与草稿保护

修复前静态确认：学生基本信息调用useStudentInvalidation，学习记录列表没有订阅；同学生key未变不会重新挂载列表。

修复仅增加useStudentInvalidation(refresh)。refresh仍只写items/total/loading/error，不写editing、draft或expectedVersion来源。外部更新后列表读取新版本，正在编辑的旧草稿保留旧版本；若继续保存仍走原409冲突流程，不静默覆盖草稿或跳过乐观锁。既有筛选、分页不重置。

新增两项事件单元：使用真实EventTarget和实际useStudentInvalidation，模拟focus和student-data-changed；只将Vue挂载时机映射到effectScope，服务数据用mock，不接触真实记录。断言：

- 列表及基本信息各新增一次请求；发生日期与最近跟进由2000-01-01更新为03。
- 第2页、关键词、分类、日期范围不变。
- 编辑窗保持打开，未保存正文不变，editing.version仍1；列表已读到version2。
- 没有调用更新或强制重载草稿；scope销毁后事件不再请求。
- 原有409草稿保留、显式重载、保存失败及过期请求测试仍通过。

本轮禁止编辑真实合成记录，所以没有执行“窗口B保存真实记录→OS切换焦点→窗口A”端到端写回归。已验证的是实际失效订阅的事件单元，不冒称真实OS窗口联调通过；该未验证项留待总指挥授权适当复验。

## 5. D04：实际执行与跳过准确区分

修复前源码与独立报告确认：三处if跳过创建，结尾仍宣称创建/并发创建通过。本轮未执行旧写脚本重现，以遵守零数据修改边界。

修复后每个场景仅action成功后记录PASS；跳过会记录原因且不调用action；失败不会进入通过汇总。默认模式仍保留原有完成、恢复、冲突和约束测试，只修正分支记录。新增--read-only显式模式跳过一切HTTP业务写及DML；未知参数直接停止。

本轮在当前固定14条分配上实际执行：

```text
[SKIP] 写入输入校验/不存在对象/整批拒绝：本轮只读，不执行写入
[PASS] 只读非法查询/分页/关键词
[SKIP] 完成接口不存在ID：本轮只读，不执行写入
[SKIP] 首次2人批量创建：固定样例已存在
[SKIP] 首次并发创建201/409：固定样例已存在
[SKIP] 首次1人创建：固定样例已存在
[SKIP] 完成/恢复/同目标/版本及并发冲突：本轮只读，不执行写入
[SKIP] FK/CHECK/唯一约束/事务回滚：本轮只读，不执行写入
[PASS] 只读当前定义JOIN/首页计数/人数去重/安全投影
本轮执行通过：只读非法查询/分页/关键词、只读当前定义JOIN/首页计数/人数去重/安全投影
本轮跳过（不计通过）：写入输入校验/不存在对象/整批拒绝、完成接口不存在ID、首次2人批量创建、首次并发创建201/409、首次1人创建、完成/恢复/同目标/版本及并发冲突、FK/CHECK/唯一约束/事务回滚
固定分配总数=14，S1–S5指纹未变。只读模式：分配全字段也未变化。
```

单元验证已有样例和只读跳过不执行action、实际成功才进入汇总、异常不计PASS。默认写模式本轮没有执行；未删除固定样例、未增随机样例，也没有通过回滚写入消耗自增ID。

## 6. 验证命令及结果

| 命令                                                    | 结果                                  |
| ------------------------------------------------------- | ------------------------------------- |
| pnpm format:check                                       | 通过                                  |
| pnpm typecheck                                          | 通过                                  |
| pnpm lint                                               | 通过                                  |
| pnpm test                                               | 16文件、73项通过                      |
| pnpm build                                              | 通过，Nuxt/Nitro node-server产物      |
| node tests/integration/api-route-boundary.mjs           | 开发服务8项实际HTTP断言通过           |
| node tests/integration/api-route-built.mjs              | 构建产物同8项通过；临时回环进程已关闭 |
| node tests/integration/task-assignments.mjs --read-only | 当前固定数据实际输出如上，无数据变化  |
| git diff --check                                        | 通过                                  |

复跑D01可设置AUDIT_API_BASE_URL为实际本机端口，默认3001；D04沿用S6_API_BASE_URL，仅允许回环地址。构建验证脚本使用已有运行时配置加载方式，不输出或修改.env。没有安装依赖、运行迁移/种子、停止用户原有服务。

## 7. 限制、回退与停止点

- D03真实跨窗口写入后OS聚焦、D04默认写模式、首次创建均未在本轮执行；没有新增/删除数据来制造覆盖。
- D02为浏览器视口模拟和鼠标/键盘验证，未做物理手机触摸硬件测试或全浏览器兼容性审查；横滚使用原生overflow机制。
- 既有登录、权限、审计、部署等上线门禁保持原报告结论，完全未建设。本修复不代表MVP完整验收或生产可用。
- 回退只撤回本报告列出的代码/测试变更，保留原独立报告与修复记录；无需数据库回滚。撤回对应代码会重新出现D01–D04，因此应由总指挥决定。
- 无Git提交；完成后停止，等待总指挥验收。
