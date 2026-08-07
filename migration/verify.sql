-- Verification queries — run these after migrate-issues.js --execute completes.
-- All are read-only. Every expected value below matches the migration audit
-- report (migration/migration_audit.md) computed from the source file.

-- 1. Exactly 4 staff, exactly 92 issues
SELECT
  (SELECT count(*) FROM issue_tracking.issue_staff) AS staff_count,   -- expect 4
  (SELECT count(*) FROM issue_tracking.issues)       AS issue_count;   -- expect 92

-- 2. Correct issue count per staff member (expect ND=45, SA=27, ST=6, NV=14)
SELECT staff_code, count(*) AS issue_count
FROM issue_tracking.issues
GROUP BY staff_code
ORDER BY staff_code;

-- 3. No duplicate issue_id (PK already enforces this; confirms nothing silently collided)
SELECT issue_id, count(*)
FROM issue_tracking.issues
GROUP BY issue_id
HAVING count(*) > 1;
-- expect 0 rows

-- 4. No orphan issues — every issue's staff_code has a matching issue_staff row
--    (FK already enforces this; confirms integrity end to end)
SELECT i.issue_id, i.staff_code
FROM issue_tracking.issues i
LEFT JOIN issue_tracking.issue_staff s ON s.staff_code = i.staff_code
WHERE s.staff_code IS NULL;
-- expect 0 rows

-- 5. No staff-code / issue-id prefix mismatch — the prefix of issue_id must
--    equal staff_code for every row (this is not enforced by a DB constraint,
--    so it must be checked explicitly)
SELECT issue_id, staff_code
FROM issue_tracking.issues
WHERE split_part(issue_id, '-', 1) <> staff_code;
-- expect 0 rows

-- 6. Required fields present (matches the NOT NULL columns, but confirms no
--    empty-string values slipped through where NULL was intended)
SELECT issue_id
FROM issue_tracking.issues
WHERE issue_title = '' OR issue_description = '' OR category = '' OR status = '';
-- expect 0 rows

-- 7. Priority normalization is correct — only lowercase enum values or NULL,
--    never the original mixed-case source values (HIGH/High/Medium etc.)
SELECT DISTINCT priority FROM issue_tracking.issues ORDER BY priority;
-- expect only: critical, high, medium, and NULL (never 'HIGH', 'High', 'Medium', etc.)

-- 8. Spot-check: SA-007 matches the expected transformed source data exactly
SELECT * FROM issue_tracking.issues WHERE issue_id = 'SA-007';
-- expect: staff_code='SA', issue_title='Product Allocation Communication Gap with Mano',
-- category='listing', status='RED', priority=NULL, created_date='2026-07-29',
-- extra_data containing member/rootCause/whatIsHappening/... (see migration_audit.md
-- section 4 for the exact full expected row)

-- 9. Confirm no data was silently dropped — every extra_data key that should
--    be present in the source is present here too, for records that had it
SELECT issue_id
FROM issue_tracking.issues
WHERE extra_data ? 'dataLink'
ORDER BY issue_id;
-- expect exactly the 6 ST-* tickets that had a dataLink in the source

-- 10. Confirm original pre-normalization values were preserved wherever
--     normalization changed something (see migration_audit.md section 3)
SELECT issue_id, priority, extra_data->>'originalPriority' AS original_priority
FROM issue_tracking.issues
WHERE extra_data ? 'originalPriority'
ORDER BY issue_id;
-- expect one row per record whose source priority casing differed from the
-- normalized lowercase value (e.g. 'HIGH' -> priority='high', original_priority='HIGH')
