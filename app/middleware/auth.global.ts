import { safeRedirect, useAuth } from "~/composables/useAuth";

export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuth();
  if (!auth.checked.value) {
    try {
      await auth.refresh();
    } catch {
      // A non-auth infrastructure error stays on the requested page for its own error UI.
      if (to.path !== "/login") return;
    }
  }
  if (to.path === "/login") {
    if (auth.user.value) return navigateTo("/");
    return;
  }
  if (!auth.user.value)
    return navigateTo({
      path: "/login",
      query: { redirect: safeRedirect(to.fullPath) },
    });
});
