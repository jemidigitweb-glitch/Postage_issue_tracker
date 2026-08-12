// Audio Attachments on the Issue detail page — rendering and PORTAL SEPARATION.
//
// Renders the component with react-dom/server and asserts the actual markup.
// IssueAudioAttachments is a plain Server Component whose only runtime import
// is lib/access/attachments (pure), so it renders in a bare Node test.
//
// It sits inside components/issues/IssueDetail.tsx, which BOTH detail pages
// render — so the `includeHistorical` prop is the whole portal-separation
// mechanism, and these tests are what pin it down.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import IssueAudioAttachments from "../components/issues/IssueAudioAttachments";
import { ASSIGNEE_VISIBLE_SOURCES, readAudioAttachments } from "../lib/access/attachments";

/** Shaped exactly like a stored row written by the historical import. */
function historical(overrides: Record<string, unknown> = {}) {
  return {
    type: "audio",
    url: "https://res.cloudinary.com/qqobpgwl/video/upload/v1/issue-tracker/ND-001/recording-001.mp3",
    public_id: "issue-tracker/ND-001/recording-001",
    original_name: "recording-001.mp3",
    mime_type: "audio/mpeg",
    source: "historical",
    bytes: 309165,
    ...overrides,
  };
}

/** Shaped like a row written by Add New Issue. Deliberately a DIFFERENT url
 *  and public_id from historical(), so a leak test can tell the two apart. */
function uploaded(overrides: Record<string, unknown> = {}) {
  return {
    ...historical(),
    url: "https://res.cloudinary.com/qqobpgwl/video/upload/v1/issue-tracker/intake/abc.wav",
    public_id: "issue-tracker/intake/abc",
    original_name: "test_issue_audio.wav",
    mime_type: "audio/wav",
    source: "upload",
    ...overrides,
  };
}

function renderAdmin(extraData: Record<string, unknown>): string {
  return renderToStaticMarkup(
    createElement(IssueAudioAttachments, { extraData, includeHistorical: true })
  );
}

function renderAssignee(extraData: Record<string, unknown>): string {
  // The Assignee page passes no prop, so the default (false) applies.
  return renderToStaticMarkup(createElement(IssueAudioAttachments, { extraData }));
}

describe("Super Admin — one historical recording", () => {
  const markup = renderAdmin({ attachments: [historical()] });

  it("renders the Audio Attachments section", () => {
    assert.ok(markup.includes("Audio Attachments"));
  });

  it("renders the filename", () => {
    assert.ok(markup.includes("recording-001.mp3"));
  });

  it("renders a native player with controls", () => {
    assert.ok(markup.includes("<audio"));
    assert.ok(markup.includes("controls"));
  });

  it("renders the stored Cloudinary URL", () => {
    assert.ok(markup.includes("issue-tracker/ND-001/recording-001.mp3"));
  });

  it("offers Open in new tab, safely", () => {
    assert.ok(markup.includes("Open in new tab"));
    assert.ok(markup.includes('rel="noopener noreferrer"'));
    assert.ok(markup.includes('target="_blank"'));
  });

  it("labels it as historical evidence", () => {
    assert.ok(markup.includes("Historical evidence"));
  });

  it("shows the file size", () => {
    assert.ok(markup.includes("302 KB"));
  });
});

describe("Super Admin — multiple recordings", () => {
  // ND-020 really does carry three (issues 22/recording_2026-07-12_r1..r3).
  const markup = renderAdmin({
    attachments: [
      historical({ original_name: "recording_2026-07-12_r1.mp3", public_id: "a", url: "https://x/a.mp3" }),
      historical({ original_name: "recording_2026-07-12_r2.mp3", public_id: "b", url: "https://x/b.mp3" }),
      historical({ original_name: "recording_2026-07-12_r3.mp3", public_id: "c", url: "https://x/c.mp3" }),
    ],
  });

  it("renders every filename", () => {
    for (const n of ["_r1.mp3", "_r2.mp3", "_r3.mp3"]) assert.ok(markup.includes(n), n);
  });

  it("renders one player per recording", () => {
    assert.equal(markup.split("<audio").length - 1, 3);
  });

  it("renders a single section heading", () => {
    assert.equal(markup.split("Audio Attachments").length - 1, 1);
  });
});

describe("no autoplay, ever", () => {
  it("single recording", () => {
    assert.equal(/autoplay/i.test(renderAdmin({ attachments: [historical()] })), false);
  });

  it("multiple recordings", () => {
    const markup = renderAdmin({
      attachments: [historical(), historical({ public_id: "b", url: "https://x/b.mp3" })],
    });
    assert.equal(/autoplay/i.test(markup), false);
  });

  it("preloads metadata only", () => {
    assert.ok(renderAdmin({ attachments: [historical()] }).includes('preload="metadata"'));
  });
});

