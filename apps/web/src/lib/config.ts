import { type Deployment, elysiumTestnet, elysiumTestnetDeployment } from "@updraft/sdk";

export const RPC_URL = process.env.NEXT_PUBLIC_ELYSIUM_RPC ?? "https://testnet-rpc.elysium.kinetiq.xyz";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:42069";

export const chain = { ...elysiumTestnet, rpcUrls: { default: { http: [RPC_URL] } } };

export const deployment = elysiumTestnetDeployment as unknown as Deployment;
