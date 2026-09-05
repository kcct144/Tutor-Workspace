<script setup lang="ts">
import { computed, ref } from "vue";
import { getStudyPlans } from "~/mocks/services/plans";
import type { StudyPlanDocument } from "~/types/plans";

const plans = ref<StudyPlanDocument[]>(getStudyPlans());
const selectedId = ref(plans.value[0]?.id ?? "");
const keyword = ref("");
const isEditing = ref(false);
const draftContent = ref("");
const saveMessage = ref("");

const selectedPlan = computed(
  () => plans.value.find((plan) => plan.id === selectedId.value) ?? null,
);
const filteredPlans = computed(() => {
  const query = keyword.value.trim();
  if (!query) return plans.value;
  return plans.value.filter(
    (plan) =>
      plan.title.includes(query) ||
      plan.summary.includes(query) ||
      plan.content.includes(query),
  );
});
const renderedContent = computed(() =>
  renderMarkdown(
    isEditing.value ? draftContent.value : (selectedPlan.value?.content ?? ""),
  ),
);

function selectPlan(id: string) {
  if (id === selectedId.value) return;
  if (
    isEditing.value &&
    selectedPlan.value &&
    draftContent.value !== selectedPlan.value.content &&
    !window.confirm("当前学习计划有未保存修改，确定放弃吗？")
  ) {
    return;
  }
  selectedId.value = id;
  isEditing.value = false;
  saveMessage.value = "";
}

function startEditing() {
  if (!selectedPlan.value) return;
  draftContent.value = selectedPlan.value.content;
  saveMessage.value = "";
  isEditing.value = true;
}

function cancelEditing() {
  isEditing.value = false;
  saveMessage.value = "";
}

function saveEditing() {
  const currentPlan = selectedPlan.value;
  if (!currentPlan || !draftContent.value.trim()) {
    saveMessage.value = "正文不能为空";
    return;
  }
  const index = plans.value.findIndex((plan) => plan.id === currentPlan.id);
  if (index < 0) return;
  plans.value[index] = {
    id: currentPlan.id,
    title: currentPlan.title,
    summary: currentPlan.summary,
    content: draftContent.value,
    updatedAt: "2026-09-05",
  };
  isEditing.value = false;
  saveMessage.value = "已保存到本次会话";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderInline(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderMarkdown(markdown: string) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let skippedDocumentTitle = false;

  const closeList = () => {
    if (listType) html.push(`</${listType}>`);
    listType = null;
  };
  const openList = (type: "ul" | "ol") => {
    if (listType === type) return;
    closeList();
    html.push(`<${type}>`);
    listType = type;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      closeList();
      continue;
    }
    if (
      line.startsWith("|") &&
      index + 1 < lines.length &&
      /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")
    ) {
      closeList();
      const headers = line.split("|").slice(1, -1);
      html.push(
        `<table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell.trim())}</th>`).join("")}</tr></thead><tbody>`,
      );
      index += 2;
      while (index < lines.length && (lines[index] ?? "").startsWith("|")) {
        const cells = (lines[index] ?? "").split("|").slice(1, -1);
        html.push(
          `<tr>${cells.map((cell) => `<td>${renderInline(cell.trim())}</td>`).join("")}</tr>`,
        );
        index += 1;
      }
      html.push("</tbody></table>");
      index -= 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1]?.length ?? 1;
      if (level === 1 && !skippedDocumentTitle) {
        skippedDocumentTitle = true;
        continue;
      }
      html.push(`<h${level}>${renderInline(heading[2] ?? "")}</h${level}>`);
      continue;
    }
    if (line.startsWith("> ")) {
      closeList();
      html.push(`<blockquote>${renderInline(line.slice(2))}</blockquote>`);
      continue;
    }
    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      openList("ul");
      const checkbox = unordered[1]?.match(/^\[([ xX])\]\s+(.+)$/);
      if (checkbox) {
        const checked = checkbox[1]?.toLowerCase() === "x";
        html.push(
          `<li class="plan-check-item"><span class="plan-check ${checked ? "checked" : ""}">${checked ? "✓" : ""}</span>${renderInline(checkbox[2] ?? "")}</li>`,
        );
      } else {
        html.push(`<li>${renderInline(unordered[1] ?? "")}</li>`);
      }
      continue;
    }
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      openList("ol");
      html.push(`<li>${renderInline(ordered[1] ?? "")}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${renderInline(line)}</p>`);
  }
  closeList();
  return html.join("");
}
</script>

<template>
  <div class="plans-page">
    <section class="list-heading plans-heading">
      <div>
        <p class="eyebrow">STUDY PLAN LIBRARY</p>
        <h1>学习计划</h1>
      </div>
      <span class="prototype-note">原型数据 · 仅本次会话有效</span>
    </section>

    <section class="plans-shell">
      <aside class="plans-sidebar" aria-label="学习计划列表">
        <div class="plans-sidebar-head">
          <div>
            <strong>计划文档</strong>
            <span>{{ filteredPlans.length }} 份</span>
          </div>
          <AInput v-model:value="keyword" allow-clear placeholder="搜索计划" />
        </div>
        <nav class="plans-list">
          <button
            v-for="plan in filteredPlans"
            :key="plan.id"
            type="button"
            class="plan-list-item"
            :class="{ active: plan.id === selectedId }"
            @click="selectPlan(plan.id)"
          >
            <strong>{{ plan.title }}</strong>
            <span>{{ plan.summary }}</span>
            <time>{{ plan.updatedAt }} 更新</time>
          </button>
          <div v-if="filteredPlans.length === 0" class="plans-empty">
            没有找到匹配的学习计划
          </div>
        </nav>
      </aside>

      <main v-if="selectedPlan" class="plan-document-panel">
        <header class="plan-document-head">
          <div>
            <p class="plan-document-kicker">MARKDOWN DOCUMENT</p>
            <h2>{{ selectedPlan.title }}</h2>
            <p>{{ selectedPlan.summary }}</p>
          </div>
          <div class="plan-document-actions">
            <span v-if="saveMessage" class="plan-save-message">{{
              saveMessage
            }}</span>
            <template v-if="isEditing">
              <AButton @click="cancelEditing">取消</AButton>
              <AButton
                type="primary"
                class="primary-green-button"
                @click="saveEditing"
                >保存</AButton
              >
            </template>
            <AButton
              v-else
              type="primary"
              class="primary-green-button"
              @click="startEditing"
              >编辑计划</AButton
            >
          </div>
        </header>
        <div v-if="isEditing" class="plan-editor-wrap">
          <textarea
            v-model="draftContent"
            class="plan-editor"
            aria-label="学习计划 Markdown 编辑器"
            spellcheck="false"
          />
          <span class="plan-editor-hint"
            >支持 Markdown 文本 · 保存后仅在当前浏览器会话内生效</span
          >
        </div>
        <!-- renderMarkdown 先转义原始文本，再生成受控标签 -->
        <!-- eslint-disable vue/no-v-html -->
        <article
          v-else
          class="plan-rendered-content"
          v-html="renderedContent"
        />
        <!-- eslint-enable vue/no-v-html -->
      </main>
      <div v-else class="plans-document-empty">请选择一份学习计划</div>
    </section>
  </div>
</template>
