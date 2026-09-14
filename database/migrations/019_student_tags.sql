CREATE TABLE student_tags (
  student_id BIGINT UNSIGNED NOT NULL,
  tag VARCHAR(24) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  PRIMARY KEY (student_id, tag),
  CONSTRAINT fk_student_tags_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_student_tags_name CHECK (CHAR_LENGTH(TRIM(tag)) BETWEEN 1 AND 24),
  INDEX idx_student_tags_tag_student (tag, student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
