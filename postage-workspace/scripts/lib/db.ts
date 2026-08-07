// scripts/lib/db.ts
//
// CLI-only PostgreSQL connection module for standalone tsx scripts
// (e.g. scripts/create-first-admin.ts).
//
// This module must NEVER import "server-only" and must NEVER be imported
// by any app code under app/ or lib/ — it exists specifically so CLI
// scripts don't have to go through lib/db.ts, whose "server-only" import
// makes it unusable outside the Next.js server build.
//
// Connection string comes from DATABASE_URL only — a plain server-side
// environment variable, read directly from process.env. Never a
// NEXT_PUBLIC_* variable (those are for client-bundle inlining and have no
// place in a CLI script). Nothing in this file logs, throws, or returns the
// connection string or any credential value.

import { Pool } from "pg";

let pool: Pool | undefined;

function createPool(): Pool {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    // Names only the missing variable, never a value — there is no value to leak.
    throw new Error(
      "Missing DATABASE_URL environment variable. Set it in .env.local (never commit it)."
    );
  }
  return new Pool({
    connectionString: DATABASE_URL,
    // SSL is required by the target Postgres server (see lib/db.ts and
    // migration/migrate-issues.js for the same tradeoff).
    ssl: { rejectUnauthorized: false },
  });
}

/**
 * Returns the shared connection pool, creating it on first use. CLI scripts
 * are short-lived, single-run processes — no HMR concerns, so a plain
 * module-scoped singleton is sufficient (unlike lib/db.ts's globalThis
 * guard, which exists only to survive Next.js dev-mode hot reloads).
 */
export function getPool(): Pool {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

export default getPool;
