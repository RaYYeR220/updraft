import { fallback, http } from "viem";
import { type Deployment, elysiumTestnet, elysiumTestnetDeployment } from "@updraft/sdk";

export const RPC_URL = process.env.NEXT_PUBLIC_ELYSIUM_RPC ?? "https://testnet-rpc.elysium.kinetiq.xyz";
const RPC_URLS = [...new Set([RPC_URL, "https://testnet-rpc.elysium.kinetiq.xyz", "https://rpc-elysium-testnet.t.conduit.xyz"])];

/** Elysium's public endpoints rate-limit each client, so reads and sends spread over both and back off on 429. */
export const rpcTransport = () => fallback(RPC_URLS.map((url) => http(url, { retryCount: 4, retryDelay: 400 })));
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:42069";

export const chain = { ...elysiumTestnet, rpcUrls: { default: { http: [RPC_URL] } } };

export const deployment = elysiumTestnetDeployment as unknown as Deployment;
