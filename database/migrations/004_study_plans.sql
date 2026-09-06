CREATE TABLE study_plan_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(128) NOT NULL,
  summary VARCHAR(300) NULL,
  content MEDIUMTEXT NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_plans_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_plans_title CHECK (CHAR_LENGTH(TRIM(title)) > 0),
  CONSTRAINT chk_plans_content CHECK (CHAR_LENGTH(content) > 0 AND OCTET_LENGTH(content) <= 2097152),
  CONSTRAINT chk_plans_version CHECK (version > 0),
  INDEX idx_plans_updated (updated_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;

CREATE TABLE study_plan_students (
  plan_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (plan_id, student_id),
  CONSTRAINT fk_plan_students_plan FOREIGN KEY (plan_id) REFERENCES study_plan_documents(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_plan_students_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  INDEX idx_plan_students_student (student_id, plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
