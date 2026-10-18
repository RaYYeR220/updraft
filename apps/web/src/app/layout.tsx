import type { Metadata, Viewport } from "next";
import { Figtree, Fraunces, Spline_Sans_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "@/styles/base.css";
import "@/styles/chrome.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
const mono = Spline_Sans_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Updraft · fair launches on Ascend", template: "%s · Updraft" },
  description:
    "Updraft pools a round's commits into Ascend's launch buy, so every wallet, the dev's too, pays one average price. Nobody gets the bottom of the curve to themselves.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: { title: "Updraft", description: "Everyone lands at the same price. Fair launches on Ascend, Elysium." },
};

export const viewport: Viewport = { themeColor: "#efe8d6" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${figtree.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
        <div className="grain" aria-hidden="true" />
      </body>
    </html>
  );
}
