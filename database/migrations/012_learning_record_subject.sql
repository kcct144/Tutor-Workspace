ALTER TABLE student_learning_records
  ADD COLUMN subject VARCHAR(64) NULL AFTER category,
  ADD CONSTRAINT chk_records_subject CHECK (
    subject IS NULL OR CHAR_LENGTH(TRIM(subject)) BETWEEN 1 AND 64
  ),
  ADD INDEX idx_records_student_subject_date (student_id, subject, occurred_on, id);
