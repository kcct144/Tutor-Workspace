import rawTasks from "../data/tasks.json";
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
