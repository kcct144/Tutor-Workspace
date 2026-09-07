/**
 * Shared subject value used by contracts, task definitions, and learning
 * records. Subject names remain database-backed options rather than a second
 * record-specific free-text vocabulary.
 */
export type Subject = string;

export const subjectMaxLength = 64;
