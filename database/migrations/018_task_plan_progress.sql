ALTER TABLE tasks
  ADD COLUMN study_plan_id BIGINT UNSIGNED NULL AFTER owner_user_id,
  ADD CONSTRAINT fk_tasks_study_plan FOREIGN KEY (study_plan_id) REFERENCES study_plan_documents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD INDEX idx_tasks_study_plan_status_updated (study_plan_id, status, updated_at, id);

ALTER TABLE task_assignments
  ADD COLUMN study_plan_id_snapshot BIGINT UNSIGNED NULL AFTER student_id,
  ADD CONSTRAINT fk_assignments_study_plan_snapshot FOREIGN KEY (study_plan_id_snapshot) REFERENCES study_plan_documents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD INDEX idx_assignments_plan_student_status (study_plan_id_snapshot, student_id, status, id);
