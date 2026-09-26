import { apiGet, apiWrite } from "./http";
import type {
  CurrentUser,
  ResponsibleSubjectsUpdate,
} from "../../types/api/auth";

export function getCurrentUser(): Promise<CurrentUser> {
  return apiGet<CurrentUser>("/api/auth/me", {});
}

export function login(
  username: string,
  password: string,
): Promise<CurrentUser> {
  return apiWrite<CurrentUser>("/api/auth/login", "POST", {
    username,
    password,
  });
}

export function logout(): Promise<{ loggedOut: boolean }> {
  return apiWrite<{ loggedOut: boolean }>("/api/auth/logout", "POST", {});
}

/** Reissues the cookie-bound CSRF value without placing it in application state. */
export function rotateCsrf(): Promise<{ rotated: boolean }> {
  return apiGet<{ rotated: boolean }>("/api/auth/csrf", {});
}

export function updateMyResponsibleSubjects(
  input: ResponsibleSubjectsUpdate,
): Promise<CurrentUser> {
  return apiWrite<CurrentUser>(
    "/api/auth/me/responsible-subjects",
    "PATCH",
    input,
  );
}
