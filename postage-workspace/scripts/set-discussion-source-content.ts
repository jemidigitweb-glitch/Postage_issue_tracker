// scripts/set-discussion-source-content.ts
//
// Authoritative, self-contained, idempotent DATA CORRECTION for the 14
// individual German Market Discussions' source_content (migration/009).
// Every DESCRIPTION/ACTIONS/CHANNELS/REQUIREMENT/EXAMPLES value below is
// transcribed verbatim from the authoritative data supplied directly in
// the task prompt — not paraphrased, summarized, or truncated. No external
// .txt file is read; this script is fully self-contained.
//
// Matching rule: each of the 14 titles below must match EXACTLY ONE
// existing, non-deleted issue_tracking.discussions row. This script never
// creates a new Discussion (all 14 already exist as of migration
// 007/008/009 + scripts/migrate-german-market-points-to-discussions.ts) —
// if that assumption is ever wrong (a title is missing, or matches more
// than one row), the whole transaction aborts with zero writes. Discussion
// IDs, status, comments, status history, participants, linked Issues,
// workflow dates, and created_at are never touched — only source_content
// (and the group's shared objective/coordinator-responsibility text) is
// corrected.
//
// Safety model (mirrors every other scripts/*.ts in this project):
//  - Hard target-database check before any write.
//  - Pre-write validation: exactly 14 source records, 14 unique titles, no
//    duplicate titles in either the source data or the database, before
//    anything is written.
//  - Single transaction: all 14 UPDATEs + the group correction commit
//    together or not at all.
//  - Never touches issue_tracking.issues, issue_staff, or any column on
//    discussions other than source_content (and updated_at) — confirmed by
//    post-write verification that reads issues/issue_staff counts and the
//    SA-021 link back out and compares them to the pre-write snapshot.
//  - Idempotent: every write is a plain UPDATE keyed by an exact title
//    match already validated 1:1 — running this script again reproduces
//    the same end state, never duplicates a row.
//
// Usage (manual only):
//   npx tsx scripts/set-discussion-source-content.ts

import { getPool } from "./lib/db";

const REQUIRED_DATABASE = "varmen_db";

type ActionEntry = string | { label: string; items: string[] };

interface SourceContent {
  discussion: string;
  channelsLabel?: string;
  channels?: string[];
  requirement?: string;
  action: ActionEntry[];
  examples?: string[];
}

interface Correction {
  title: string;
  sourceContent: SourceContent;
}

