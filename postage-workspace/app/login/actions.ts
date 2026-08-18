"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

import { findUserForLogin } from "@/lib/queries/users";
import { createSession } from "@/lib/session";
import { loginDestination } from "@/lib/access/raisedByAccess";

// Login Server Action. Approved design:
// documentation/issue_tracker_auth_implementation_plan.md §2 (Login flow):
//   Browser → Server Action → password verification → signed session
//   cookie → request authentication.
//
// Security:
// - Never logs the submitted password, or any password_hash, anywhere.
// - Returns exactly one generic error message for every failure mode
//   (missing fields, unknown identifier, inactive account, wrong
//   password) — never reveals which check failed.
// - Runs a bcrypt compare even when no matching user is found (against a
//   fixed, non-secret dummy hash) so an unknown-username attempt takes
//   roughly the same time as a wrong-password attempt on a real account —
//   mitigates a timing side-channel that could otherwise reveal whether a
//   given username/email exists in issue_tracking.management_users.
// - No user or password is ever hardcoded here.

export interface LoginState {
  error?: string;
}

const GENERIC_ERROR = "Invalid username or password.";

// Computed once per server process, from a fixed non-secret plaintext —
// not a credential. Exists only so failed lookups and failed password
// checks take a comparable amount of time.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash("timing-attack-mitigation-only", 12);
  }
  return dummyHashPromise;
}

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const identifier = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    return { error: GENERIC_ERROR };
  }

  const user = await findUserForLogin(identifier);

  if (!user || !user.active) {
    // Constant-shape timing even when there's no real hash to compare against.
    await bcrypt.compare(password, await getDummyHash());
    return { error: GENERIC_ERROR };
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return { error: GENERIC_ERROR };
  }

  await createSession(user.userId);

  // ── RETURN TARGET ────────────────────────────────────────────────────────
  // Where the request came from — /mobile sends the worker here when they have
  // no session. It is attacker-supplied input, so it is validated against an
  // allow-list server-side (lib/access/raisedByAccess.ts): anything that is not
  // one of the two approved internal paths, and anything absolute,
  // protocol-relative or scheme-bearing, is discarded in favour of the Issue
  // list. The raw value is never redirected to.
  redirect(loginDestination(formData.get("next")));
}
