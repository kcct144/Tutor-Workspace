import assert from "node:assert/strict";
import { requireDevActor } from "../../server/db/dev-actor.ts";
export const planFixtures = [
  {
    title: "S4标准演示计划",
    summary: "S4固定样例甲：共享关联演示。",
    content:
      "# S4标准演示计划\n\n## 示例正文\n\n仅用于开发验收：正文唯一检索词甲。\n\n- **示例要点**\n- [ ] 示例清单\n\n> 这不是产品规则。\n\n| 项目 | 说明 |\n| --- | --- |\n| 示例 | `原始 Markdown` |\n",
  },
  {
    title: "S4标准演示计划",
    summary: "S4固定样例乙：同名不同ID。",
    content:
      "# S4标准演示计划\n\n## 第二份示例\n\n1. 仅用于验证同名标签不合并。\n2. 不代表真实学习安排。\n",
  },
  {
    title: "S4独立演示计划",
    summary: null,
    content: "# S4独立演示计划\n\n## 独立阅读\n\n仅用于浏览器编辑验收。\n",
  },
];
export const browserPlanContent =
  planFixtures[2].content + "\n浏览器固定保存校验。\n";
export const unsafePlanContent =
  '  \n## 特殊字符与安全预览\n\n<script>alert("S4安全校验")</script>\n<img src="x" onerror="alert(1)">\n[链接](javascript:alert(1))\n&amp; **粗体** `代码`\n\n  ';
export const longPlanContent = "😀".repeat(100000);
export async function planFixtureContext(db) {
  const actorId = await requireDevActor(db, process.env.DEV_ACTOR_ID);
  const [actor] = await db.execute(
    "SELECT id FROM users WHERE id=? AND name=? LIMIT 1",
    [actorId, "S1合成演示老师"],
  );
  assert.equal(actor.length, 1);
  const [students] = await db.execute(
    "SELECT id,name FROM students WHERE name IN (?,?,?) AND note=? ORDER BY name LIMIT 4",
    [
      "S1演示学生01",
      "S1演示学生02",
      "S1演示学生03",
      "仅用于S1联调的合成记录，不代表真实学生。",
    ],
  );
  assert.equal(students.length, 3);
  assert.equal(new Set(students.map((s) => s.name)).size, 3);
  return { actorId, studentIds: students.map((s) => String(s.id)) };
}
export async function verifyPlanFixtures(db, actorId, studentIds) {
  const [rows] = await db.execute(
    "SELECT id,owner_user_id,title,summary,content FROM study_plan_documents ORDER BY id LIMIT ?",
    [4],
  );
  assert.equal(rows.length, 3);
  rows.forEach((row, index) => {
    assert.equal(String(row.owner_user_id), actorId);
    assert.equal(row.title, planFixtures[index].title);
    assert.equal(row.summary, planFixtures[index].summary);
  });
  const [relations] = await db.execute(
    "SELECT plan_id,student_id FROM study_plan_students ORDER BY plan_id,student_id LIMIT ?",
    [5],
  );
  const expected = [
    [String(rows[0].id), studentIds[0]],
    [String(rows[0].id), studentIds[1]],
    [String(rows[1].id), studentIds[0]],
    [String(rows[2].id), studentIds[2]],
  ];
  assert.deepEqual(
    relations.map((r) => [String(r.plan_id), String(r.student_id)]),
    expected,
  );
  return rows;
}
