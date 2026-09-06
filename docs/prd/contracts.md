# 合同模块（S2）

- 状态：已实现（开发自测，待总指挥/测试验收）
- 负责人：开发负责人
- 创建日期：2026-09-05
- 最后更新日期：2026-09-06
- 关联需求：S2合同、学生列表与详情合同聚合

## 已确认范围

只实现合同列表、筛选、分页、详情、新增、编辑及科目选项；学生科目和到期日读取真实合同聚合。保留合同原型的表格、筛选、弹窗布局（实际路由为 /contracts），增加编号只读展示、异步反馈、版本冲突提示和远程选项分页。无金额、支付、附件、续签、作废、删除、自动扣课；不实现首页、记录、计划、任务、Redis、登录或权限。

## 字段与规则

- 一个合同关联一个学生、一个科目；学生可有多合同。科目trim后1–64个Unicode字符，使用区分大小写/重音的数据库排序规则去重，不新建科目字典。
- 类型为month/月卡、half_year/半年卡、year/年卡、lessons/按课时。
- 时间类startDate/endDate必填真实YYYY-MM-DD日期、开始≤结束；attendedLessons/totalLessons必须为null。日期人工填，不自动按月计算。
- 按课时两个日期必须为null；课时整数，0≤已上≤总数、总数>0。所有类型保留makeupLessons非负整数，默认0；三个课时数上限采用INT UNSIGNED的4294967295，不允许小数。
- contractNo仅服务端crypto.randomUUID()生成，唯一、不可改。请求中出现编号（即使原值）、操作人或未知字段都拒绝。
- version从1递增；编辑提交expectedVersion，旧版本409，保留输入，用户主动重新载入后再编辑。允许更换关联学生，保存后原/新学生聚合均重新读取。
- created_by/updated_by只保存服务端DEV_ACTOR_ID对应人员引用，用于本次写入责任信息，不创建审计历史或账号管理系统。

## 权威有效性与聚合

每次API请求由服务端取得Asia/Shanghai当天日期，不接受客户端asOfDate。
时间类开始≤今天≤到期为生效中；未来未开始，结束日<今天已到期。
按课时已上<总数为生效中，等于总数已用完，不受日期影响。
学生subjects只从生效合同去重；expiryDate为有效时间合同MIN(end_date)，无则null。无有效合同subjects=[]，不保留mock兜底。
列表、详情、筛选和聚合使用同一规则；学生表不冗余存结果。读取时自然跨天更新，无后台定时任务。

## API与数据模型

统一{status,msg,data}；GET分页page默认1、pageSize默认8最大100，科目选项默认20；页码最大1000000000；越界为空items、total准确。

| 路由                        | 输入                                                                                        | 输出                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| GET /api/contracts/list     | page/pageSize，keyword、studentId、subject、contractType、status可选                        | 分页Contract；关键词匹配编号/学生名/科目 |
| GET /api/contracts/detail   | id                                                                                          | Contract                                 |
| POST /api/contracts/create  | studentId,subject,contractType,startDate,endDate,attendedLessons,totalLessons,makeupLessons | 201 Contract                             |
| PATCH /api/contracts/update | 上述字段+id,expectedVersion                                                                 | 200 Contract                             |
| GET /api/contracts/subjects | page/pageSize、keyword可选                                                                  | 分页{value}；包括历史合同科目以支持筛选  |

Contract包含id/contractNo/studentId/studentName/subject/contractType/日期/课时/补课数/status/version/updatedAt，不返回人员内部字段或完整数据库行。
400校验、404关联学生/合同不存在、409版本/编号冲突、413超大JSON、503数据库或DEV_ACTOR配置缺失/无效；不泄露配置/SQL/驱动错误。写请求仅JSON，技术上限16KiB，失败不自动重发。

002_contracts只创建contracts：BIGINT主键、student FK、人员FK、编号唯一、类型和互斥CHECK、非空/整数范围约束；version正数；(student_id,start_date,end_date,id)、(subject,contract_type,id)索引。保留创建/更新时间，UTC；无软删除。已应用S1 SQL不改。
显式迁移/种子/测试及运行时每次写库前确认DATABASE()为批准的tutor_workspace；无切库/清库/跨库操作。凭据只由用户配置.env，工具不得查看或输出其内容。

## 前端与刷新

- 学生/科目选择器用远程搜索、分页或加载更多，不从当前合同页冒充完整选项；选项有加载、空、错误/重试。
- 编辑先取详情，显示加载/失败；保存期间禁用表单与重复提交，成功关闭并刷新列表，失败保留草稿。
- 网络结果不明时不自动重试创建，提示先刷新核对编号/学生，避免重复新增；409保留草稿并提供重新载入。
- 合同保存发送学生数据失效通知；同页挂载的学生查询刷新，跨路由进入学生列表/详情重新读取；其他标签页重新聚焦时刷新，不持久缓存聚合。
- 学生详情新增科目展示，学生列表科目用标签，到期空值为“—”；学习计划/记录/任务仍为空且标注后续接入。
- 开发人员仅在服务端.env填写DEV_ACTOR_ID；没有有效人员则禁止写入，不默认演示ID。S2仍不得公网部署。

## 种子、测试与回退

显式合同种子仅识别S1合成标记且人员/学生匹配的现有学生；事务插入，不覆盖已有合同。采用带S2标记的合成科目检测已装载，重复跳过；有非种子合同的目标学生跳过，不读mock、不改.env。每条编号仍由randomUUID生成。
单元覆盖四类型/日期/互斥/课时范围、状态与上海跨日、输入白名单/版本；真实API覆盖创建编辑、409和学生刷新一致。数据库约束/唯一性/失败回滚用批准库内事务验证，回滚测试数据，不清库；API新增的合成测试合同保留并明确标记。
验收：同一合成学生两份有效时间合同→科目去重/最早到期→编辑使最早失效→显示另一份；课时耗尽后剔除科目；无有效合同无兜底；刷新/跨页结果一致。
回退应用、保留合同数据；DDL不支持整组事务回滚，失败停止人工核对，不自动drop或清库。任何破坏性处理另行审批。S2交付后停止，不开始S3。
