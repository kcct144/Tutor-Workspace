import rawTasks from "../data/tasks.json";
// TODO (开发负责人，S6验收时移除): 仅任务分配原型使用，S5定义页禁止读取。
import type { TaskAssignment, TaskDefinition } from "~/types/tasks";

interface TaskMockData {
  tasks: TaskDefinition[];
  assignments: TaskAssignment[];
}

export function getTaskDefinitions(): TaskDefinition[] {
  return structuredClone(rawTasks as TaskMockData).tasks;
}

export function getTaskAssignments(): TaskAssignment[] {
  return structuredClone(rawTasks as TaskMockData).assignments;
}
