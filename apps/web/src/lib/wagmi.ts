import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { chain, rpcTransport } from "./config";

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: rpcTransport() },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
