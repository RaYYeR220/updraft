import { defineChain } from "viem";

/** Elysium testnet (Kinetiq's L2 settling to HyperEVM, HYPE as gas). */
export const elysiumTestnet = defineChain({
  id: 99801,
  name: "Elysium Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.elysium.kinetiq.xyz"] } },
  blockExplorers: {
    default: { name: "Elysium Explorer", url: "https://elysium.kinetiq.xyz/testnet-explorer" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: true,
});

/** Ascend's live deployment on Elysium testnet. The launchpad is redeployed from time to time. */
export const ascendTestnet = {
  launchpad: "0x6d01f6644bbf1b5074472D3e85aa1465B4d2bF3d",
  owner: "0x5Fa637713b819d6314e139291De2Bfa7b7cD70eB",
  poolManager: "0x12E84206cB53aE0df055482ebc4658635096E1aA",
  vault: "0x2B738A9A69b7a45C9dA6B519f6bE6efBfb912aec",
  usdc: "0x84Cc00D13173f7016Bbab22A736dBf75A154cFE2",
  mnvdax: "0xa7CDbE6342A2eF5f789BCdd3653c7f48c7F16A51",
} as const;

export const explorerTx = (hash: string) => `${elysiumTestnet.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddress = (address: string) => `${elysiumTestnet.blockExplorers.default.url}/address/${address}`;
