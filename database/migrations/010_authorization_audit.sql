CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  entity_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  metadata_json JSON NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_audit_logs_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_audit_logs_entity_type CHECK (entity_type IN ('student', 'contract', 'learning_record', 'task', 'task_assignment', 'user_account')),
  CONSTRAINT chk_audit_logs_action CHECK (CHAR_LENGTH(action) BETWEEN 3 AND 64),
  INDEX idx_audit_logs_occurred (occurred_at, id),
  INDEX idx_audit_logs_actor_occurred (actor_user_id, occurred_at, id),
  INDEX idx_audit_logs_student_occurred (student_id, occurred_at, id),
  INDEX idx_audit_logs_entity_occurred (entity_type, entity_id, occurred_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE students ADD INDEX idx_students_owner_status (owner_user_id, status, id);
