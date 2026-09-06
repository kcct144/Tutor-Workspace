import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { taskActor, verifyTasks, protectedSnapshot } from "./task-fixtures.mjs";
export async function assignmentContext(db) {
  const actor = await taskActor(db),
    tasks = await verifyTasks(db, actor);
  const [students] = await db.execute(
    "SELECT id,name,note FROM students ORDER BY id LIMIT 13",
  );
  assert.equal(students.length, 12);
  const studentIds = [];
  for (let i = 1; i <= 12; i++) {
    const matches = students.filter(
      (row) =>
        row.name === "S1演示学生" + String(i).padStart(2, "0") &&
        row.note === "仅用于S1联调的合成记录，不代表真实学生。",
    );
    assert.equal(matches.length, 1);
    studentIds.push(String(matches[0].id));
  }
  const titles = ["S5标准任务甲", "S5固定API验收", "S5固定浏览器验收"];
  const taskIds = titles.map((title) => {
    const row = tasks.find((item) => item.title === title);
    assert.ok(row);
    assert.equal(row.status, "enabled");
    return String(row.id);
  });
  const disabled = tasks.find((task) => task.status === "disabled");
  assert.ok(disabled);
  return { actor, taskIds, studentIds, disabledId: String(disabled.id) };
}
export function seedAssignments(context, today) {
  const { taskIds, studentIds } = context;
  const offset = (days) =>
    new Date(Date.parse(today + "T00:00:00Z") + days * 86400000)
      .toISOString()
      .slice(0, 10);
  return [
    ...taskIds.map((taskId, i) => ({
      taskId,
      studentId: studentIds[0],
      status: "pending",
      dueDate: offset(i - 1),
      completedAt: null,
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      taskId: taskIds[0],
      studentId: studentIds[0],
      status: "completed",
      dueDate: "2000-01-0" + (i + 1),
      completedAt: "2000-01-0" + (i + 1) + " 00:00:00.000",
    })),
    {
      taskId: taskIds[0],
      studentId: studentIds[3],
      status: "pending",
      dueDate: offset(1),
      completedAt: null,
    },
  ];
}
export async function verifyAssignments(db, context) {
  const [rows] = await db.execute(
    "SELECT id,task_id,student_id,assigned_by,status,assigned_at,due_date,completed_at,version FROM task_assignments ORDER BY id LIMIT 15",
  );
  assert.ok(rows.length >= 9 && rows.length <= 14);
  const seed = rows.slice(0, 9),
    anchor = seed[1].due_date,
    expected = seedAssignments(context, anchor);
  for (let i = 0; i < 9; i++) {
    const row = seed[i],
      value = expected[i];
    assert.equal(String(row.task_id), value.taskId);
    assert.equal(String(row.student_id), value.studentId);
    assert.equal(row.due_date, value.dueDate);
    assert.equal(String(row.assigned_by), context.actor);
  }
  const allowed = [
    [context.taskIds[0], context.studentIds[6]],
    [context.taskIds[0], context.studentIds[7]],
    [context.taskIds[1], context.studentIds[10]],
    [context.taskIds[1], context.studentIds[11]],
    [context.taskIds[2], context.studentIds[9]],
  ];
  for (const row of rows.slice(9)) {
    assert.ok(
      allowed.some(
        ([task, student]) =>
          String(row.task_id) === task && String(row.student_id) === student,
      ),
    );
    assert.equal(String(row.assigned_by), context.actor);
    assert.equal(
      rows
        .slice(9)
        .filter(
          (item) =>
            String(item.task_id) === String(row.task_id) &&
            String(item.student_id) === String(row.student_id),
        ).length,
      1,
    );
  }
  return rows;
}
export async function s6ProtectedSnapshot(db) {
  const previous = await protectedSnapshot(db);
  const [rows] = await db.execute(
    "SELECT id,owner_user_id,title,subject,description,status,version,created_at,updated_at FROM tasks ORDER BY id LIMIT 100",
  );
  previous.tasks = {
    count: rows.length,
    hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
  };
  return previous;
}
