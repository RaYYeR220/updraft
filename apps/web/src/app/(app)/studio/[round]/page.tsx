import type { Metadata } from "next";
import { CreatorConsole } from "@/components/studio/CreatorConsole";
import "@/styles/studio.css";

export const metadata: Metadata = {
  title: "Creator console",
  description: "The vault behind an Updraft launch: its fee policy and bounds, queued changes, team and staker balances, and every flow.",
};

export default async function ConsolePage({ params }: { params: Promise<{ round: string }> }) {
  const { round } = await params;
  return <CreatorConsole id={round} />;
}
