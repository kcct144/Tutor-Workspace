<script setup lang="ts">
import type { StudentDetail } from "../../types/api/students";
defineProps<{ student: StudentDetail }>();
defineEmits<{ edit: []; status: [] }>();
</script>

<template>
  <section class="basic-info-panel">
    <div class="basic-info-identity">
      <div class="student-initial">{{ student.name.slice(0, 1) }}</div>
      <div>
        <h2>{{ student.name }}</h2>
        <p>{{ student.school ?? "—" }}</p>
      </div>
    </div>
    <ASpace wrap
      ><AButton @click="$emit('edit')">编辑档案</AButton
      ><AButton @click="$emit('status')">变更状态</AButton></ASpace
    >
    <dl class="basic-info-list">
      <div>
        <dt>年级</dt>
        <dd>{{ student.grade }} · {{ student.className ?? "—" }}</dd>
      </div>
      <div>
        <dt>学校</dt>
        <dd>{{ student.school ?? "—" }}</dd>
      </div>
      <div>
        <dt>性别</dt>
        <dd>{{ student.gender ?? "—" }}</dd>
      </div>
      <div>
        <dt>到期时间</dt>
        <dd>{{ student.expiryDate ?? "—" }}</dd>
      </div>
      <div>
        <dt>建档时间</dt>
        <dd>{{ student.createdAt.slice(0, 10) }}</dd>
      </div>
      <div>
        <dt>入学日期</dt>
        <dd>{{ student.enrolledAt ?? "—" }}</dd>
      </div>
      <div>
        <dt>主要监护人</dt>
        <dd>{{ student.guardianName ?? "—" }}</dd>
      </div>
      <div>
        <dt>监护人联系方式</dt>
        <dd>{{ student.guardianPhoneMasked ?? "—" }}</dd>
      </div>
      <div>
        <dt>当前状态</dt>
        <dd>
          <ATag class="status-tag" :class="`status-${student.status}`">{{
            student.status
          }}</ATag>
        </dd>
      </div>
      <div>
        <dt>负责学管师</dt>
        <dd>{{ student.owner?.name ?? "未分配" }}</dd>
      </div>
      <div>
        <dt>最近跟进</dt>
        <dd>{{ student.lastFollowUp ?? "—" }}</dd>
      </div>
      <div class="basic-info-wide">
        <dt>备注</dt>
        <dd>{{ student.note || "暂无" }}</dd>
      </div>
      <div class="basic-info-wide">
        <dt>有效合同科目</dt>
        <dd>
          <ATag
            v-for="subject in student.subjects"
            :key="subject"
            class="subject-tag"
            >{{ subject }}</ATag
          ><span v-if="!student.subjects.length">—</span>
        </dd>
      </div>
      <div class="basic-info-wide">
        <dt>进行中的学习计划</dt>
        <dd><PlanTags :plans="student.plans" /></dd>
      </div>
    </dl>
  </section>
</template>
