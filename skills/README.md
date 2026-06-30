# skills/

## Why this folder exists

This folder holds the skill files that define what this AIOS can do when called
with a slash command. Each skill file contains the instructions Claude follows
when a specific capability is invoked.

## What belongs here

Skill definition files only, one per capability:
- postage-brief.md — /postage-brief skill
- procedure-lookup.md — /procedure-lookup skill
- courier-brief.md — /courier-brief skill
- issue-router.md — /issue-router skill
- booking-check.md — /booking-check skill
- daily-issue-log.md — /daily-issue-log skill
- pattern-check.md — /pattern-check skill

## What does NOT belong here

- Operational content, procedures, or rule descriptions — those go in context/
- Issue logs or daily entries — those go in intelligence-inbox/daily-issues/
- Evidence files — those go in evidence/
- Any file not defined in Postage_AIOS_Architecture.md without Varmen approval

## Status

Placeholder files exist. Skill content must not be populated without Varmen
review and approval. See Operating Rules in CLAUDE.md: finalising any skill
file requires Varmen approval (Amber category).
