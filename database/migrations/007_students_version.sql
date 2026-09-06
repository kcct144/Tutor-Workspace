ALTER TABLE students ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1, ADD CONSTRAINT chk_students_version CHECK (version > 0);