// ── The 14 authoritative records, in the order supplied ─────────────────────
const CORRECTIONS: Correction[] = [
  {
    title: "German Market Data Understanding & Monitoring",
    sourceContent: {
      discussion:
        "The coordinator should have complete knowledge and understanding of the German market performance.\n" +
        "Regular monitoring of sales, products, channels, customer behavior, and operational issues is required.",
      action: [
        {
          label: "Maintain updated knowledge of:",
          items: ["Channel-wise sales performance", "Product performance", "Customer feedback", "Stock availability", "Market trends"],
        },
        "Use data-driven decisions to improve sales.",
      ],
    },
  },
  {
    title: "Customer Complaint Management",
    sourceContent: {
      discussion: "Customer complaints received from all platforms should be properly reviewed and resolved.",
      channelsLabel: "Channels Covered",
      channels: ["Shopify", "Amazon", "eBay"],
      action: [
        "Collect customer complaints from emails and messages.",
        "Categorize issues (delivery, product quality, missing items, incorrect information, etc.).",
        "Coordinate with responsible teams to solve problems.",
        "Track repeated issues and implement preventive actions.",
      ],
    },
  },
  {
    title: "Product Sales Performance Analysis",
    sourceContent: {
      discussion:
        "Identify products with high sales performance and increase their potential.\n" +
        "Analyze products with low or no sales and find improvement opportunities.",
      action: [
        "Identify fast-moving products.",
        {
          label: "Ensure high-performing products receive:",
          items: ["Better visibility", "Availability across all channels", "Promotional support"],
        },
        {
          label: "Analyze slow-moving products and identify reasons:",
          items: ["Missing listings", "Pricing issues", "Stock issues", "Low visibility"],
        },
      ],
    },
  },
  {
    title: "Product Listing Across All Channels",
    sourceContent: {
      discussion: "All products should be available across all selling channels.",
      channelsLabel: "Channels",
      channels: ["Shopify", "Amazon", "eBay"],
      action: [
        "Audit all product listings.",
        "Identify missing products in each channel.",
        "Create missing listings.",
        "Ensure fast-selling products are listed on all platforms.",
      ],
    },
  },
  {
    title: "Cross-Channel Product Growth Opportunity",
    sourceContent: {
      discussion: "Some products perform well in one channel but not in others.",
      action: [
        "Compare product performance between Shopify, Amazon, and eBay.",
        "Identify channel gaps.",
        "Push successful products from one channel into other channels.",
        "Improve visibility and sales opportunities.",
      ],
    },
  },
  {
    title: "Profitability & Loss Analysis",
    sourceContent: {
      discussion: "Work together with the accounting team to identify activities causing losses.",
      action: [
        {
          label: "Analyze:",
          items: ["Product pricing", "Shipping costs", "Marketplace fees", "Low-margin products", "Unprofitable sales activities"],
        },
        "Discuss findings with MDs and Sasi.",
        "Implement corrective actions.",
      ],
    },
  },
  {
    title: "Combo & Pack Product Development",
    sourceContent: {
      discussion: "Combo products are preferred because they increase customer value and average order value.",
      action: ["Identify suitable product combinations.", "Create new combo and pack offers."],
      examples: ["Lampshade + Holder + Bulb", "Pendant Light + Matching Bulb", "Cable + Ceiling Rose + Accessories"],
    },
  },
  {
    title: "Minimum Product Price Review",
    sourceContent: {
      discussion: "Products should maintain a profitable selling price.",
      requirement: "Product selling price including shipping should not be below €8.",
      action: ["Review products below the minimum price.", "Adjust pricing or create bundles where required."],
    },
  },
  {
    title: "Related Product Recommendations",
    sourceContent: {
      discussion: "Increase additional purchases by recommending related products.",
      action: ["Add relevant product recommendations:"],
      examples: [
        "Lampshade → Lamp Holder + Bulb",
        "Ceiling Light → Compatible Bulb",
        "Cable → Ceiling Rose",
        "Lamp Holder → Suitable Accessories",
      ],
    },
  },
  {
    title: "Website Navigation Improvement",
    sourceContent: {
      discussion: "Website navigation should be improved according to customer search behavior.",
      action: [
        "Review current menu structure.",
        "Make categories easier to find.",
        "Organize products based on customer buying journey.",
        "Improve product discovery experience.",
      ],
    },
  },
  {
    title: "Weekly Channel & Account Reports",
    sourceContent: {
      discussion: "Regular reporting is required for better decision-making.",
      // "Channel-wise performance:" is itself a labeled sub-group inside
      // "Prepare weekly reports covering:" in the source text, but the
      // existing source_content shape (migration 009) supports only one
      // level of label->items nesting, and this task is explicitly
      // DB-data-only (no schema/rendering changes). Flattened into one
      // readable item so every word (including Shopify/Amazon/eBay) is
      // preserved, deliberately WITHOUT moving them into a separate
      // `channels` field per the task's explicit instruction.
      action: [
        {
          label: "Prepare weekly reports covering:",
          items: [
            "Channel-wise performance: Shopify, Amazon, eBay",
            "Account-wise performance",
            "Sales growth",
            "Product performance",
            "Customer complaints",
            "Listing status",
            "Issues requiring attention",
          ],
        },
      ],
    },
  },
  {
    title: "Daily Coordination With Sasi",
    sourceContent: {
      discussion: "Maintain continuous communication between warehouse operations and sales activities.",
      action: [
        "Have a daily 5-minute discussion with Sasi.",
        "Share updates, challenges, and pending tasks.",
        "Ensure quick resolution of operational issues.",
      ],
    },
  },
  {
    title: "Team Communication & Task Updates",
    sourceContent: {
      discussion: "A dedicated communication channel should be created for tracking updates.",
      action: [
        "Create a team group.",
        {
          label: "Update important topics regularly:",
          items: ["Customer issues", "Product updates", "Stock problems", "Listing status", "Action items"],
        },
      ],
    },
  },
  {
    title: "Team Leader Coordination",
    sourceContent: {
      discussion: "Regular follow-up with team leaders is required to ensure German market activities are completed.",
      // The Coordinator Responsibility list is ALSO explicitly requested
      // here (in addition to discussion_groups.objective, not instead of)
      // — a deliberate exception for this one Discussion, confirmed
      // directly by the task owner after the original "never append this
      // to Team Leader Coordination" instruction. Every other Discussion
      // still excludes it.
      action: [
        "Communicate with Team Leaders.",
        "Confirm completion of German market-related updates.",
        "Track pending activities and follow up until completion.",
        {
          label: "Coordinator Responsibility – Mahima",
          items: [
            "Act as the communication bridge between Sasi, German team, and internal teams.",
            "Monitor sales performance across all channels.",
            "Identify opportunities for growth.",
            "Ensure product availability and listing consistency.",
            "Track customer complaints and resolutions.",
            "Prepare weekly performance reports.",
            "Coordinate daily updates and follow-ups.",
          ],
        },
      ],
    },
  },
];

