import rawDetail from "../data/student-detail.json";
import { getStudents } from "./students";
import type { LearningRecord, StudentTask } from "~/types/student-detail";
import type { StudentRecord } from "~/types/students";

export function getStudent(id: string): StudentRecord | undefined {
  return getStudents().find((student) => student.id === id);
}

export function getLearningRecords(studentId: string): LearningRecord[] {
  return structuredClone(rawDetail.records).filter(
    (record) => record.studentId === studentId,
  ) as LearningRecord[];
}

export function getStudentTasks(studentId: string): StudentTask[] {
  return structuredClone(rawDetail.tasks).filter(
    (task) => task.studentId === studentId,
  ) as StudentTask[];
}
