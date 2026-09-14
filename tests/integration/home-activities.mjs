// Read-only integration: no seed, no business writes, no private output.
import { runDatabaseCommand } from "../../database/connection.mjs";
import { listHome } from "../../server/db/home.ts";
import { shanghaiToday } from "../../server/db/contracts-rules.ts";

function check(condition) {
  if (!condition) throw new Error("S12 read-only assertion failed");
}
await runDatabaseCommand(async (db) => {
  await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await db.query("START TRANSACTION READ ONLY");
  try {
    const today = shanghaiToday();
    const page = await listHome(
      db,
      { page: 1, pageSize: 100 },
      { role: "admin", userId: "1" },
      today,
    );
    for (const card of page.items) {
      const [pending] = await db.execute(
        "SELECT id,due_date FROM task_assignments WHERE student_id=? AND status='pending' ORDER BY due_date ASC,id ASC LIMIT 4",
        [card.id],
      );
      const [counts] = await db.execute(
        "SELECT COUNT(*) AS total FROM task_assignments WHERE student_id=? AND status='pending' LIMIT 1",
        [card.id],
      );
      check(card.pendingCount === Number(counts[0].total));
      check(card.pendingRemaining === Math.max(0, card.pendingCount - 3));
      check(
        JSON.stringify(card.pendingTasks.map((t) => t.id)) ===
          JSON.stringify(pending.slice(0, 3).map((t) => String(t.id))),
      );
      const [events] = await db.execute(
        `SELECT source_id,source_type,occurred_at FROM (
        SELECT id AS source_id,'task_completed' AS source_type,completed_at AS occurred_at FROM task_assignments WHERE student_id=? AND status='completed' AND completed_at IS NOT NULL
        UNION ALL SELECT id,'learning_record_created',created_at FROM student_learning_records WHERE student_id=?
      ) e ORDER BY occurred_at DESC,source_id DESC,source_type DESC LIMIT 5`,
        [card.id, card.id],
      );
      check(
        JSON.stringify(card.activities.map((a) => a.id)) ===
          JSON.stringify(
            events.map((e) => `activity:${e.source_type}:${e.source_id}`),
          ),
      );
      check(
        card.activities.every(
          (a) =>
            a.type !== "learning_record_created" ||
            Array.from(a.recordSummary).length <= 48,
        ),
      );
      check(!("completedTasks" in card) && !("guardianPhone" in card));
      check(card.pendingTasks.every((t) => !("description" in t)));
    }
    console.log(
      `PASS S12 read-only MySQL: ${page.items.length} cards, ordering/counts/projections; no business writes.`,
    );
    if (!page.items.length)
      console.log(
        "SKIP populated-card comparisons: no visible active students.",
      );
  } finally {
    await db.rollback();
  }
});
