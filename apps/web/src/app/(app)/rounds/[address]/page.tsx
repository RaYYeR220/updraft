import type { Metadata } from "next";
import { createPublicClient, getAddress, isAddress } from "viem";
import { updraftRoundAbi } from "@updraft/sdk";
import { RoundNotFound, RoundPage } from "@/components/round/RoundPage";
import { chain, rpcTransport } from "@/lib/config";
import { indexer } from "@/lib/data";
import "@/styles/round.css";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) return { title: "Round not found" };
  const row = await indexer.round(address);
  const named =
    row ??
    (await createPublicClient({ chain, transport: rpcTransport() })
      .readContract({ address: getAddress(address.toLowerCase()), abi: updraftRoundAbi, functionName: "config" })
      .catch(() => null));
  if (!named) return { title: "Round" };
  return {
    title: `${named.name} ($${named.symbol}) round`,
    description: `Commit USDC to the ${named.name} round. At T0 the whole pot becomes Ascend's launch buy and every wallet, the creator's too, pays one average price.`,
  };
}

export default async function Page({ params }: Props) {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) return <RoundNotFound address={address} />;
  return <RoundPage address={getAddress(address.toLowerCase())} />;
}
