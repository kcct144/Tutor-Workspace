<template>
  <ALayout class="app-shell">
    <ALayoutHeader class="app-header">
      <NuxtLink to="/" class="brand">学管师工作台</NuxtLink>
      <span class="environment-label">开发环境</span>
    </ALayoutHeader>
    <ALayoutContent class="app-content">
      <slot />
    </ALayoutContent>
  </ALayout>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: #f5f7fa;
}
.app-header {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #001529;
}
.brand {
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}
.environment-label {
  color: #91caff;
  font-size: 13px;
}
.app-content {
  max-width: 1120px;
  width: 100%;
  margin: 0 auto;
  padding: 32px 24px;
}
</style>
