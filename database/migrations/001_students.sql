CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_users_name CHECK (CHAR_LENGTH(TRIM(name)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE students (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_user_id BIGINT UNSIGNED NULL,
  name VARCHAR(64) NOT NULL,
  grade VARCHAR(16) NOT NULL,
  class_name VARCHAR(32) NULL,
  school VARCHAR(128) NULL,
  gender VARCHAR(8) NULL,
  enrolled_at DATE NULL,
  guardian_name VARCHAR(64) NULL,
  guardian_phone VARCHAR(32) NULL,
  note VARCHAR(500) NULL,
  status VARCHAR(16) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_students_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_students_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_students_grade CHECK (grade IN ('初一','初二','初三','高一','高二')),
  CONSTRAINT chk_students_gender CHECK (gender IS NULL OR gender IN ('男','女')),
  CONSTRAINT chk_students_status CHECK (status IN ('在读','待分配','已结课')),
  INDEX idx_students_grade_status (grade, status, id),
  INDEX idx_students_owner (owner_user_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
