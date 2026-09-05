import rawPlans from "../data/plans.json";
import type { StudyPlanDocument } from "~/types/plans";

export function getStudyPlans(): StudyPlanDocument[] {
  return structuredClone(rawPlans) as StudyPlanDocument[];
}
