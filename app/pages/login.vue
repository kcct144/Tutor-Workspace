<script setup lang="ts">
import { computed, ref } from "vue";
import { ServiceError } from "~/services/http";
import { safeRedirect, useAuth } from "~/composables/useAuth";

const route = useRoute();
const auth = useAuth();
const username = ref("");
const password = ref("");
const submitting = ref(false);
const error = ref("");
const redirectTo = computed(() => safeRedirect(route.query.redirect));

async function submit() {
  if (submitting.value) return;
  error.value = "";
  if (!username.value.trim() || !password.value) {
    error.value = "请输入账号和密码。";
    return;
  }
  submitting.value = true;
  try {
    await auth.signIn(username.value, password.value);
    password.value = "";
    await navigateTo(redirectTo.value);
  } catch (cause) {
    password.value = "";
    error.value =
      cause instanceof ServiceError
        ? cause.message
        : "暂时无法登录，请稍后重试。";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-card" aria-labelledby="login-title">
      <div class="login-brand" aria-hidden="true">学</div>
      <p class="eyebrow">TUTOR WORKSPACE</p>
      <h1 id="login-title">登录学管师工作台</h1>
      <p>仅限本机受控环境使用。</p>
      <form class="login-form" @submit.prevent="submit">
        <label>
          <span>账号</span>
          <AInput
            v-model:value="username"
            autocomplete="username"
            :disabled="submitting"
            :maxlength="64"
          />
        </label>
        <label>
          <span>密码</span>
          <AInputPassword
            v-model:value="password"
            autocomplete="current-password"
            :disabled="submitting"
            :maxlength="128"
          />
        </label>
        <AAlert v-if="error" type="error" show-icon :message="error" />
        <AButton type="primary" html-type="submit" :loading="submitting"
          >登录</AButton
        >
      </form>
    </section>
  </main>
</template>
