<script setup lang="ts">
import { watch } from "vue";
import { ServiceError } from "~/services/http";

const route = useRoute();
const { user, settingsOpen, refresh, signOut, saveResponsibleSubjects } =
  useAuth();
const loggingOut = ref(false);
const savingSettings = ref(false);
const settingsError = ref("");
const settingsNotice = ref("");
const settingsConflict = ref(false);
const subjectDraft = ref<string[]>([]);

watch(settingsOpen, (open) => {
  if (!open) return;
  subjectDraft.value = [...(user.value?.responsibleSubjects ?? [])];
  settingsError.value = "";
  settingsNotice.value = "";
  settingsConflict.value = false;
});

async function saveSettings() {
  if (savingSettings.value) return;
  savingSettings.value = true;
  settingsError.value = "";
  settingsNotice.value = "";
  settingsConflict.value = false;
  try {
    await saveResponsibleSubjects(subjectDraft.value);
    settingsNotice.value = "负责学科已保存。";
  } catch (cause) {
    settingsConflict.value =
      cause instanceof ServiceError && cause.code === "VERSION_CONFLICT";
    settingsError.value = settingsConflict.value
      ? "设置已在其他窗口更新。当前选择已保留，请重新加载后再确认。"
      : cause instanceof ServiceError
        ? cause.message
        : "负责学科保存失败，请重试。";
  } finally {
    savingSettings.value = false;
  }
}

async function reloadSettings() {
  settingsError.value = "";
  settingsConflict.value = false;
  try {
    const current = await refresh();
    subjectDraft.value = [...(current?.responsibleSubjects ?? [])];
    settingsNotice.value = "已读取最新设置。";
  } catch (cause) {
    settingsError.value =
      cause instanceof ServiceError
        ? cause.message
        : "最新设置读取失败，请重试。";
  }
}

async function logout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  try {
    await signOut();
    await navigateTo("/login");
  } finally {
    loggingOut.value = false;
  }
}
</script>

<template>
  <ALayout class="app-shell">
    <ALayoutHeader v-if="route.path !== '/login'" class="app-header">
      <div class="header-inner">
        <NuxtLink to="/" class="brand-mark" aria-label="学管师工作台">
          <span class="brand-symbol">学</span>
        </NuxtLink>
        <nav class="main-nav" aria-label="主导航">
          <NuxtLink
            to="/"
            class="nav-item"
            :class="{ active: route.path === '/' }"
            >工作台</NuxtLink
          >
          <NuxtLink
            to="/students"
            class="nav-item"
            :class="{ active: route.path.startsWith('/students') }"
            >学员管理</NuxtLink
          >
          <NuxtLink
            to="/contracts"
            class="nav-item"
            :class="{ active: route.path.startsWith('/contracts') }"
            >合同管理</NuxtLink
          >
          <NuxtLink
            to="/plans"
            class="nav-item"
            :class="{ active: route.path.startsWith('/plans') }"
            >学习计划</NuxtLink
          >
          <NuxtLink
            to="/tasks"
            class="nav-item"
            :class="{ active: route.path === '/tasks' }"
            >任务列表</NuxtLink
          >
          <NuxtLink
            to="/tasks/assignments"
            class="nav-item"
            :class="{ active: route.path.startsWith('/tasks/assignments') }"
            >任务分配</NuxtLink
          >
          <NuxtLink
            to="/scores"
            class="nav-item"
            :class="{ active: route.path.startsWith('/scores') }"
            >成绩记录</NuxtLink
          >
          <NuxtLink
            to="/attendance"
            class="nav-item"
            :class="{ active: route.path.startsWith('/attendance') }"
            >出勤管理</NuxtLink
          >
        </nav>
        <AButton
          type="link"
          class="header-settings-button"
          aria-label="打开个人设置"
          @click="settingsOpen = true"
          ><span class="settings-label-full">个人设置</span
          ><span class="settings-label-compact">设置</span></AButton
        >
        <div class="header-user">
          <span class="status-dot" />{{ user?.username ?? "正在读取登录状态" }}
          <span class="header-role">{{
            user?.role === "admin" ? "管理员" : "学管师"
          }}</span>
          <AButton
            type="link"
            size="small"
            :loading="loggingOut"
            @click="logout"
            >退出</AButton
          >
        </div>
      </div>
    </ALayoutHeader>
    <ALayoutContent class="app-content"><slot /></ALayoutContent>
    <ADrawer
      v-model:open="settingsOpen"
      title="个人设置"
      placement="right"
      width="min(420px, 100vw)"
      class="account-settings-drawer"
    >
      <div class="account-settings-content">
        <div>
          <h3>负责学科</h3>
          <p>用于工作台默认筛选，不改变学生数据权限。</p>
        </div>
        <SubjectMultiSelect
          v-model="subjectDraft"
          :disabled="savingSettings"
          placeholder="可选择或输入，最多10项"
          aria-label="编辑负责学科"
        />
        <AAlert
          v-if="settingsError"
          type="error"
          show-icon
          :message="settingsError"
        >
          <template v-if="settingsConflict" #action>
            <AButton size="small" @click="reloadSettings">重新加载</AButton>
          </template>
        </AAlert>
        <AAlert
          v-if="settingsNotice"
          type="success"
          show-icon
          :message="settingsNotice"
        />
        <div class="account-settings-actions">
          <AButton @click="settingsOpen = false">取消</AButton>
          <AButton
            type="primary"
            :loading="savingSettings"
            :disabled="savingSettings"
            @click="saveSettings"
            >保存</AButton
          >
        </div>
      </div>
    </ADrawer>
  </ALayout>
</template>

<style scoped>
.header-settings-button {
  flex: 0 0 auto;
  padding: 0;
  color: #b8d8b0;
  font-size: 12px;
}
.settings-label-compact {
  display: none;
}
.account-settings-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.account-settings-content h3,
.account-settings-content p {
  margin: 0;
}
.account-settings-content p {
  margin-top: 6px;
  color: #7a857e;
  font-size: 13px;
}
.account-settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
@media (max-width: 760px) {
  .header-settings-button {
    width: 42px;
  }
  .settings-label-full {
    display: none;
  }
  .settings-label-compact {
    display: inline;
  }
}
</style>
