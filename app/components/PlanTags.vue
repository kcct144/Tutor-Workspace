<script setup lang="ts">
import type { PlanTag } from "../../types/api/study-plans";
defineProps<{ plans: PlanTag[] }>();
</script>
<template>
  <span
    ><ATag v-for="plan in plans" :key="plan.id" class="plan-tag"
      ><NuxtLink :to="{ path: '/plans', query: { planId: plan.id } }">{{
        plan.title
      }}</NuxtLink></ATag
    ><span v-if="!plans.length">—</span></span
  >
</template>
