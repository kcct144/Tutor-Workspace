ALTER TABLE students
  DROP CHECK chk_students_grade,
  ADD CONSTRAINT chk_students_grade CHECK (
    grade IS NULL OR grade IN ('三年级','四年级','五年级','六年级','初一','初二','初三','高一','高二','高三')
  );
