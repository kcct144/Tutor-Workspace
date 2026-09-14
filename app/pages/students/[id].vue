<script setup lang="ts">
import { message } from "ant-design-vue";
const profile = useTemplateRef("profile");
const statusDialog = useTemplateRef("statusDialog");
const route = useRoute();
const { student, loading, error, notFound, refresh } = useStudentDetail(() =>
  String(route.params.id),
);
const { activeTab, visited } = useStudentDetailWorkspace(() =>
  String(route.params.id),
);
</script>

<template>
  <div class="detail-page">
    <NuxtLink class="back-link" to="/students">← 返回学员管理</NuxtLink>
    <ASkeleton
      v-if="loading && !student"
      active
      aria-label="正在加载学生详情"
    />
    <AResult
      v-else-if="notFound"
      status="404"
      title="未找到学生"
      sub-title="请返回学员管理重新选择学生"
    />
    <AAlert
      v-else-if="error && !student"
      type="error"
      show-icon
      :message="error"
      role="alert"
    >
      <template #action><AButton @click="refresh">重试</AButton></template>
    </AAlert>
    <template v-else-if="student">
      <AAlert v-if="error" type="error" :message="error" show-icon
        ><template #action
          ><AButton @click="refresh">重试基本信息</AButton></template
        ></AAlert
      >
      <p v-if="loading" role="status">正在刷新基本信息…</p>
      <div class="detail-context-row">
        <span class="prototype-note">S7 · 学生档案及关联查询已接入</span>
      </div>
      <div class="detail-layout">
        <BasicInfoPanel
          :student="student"
          @edit="profile?.begin(student.id)"
          @status="statusDialog?.begin(student)"
        >
          <template #footer>
            <StudentTagsPanel
              :key="'tags-' + student.id"
              :student-id="student.id"
              embedded
            />
          </template>
        </BasicInfoPanel>
        <div class="detail-main detail-workspace">
          <ATabs
            v-model:active-key="activeTab"
            :destroy-inactive-tab-pane="false"
          >
            <ATabPane key="records" tab="学习记录" force-render>
              <LearningRecordsSection
                :key="'records-' + student.id"
                :student-id="student.id"
              />
            </ATabPane>
            <ATabPane
              key="scores"
              tab="成绩记录"
              :force-render="visited.scores"
            >
              <ScoreRecordsSection
                v-if="visited.scores"
                :key="'scores-' + student.id"
                :student-id="student.id"
              />
            </ATabPane>
            <ATabPane
              key="assignments"
              tab="任务列表"
              :force-render="visited.assignments"
            >
              <AssignmentsSection
                v-if="visited.assignments"
                :key="'tasks-' + student.id"
                :student-id="student.id"
              />
            </ATabPane>
          </ATabs>
        </div>
      </div>
    </template>
    <StudentProfileDrawer
      ref="profile"
      @saved="message.success('学生档案已保存')"
    />
    <StudentStatusDialog ref="statusDialog" />
  </div>
</template>

<style scoped>
.detail-workspace {
  min-width: 0;
}
.detail-workspace :deep(.ant-tabs-nav) {
  margin: 0 0 12px;
}
.detail-workspace :deep(.ant-tabs-nav-wrap) {
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}
.detail-workspace :deep(.ant-tabs-nav-list) {
  flex: 0 0 auto;
}
.detail-workspace :deep(.ant-tabs-tab-btn:focus-visible) {
  outline: 2px solid #477657;
  outline-offset: 3px;
}
.detail-workspace :deep(.detail-section-card) {
  margin-bottom: 0;
}
@media (max-width: 720px) {
  .detail-workspace {
    width: 100%;
    overflow: hidden;
  }
}
</style>
