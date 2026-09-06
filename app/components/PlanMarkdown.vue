<script setup lang="ts">
import { renderMarkdown } from "~/utils/markdown";
const props = defineProps<{ content: string }>();
const rendered = computed(() => renderMarkdown(props.content));
</script>
<template>
  <!-- All user text is escaped before fixed markup generation; no raw HTML/URLs. -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <article class="plan-rendered-content" v-html="rendered" />
</template>
