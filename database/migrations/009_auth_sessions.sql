CREATE TABLE auth_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash BINARY(32) NOT NULL,
  csrf_token_hash BINARY(32) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  idle_expires_at DATETIME(3) NOT NULL,
  absolute_expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  revoke_reason VARCHAR(32) NULL,
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES user_accounts(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_auth_sessions_expiry CHECK (idle_expires_at <= absolute_expires_at),
  CONSTRAINT chk_auth_sessions_revocation CHECK ((revoked_at IS NULL AND revoke_reason IS NULL) OR (revoked_at IS NOT NULL AND revoke_reason IN ('logout', 'password_reset', 'password_change', 'role_change', 'account_disabled'))),
  UNIQUE KEY uq_auth_sessions_token_hash (token_hash),
  INDEX idx_auth_sessions_user_active (user_id, revoked_at, absolute_expires_at, id),
  INDEX idx_auth_sessions_expiry (absolute_expires_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
