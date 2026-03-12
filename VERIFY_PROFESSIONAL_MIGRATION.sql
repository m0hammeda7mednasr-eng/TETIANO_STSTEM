-- ============================================================
-- Verification script for professional migration
-- ============================================================

-- 1) Tables existence
SELECT
  table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('tasks', 'task_comments', 'task_attachments', 'notifications', 'permissions')
ORDER BY table_name;

-- 2) Permissions columns existence
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'permissions'
  AND column_name IN ('can_manage_tasks', 'can_view_all_reports', 'can_view_activity_log')
ORDER BY column_name;

-- 3) Task attachments columns
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'task_attachments'
ORDER BY ordinal_position;

-- 4) Notifications columns
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'notifications'
ORDER BY ordinal_position;

-- 5) Indexes existence
SELECT
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_tasks_assigned_to',
    'idx_task_attachments_task_id',
    'idx_notifications_user_is_read_created'
  )
ORDER BY indexname;

-- 6) Quick counts
SELECT
  (SELECT COUNT(*) FROM users) AS users_count,
  (SELECT COUNT(*) FROM permissions) AS permissions_count,
  (SELECT COUNT(*) FROM tasks) AS tasks_count,
  (SELECT COUNT(*) FROM task_attachments) AS task_attachments_count,
  (SELECT COUNT(*) FROM notifications) AS notifications_count;
