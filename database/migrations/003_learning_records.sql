CREATE TABLE student_learning_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  author_user_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(8) NOT NULL,
  content TEXT NOT NULL,
  occurred_on DATE NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_records_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_records_author FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_records_category CHECK (category IN ('缺','补','强')),
  CONSTRAINT chk_records_content CHECK (CHAR_LENGTH(TRIM(content)) BETWEEN 1 AND 10000),
  CONSTRAINT chk_records_version CHECK (version > 0),
  INDEX idx_records_student_date (student_id, occurred_on, id),
  INDEX idx_records_student_category_date (student_id, category, occurred_on, id),
  INDEX idx_records_student_created (student_id, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_cs;
