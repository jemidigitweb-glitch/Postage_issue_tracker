import { redirect } from "next/navigation";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ProfileInformationForm from "@/components/account/ProfileInformationForm";
import SecurityForm from "@/components/account/SecurityForm";
import { cardClassName, sectionHeadingClassName } from "@/components/common/formStyles";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getAccountSettings } from "@/lib/queries/accountSettings";
import { ASSIGNEE_HOME } from "@/lib/routeGuards";

// ASSIGNEE PORTAL ONLY — /dashboard/account-settings.
//
// ── WHO GETS THIS PAGE ──────────────────────────────────────────────────────
// Only an authenticated Assignee (role 'staff'). Everyone else is sent away
// rather than shown a partial page:
//   - not signed in            -> /login   (proxy.ts also covers this prefix)
//   - Super Admin / management -> /dashboard/issues. The Super Admin portal
//                                 gains no page in this stage, so their own
//                                 experience is byte-for-byte unchanged.
//   - a 'staff' login with no management_users row for it -> /dashboard/issues
//
// Hiding the sidebar link is presentation; THIS redirect and the permission
// check inside app/dashboard/account-settings/actions.ts are the guards.
//
// ── LAST LOGIN ──────────────────────────────────────────────────────────────
// Deliberately NOT rendered. issue_tracking.management_users has columns
// user_id, username, display_name, email, password_hash, role, active,
// created_at, updated_at — and no last-login timestamp of any kind (audited
// 2026-08-13). `updated_at` is a row-modification stamp, not a sign-in stamp,
// and showing it as "Last Login" would be a fabricated value. Adding a real
// one needs a migration, which is out of scope for this stage.

export default async function AccountSettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // The Super Admin's own portal is out of scope for this stage.
  if (await hasPermission(user, "issue:view_all")) {
    redirect(ASSIGNEE_HOME);
  }

  // Resolved from the session, never from a query parameter — there is no
  // way to ask this page for somebody else's account.
  const account = await getAccountSettings(user.userId);
  if (!account) {
    redirect(ASSIGNEE_HOME);
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
          Account Settings
        </h1>

        <section className={`${cardClassName} flex flex-col gap-5`}>
          <h2 className={sectionHeadingClassName}>Profile Information</h2>
          <ProfileInformationForm
            fullName={account.assigneeName}
            username={account.username}
            email={account.email}
            active={account.active}
          />
        </section>

        <section className={`${cardClassName} flex flex-col gap-5`}>
          <h2 className={sectionHeadingClassName}>Security</h2>
          <SecurityForm />
        </section>
      </div>
    </DashboardLayout>
  );
}
