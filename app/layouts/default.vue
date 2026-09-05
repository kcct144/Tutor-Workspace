<template>
  <ALayout class="app-shell">
    <ALayoutHeader class="app-header">
      <div class="header-inner">
        <NuxtLink to="/" class="brand-mark"
          ><span class="brand-symbol">学</span
          ><span>学管师工作台</span></NuxtLink
        >
        <nav class="main-nav" aria-label="主导航">
          <NuxtLink to="/" class="nav-item active">工作台</NuxtLink>
          <NuxtLink to="/students" class="nav-item">学员管理</NuxtLink>
          <NuxtLink to="/plans" class="nav-item">学习计划</NuxtLink>
          <NuxtLink to="/tasks" class="nav-item">任务列表</NuxtLink>
        </nav>
        <div class="header-user"><span class="status-dot" />王老师</div>
      </div>
    </ALayoutHeader>
    <ALayoutContent class="app-content"><slot /></ALayoutContent>
  </ALayout>
</template>
