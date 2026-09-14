import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";

function ymdPlus(ymdStr, addDays) {
  const d = new Date(ymdStr + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + addDays);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toYmd(value) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

async function main() {
  const cfg = {
    host: "rm-wz9vd4ltuk4683ma2to.mysql.rds.aliyuncs.com",
    port: 3306,
    user: "kcct144",
    password: "!Kcct1448",
    database: "tutor_workspace",
  };

  const conn = await mysql.createConnection(cfg);
  const requestId = randomUUID();

  try {
    const [students] = await conn.execute(
      "SELECT id,name,status FROM students WHERE name=?",
      ["张钰润"],
    );
    if (!students.length) {
      console.log(JSON.stringify({ error: "未找到学生：张钰润" }, null, 2));
      return;
    }
    const student = students[0];

    const [units] = await conn.execute(
      "SELECT id,title,study_plan_id FROM tasks WHERE title IN (?, ?) ORDER BY title",
      ["高频1000词背诵 Unit 10", "高频1000词背诵 Unit 11"],
    );

    const [dateRows] = await conn.execute("SELECT DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00')) AS d");
    const todayStr = toYmd(dateRows[0].d);

    const [actors] = await conn.execute("SELECT id FROM users ORDER BY id LIMIT 1");
    const actorId = actors[0].id;

    const [planRows] = await conn.execute(
      "SELECT id,title FROM study_plan_documents WHERE id=?",
      [29],
    );

    const [planLinkRows] = await conn.execute(
      "SELECT 1 FROM study_plan_students WHERE plan_id=? AND student_id=? LIMIT 1",
      [29, student.id],
    );

    const report = {
      student: { id: student.id, name: student.name },
      today: todayStr,
      plan: { id: 29, title: planRows[0]?.title || "高频1000词背诵", linked: true },
      created: [],
      skipped: [],
      missing: [],
      verified: [],
    };

    if (!planLinkRows.length) {
      try {
        await conn.execute("INSERT INTO study_plan_students (plan_id, student_id) VALUES (?, ?)", [29, student.id]);
      } catch (error) {
        report.plan.linked = false;
        report.plan.error = String(error.message || error);
      }
    }

    const planTaskMap = new Map(units.map((u) => [u.title, u]));
    const needed = ["高频1000词背诵 Unit 10", "高频1000词背诵 Unit 11"];
    for (const name of needed) {
      if (!planTaskMap.has(name)) {
        report.missing.push(name);
      }
    }

    const schedule = [
      { title: "高频1000词背诵 Unit 10", dueDate: ymdPlus(todayStr, 1), offsetTag: "第1-2天" },
      { title: "高频1000词背诵 Unit 11", dueDate: ymdPlus(todayStr, 3), offsetTag: "第3-4天" },
    ];

    for (const item of schedule) {
      const task = planTaskMap.get(item.title);
      if (!task) {
        continue;
      }

      const [pending] = await conn.execute(
        "SELECT id,status FROM task_assignments WHERE task_id=? AND student_id=? AND status='pending' LIMIT 1",
        [task.id, student.id],
      );
      if (pending.length) {
        report.skipped.push({ taskId: String(task.id), title: task.title, reason: "已有待完成分配" });
        continue;
      }

      if (task.study_plan_id) {
        const [linked] = await conn.execute(
          "SELECT 1 FROM study_plan_students WHERE plan_id=? AND student_id=? LIMIT 1",
          [task.study_plan_id, student.id],
        );
        if (!linked.length) {
          report.skipped.push({ taskId: String(task.id), title: task.title, reason: `学习计划未关联（plan ${task.study_plan_id}）` });
          continue;
        }
      }

      const [insert] = await conn.execute(
        "INSERT INTO task_assignments (task_id,student_id,assigned_by,due_date,study_plan_id_snapshot) VALUES (?, ?, ?, ?, ?)",
        [task.id, student.id, actorId, item.dueDate, task.study_plan_id ?? null],
      );

      await conn.execute(
        "INSERT INTO audit_logs (request_id, actor_user_id, action, entity_type, entity_id, student_id, after_json) VALUES (?, ?, ?, ?, ?, ?, JSON_OBJECT('taskId', ?, 'dueDate', ?, 'status', 'pending', 'studyPlanId', ?))",
        [
          requestId,
          actorId,
          "task_assignment.create",
          "task_assignment",
          insert.insertId,
          student.id,
          task.id,
          item.dueDate,
          task.study_plan_id,
        ],
      );

      report.created.push({
        taskId: String(task.id),
        title: task.title,
        dueDate: item.dueDate,
        assignmentId: String(insert.insertId),
        slot: item.offsetTag,
      });
    }

    const [verify] = await conn.execute(
      "SELECT t.id AS task_id, t.title, ta.due_date, ta.status, ta.id AS assignment_id FROM task_assignments ta JOIN tasks t ON t.id=ta.task_id WHERE ta.student_id=? AND t.title IN (?, ?) ORDER BY ta.id",
      [student.id, "高频1000词背诵 Unit 10", "高频1000词背诵 Unit 11"],
    );

    console.log(JSON.stringify({
      requestId,
      ...report,
      verify,
    }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error?.message ? error.message : String(error));
  process.exit(1);
});
