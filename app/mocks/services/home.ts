import rawStudents from "../data/home.json";
import { getStudentSubjects } from "./contracts";
import type { HomeStudent, HomeSummary } from "~/types/home";

export function getHomeStudents(): HomeStudent[] {
  const students = structuredClone(rawStudents) as HomeStudent[];
  return students.map((student) => ({
    ...student,
    subjects: getStudentSubjects(student.id),
  }));
}

export function getHomeSummary(): HomeSummary {
  return { activeStudents: rawStudents.length };
}
