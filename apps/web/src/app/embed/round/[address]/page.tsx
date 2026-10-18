import type { Metadata } from "next";
import { getAddress, isAddress } from "viem";
import { EmbedCard } from "@/components/round/EmbedCard";

type Props = { params: Promise<{ address: string }> };

export const metadata: Metadata = { title: "Round" };

export default async function EmbedRound({ params }: Props) {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) {
    return (
      <article className="em-card">
        <p className="em-msg">No Updraft round at this address.</p>
      </article>
    );
  }
  return <EmbedCard address={getAddress(address.toLowerCase())} />;
}
