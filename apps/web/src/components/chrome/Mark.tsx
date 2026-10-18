import Link from "next/link";

export function MarkGlyph() {
  return (
    <svg viewBox="0 0 30 20" aria-hidden="true">
      <path d="M2 11.5 L10 5 L14.5 9 L19 5 L28 11.5 L19 8.2 L14.5 13 L10 8.2 Z" fill="#231e19" />
      <path d="M0 18.2 Q15 19.6 30 18.2" stroke="#231e19" strokeWidth="1.4" fill="none" />
      <circle cx="22" cy="16.4" r="1.9" fill="#c7d83b" stroke="#2e4527" strokeWidth=".9" />
    </svg>
  );
}

export function Mark() {
  return (
    <Link className="mark" href="/" aria-label="Updraft, home">
      <MarkGlyph />
      Updraft
    </Link>
  );
}