// Common meeting/group data — kept here too (discussion_groups.objective),
// per the task owner's explicit "too" — this is stored in BOTH places for
// Team Leader Coordination, not moved. Every other Discussion still
// excludes it. Corrects the coordinator-responsibility wording to the
// authoritative text; the meeting objective sentence itself is unchanged
// from the original seed.
const GROUP_TITLE = "German Market Coordination & Sales Improvement Meeting";
const GROUP_MEETING_OBJECTIVE =
  "Improve coordination between the German warehouse, sales teams and online marketplaces, identify sales " +
  "opportunities, resolve customer issues, improve product availability and increase German market performance " +
  "across Shopify, Amazon and eBay.";
const GROUP_COORDINATOR_RESPONSIBILITY =
  "Coordinator Responsibility – Mahima\n" +
  "Act as the communication bridge between Sasi, German team, and internal teams.\n" +
  "Monitor sales performance across all channels.\n" +
  "Identify opportunities for growth.\n" +
  "Ensure product availability and listing consistency.\n" +
  "Track customer complaints and resolutions.\n" +
  "Prepare weekly performance reports.\n" +
  "Coordinate daily updates and follow-ups.";
const GROUP_OBJECTIVE = `${GROUP_MEETING_OBJECTIVE}\n\n${GROUP_COORDINATOR_RESPONSIBILITY}`;

function validateSourceData() {
  if (CORRECTIONS.length !== 14) {
    throw new Error(`Expected exactly 14 authoritative source records, found ${CORRECTIONS.length}.`);
  }
  const titles = CORRECTIONS.map((c) => c.title);
  const uniqueTitles = new Set(titles);
  if (uniqueTitles.size !== 14) {
    const seen = new Set<string>();
    const dupes = titles.filter((t) => (seen.has(t) ? true : (seen.add(t), false)));
    throw new Error(`Duplicate title(s) in source data: ${dupes.join(", ")}`);
  }
}

