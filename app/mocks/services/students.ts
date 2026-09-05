import rawStudents from "../data/students.json";
import { getStudentExpiryDate, getStudentSubjects } from "./contracts";
import type { StudentRecord } from "~/types/students";

export function getStudents(): StudentRecord[] {
  const students = structuredClone(rawStudents) as StudentRecord[];
  return students.map((student) => ({
    ...student,
    expiryDate: getStudentExpiryDate(student.id) ?? student.expiryDate,
    subjects: getStudentSubjects(student.id),
  }));
}
