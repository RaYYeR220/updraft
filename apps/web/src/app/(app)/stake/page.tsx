import type { Metadata } from "next";
import { StakeView } from "@/components/stake/StakeView";
import "@/styles/studio.css";
import "@/styles/stake.css";

export const metadata: Metadata = {
  title: "Stake $DRAFT",
  description: "Stake $DRAFT to earn the platform basket: the platform's cut of every Updraft launch's tokens and of every vault's creator fees, paid by epoch.",
};

export default function StakePage() {
  return <StakeView />;
}
