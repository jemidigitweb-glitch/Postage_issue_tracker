// components/common/Listbox — the application's own dropdown, not a native
// <select>.
//
// Renders the component with react-dom/server and asserts the markup. Listbox
// is a Client Component, but "use client" is only a directive string and it
// imports nothing server-only (no `next/*`, no Server Action, no database), so
// it renders fine in a bare Node test. `useState`/`useId`/`useRef` all work
// during a server render; `useEffect` simply does not run, which is correct —
// the closed state is what this file checks.
//
// The OPEN menu (its option rows, keyboard behaviour and styling) is verified
// in a real browser — see the browser-verification evidence for this stage.
// Server rendering can only ever show the initial, closed state, so claiming
// the open menu from here would be overstating what was checked.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import Listbox from "../components/common/Listbox";
import {
  assigneeStatusOptionList,
  CHANGE_STATUS_LABEL,
  STATUS_PLACEHOLDER,
} from "../lib/access/issueStatusLabels";

function renderFrom(status: "RED" | "AMBER", value: "" | "RED" | "AMBER" | "GREEN" = ""): string {
  return renderToStaticMarkup(
    createElement(Listbox, {
      label: CHANGE_STATUS_LABEL,
      options: assigneeStatusOptionList(status),
      value,
      placeholder: STATUS_PLACEHOLDER,
      onChange: () => {},
    })
  );
}

describe("no native form control is used", () => {
  const markup = renderFrom("AMBER");

  it("renders no <select> element", () => {
    assert.equal(markup.includes("<select"), false, "a native <select> is still being rendered");
  });

  it("renders no <option> elements", () => {
    assert.equal(markup.includes("<option"), false, "native <option> elements are still rendered");
  });

  it("renders no <datalist>", () => {
    assert.equal(markup.includes("<datalist"), false);
  });

  it("the trigger is a real button, so it can never submit the form by accident", () => {
    assert.ok(markup.includes('type="button"'));
  });
});

describe("ARIA — the listbox pattern", () => {
  const markup = renderFrom("AMBER");

  it('the trigger is role="combobox"', () => {
    assert.ok(markup.includes('role="combobox"'));
  });

  it("the trigger declares a listbox popup", () => {
    assert.ok(markup.includes('aria-haspopup="listbox"'));
  });

  it("the trigger reports its collapsed state", () => {
    assert.ok(markup.includes('aria-expanded="false"'));
  });

  it("the trigger points at the popup it controls", () => {
    assert.ok(markup.includes("aria-controls="));
  });
});

describe("closed state shows the placeholder", () => {
  it('shows "Select status" when nothing is chosen', () => {
    const markup = renderFrom("AMBER");
    assert.ok(markup.includes(STATUS_PLACEHOLDER));
  });

  it("shows the chosen option's label once a value is set", () => {
    const markup = renderFrom("AMBER", "GREEN");
    assert.ok(markup.includes("Completely Solved"));
    assert.equal(markup.includes(STATUS_PLACEHOLDER), false);
  });

  it("does not render the option list while closed", () => {
    const markup = renderFrom("AMBER");
    assert.equal(markup.includes('role="option"'), false);
    assert.equal(markup.includes('role="listbox"'), false);
  });
});

describe("the label renders as the app's field label", () => {
  it('shows "Change status"', () => {
    const markup = renderFrom("AMBER");
    assert.ok(markup.includes(CHANGE_STATUS_LABEL));
  });

  it("uses the app's uppercase-tracking label styling, not a raw <label> default", () => {
    const markup = renderFrom("AMBER");
    assert.ok(markup.includes("uppercase"));
    assert.ok(markup.includes("tracking-wider"));
  });
});

describe("the trigger carries the app's control styling", () => {
  const markup = renderFrom("RED");

  // Transcribed from components/common/formStyles.ts's selectClassName, which
  // is itself transcribed from the existing filter bars — so a closed Listbox
  // and a closed <select> look like the same control.
  for (const className of ["rounded-lg", "border-neutral-200", "px-3", "py-2", "text-sm"]) {
    it(`includes "${className}"`, () => {
      assert.ok(markup.includes(className), `missing ${className}`);
    });
  }
});

describe("a disabled listbox cannot be opened", () => {
  it("renders the disabled attribute", () => {
    const markup = renderToStaticMarkup(
      createElement(Listbox, {
        label: CHANGE_STATUS_LABEL,
        options: assigneeStatusOptionList("AMBER"),
        value: "" as const,
        placeholder: STATUS_PLACEHOLDER,
        disabled: true,
        onChange: () => {},
      })
    );
    assert.ok(markup.includes("disabled"));
  });
});
