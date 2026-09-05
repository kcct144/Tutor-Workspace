import rawStudents from "../data/students.json";
import type { StudentRecord } from "~/types/students";

export function getStudents(): StudentRecord[] {
  return structuredClone(rawStudents) as StudentRecord[];
}
