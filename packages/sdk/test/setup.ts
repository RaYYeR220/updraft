// Starts an anvil fork of Elysium testnet (pinned block), deploys Updraft onto it with the real
// deploy script, and tears it down afterwards. Tests read ../../deployments/anvil.json.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contracts = join(here, "..", "..", "..", "contracts");
export const ANVIL_PORT = 8547;
const FORK_BLOCK = "11024188";
const RPC = "https://testnet-rpc.elysium.kinetiq.xyz";
// anvil's first default account
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// anvil's tenth default account doubles as the attestor
const ATTESTOR = "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720";

let anvil: ChildProcess | undefined;

async function waitForRpc(url: string) {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("anvil did not start");
}

export async function setup() {
  anvil = spawn("anvil", ["--fork-url", RPC, "--fork-block-number", FORK_BLOCK, "--port", String(ANVIL_PORT), "--silent"], {
    stdio: "ignore",
  });
  const url = `http://127.0.0.1:${ANVIL_PORT}`;
  await waitForRpc(url);
  const deploy = spawnSync(
    "forge",
    ["script", "script/Deploy.s.sol", "--rpc-url", url, "--broadcast", "--slow"],
    {
      cwd: contracts,
      // The fork shares Elysium's chain id, so its broadcast record goes to its own directory and never
      // replaces the real deployment's.
      env: {
        ...process.env,
        DEPLOYER_PRIVATE_KEY: DEPLOYER_KEY,
        ATTESTOR_ADDRESS: ATTESTOR,
        DEPLOYMENTS_FILE: "anvil.json",
        FOUNDRY_BROADCAST: "broadcast-fork",
      },
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );
  if (deploy.status !== 0) throw new Error(`deploy failed:\n${deploy.stdout}\n${deploy.stderr}`);
}

export async function teardown() {
  anvil?.kill();
}
