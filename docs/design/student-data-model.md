# 学生数据模型（S1基础 + S2合同聚合）

- 状态：已实现（S1基础与S2合同聚合，待验收）
- 负责人：开发负责人（按总指挥裁决同步）
- 创建日期：2026-09-05
- 最后更新日期：2026-09-06
- 关联需求：S1学生基础、S2合同聚合

## S1模型

仅创建users、students和schema_migrations；InnoDB、utf8mb4。BIGINT UNSIGNED主键，API用string防精度损失；日期DATE，时间DATETIME(3)使用UTC。无软删除、删除接口或级联删除。
users：id自增主键、name VARCHAR(64)非空、created_at/updated_at；只作演示人员引用，不设登录/密码/电话/邮箱。
students：

| 字段                           | 类型与约束                                                   |
| ------------------------------ | ------------------------------------------------------------ |
| id                             | BIGINT UNSIGNED自增PK                                        |
| owner_user_id                  | BIGINT UNSIGNED NULL，FK users.id，ON DELETE/UPDATE RESTRICT |
| name                           | VARCHAR(64) NOT NULL，trim后非空                             |
| grade                          | VARCHAR(16) NOT NULL；初一/初二/初三/高一/高二               |
| class_name / school            | VARCHAR(32) / VARCHAR(128)，NULL                             |
| gender                         | VARCHAR(8) NULL；非空时男/女                                 |
| enrolled_at                    | DATE NULL                                                    |
| guardian_name / guardian_phone | VARCHAR(64) / VARCHAR(32)，NULL                              |
| note                           | VARCHAR(500) NULL                                            |
| status                         | VARCHAR(16) NOT NULL；在读/待分配/已结课                     |
| created_at / updated_at        | DATETIME(3) NOT NULL                                         |

索引：(grade,status,id)、(owner_user_id,id)，另有主键。姓名/联系方式不唯一。S1只读，无version或last_follow_up_at列。
schema_migrations：version VARCHAR(64) PK、checksum CHAR(64)、applied_at DATETIME(3)。迁移显式有序执行，成功才记录，已执行文件校验和不允许更改；DDL失败停下人工核对，不自动drop/清库。

## 投影与阶段边界

选择器仅id/name/grade；列表不返回监护人/备注。详情才返回监护人/备注/负责人，全部仅合成测试数据。
S2已接入contracts：由服务端Asia/Shanghai今天判定有效时间合同start≤今天≤end，课时attended<total；列表和详情subjects从有效合同去重聚合，expiryDate取有效时间合同MIN(end_date)，没有则[]/null，无mock兜底。每页学生ID批量聚合，学生表不新增冗余字段。
S2编号由crypto.randomUUID生成、唯一且API不可改，编辑version防覆盖；表字段/索引/互斥约束以[合同PRD](../prd/contracts.md)和002_contracts.sql为准。created_by/updated_by为DEV_ACTOR_ID人员引用，不建历史审计表。合同保存使学生数据失效，跨页重读/聚焦刷新。
plans仍[]、lastFollowUp仍null，明确后续接入。S3后最近跟进取MAX(记录occurred_on)；当前不建记录/学习计划/任务表。

## 安全与执行

仅允许用户批准的tutor_workspace。每个连接在迁移/装载/业务查询前执行DATABASE()校验，不匹配停止，不显示真实配置。禁用多语句SQL，不允许切库、数据库创建删除、清库或操作其他库。
迁移固定清单：S1三表、S2仅contracts，受限语句检查，不接受任意SQL。S1种子检查人员/学生表为空；S2合同种子只给已识别的合成学生追加，已有合同的学生跳过，不读mock、不改.env。每次DML前再次校验DATABASE()。
DEV_ACTOR_ID由用户在.env自行填写；S2写入和合同种子验证人员存在，缺失/无效拒绝。S1创建首个演示人员的装载不依赖该值，不是浏览器写接口。
回滚默认保留表与数据，回退应用；不提供自动破坏性down。需处理失败DDL时先检查当前库和现有结构，再单独审批修复，不删除其他表。
