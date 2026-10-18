import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { RPC_URL, chain } from "./config";

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: http(RPC_URL) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
