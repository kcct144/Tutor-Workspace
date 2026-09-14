# 学生标签交付记录

日期：2026-09-13。

## 范围与使用

学生详情 → 学生标签 → 编辑标签 → 输入并按回车 → 保存。工作台顶部选择学生标签，可叠加年级筛选。标签最多 10 个，每个最多 24 个 Unicode 字符；历史学生无标签。

## 文件

- `database/migrations/019_student_tags.sql`、`database/migrate.mjs`：学生标签关联表、复合主键、标签索引、RESTRICT 外键和迁移白名单。
- `types/api/student-tags.ts`、`server/db/student-tags.ts`：共享校验、批量查询、分页选项、版本锁、同事务审计和保存回读。
- `server/api/students/tags.get.ts`、`tags.patch.ts`、`server/api/student-tags/options.get.ts`：统一响应、既有登录与 CSRF 保护。
- `types/api/home.ts`、`server/db/assignment-rules.ts`、`server/db/home.ts`：标签精确筛选及卡片批量投影，无逐卡查询。
- `app/services/student-tags.ts`、`app/composables/useStudentTags.ts`、`app/components/StudentTagsPanel.vue`：详情独立维护、草稿保护。
- `app/pages/students/[id].vue`、`app/pages/index.vue`、`app/composables/useHome.ts`：编辑入口、卡片展示、标签与年级组合筛选及页码重置；保留之前任务完成局部更新改动。
- `tests/unit/student-tags.test.ts`、`student-tags-state.test.ts`：7 项定向测试。
- `docs/prd/student-tags.md`、`docs/design/student-tags-implementation-plan.md`、本报告：规则和交付记录。

## 验证

- PASS：`pnpm db:migrate` 首次在批准库边界校验后应用 019；再次执行显示已应用、跳过，旧迁移保持不变。
- PASS：`pnpm typecheck`。
- PASS：`pnpm test`，27 文件、149 测试通过；包括新增 7 项标签测试。
- PASS：`pnpm build`，存在上游构建性能/弃用提示，不影响构建成功。
- PASS：`git diff --check`（仅换行符提示）。
- 单元覆盖：Unicode、数量、重复、非法字段、学生版本冲突、相同值无副作用、清空、版本上限、审计失败整事务回滚、参数化筛选、分页和选项通配符转义、草稿不被失效刷新或冲突覆盖。
- 浏览器实测：已有登录会话下工作台筛选入口显示，实际空标签选项显示“暂无选项”；学生详情显示“暂无标签”，打开编辑时呈现加载/禁用态，回填完成后可保存，取消返回只读态。未按保存，未添加真实标签。
- 全仓 Lint 未通过：既有未跟踪 `tools/complete_pindu_tasks.mjs`、`tools/tmp.mjs` 共 4 个未使用变量错误。
- 全仓格式未通过：既有未跟踪的业务种子及 tools 文件格式问题；未修改这些文件。

## 数据边界与未验证项

仅执行结构迁移与迁移记录写入；未创建/修改真实学生或标签业务数据，未运行种子，未读取、输出或修改 `.env`，未新增依赖，未提交 Git。当前工作区仍保留既有出勤、任务局部刷新、种子和工具改动。

真实 MySQL 保存、浏览器保存后筛选匹配未执行，以免给真实学生增加测试标签；相应保存/筛选逻辑由隔离驱动单元测试覆盖。窄屏未单独实测。

回退仅撤回本功能应用接入，保留关联表及审计数据，不自动删表或清库。
