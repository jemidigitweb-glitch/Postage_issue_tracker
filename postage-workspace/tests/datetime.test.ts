// lib/datetime.ts — the display-only Asia/Colombo conversion.
//
// These tests pin the two things the correction actually requires: the
// CONVERSION (UTC instant -> Sri Lankan wall clock, done through the IANA
// zone, never by adding 5h30m to a string) and the LABEL that follows it.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DISPLAY_TIME_ZONE,
  DISPLAY_TIME_ZONE_LABEL,
  formatZonedDate,
  formatZonedTimeWithSeconds,
  formatZonedTimestamp,
} from "../lib/datetime";

describe("the zone and its label", () => {
  it("uses the IANA zone Asia/Colombo", () => {
    assert.equal(DISPLAY_TIME_ZONE, "Asia/Colombo");
  });

  it("shows the label Asia/Colombo (UTC+05:30)", () => {
    assert.equal(DISPLAY_TIME_ZONE_LABEL, "Asia/Colombo (UTC+05:30)");
  });
});

describe("formatZonedTimestamp", () => {
  it("renders the worked example from the correction", () => {
    assert.equal(
      formatZonedTimestamp("2026-08-12T09:46:00Z"),
      "12/08/2026 15:16 Asia/Colombo (UTC+05:30)"
    );
  });

  it("rolls the calendar day forward when +05:30 crosses midnight", () => {
    assert.equal(
      formatZonedTimestamp("2026-08-12T19:30:00Z"),
      "13/08/2026 01:00 Asia/Colombo (UTC+05:30)"
    );
  });

  it("never shows a 24:xx hour at Sri Lankan midnight", () => {
    assert.equal(
      formatZonedTimestamp("2026-08-12T18:30:00Z"),
      "13/08/2026 00:00 Asia/Colombo (UTC+05:30)"
    );
  });

  it("shows no UTC-only or SLT label", () => {
    const rendered = formatZonedTimestamp("2026-08-12T09:46:00Z");
    assert.equal(/\bSLT\b/.test(rendered), false);
    assert.equal(rendered.endsWith("Asia/Colombo (UTC+05:30)"), true);
  });

  it("treats a zone-less timestamp as UTC, not as machine-local time", () => {
    assert.equal(
      formatZonedTimestamp("2026-08-12T09:46:00"),
      formatZonedTimestamp("2026-08-12T09:46:00Z")
    );
  });

  it("returns the input unchanged rather than throwing on junk", () => {
    assert.equal(formatZonedTimestamp("not-a-timestamp"), "not-a-timestamp");
  });
});

describe("formatZonedDate", () => {
  it("gives the Sri Lankan calendar day, not the UTC one", () => {
    assert.equal(formatZonedDate("2026-08-12T19:30:00Z"), "13/08/2026");
  });
});

describe("formatZonedTimeWithSeconds", () => {
  it("keeps seconds and carries the same label", () => {
    assert.equal(
      formatZonedTimeWithSeconds("2026-08-12T09:46:07Z"),
      "15:16:07 Asia/Colombo (UTC+05:30)"
    );
  });
});