describe("an Issue with no audio renders nothing", () => {
  it("no attachments key at all", () => {
    assert.equal(renderAdmin({ member: "vishnusri" }), "");
  });

  it("a historical Issue that has only images", () => {
    assert.equal(
      renderAdmin({
        images: [
          {
            url: "https://res.cloudinary.com/x/image/upload/v1/issue-tracker/ND-002/e.png",
            public_id: "issue-tracker/ND-002/e",
            original_name: "e.png",
          },
        ],
      }),
      ""
    );
  });

  it("attachments containing only images", () => {
    assert.equal(renderAdmin({ attachments: [{ ...historical(), type: "image" }] }), "");
  });

  it("an empty attachments array", () => {
    assert.equal(renderAdmin({ attachments: [] }), "");
  });
});

// ---------------------------------------------------------------------------
// PORTAL SEPARATION — the point of this stage's UI work.
// ---------------------------------------------------------------------------
describe("Assignee portal gains NO historical-audio display", () => {
  it("renders nothing for an Issue whose only audio is historical", () => {
    assert.equal(renderAssignee({ attachments: [historical()] }), "");
  });

  it("renders nothing even for several historical recordings", () => {
    assert.equal(
      renderAssignee({
        attachments: [historical(), historical({ public_id: "b", url: "https://x/b.mp3" })],
      }),
      ""
    );
  });

  it("never leaks a historical Cloudinary URL into the Assignee markup", () => {
    const markup = renderAssignee({ attachments: [historical(), uploaded()] });
    assert.equal(markup.includes("issue-tracker/ND-001/recording-001.mp3"), false);
    assert.equal(markup.includes("recording-001.mp3"), false);
  });

  it("STILL shows Add-New-Issue audio — existing behaviour preserved", () => {
    const markup = renderAssignee({ attachments: [uploaded()] });
    assert.ok(markup.includes("Audio Attachments"));
    assert.ok(markup.includes("test_issue_audio.wav"));
  });

  it("still shows a voice recording", () => {
    const markup = renderAssignee({
      attachments: [uploaded({ source: "voice_recording", original_name: "voice-recording.webm" })],
    });
    assert.ok(markup.includes("voice-recording.webm"));
    assert.ok(markup.includes("Voice recording"));
  });

  it("shows only the non-historical entries on a mixed Issue", () => {
    const markup = renderAssignee({ attachments: [historical(), uploaded()] });
    assert.equal(markup.split("<audio").length - 1, 1);
    assert.ok(markup.includes("test_issue_audio.wav"));
  });

  it("the Super Admin sees BOTH on that same mixed Issue", () => {
    const markup = renderAdmin({ attachments: [historical(), uploaded()] });
    assert.equal(markup.split("<audio").length - 1, 2);
    assert.ok(markup.includes("recording-001.mp3"));
    assert.ok(markup.includes("test_issue_audio.wav"));
  });
});

describe("the source filter is enforced in the data layer, not the markup", () => {
  it("readAudioAttachments drops historical entries for the assignee source list", () => {
    const entries = readAudioAttachments([historical(), uploaded()], ASSIGNEE_VISIBLE_SOURCES);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].source, "upload");
  });

  it("readAudioAttachments returns everything when no filter is given", () => {
    assert.equal(readAudioAttachments([historical(), uploaded()]).length, 2);
  });

  it("the assignee source list excludes 'historical'", () => {
    assert.equal(ASSIGNEE_VISIBLE_SOURCES.includes("historical" as never), false);
    assert.deepEqual([...ASSIGNEE_VISIBLE_SOURCES], ["upload", "voice_recording"]);
  });

  it("an unknown source string is treated as an ordinary upload, not historical", () => {
    const entries = readAudioAttachments([historical({ source: "something_else" })]);
    assert.equal(entries[0].source, "upload");
  });
});

describe("stored metadata is validated before rendering", () => {
  it("drops an entry whose URL is not https", () => {
    assert.equal(renderAdmin({ attachments: [historical({ url: "javascript:alert(1)" })] }), "");
    assert.equal(renderAdmin({ attachments: [historical({ url: "http://x/a.mp3" })] }), "");
  });

  it("falls back to a neutral label when the filename is missing", () => {
    assert.ok(renderAdmin({ attachments: [historical({ original_name: undefined })] }).includes("Audio attachment"));
  });
});
