import { readFileSync } from "node:fs";
import { createConfig, factory } from "ponder";
import { parseAbiItem } from "viem";
import { creatorVaultAbi, launchCertificateAbi, updraftFactoryAbi, updraftRoundAbi } from "@updraft/sdk";

const deploymentFile = process.env.DEPLOYMENT_FILE ?? new URL("../../deployments/elysium-testnet.json", import.meta.url);
const deployment = JSON.parse(readFileSync(deploymentFile, "utf8")) as {
  chainId: number;
  deployBlock: number;
  factory: `0x${string}`;
  certificate: `0x${string}`;
};
const ASCEND_POOL_MANAGER = "0x12E84206cB53aE0df055482ebc4658635096E1aA";

export default createConfig({
  database: process.env.DATABASE_URL
    ? { kind: "postgres", connectionString: process.env.DATABASE_URL }
    : { kind: "pglite" },
  chains: {
    elysium: {
      id: deployment.chainId,
      rpc: process.env.ELYSIUM_RPC ?? "https://testnet-rpc.elysium.kinetiq.xyz",
      pollingInterval: 2_000,
    },
  },
  contracts: {
    UpdraftFactory: {
      chain: "elysium",
      abi: updraftFactoryAbi,
      address: deployment.factory,
      startBlock: deployment.deployBlock,
    },
    UpdraftRound: {
      chain: "elysium",
      abi: updraftRoundAbi,
      address: factory({
        address: deployment.factory,
        event: parseAbiItem(
          "event RoundCreated(address indexed round, address indexed token, address indexed creator, address launchpad, address quote, uint8 mode)",
        ),
        parameter: "round",
      }),
      startBlock: deployment.deployBlock,
    },
    // Vaults are clones created inside fire(); their events are matched by signature and kept
    // only when the vault belongs to a fired Updraft round.
    CreatorVault: {
      chain: "elysium",
      abi: creatorVaultAbi,
      startBlock: deployment.deployBlock,
    },
    LaunchCertificate: {
      chain: "elysium",
      abi: launchCertificateAbi,
      address: deployment.certificate,
      startBlock: deployment.deployBlock,
    },
    AscendPools: {
      chain: "elysium",
      abi: [
        parseAbiItem(
          "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee, uint16 protocolFee)",
        ),
      ],
      address: ASCEND_POOL_MANAGER,
      startBlock: deployment.deployBlock,
    },
  },
});
