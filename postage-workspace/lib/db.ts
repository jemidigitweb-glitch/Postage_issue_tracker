import "server-only";

import { Pool } from "pg";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

// Server-only PostgreSQL connection pool for issue_tracking.
//
// The `server-only` import above makes this module a build error if it is
// ever imported into a Client Component (directly or transitively) — see
// https://nextjs.org/docs/app/getting-started/server-and-client-components.
// That is the structural guarantee, not just a convention: the browser can
// never reach this file, and `pg` itself cannot run in a browser bundle
// anyway (it depends on Node's `net`/`tls` modules).
//
// Connection string comes from DATABASE_URL only — never a NEXT_PUBLIC_*
// variable, which Next.js inlines into client bundles. Nothing in this file
// logs, throws, or returns the connection string or any credential value.
//
// Scope: issue_tracking only. This pool must never be pointed at any other
// schema/database (ledsone, ph_dashboard, postgres, staff.users, or any
// HR/company staff table) — callers are responsible for only querying
// issue_tracking.* through it.
//
// DATABASE_URL is checked lazily — inside getPool(), not at module load —
// deliberately different from this file's original Stage 13 version. As of
// Stage 14b, lib/auth.ts's getCurrentUser() imports lib/queries/users.ts,
// which imports this module, and getCurrentUser() is called from
// app/login/page.tsx (a Server Component). Next.js evaluates page modules
// while collecting page data at build time, so an eager throw here would
// risk breaking `next build` in an environment without DATABASE_URL set —
// exactly the failure mode already fixed once for AUTH_SECRET in
// lib/session.ts. The fix is the same: fail only when a query is actually
// attempted, not on import.

declare global {
  var __issueTrackingPool: Pool | undefined;
}

let modulePool: Pool | undefined;

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
    // SSL is required by the target Postgres server (confirmed operationally
    // during the historical data migration — see migration/migrate-issues.js).
    // rejectUnauthorized: false matches the same tradeoff already accepted
    // there; revisit if the deployment target's certificate chain changes.
    ssl: { rejectUnauthorized: false },
  });
}

/**
 * Returns the shared connection pool, creating it on first use. Never call
 * this at module top-level — always inside a function body, so the
 * DATABASE_URL check stays lazy.
 */
export function getPool(): Pool {
  if (process.env.NODE_ENV !== "production") {
    // Next.js dev-mode hot module reloading re-evaluates this module on
    // every edit. Without a global-scoped singleton, each reload would spawn
    // a new Pool, leaking connections until the dev server is restarted.
    // Guarding via `globalThis` survives HMR.
    if (!globalThis.__issueTrackingPool) {
      globalThis.__issueTrackingPool = createPool();
    }
    return globalThis.__issueTrackingPool;
  }

  // In production a fresh module instance per process is created exactly
  // once (no HMR), so a plain module-scoped variable is sufficient.
  if (!modulePool) {
    modulePool = createPool();
  }
  return modulePool;
}

// Verified once per process (not once per query — that would be a wasted
// round trip on every call). Every query issued through `query()` below is
// guaranteed to run only after this has passed at least once.
let identityVerified = false;

async function assertDatabaseIdentity(pool: Pool): Promise<void> {
  if (identityVerified) {
    return;
  }
  const result = await pool.query<{ current_database: string; current_user: string }>(
    "SELECT current_database(), current_user"
  );
  const identity = result.rows[0];
  if (!identity || identity.current_database !== "varmen_db" || identity.current_user !== "varmen_user") {
    throw new Error(
      `Refusing to query: connected as "${identity?.current_user ?? "unknown"}" on database "${identity?.current_database ?? "unknown"}", expected "varmen_user" on "varmen_db".`
    );
  }
  identityVerified = true;
}

/**
 * The only way `lib/queries/*.ts` modules should talk to Postgres. Confirms
 * `current_database() = 'varmen_db'` before the first real query of the
 * process runs (cached after that — see assertDatabaseIdentity above), then
 * delegates to the pool. Never call `getPool().query(...)` directly from a
 * query module — always go through this function instead.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const pool = getPool();
  await assertDatabaseIdentity(pool);
  return pool.query<T>(text, params);
}

/**
 * Same identity guarantee as `query()`, but returns a checked-out client
 * for multi-statement transactions (BEGIN/COMMIT/ROLLBACK) — needed when a
 * single logical write spans more than one statement (e.g. allocating the
 * next issue_id and inserting the row atomically). Callers MUST call
 * `client.release()` in a `finally` block.
 */
export async function getVerifiedClient(): Promise<PoolClient> {
  const pool = getPool();
  await assertDatabaseIdentity(pool);
  return pool.connect();
}

export default getPool;
