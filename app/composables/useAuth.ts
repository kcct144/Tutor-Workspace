import { ref } from "vue";
import { getCurrentUser, login, logout } from "~/services/auth";
import { ServiceError } from "~/services/http";
import type { CurrentUser } from "../../types/api/auth";

const allowedRedirect = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//");

export function safeRedirect(value: unknown): string {
  return allowedRedirect(value) ? value : "/";
}

export function useAuth() {
  const user = useState<CurrentUser | null>("auth:current-user", () => null);
  const checked = useState("auth:checked", () => false);
  const checking = ref(false);

  async function refresh(): Promise<CurrentUser | null> {
    if (checking.value) return user.value;
    checking.value = true;
    try {
      user.value = await getCurrentUser();
      return user.value;
    } catch (error) {
      user.value = null;
      if (!(error instanceof ServiceError) || error.statusCode !== 401)
        throw error;
      return null;
    } finally {
      checked.value = true;
      checking.value = false;
    }
  }

  async function signIn(
    username: string,
    password: string,
  ): Promise<CurrentUser> {
    const current = await login(username, password);
    user.value = current;
    checked.value = true;
    return current;
  }

  async function signOut(): Promise<void> {
    try {
      await logout();
    } finally {
      user.value = null;
      checked.value = true;
    }
  }

  return { user, checked, refresh, signIn, signOut };
}

/** Called by the shared HTTP service after an authenticated API response becomes 401. */
export function handleUnauthenticated(): void {
  if (!import.meta.client) return;
  const user = useState<CurrentUser | null>("auth:current-user", () => null);
  const checked = useState("auth:checked", () => false);
  user.value = null;
  checked.value = true;
  const route = useRoute();
  if (route.path === "/login") return;
  void navigateTo({
    path: "/login",
    query: { redirect: safeRedirect(route.fullPath) },
  });
}
