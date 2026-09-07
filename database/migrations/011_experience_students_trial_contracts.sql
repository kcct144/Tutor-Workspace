ALTER TABLE students
  MODIFY COLUMN grade VARCHAR(16) NULL,
  DROP CHECK chk_students_grade,
  ADD CONSTRAINT chk_students_grade CHECK (
    grade IS NULL OR grade IN ('初一','初二','初三','高一','高二')
  );

ALTER TABLE contracts
  ADD COLUMN trial_status VARCHAR(16) NULL AFTER contract_type,
  DROP CHECK chk_contracts_fields,
  ADD CONSTRAINT chk_contracts_fields CHECK (
    (contract_type IN ('month','half_year','year') AND trial_status IS NULL AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_date <= end_date AND attended_lessons IS NULL AND total_lessons IS NULL)
    OR (contract_type = 'lessons' AND trial_status IS NULL AND start_date IS NULL AND end_date IS NULL AND attended_lessons IS NOT NULL AND total_lessons IS NOT NULL AND total_lessons > 0 AND attended_lessons <= total_lessons)
    OR (contract_type = 'trial' AND trial_status IN ('active','terminated') AND start_date IS NULL AND end_date IS NULL AND attended_lessons IS NULL AND total_lessons IS NULL AND makeup_lessons = 0)
  ),
  ADD INDEX idx_contracts_student_trial_status (student_id, contract_type, trial_status, id);
