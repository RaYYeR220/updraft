import type { Metadata } from "next";
import { StudioWizard } from "@/components/studio/StudioWizard";
import "@/styles/studio.css";

export const metadata: Metadata = {
  title: "Creator Studio",
  description: "Set up an Updraft round: token, windows, raise, mode, unlocks and fee policy, checked against the factory's rules before you sign.",
};

export default function StudioPage() {
  return <StudioWizard />;
}