async function main() {
  validateSourceData();
  console.log(`Source data validated: 14 unique authoritative records.`);

  const pool = getPool();

  try {
    const identity = await pool.query<{ current_database: string; current_user: string }>(
      "SELECT current_database(), current_user;"
    );
    const connectedDb = identity.rows[0]?.current_database;
    console.log(`Connected as ${identity.rows[0]?.current_user ?? "(unknown)"} on ${connectedDb ?? "(unknown)"}`);

    if (connectedDb !== REQUIRED_DATABASE) {
      console.error(`SAFETY ABORT: connected database is "${connectedDb ?? "(unknown)"}", not "${REQUIRED_DATABASE}". No writes made.`);
      process.exitCode = 1;
      return;
    }

    // ── Pre-write snapshot: never touched, only compared before/after ──────
    const preIssueCount = await pool.query<{ count: string }>(`SELECT count(*) FROM issue_tracking.issues`);
    const preStaffCount = await pool.query<{ count: string }>(`SELECT count(*) FROM issue_tracking.issue_staff`);
    const preSa021Link = await pool.query<{ discussion_id: string }>(
      `SELECT discussion_id FROM issue_tracking.discussions WHERE linked_issue_id = 'SA-021' AND deleted_at IS NULL`
    );

    // ── Pre-write classification: every title must match EXACTLY ONE row ───
    const idByTitle = new Map<string, string>();
    for (const correction of CORRECTIONS) {
      const matches = await pool.query<{ discussion_id: string }>(
        `SELECT discussion_id FROM issue_tracking.discussions WHERE title = $1 AND deleted_at IS NULL`,
        [correction.title]
      );
      if (matches.rows.length === 0) {
        console.error(`SAFETY ABORT: no Discussion found with title "${correction.title}". No writes made.`);
        process.exitCode = 1;
        return;
      }
      if (matches.rows.length > 1) {
        console.error(
          `SAFETY ABORT: ${matches.rows.length} Discussions found with title "${correction.title}" ` +
            `(${matches.rows.map((r) => r.discussion_id).join(", ")}) — duplicate, refusing to guess. No writes made.`
        );
        process.exitCode = 1;
        return;
      }
      idByTitle.set(correction.title, matches.rows[0].discussion_id);
    }
    console.log(`Classification: all 14 titles match exactly one existing Discussion each. No creates needed.`);

    const groupMatches = await pool.query<{ group_id: number }>(
      `SELECT group_id FROM issue_tracking.discussion_groups WHERE title = $1`,
      [GROUP_TITLE]
    );
    if (groupMatches.rows.length !== 1) {
      console.error(
        `SAFETY ABORT: expected exactly 1 discussion_groups row titled "${GROUP_TITLE}", found ${groupMatches.rows.length}. No writes made.`
      );
      process.exitCode = 1;
      return;
    }
    const groupId = groupMatches.rows[0].group_id;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const correction of CORRECTIONS) {
        const discussionId = idByTitle.get(correction.title)!;
        await client.query(
          `UPDATE issue_tracking.discussions SET source_content = $2::jsonb, updated_at = now() WHERE discussion_id = $1`,
          [discussionId, JSON.stringify(correction.sourceContent)]
        );
        console.log(`  SET ${discussionId} ("${correction.title}") source_content.`);
      }

      await client.query(
        `UPDATE issue_tracking.discussion_groups SET objective = $2, updated_at = now() WHERE group_id = $1`,
        [groupId, GROUP_OBJECTIVE]
      );
      console.log(`  SET discussion_groups.group_id = ${groupId} objective (coordinator responsibility corrected).`);

      // ── In-transaction verification before commit ──────────────────────
      const postIssueCount = await client.query<{ count: string }>(`SELECT count(*) FROM issue_tracking.issues`);
      const postStaffCount = await client.query<{ count: string }>(`SELECT count(*) FROM issue_tracking.issue_staff`);
      const postSa021Link = await client.query<{ discussion_id: string }>(
        `SELECT discussion_id FROM issue_tracking.discussions WHERE linked_issue_id = 'SA-021' AND deleted_at IS NULL`
      );
      const postDiscussionCount = await client.query<{ count: string }>(
        `SELECT count(*) FROM issue_tracking.discussions WHERE deleted_at IS NULL AND group_id = $1`,
        [groupId]
      );

      if (postIssueCount.rows[0].count !== preIssueCount.rows[0].count) {
        throw new Error(
          `VERIFICATION FAILED: issues count changed from ${preIssueCount.rows[0].count} to ${postIssueCount.rows[0].count}.`
        );
      }
      if (postStaffCount.rows[0].count !== preStaffCount.rows[0].count) {
        throw new Error(
          `VERIFICATION FAILED: issue_staff count changed from ${preStaffCount.rows[0].count} to ${postStaffCount.rows[0].count}.`
        );
      }
      if (postSa021Link.rows.length !== 1 || postSa021Link.rows[0].discussion_id !== preSa021Link.rows[0]?.discussion_id) {
        throw new Error(
          `VERIFICATION FAILED: SA-021 link changed (was "${preSa021Link.rows[0]?.discussion_id}", now "${postSa021Link.rows[0]?.discussion_id}").`
        );
      }
      if (Number(postDiscussionCount.rows[0].count) !== 14) {
        throw new Error(`VERIFICATION FAILED: expected 14 Discussions under group ${groupId}, found ${postDiscussionCount.rows[0].count}.`);
      }

      await client.query("COMMIT");
      console.log(`\nCommitted. Issues count unchanged (${postIssueCount.rows[0].count}), staff count unchanged (${postStaffCount.rows[0].count}), SA-021 still linked to ${postSa021Link.rows[0].discussion_id}.`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
