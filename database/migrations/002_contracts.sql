CREATE TABLE contracts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  contract_no CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  subject VARCHAR(64) COLLATE utf8mb4_0900_as_cs NOT NULL,
  contract_type VARCHAR(16) NOT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  attended_lessons INT UNSIGNED NULL,
  total_lessons INT UNSIGNED NULL,
  makeup_lessons INT UNSIGNED NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_contracts_no (contract_no),
  CONSTRAINT fk_contracts_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_contracts_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_contracts_editor FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_contracts_subject CHECK (CHAR_LENGTH(TRIM(subject)) > 0),
  CONSTRAINT chk_contracts_version CHECK (version > 0),
  CONSTRAINT chk_contracts_fields CHECK (
    (contract_type IN ('month','half_year','year') AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_date <= end_date AND attended_lessons IS NULL AND total_lessons IS NULL)
    OR (contract_type = 'lessons' AND start_date IS NULL AND end_date IS NULL AND attended_lessons IS NOT NULL AND total_lessons IS NOT NULL AND total_lessons > 0 AND attended_lessons <= total_lessons)
  ),
  INDEX idx_contracts_student_dates (student_id, start_date, end_date, id),
  INDEX idx_contracts_subject_type (subject, contract_type, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
