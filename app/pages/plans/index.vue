<script setup lang="ts">
const route = useRoute();
const {
  items,
  total,
  page,
  pageSize,
  keyword,
  listLoading,
  listError,
  detailLoading,
  detailError,
  selectedId,
  selectedPlan,
  isEditing,
  draftContent,
  saving,
  saveMessage,
  saveError,
  conflict,
  canLeave,
  selectPlan,
  refreshList,
  startEditing,
  cancelEditing,
  saveEditing,
  reloadLatest,
} = useStudyPlans(() =>
  typeof route.query.planId === "string" ? route.query.planId : "",
);
onBeforeRouteLeave(() => canLeave());
</script>
<template>
  <div class="plans-page">
    <section class="list-heading plans-heading">
      <div>
        <p class="eyebrow">STUDY PLAN LIBRARY</p>
        <h1>学习计划</h1>
      </div>
      <span class="prototype-note">S4 · 真实计划正文与只读学生关联</span>
    </section>
    <section class="plans-shell">
      <aside class="plans-sidebar" aria-label="学习计划列表">
        <div class="plans-sidebar-head">
          <div>
            <strong>计划文档</strong><span>{{ total }} 份</span>
          </div>
          <AInput
            v-model:value="keyword"
            allow-clear
            :maxlength="64"
            placeholder="搜索计划"
          />
        </div>
        <ASkeleton v-if="listLoading" active aria-label="正在加载计划列表" />
        <AAlert
          v-else-if="listError"
          type="error"
          :message="listError"
          show-icon
          ><template #action
            ><AButton @click="refreshList">重试列表</AButton></template
          ></AAlert
        >
        <nav v-else class="plans-list">
          <button
            v-for="plan in items"
            :key="plan.id"
            type="button"
            class="plan-list-item"
            :class="{ active: plan.id === selectedId }"
            :disabled="saving"
            @click="selectPlan(plan.id)"
          >
            <strong>{{ plan.title }}</strong
            ><span>{{ plan.summary ?? "—" }}</span
            ><time
              >{{
                plan.updatedAt.replace("T", " ").replace("Z", " UTC")
              }}
              更新</time
            >
          </button>
          <div v-if="!items.length" class="plans-empty">
            没有找到匹配的学习计划
          </div>
        </nav>
        <APagination
          v-model:current="page"
          :page-size="pageSize"
          :total="total"
          :show-size-changer="false"
          size="small"
          class="plan-pagination"
        />
      </aside>
      <main class="plan-document-panel">
        <ASkeleton
          v-if="detailLoading && !selectedPlan"
          active
          aria-label="正在加载计划正文"
        />
        <AAlert v-if="detailError" type="error" :message="detailError" show-icon
          ><template #action
            ><AButton :disabled="saving" @click="reloadLatest"
              >重试正文</AButton
            ></template
          ></AAlert
        >
        <template v-if="selectedPlan">
          <header class="plan-document-head">
            <div>
              <p class="plan-document-kicker">MARKDOWN DOCUMENT</p>
              <h2>{{ selectedPlan.title }}</h2>
              <p>{{ selectedPlan.summary ?? "—" }}</p>
              <small>负责人：{{ selectedPlan.owner.name }}</small>
            </div>
            <div class="plan-document-actions">
              <template v-if="isEditing"
                ><AButton
                  :disabled="saving || detailLoading"
                  @click="cancelEditing"
                  >取消</AButton
                ><AButton
                  type="primary"
                  class="primary-green-button"
                  :loading="saving"
                  :disabled="conflict || detailLoading"
                  @click="saveEditing"
                  >保存</AButton
                ></template
              >
              <AButton
                v-else
                type="primary"
                class="primary-green-button"
                :disabled="detailLoading"
                @click="startEditing"
                >编辑计划</AButton
              >
            </div>
          </header>
          <AAlert
            v-if="saveMessage"
            type="success"
            :message="saveMessage"
            show-icon
          />
          <AAlert
            v-if="saveError"
            type="error"
            :message="saveError"
            show-icon
            role="alert"
          />
          <AButton
            v-if="conflict"
            :loading="detailLoading"
            @click="reloadLatest"
            >重载最新版本（替换草稿）</AButton
          >
          <div v-if="isEditing" class="plan-editor-wrap">
            <textarea
              v-model="draftContent"
              class="plan-editor"
              aria-label="学习计划 Markdown 编辑器"
              spellcheck="false"
              :disabled="saving || detailLoading"
            />
            <span class="plan-editor-hint"
              >{{ [...draftContent.trim()].length }} / 100000 字符 · 保存原始
              Markdown，仅正文可编辑</span
            >
          </div>
          <PlanMarkdown v-else :content="selectedPlan.content" />
          <section class="plan-task-progress-panel">
            <h3>关联任务</h3>
            <p v-if="!selectedPlan.relatedTasks.length" class="muted-cell">
              暂无关联任务
            </p>
            <div v-else class="plan-task-list">
              <article v-for="task in selectedPlan.relatedTasks" :key="task.id">
                <strong>{{ task.title }}</strong>
                <span
                  >{{ task.subject }} ·
                  {{ task.status === "enabled" ? "启用" : "停用" }}</span
                >
                <small>已分配 {{ task.assignmentCount }} 人</small>
              </article>
            </div>
          </section>
          <section class="plan-task-progress-panel">
            <h3>关联学生任务完成度</h3>
            <p v-if="!selectedPlan.studentProgress.length" class="muted-cell">
              暂无关联学生
            </p>
            <div v-else class="plan-task-list">
              <article
                v-for="item in selectedPlan.studentProgress"
                :key="item.student.id"
              >
                <NuxtLink :to="'/students/' + item.student.id">{{
                  item.student.name
                }}</NuxtLink>
                <span>{{ item.student.grade ?? "年级待确认" }}</span>
                <template v-if="item.progressState === 'active'"
                  ><strong
                    >{{ item.completedAssignments }} /
                    {{ item.totalAssignments }}</strong
                  ><AProgress :percent="item.progressPercent ?? 0" size="small"
                /></template>
                <small v-else>暂无任务</small>
              </article>
            </div>
          </section>
        </template>
        <div
          v-else-if="!detailLoading && !detailError"
          class="plans-document-empty"
        >
          请选择一份学习计划
        </div>
      </main>
    </section>
  </div>
</template>
<style scoped>
.plan-pagination {
  padding: 16px;
}
.plan-task-progress-panel {
  border-top: 1px solid #e4e9e8;
  margin-top: 24px;
  padding-top: 18px;
}
.plan-task-progress-panel h3 {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 12px;
}
.plan-task-list {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}
.plan-task-list article {
  border: 1px solid #e4e9e8;
  border-radius: 8px;
  padding: 10px;
}
.plan-task-list strong,
.plan-task-list span,
.plan-task-list small {
  display: block;
  margin-top: 4px;
}
.plan-task-list a {
  color: #236c57;
  font-weight: 700;
}
</style>
