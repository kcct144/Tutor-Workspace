CREATE TABLE user_responsible_subjects (
  user_id BIGINT UNSIGNED NOT NULL,
  subject VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, subject),
  CONSTRAINT fk_user_responsible_subjects_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_user_responsible_subjects_name CHECK (CHAR_LENGTH(TRIM(subject)) BETWEEN 1 AND 64),
  INDEX idx_user_responsible_subjects_subject_user (subject, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
