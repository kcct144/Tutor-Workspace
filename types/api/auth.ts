export type AuthRole = "admin" | "advisor";

/** Safe browser projection. It deliberately excludes internal user and session IDs. */
export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  role: AuthRole;
  mustChangePassword: boolean;
  responsibleSubjects: string[];
  version: number;
}

export interface ResponsibleSubjectsUpdate {
  subjects: string[];
  expectedVersion: number;
}
