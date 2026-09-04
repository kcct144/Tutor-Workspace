<script setup lang="ts">
const config = useRuntimeConfig();
const currentTime = useState("current-time", () =>
  new Date().toLocaleString("zh-CN"),
);
</script>

<template>
  <main>
    <AAlert
      message="基础环境已就绪"
      description="此页面只用于验证 Nuxt、Ant Design Vue 和运行时配置，不包含业务功能。"
      type="success"
      show-icon
      class="intro-alert"
    />
    <ARow :gutter="[16, 16]">
      <ACol :xs="24" :md="12">
        <ACard title="前端验证" :bordered="false">
          <ASpace direction="vertical" size="middle">
            <ATag color="blue">Nuxt + TypeScript</ATag>
            <ATag color="green">Ant Design Vue 自动组件解析</ATag>
            <AButton type="primary">示例组件</AButton>
          </ASpace>
        </ACard>
      </ACol>
      <ACol :xs="24" :md="12">
        <ACard title="运行时配置" :bordered="false">
          <ADescriptions :column="1" size="small">
            <ADescriptionsItem label="应用地址">{{
              config.public.appUrl
            }}</ADescriptionsItem>
            <ADescriptionsItem label="页面加载时间">{{
              currentTime
            }}</ADescriptionsItem>
          </ADescriptions>
        </ACard>
      </ACol>
    </ARow>
  </main>
</template>

<style scoped>
.intro-alert {
  margin-bottom: 16px;
}
</style>
