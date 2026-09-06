import rawStudents from "../data/students.json";
import type { StudentRecord } from "~/types/students";

export function getStudents(): StudentRecord[] {
  const students = structuredClone(rawStudents) as StudentRecord[];
  return students.map((student) => ({
    ...student,
    // TODO 开发负责人：S6替换任务选择器后删除本原型服务；不提供合同兜底。
    expiryDate: "",
    subjects: [],
  }));
}
