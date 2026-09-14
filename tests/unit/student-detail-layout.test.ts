import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { useStudentDetailWorkspace } from "../../app/composables/useStudentDetailWorkspace";

describe("student detail tab workspace", () => {
  it("loads only records by default, lazily visits others and preserves visits", async () => {
    const id = ref("1");
    const scope = effectScope();
    const state = scope.run(() => useStudentDetailWorkspace(() => id.value))!;
    expect(state.activeTab.value).toBe("records");
    expect({ ...state.visited }).toEqual({
      records: true,
      scores: false,
      assignments: false,
    });
    state.activeTab.value = "scores";
    await nextTick();
    expect(state.visited.scores).toBe(true);
    state.activeTab.value = "records";
    await nextTick();
    expect(state.visited.scores).toBe(true);
    state.activeTab.value = "assignments";
    await nextTick();
    expect(state.visited.assignments).toBe(true);
    scope.stop();
  });

  it("resets to records for another student", async () => {
    const id = ref("1");
    const scope = effectScope();
    const state = scope.run(() => useStudentDetailWorkspace(() => id.value))!;
    state.activeTab.value = "scores";
    await nextTick();
    id.value = "2";
    await nextTick();
    expect(state.activeTab.value).toBe("records");
    expect({ ...state.visited }).toEqual({
      records: true,
      scores: false,
      assignments: false,
    });
    scope.stop();
  });

  it("keeps plan progress API out of the detail page and mounts visited panes", () => {
    const page = readFileSync("app/pages/students/[id].vue", "utf8");
    expect(page).not.toMatch(/PlanProgressSection|plan-progress/);
    expect(page).toContain('v-if="visited.scores"');
    expect(page).toContain('v-if="visited.assignments"');
    expect(page).toContain(':force-render="visited.scores"');
    expect(page).toContain("<StudentTagsPanel");
    expect(page).toContain("#footer");
  });
});
