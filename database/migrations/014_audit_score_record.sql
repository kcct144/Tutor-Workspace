ALTER TABLE audit_logs
  DROP CHECK chk_audit_logs_entity_type,
  ADD CONSTRAINT chk_audit_logs_entity_type CHECK (entity_type IN ('student', 'contract', 'learning_record', 'score_record', 'task', 'task_assignment', 'user_account'));
