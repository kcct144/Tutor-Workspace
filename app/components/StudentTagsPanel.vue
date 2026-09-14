<script setup lang="ts">
const props = withDefaults(
  defineProps<{ studentId: string; embedded?: boolean }>(),
  { embedded: false },
);
const {
  tags,
  draft,
  editing,
  loading,
  saving,
  error,
  notice,
  begin,
  cancel,
  save,
  refresh,
} = useStudentTags(() => props.studentId);
</script>
<template>
  <section
    class="student-tags-panel"
    :class="{ 'student-tags-embedded': embedded }"
    aria-label="学生标签"
  >
    <div class="tags-heading">
      <h2>学生标签</h2>
      <AButton v-if="!editing" :disabled="loading" @click="begin"
        >编辑标签</AButton
      >
    </div>
    <p v-if="loading" role="status">正在加载标签…</p>
    <AAlert v-if="error" type="error" show-icon :message="error" />
    <p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="editing">
      <ASelect
        v-model:value="draft"
        mode="tags"
        aria-label="学生标签"
        placeholder="输入标签后按回车，可添加多个"
        :disabled="loading || saving"
        style="width: 100%"
      />
      <p>每位学生最多10个标签，每个最多24个字符。移除标签后需保存。</p>
      <ASpace wrap
        ><AButton
          type="primary"
          :loading="saving"
          :disabled="loading"
          @click="save"
          >保存标签</AButton
        ><AButton :disabled="saving" @click="cancel">取消</AButton
        ><APopconfirm
          title="重新加载将替换未保存的标签，是否继续？"
          :disabled="saving || loading"
          @confirm="refresh"
          ><AButton :disabled="saving || loading"
            >重新加载</AButton
          ></APopconfirm
        ></ASpace
      >
    </template>
    <div v-else class="tags-list">
      <ATag v-for="tag in tags" :key="tag" color="cyan">{{ tag }}</ATag
      ><span v-if="!loading && !tags.length && !error">暂无标签</span
      ><AButton v-if="error" @click="refresh">重试</AButton>
    </div>
  </section>
</template>
<style scoped>
.student-tags-panel {
  padding: 20px;
  border: 1px solid #e1e6df;
  border-radius: 12px;
  background: white;
  min-width: 0;
}
.student-tags-embedded {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.student-tags-embedded .tags-heading {
  align-items: baseline;
}
.student-tags-embedded h2 {
  color: #47544c;
  font-size: 13px;
}
.student-tags-embedded p {
  margin: 8px 0;
  color: #7d8981;
  font-size: 12px;
}
.tags-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
h2 {
  margin: 0;
  font-size: 18px;
}
.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tags-list :deep(.ant-tag) {
  white-space: normal;
  overflow-wrap: anywhere;
  max-width: 100%;
}
</style>
