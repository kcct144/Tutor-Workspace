<script setup lang="ts">
const route = useRoute();
const { user, signOut } = useAuth();
const loggingOut = ref(false);

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
  </ALayout>
</template>
