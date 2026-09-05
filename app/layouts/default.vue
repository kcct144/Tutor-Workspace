<script setup lang="ts">
const route = useRoute();
</script>

<template>
  <ALayout class="app-shell">
    <ALayoutHeader class="app-header">
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
        </nav>
        <div class="header-user"><span class="status-dot" />王老师</div>
      </div>
    </ALayoutHeader>
    <ALayoutContent class="app-content"><slot /></ALayoutContent>
  </ALayout>
</template>
