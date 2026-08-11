// Small inline icons for the Discussions Actions column — same convention
// as components/issues/IssueDetail.tsx's DataLinkIcon (16x16 viewBox,
// stroke="currentColor", rounded caps/joins). No icon library dependency
// exists in this project (checked package.json) — inline SVG is the
// established pattern here, not a new one.

export function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M1.5 8S3.8 3 8 3s6.5 5 6.5 5-2.3 5-6.5 5-6.5-5-6.5-5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M2.75 4.5h10.5M6.25 4.5V3a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1v1.5M6.5 7.5v4M9.5 7.5v4M3.75 4.5l.6 8.1a1 1 0 0 0 1 .9h5.3a1 1 0 0 0 1-.9l.6-8.1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
