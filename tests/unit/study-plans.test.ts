import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import type { Connection } from "mysql2/promise";
import {
  parsePlanQuery,
  parsePlanUpdate,
} from "../../server/db/study-plan-rules";
import {
  projectPlanList,
  projectPlanDetail,
  studentPlanTags,
  listPlans,
} from "../../server/db/study-plans";
import { parseMigration } from "../../server/db/safety";
import { renderMarkdown } from "../../app/utils/markdown";
describe("S4 validation and rendering", () => {
  it("preserves original markdown while enforcing Unicode trimmed length", () => {
    const content = " \n\t## 标题\r\n    缩进\n\n ";
    expect(
      parsePlanUpdate({ id: "1", expectedVersion: 1, content }).content,
    ).toBe(content);
    expect(
      parsePlanUpdate({
        id: "1",
        expectedVersion: 1,
        content: "\n" + "😀".repeat(100000) + "\n",
      }).content,
    ).toHaveLength(200002);
    for (const content of ["", " \n\t", "字".repeat(100001), null, 3])
      expect(() =>
        parsePlanUpdate({ id: "1", expectedVersion: 1, content }),
      ).toThrow();
  });
  it("rejects unknown fields, owner/actor forgery, invalid ID/version and pagination", () => {
    for (const field of [
      "title",
      "summary",
      "owner",
      "ownerUserId",
      "actor",
      "actorId",
      "version",
      "studentIds",
    ])
      expect(() =>
        parsePlanUpdate({
          id: "1",
          expectedVersion: 1,
          content: "正文",
          [field]: "伪造",
        }),
      ).toThrow();
    for (const expectedVersion of [0, -1, 1.5, "1", 4294967296])
      expect(() =>
        parsePlanUpdate({ id: "1", expectedVersion, content: "正文" }),
      ).toThrow();
    expect(parsePlanQuery({})).toMatchObject({ page: 1, pageSize: 20 });
    for (const query of [
      { page: "0" },
      { pageSize: "101" },
      { keyword: ["a"] },
      { keyword: "字".repeat(65) },
      { ownerId: "1" },
    ])
      expect(() => parsePlanQuery(query)).toThrow();
  });
  it("escapes script, event handlers, URLs and entity injection in all markup contexts", () => {
    const payload = "<script>alert(1)</script><img src=x onerror=alert(1)>";
    const html = renderMarkdown(
      "## " +
        payload +
        "\n\n> " +
        payload +
        "\n- **" +
        payload +
        "**\n- [x] " +
        payload +
        "\n| 列 |\n| --- |\n| " +
        payload +
        " |\n[j](javascript:alert(1))\n&lt;script&gt;",
    );
    // Inspect actual generated tags, not escaped text containing literal src/onerror.
    expect((html.match(/<[^>]*>/g) ?? []).join("")).not.toMatch(
      /<script|<img|<a\b|\shref=|\ssrc=|<[^>]+\son\w+=/i,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;lt;script&amp;gt;");
    expect(html).toContain("<table>");
    expect(html).toContain("<strong>");
    expect(html).toContain("plan-check checked");
  });
  it("migration contains only approved S4 tables and restrictive foreign keys", () => {
    const sql = readFileSync(
      new URL("../../database/migrations/004_study_plans.sql", import.meta.url),
      "utf8",
    );
    expect(
      parseMigration(
        sql,
        ["study_plan_documents", "study_plan_students"],
        ["users", "students", "study_plan_documents"],
      ),
    ).toHaveLength(2);
    expect(sql).toContain("PRIMARY KEY (plan_id, student_id)");
    expect(sql).not.toMatch(/CASCADE|deleted_at|history/);
  });
});
describe("S4 SQL and projection", () => {
  const row = {
    id: "1",
    title: "同名",
    summary: null,
    content: "正文",
    version: 1,
    created_at: "2000-01-01 00:00:00.000",
    updated_at: "2000-01-01 00:00:00.000",
    owner_user_id: "1",
    owner_name: "合成人员",
    internal_secret: "private",
  };
  it("list excludes body and internal fields; search binds all three fields with LIMIT", async () => {
    expect(Object.keys(projectPlanList(row)).sort()).toEqual(
      ["id", "title", "summary", "updatedAt", "version"].sort(),
    );
    expect(projectPlanDetail(row)).not.toHaveProperty("internal_secret");
    const execute = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[row]]);
    const result = await listPlans({ execute } as unknown as Connection, {
      page: 1,
      pageSize: 20,
      keyword: "%'_!",
    });
    expect(result.total).toBe(1);
    expect(execute.mock.calls[1]![0]).toContain("LIMIT ? OFFSET ?");
    expect(execute.mock.calls[1]![1]).toEqual([
      "%!%'!_!!%",
      "%!%'!_!!%",
      "%!%'!_!!%",
      20,
      0,
    ]);
  });
  it("batches all current students with LIMIT and keeps different IDs with identical titles", async () => {
    const execute = vi.fn().mockResolvedValue([
      [
        {
          student_id: "2",
          plans: [
            { id: "2", title: "同名" },
            { id: "1", title: "同名" },
          ],
        },
        { student_id: "3", plans: [{ id: "1", title: "同名" }] },
      ],
    ]);
    const db = { execute } as unknown as Connection;
    expect((await studentPlanTags(db, [])).size).toBe(0);
    expect(execute).not.toHaveBeenCalled();
    const tags = await studentPlanTags(db, ["2", "3"]);
    expect(tags.get("2")?.map((p) => p.id)).toEqual(["1", "2"]);
    expect(tags.get("3")).toHaveLength(1);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]![0]).toContain(
      "GROUP BY ps.student_id LIMIT ?",
    );
    expect(execute.mock.calls[0]![1]).toEqual(["2", "3", 2]);
  });
});
