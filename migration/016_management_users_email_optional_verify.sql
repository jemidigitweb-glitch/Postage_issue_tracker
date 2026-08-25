-- ============================================================================
-- migration/016_management_users_email_optional_verify.sql
--
-- READ-ONLY. Confirms migration/016_management_users_email_optional.sql landed
-- and that nothing else moved with it.
--
-- Contains NO INSERT, NO UPDATE, NO DELETE and NO DDL. Safe to run at any time,
-- before or after the migration, as many times as you like.
--
-- Usage: psql "$MIGRATION_DB_URL" -f migration/016_management_users_email_optional_verify.sql
-- ============================================================================

\echo '--- 0. Identity (must be varmen_db / varmen_user) ---'
SELECT current_database(), current_user;

\echo ''
\echo '--- 1. email must be NULLABLE (is_nullable = YES) ---'
SELECT column_name, data_type, character_maximum_length, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'issue_tracking'
   AND table_name   = 'management_users'
   AND column_name  = 'email';

\echo ''
\echo '--- 2. Every OTHER column keeps the nullability it had ---'
\echo '     Expected NOT NULL: user_id, username, display_name, password_hash,'
\echo '     role, active, created_at, updated_at.  Nullable: email, staff_code.'
SELECT column_name, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'issue_tracking'
   AND table_name   = 'management_users'
 ORDER BY ordinal_position;

\echo ''
\echo '--- 3. UNIQUE (email) must still exist — uniqueness was NOT dropped ---'
SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint con
  JOIN pg_class rel      ON rel.oid = con.conrelid
  JOIN pg_namespace nsp  ON nsp.oid = rel.relnamespace
 WHERE nsp.nspname = 'issue_tracking'
   AND rel.relname = 'management_users'
 ORDER BY con.conname;

\echo ''
\echo '--- 4. The unique INDEX behind it, and whether nulls are distinct ---'
\echo '     indnullsnotdistinct must be FALSE: that is what lets several'
\echo '     accounts have no email while duplicates are still rejected.'
SELECT i.relname AS index_name,
       idx.indisunique,
       idx.indnullsnotdistinct,
       pg_get_indexdef(idx.indexrelid) AS definition
  FROM pg_index idx
  JOIN pg_class i       ON i.oid   = idx.indexrelid
  JOIN pg_class rel     ON rel.oid = idx.indrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
 WHERE nsp.nspname = 'issue_tracking'
   AND rel.relname = 'management_users'
 ORDER BY i.relname;

\echo ''
\echo '--- 5. Existing accounts are unchanged (no password_hash is selected) ---'
\echo '     Expected at the time of writing: admin 1, raised_by 1, staff 10.'
SELECT role,
       count(*)                        AS accounts,
       count(email)                    AS with_email,
       count(*) - count(email)         AS without_email,
       count(*) FILTER (WHERE active)  AS active_accounts
  FROM issue_tracking.management_users
 GROUP BY role
 ORDER BY role;

\echo ''
\echo '--- 6. Which accounts have no email (identity only, no secrets) ---'
SELECT user_id, username, display_name, role, active, staff_code
  FROM issue_tracking.management_users
 WHERE email IS NULL
 ORDER BY user_id;

\echo ''
\echo '--- 7. Nothing was left behind by the migration probe (expect 0 rows) ---'
SELECT user_id, username, role
  FROM issue_tracking.management_users
 WHERE username LIKE '\_\_migration\_%' ESCAPE '\'
    OR email LIKE '%@migration.invalid'
 ORDER BY user_id;

\echo ''
\echo '--- 8. No duplicate non-null email slipped in (expect 0 rows) ---'
SELECT email, count(*) AS accounts
  FROM issue_tracking.management_users
 WHERE email IS NOT NULL
 GROUP BY email
HAVING count(*) > 1;

\echo ''
\echo '--- 9. Empty-string emails, which are NOT the same as "no email" (expect 0) ---'
SELECT user_id, username, role
  FROM issue_tracking.management_users
 WHERE email = ''
 ORDER BY user_id;

\echo ''
\echo '--- 10. Login by username still resolves for an account with no email ---'
\echo '      Simulates lib/queries/users.ts findUserForLogin() for every'
\echo '      email-less account, WITHOUT selecting any password hash.'
SELECT mu.username AS identifier_typed_at_login,
       EXISTS (
         SELECT 1
           FROM issue_tracking.management_users m
          WHERE m.username = mu.username OR m.email = mu.username
       ) AS resolves
  FROM issue_tracking.management_users mu
 WHERE mu.email IS NULL
 ORDER BY mu.username;

\echo ''
\echo '--- 11. Roles and permissions untouched: the role CHECK is as 013 left it ---'
SELECT pg_get_constraintdef(con.oid) AS role_check
  FROM pg_constraint con
  JOIN pg_class rel      ON rel.oid = con.conrelid
  JOIN pg_namespace nsp  ON nsp.oid = rel.relnamespace
 WHERE nsp.nspname = 'issue_tracking'
   AND rel.relname = 'management_users'
   AND con.conname = 'management_users_role_check';
