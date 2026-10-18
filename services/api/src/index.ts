import { serve } from "@hono/node-server";
import postgres from "postgres";
import { type Address, type Hex, createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createApp } from "./app.js";
import { blockscoutExplorer, viemChainReader } from "./chain.js";
import { hlInfo } from "./hl.js";
import { MemoryStore, PgStore, type Store } from "./store.js";

const env = (name: string, fallback?: string) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`missing env ${name}`);
  return v;
};

const RPC = env("ELYSIUM_RPC", "https://testnet-rpc.elysium.kinetiq.xyz");
const chain = {
  id: 99801,
  name: "Elysium Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;
const USDC = env("QUOTE_USDC", "0x84Cc00D13173f7016Bbab22A736dBf75A154cFE2") as Address;

const publicClient = createPublicClient({ chain, transport: http(RPC) });
const attestor = privateKeyToAccount(env("ATTESTOR_PRIVATE_KEY") as Hex);
const apiWallet = createWalletClient({ account: privateKeyToAccount(env("API_WALLET_PRIVATE_KEY") as Hex), chain, transport: http(RPC) });

let store: Store;
if (process.env.DATABASE_URL) {
  const pg = new PgStore(postgres(process.env.DATABASE_URL, { max: 5, prepare: false }));
  await pg.migrate();
  store = pg;
} else {
  console.warn("DATABASE_URL not set: evidence and vouchers are kept in memory only");
  store = new MemoryStore();
}

const mintAbi = parseAbi(["function mint(address to, uint256 value)"]);
const app = createApp({
  attestDeps: {
    info: hlInfo(env("HYPERLIQUID_API", "https://api.hyperliquid.xyz")),
    chain: viemChainReader(publicClient, env("FACTORY") as Address),
    explorer: blockscoutExplorer(env("BLOCKSCOUT_API", "https://elysium.kinetiq.xyz/api")),
    store,
    attestor,
    chainId: chain.id,
    now: () => Date.now(),
  },
  dripDeps: {
    store,
    now: () => Date.now(),
    usdcAmount: BigInt(env("DRIP_USDC", "5000000000")),
    gasAmount: BigInt(env("DRIP_GAS_WEI", "500000000000000")),
    wallet: {
      mintUsdc: (to, amount) => apiWallet.writeContract({ address: USDC, abi: mintAbi, functionName: "mint", args: [to, amount] }),
      sendGas: (to, amount) => apiWallet.sendTransaction({ to, value: amount }),
    },
  },
  analysisPath: env("ANALYSIS_PATH", new URL("../../analysis/out/bottom-of-curve.json", import.meta.url).pathname),
});

const port = Number(env("PORT", "8080"));
serve({ fetch: app.fetch, port });
console.log(`updraft api on :${port} (attestor ${attestor.address})`);
