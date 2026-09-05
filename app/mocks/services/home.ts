import rawStudents from "../data/home.json";
import type { HomeStudent, HomeSummary } from "~/types/home";

export function getHomeStudents(): HomeStudent[] {
  return structuredClone(rawStudents) as HomeStudent[];
}

export function getHomeSummary(): HomeSummary {
  return { activeStudents: rawStudents.length };
}
