import rawStudents from "../data/home.json";
import type { HomeStudent, HomeSummary } from "~/types/home";

export function getHomeStudents(): HomeStudent[] {
  const students = structuredClone(rawStudents);
  return students.map((student) => ({
    ...student,
    grade: student.grade as HomeStudent["grade"],
    // TODO 开发负责人：S6授权后接入首页；不沿用已移除的合同mock聚合。
    subjects: [],
    plans: [],
    expiresInDays: undefined,
  }));
}

export function getHomeSummary(): HomeSummary {
  return { activeStudents: rawStudents.length };
}
