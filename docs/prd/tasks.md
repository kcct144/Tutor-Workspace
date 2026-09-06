# 任务定义（S5 MVP）

- 状态：已实现（待验收）
- 负责人：开发负责人（同步总指挥裁决）
- 创建日期：2026-09-05
- 最后更新日期：2026-09-06
- 关联需求：S5任务定义；S6未授权

## 范围与字段

仅/tasks真实接入；分配管理链接继续进入独立原型，/tasks/assignments、首页及学生详情任务逻辑不变。分配人数由API固定0。无分配表、删除、Redis、登录、权限、审计、系列或自动派发。

title/subject/description必填，trim后Unicode码点分别1–160、1–64、1–10000，保存trim后的文本，说明纯文本展示。标题不唯一。status仅enabled/disabled，显示启用/停用；新建默认enabled，不接受创建时指定状态；编辑允许两态，停用仍可读取。id对外十进制字符串。owner_user_id为服务端创建/最近维护操作人，每次写入从DEV_ACTOR_ID验证存在后取得，不接受浏览器owner/actor。version用于乐观锁，不是历史版本。

## API

统一{status,msg,data}；创建201其余200。非法/未知字段400、不存在404、冲突409、请求过大413、数据库/操作人不可用503，不输出SQL/配置。

| 路由                    | 输入                                                | data                             |
| ----------------------- | --------------------------------------------------- | -------------------------------- |
| GET /api/tasks/list     | page,pageSize,keyword,subject,status                | Page<TaskDefinition>             |
| GET /api/tasks/detail   | id                                                  | TaskDefinition                   |
| POST /api/tasks/create  | title,subject,description                           | TaskDefinition，默认启用         |
| PATCH /api/tasks/update | id,title,subject,description,status,expectedVersion | TaskDefinition                   |
| PATCH /api/tasks/status | id,status,expectedVersion                           | TaskDefinition，目标状态         |
| GET /api/tasks/options  | page,pageSize,keyword                               | Page<{id,title,subject}>，仅启用 |
| GET /api/tasks/subjects | page,pageSize,keyword                               | Page<{value}>，含停用科目去重    |

Page含items/total/page/pageSize；列表默认8，选项默认20，最大100；页≥1，越界空结果。keyword最多64，列表/options搜索标题/科目/说明，subjects搜科目；LIKE参数化且转义通配符。列表/options按updated_at DESC,id DESC，科目按value排序，均LIMIT。TaskDefinition仅id/title/subject/description/status/version/createdAt/updatedAt/assignmentCount:0。

## 交互和验收

保留列表、筛选、弹窗和启停入口。页面→composable→service→API→server/db，无mock回退。科目独立远程分页搜索，不从当前页伪造选项。详情API回填，关闭/切换忽略旧响应。所有请求有loading/empty/error；提交禁用，失败/409保留草稿并明确提示，刷新列表不丢草稿，重载详情需确认放弃。新建结果不明先刷新核对，不自动重发。启停409刷新列表并保留提示。

验收：两态、必填/空白/长度、分页/组合筛选/注入式关键词、停用可读、options仅启用、科目分页、冲突草稿、伪造操作人拒绝、无效/缺失操作人拒绝、持久化、FK/CHECK/事务失败及S1–S4数据不变。

## 数据与停止点

仅tutor_workspace，显式005迁移。种子2条固定任务；真实API新增验收最多1条，浏览器新增验收最多1条，重复识别复用、总计最多4条。固定内容/合成身份不匹配停止，不覆盖未知数据，不读mock JSON，不自动执行、不累计随机调试数据、不删除。清理另行授权。

S6真实统计/历史展示等问题留在实施计划，不由固定0提前裁决。回退应用保留表/台账/数据，无自动down。
