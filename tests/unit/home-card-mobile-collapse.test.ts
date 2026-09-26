import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("home card mobile collapse", () => {
  const card = readFileSync("app/components/HomeStudentCard.vue", "utf8");

  it("collapses cards on phones and expands on tap instead of navigating", () => {
    expect(card).toContain("(max-width: 600px)");
    expect(card).toContain("matchMedia");
    expect(card).toContain(
      "class=\"{ 'mobile-collapsed': mobile && !expanded }\"",
    );
    expect(card).toContain("expanded.value = !expanded.value");
    expect(card).toContain('aria-expanded="mobile ? expanded : undefined"');
  });

  it("shows a compact summary while collapsed and a detail entry when expanded", () => {
    expect(card).toContain('v-if="mobile && !expanded" class="card-summary"');
    expect(card).toContain("点击展开");
    expect(card).toContain('v-if="mobile" class="card-detail-action"');
    expect(card).toContain("查看详情");
  });

  it("keeps desktop card navigation unchanged", () => {
    expect(card).toContain('role="link"');
    expect(card).toContain('"Enter", " "');
    expect(card).toContain("event.target !== event.currentTarget");
    expect(card).toContain('navigateTo("/students/" + id)');
    expect(card).toContain('v-if="!mobile || expanded"');
  });

  it("inlines grade and subjects next to the student name", () => {
    const h2 = card.slice(card.indexOf("<h2>"), card.indexOf("</h2>") + 5);
    expect(h2).toContain("student-name");
    expect(h2).toContain("grade-label");
    expect(h2).toContain("expiry-tag");
  });

  it("removes home pagination and loads one bounded page", () => {
    const page = readFileSync("app/pages/index.vue", "utf8");
    expect(page).not.toContain("APagination");
    const home = readFileSync("app/composables/useHome.ts", "utf8");
    expect(home).toContain("homeStudentsPageSize");
  });
});
