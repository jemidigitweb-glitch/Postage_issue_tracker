-- REFERENCE ONLY — not executed by migrate-issues.js.
-- migrate-issues.js is a strict data-only migration: it assumes
-- issue_tracking.issue_staff and issue_tracking.issues already exist and
-- never runs CREATE SCHEMA / CREATE TABLE / CREATE INDEX. This file documents
-- the expected schema (confirmed to match the live varmen_db schema via
-- read-only inspection) for anyone who needs to (re)create it manually.
--
-- Migration: create issue_staff and issues tables
-- Source: postage-daily-issues.html (const ISSUES array, 92 records, 4 staff:
-- ND=Nandhi, SA=Sasi, ST=Sathis, NV=Nivarnan)
-- Verified against the target database: no existing table named issue_staff or
-- issues in any of the 18 schemas present (searched %issue% and %staff%).
-- This migration creates a new, self-contained schema — it does not reference,
-- modify, or depend on staff.users, employee_management.staff, or any other
-- existing table. issue_staff is intentionally independent, per instruction.
--
-- NOT NULL choices below are driven directly by the source-data audit: a
-- column is NOT NULL only where 100% of the 92 source records had a value
-- for that field (ticketId, raisedBy, dateRaised, domain, status, title,
-- description all measured at 92/92). priority and resolution stay nullable
-- because the source genuinely has gaps there (17/92 and 73/92 respectively).

CREATE SCHEMA IF NOT EXISTS issue_tracking;

CREATE TABLE IF NOT EXISTS issue_tracking.issue_staff (
    staff_code   VARCHAR(10)  PRIMARY KEY,
    staff_name   VARCHAR(100) NOT NULL,
    active       BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS issue_tracking.issues (
    issue_id           VARCHAR(20)  PRIMARY KEY,          -- preserved verbatim, e.g. 'ND-001' — never renumbered
    staff_code         VARCHAR(10)  NOT NULL
                         REFERENCES issue_tracking.issue_staff(staff_code)
                         ON DELETE RESTRICT                -- safe delete: a staff row cannot be removed while issues reference it
                         ON UPDATE CASCADE,                -- if a staff_code is ever renamed, issues follow it automatically
    issue_title        TEXT         NOT NULL,
    issue_description  TEXT         NOT NULL,
    category           VARCHAR(50)  NOT NULL,              -- source: domain
    status             VARCHAR(20)  NOT NULL
                         CHECK (status IN ('RED', 'AMBER', 'GREEN')),
    priority           VARCHAR(20)                         -- normalized lowercase; NULL where source was blank (75/92 records)
                         CHECK (priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low')),
    resolution         TEXT,                               -- source: fix — genuinely absent on 19/92 records
    created_date       DATE         NOT NULL,               -- source: dateRaised
    completed_date     DATE,                               -- no source field; always NULL from this migration
    extra_data         JSONB        NOT NULL DEFAULT '{}', -- member, rootCause, whatIsHappening, documentGap, dataLink,
                                                             -- plus original* pre-normalization values when they differ
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issues_staff_code    ON issue_tracking.issues(staff_code);
CREATE INDEX IF NOT EXISTS idx_issues_status        ON issue_tracking.issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_category      ON issue_tracking.issues(category);
CREATE INDEX IF NOT EXISTS idx_issues_created_date   ON issue_tracking.issues(created_date);
CREATE INDEX IF NOT EXISTS idx_issues_extra_data     ON issue_tracking.issues USING GIN (extra_data);
