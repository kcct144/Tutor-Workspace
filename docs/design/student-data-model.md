# 学生数据模型（S1）

- 状态：已确认
- 负责人：开发负责人（按总指挥裁决同步）
- 创建日期：2026-09-05
- 最后更新日期：2026-09-06
- 关联需求：S1学生基础

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

列表仅基本展示字段及空聚合；选择器仅id/name/grade。详情才返回监护人/备注/负责人，全部仅合成测试数据。S1 subjects/plans=[]、expiryDate/lastFollowUp=null。
后续已确认规则：有效时间合同开始日≤今天≤结束日、课时attended<total；科目去重，到期取有效时间合同最早日期；最近跟进取MAX(记录occurred_on)。合同编号由服务端生成、唯一不可改。记录可编辑不可删、发生日期≤今天、上限10000字。详细后续表结构以已确认实施计划为准，不在S1迁移。

## 安全与执行

仅允许用户批准的tutor_workspace。每个连接在迁移/装载/业务查询前执行DATABASE()校验，不匹配停止，不显示真实配置。禁用多语句SQL，不允许切库、数据库创建删除、清库或操作其他库。
迁移只含本切片三表的CREATE TABLE，使用受限语句检查；不接受用户任意SQL。独立合成装载脚本显式执行，检查表无业务数据后事务插入，不读mock、不改.env。重复运行应安全停止，不能覆盖。
DEV_ACTOR_ID由用户自行填写.env，未来写操作只从服务端获取。装载脚本创建首个演示人员，不依赖预先存在的DEV_ACTOR_ID，不是浏览器写接口。
回滚默认保留表与数据，回退应用；不提供自动破坏性down。需处理失败DDL时先检查当前库和现有结构，再单独审批修复，不删除其他表。
