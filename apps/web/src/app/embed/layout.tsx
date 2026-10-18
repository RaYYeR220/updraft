import type { Metadata } from "next";
import "@/styles/embed.css";

export const metadata: Metadata = { robots: { index: false } };

/** Embeds render bare: no header, no footer, just the card. */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div className="em">{children}</div>;
}
