# 首页卡片悬浮任务列表与快速添加学习记录：验收记录

- 状态：自动化已通过，浏览器待验收
- 负责人：开发负责人
- 日期：2026-09-26
- 关联需求：首页工作台卡片悬浮任务列表、卡片快速添加学习记录、手机端卡片折叠、首页不分页

## 验收范围

在既有首页学生卡片上验证：悬浮查看全部任务（待办 + 已完成、可滚动）、快速添加学习记录（默认“缺/英语/今天”）、手机端（≤600px）卡片默认折叠、点击展开，以及首页不分页与紧凑头部，且不破坏桌面卡片跳转、待办完成和权限范围。

| 编号    | 场景           | 预期                                                                                     |
| ------- | -------------- | ---------------------------------------------------------------------------------------- |
| CARD-01 | 悬浮任务浮层   | 悬浮待办区或点击“全部任务”展示全部任务，待办在前、已完成在后，超过可视高度可滚动         |
| CARD-02 | 浮层只读       | 浮层不写任务状态；卡片复选框仍按既有接口完成/恢复并刷新                                  |
| CARD-03 | 快速添加默认值 | 点击“＋”弹出表单，分类“缺”、科目“英语”、发生日期为 Asia/Shanghai 今天                    |
| CARD-04 | 快速添加校验   | 正文为空或超过 10000 字拒绝提交并提示；保存中禁用关闭/取消                               |
| CARD-05 | 快速添加成功   | 提交 `POST /api/learning-records/create`，关闭弹窗，首页刷新并出现“添加学习记录”动态     |
| CARD-06 | 跳转隔离       | 点击“＋”或“全部任务”不跳转学生详情；桌面卡片空白、Enter/Space 仍进入详情                 |
| CARD-07 | 紧凑头部       | 姓名同行显示年级与科目，7 天内到期标签紧随；过长时单行省略并可查看完整 `title`           |
| MOB-01  | 手机端默认折叠 | ≤600px 卡片默认折叠，仅显示姓名/年级科目/摘要/“点击展开”，卡片高度自适应                 |
| MOB-02  | 点击展开/收起  | 手机上点击卡片或 Enter/Space 切换展开，不跳转；展开后显示标签、待办与动态                |
| MOB-03  | 展开后进详情   | 展开卡片底部“查看详情”按钮进入 `/students/:id`；“＋”在折叠状态仍可用                     |
| MOB-04  | 桌面不回归     | >600px 保持固定 510px、点击进入详情、悬浮查看全部任务                                    |
| PAG-01  | 不分页         | 首页无分页控件，单次请求 `page=1&pageSize=1000`；服务端仅在首页放开到 1000，超过返回 400 |
| PERM-01 | 权限/范围      | 仅在读、权限范围内学生卡片可见；浮层按 studentId 查询，不扩大首页 DTO 或数据范围         |

## 自动化验证

- `pnpm vitest run tests/unit/home-card-quick-actions.test.ts`：**6/6 PASS**
  - `useStudentTasks` 成功加载并按状态拆分待办/已完成，请求参数为 `{studentId,page:1,pageSize:100}`；
  - 读取失败映射为“任务加载失败，请重试。”且不伪造任务；
  - `HomeStudentCard` 含 `StudentTasksPopover`、`v-model:open`、“全部任务”、`quickRecord` 与 `@click.stop` 的“＋”；
  - `StudentTasksPopover` 为 hover 触发且含“待办任务/已完成任务”两组；
  - `QuickRecordDialog` 默认“缺/英语/今天”，复用 `createRecord` 与 `notifyStudentChange`；
  - `pages/index.vue` 通过 `@quick-record` 打开弹窗。
- `pnpm vitest run tests/unit/home-card-mobile-collapse.test.ts`：**5/5 PASS**
  - `matchMedia("(max-width: 600px)")`、`mobile-collapsed`、`aria-expanded` 与 `expanded` 切换存在；
  - 折叠摘要“点击展开”与展开态“查看详情”存在；
  - 桌面 `role="link"`、Enter/Space 与 `navigateTo` 跳转逻辑保持不变；
  - 年级科目位于姓名所在 `<h2>` 内；
  - `pages/index.vue` 不含 `APagination`，`useHome` 使用 `homeStudentsPageSize`。
- `pnpm vitest run tests/unit/assignments.test.ts`：`parseHomeQuery` 接受 `pageSize=1000`、拒绝 `1001`。

## 未验证项

- 真实浏览器悬浮浮层的定位/滚动、窄屏（375px/320px）折叠行高与触屏点击展开的实机表现。
- 真实登录后提交学习记录并观察动态刷新（需受控账号与非业务验收数据，本切片不写入真实数据）。
- 首页学生数超过 1000 时单页上限的表现（当前超限返回 400，需另行评估扩容）。
- 任务数超过 100 时的浮层分页（当前按单页 100 条展示，超出以接口默认上限截断）。

## 数据边界与回退

未新增迁移或持久化结构，未写入真实任务或学习记录。服务端仅有一处解析变更：`parseStudentQuery` 增加可选 `maxPageSize`，首页 `parseHomeQuery` 传入 `homeStudentsPageSize`（1000），其他查询仍为 100。回退时移除两个入口、`useStudentTasks`、恢复首页分页并按需还原 `parseHomeQuery` 上限即可，无需数据清理。
