"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type Address, type WalletClient, createPublicClient } from "viem";
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWalletClient } from "wagmi";
import { createUpdraftClient } from "@updraft/sdk";
import { API_URL, chain, deployment, rpcTransport } from "./config";
import { createDemoKey, demoWalletClient, forgetDemoKey, loadDemoKey, requestDrip } from "./demo-wallet";

export const publicClient = createPublicClient({ chain, transport: rpcTransport() });

type WalletKind = "injected" | "demo" | null;

interface WalletState {
  kind: WalletKind;
  address: Address | null;
  walletClient: WalletClient | null;
  updraft: ReturnType<typeof createUpdraftClient>;
  connectInjected: () => void;
  /** A browser wallet connected to another network; transactions would fail until it switches. */
  wrongNetwork: boolean;
  switchNetwork: () => void;
  startDemo: () => Promise<{ ok: boolean; reason?: string }>;
  disconnect: () => void;
}

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { address: injectedAddress, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { mutate: switchChain } = useSwitchChain();
  const { disconnect: disconnectInjected } = useDisconnect();
  const { data: injectedClient } = useWalletClient();
  const [demo, setDemo] = useState<WalletClient | null>(null);

  useEffect(() => {
    const key = loadDemoKey();
    if (key) setDemo(demoWalletClient(key));
  }, []);

  const startDemo = useCallback(async () => {
    const client = demoWalletClient(loadDemoKey() ?? createDemoKey());
    setDemo(client);
    return requestDrip(client.account!.address);
  }, []);

  const disconnect = useCallback(() => {
    if (demo) {
      forgetDemoKey();
      setDemo(null);
    }
    if (isConnected) disconnectInjected();
  }, [demo, isConnected, disconnectInjected]);

  const value = useMemo<WalletState>(() => {
    const kind: WalletKind = demo ? "demo" : isConnected ? "injected" : null;
    const walletClient = demo ?? (injectedClient as WalletClient | undefined) ?? null;
    return {
      kind,
      address: demo ? demo.account!.address : (injectedAddress ?? null),
      walletClient,
      updraft: createUpdraftClient({ publicClient, walletClient: walletClient ?? undefined, deployment, apiUrl: API_URL }),
      connectInjected: () => connectors[0] && connect({ connector: connectors[0], chainId: chain.id }),
      wrongNetwork: !demo && isConnected && chainId !== chain.id,
      switchNetwork: () => switchChain({ chainId: chain.id }),
      startDemo,
      disconnect,
    };
  }, [demo, isConnected, chainId, injectedClient, injectedAddress, connectors, connect, switchChain, startDemo, disconnect]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}
