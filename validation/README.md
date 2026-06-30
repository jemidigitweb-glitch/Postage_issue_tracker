# validation/

## Why this folder exists

This folder stores validation reports produced at the end of each build phase.
Each report confirms what was built, verifies it against the architecture
specification, and records a PASS or FAIL outcome before work progresses to
the next phase.

## What belongs here

- Phase completion validation reports (one per phase)
- Structure verification reports
- CLAUDE.md validation summaries
- MCP import verification reports
- Any formal checkpoint output produced during the build

## What does NOT belong here

- Evidence files (screenshots, PDFs) — those belong in evidence/
- Active issues or gaps — those belong in intelligence-inbox/
- Confirmed decisions — those belong in decisions/
- Skill definitions or context files

## Status

Empty. Phase 1 validation report should be created here once Varmen has
reviewed and approved the CLAUDE.md and folder structure. The validation
section at the end of CLAUDE.md serves as the source for this report.
