"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  type Abi,
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  type Hash,
  type TransactionReceipt,
  UserRejectedRequestError,
  type WalletClient,
} from "viem";
import { publicClient } from "@/lib/wallet";

/** Simulates first, so a call the contract would refuse never reaches the wallet. */
export async function send(
  walletClient: WalletClient | null,
  call: { address: Address; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[] },
): Promise<Hash> {
  const account = walletClient?.account;
  if (!walletClient || !account) throw new Error("Connect a wallet first.");
  const { request } = await publicClient.simulateContract({
    address: call.address,
    abi: call.abi as Abi,
    functionName: call.functionName,
    args: (call.args ?? []) as never,
    account,
  } as never);
  return walletClient.writeContract(request as never);
}

const REASONS: Record<string, string> = {
  BadToken: "The token needs a name and a symbol.",
  ZeroCreator: "The creator address is empty.",
  BadWindows: "The times must run open, then lock, then T0, then fire-by, with T0 still ahead and fire-by at most 7 days after T0.",
  BadRaise: "Check the raise: a minimum above zero and no higher than the maximum, a wallet cap above zero, and a minimum commit between zero and the wallet cap.",
  MaxRaiseOverCapacity: "The maximum raise is more than Ascend's curve can absorb for this token.",
  BadVesting: "Participants' cliff and schedule must fit in 30 days, and anything short of 100% at T0 needs a schedule.",
  WeakCreatorVesting: "The creator's cliff must last at least as long as the participants' cliff and schedule together, with a schedule after it.",
  BadPolicy: "The fee split must add up to 100% with the platform's fixed share, sit inside its bounds, keep the team at or under its maximum, and wait at least the minimum timelock.",
  BadListingCap: "The listing cap is larger than Ascend's listing desk accepts.",
  UnknownAttestor: "This attestor isn't approved by the factory, so a Verified round can't use it.",
  QuoteNotAllowed: "Ascend doesn't accept this quote token right now.",
  LaunchpadNotAllowed: "The factory doesn't accept this launchpad.",
  LaunchpadOwnerMismatch: "Ascend's launchpad changed owner, so the factory won't create rounds on it until that is reviewed.",
  OnlyCreator: "Only the round's creator can do this.",
  OutOfBounds: "That split is outside the bounds fixed at launch, or doesn't add up to 100%.",
  TooEarly: "The timelock hasn't passed yet.",
  NothingQueued: "Nothing is queued.",
  AlreadyQueued: "A change of this kind is already queued. Execute or cancel it first.",
  ExitDisabled: "This round was created without an exit.",
  ZeroAmount: "Enter an amount above zero.",
  OverStaked: "That is more than you have staked.",
  InsufficientGas: "The transaction needs more gas to collect Ascend's fees first. Raise the gas limit and try again.",
  StakeTokenUnset: "Staking opens when $DRAFT launches.",
  AlreadyClaimed: "Already claimed.",
  BadProof: "The proof doesn't match the posted epoch root.",
};

export function explain(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "You declined the request in your wallet.";
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && REASONS[name]) return REASONS[name];
      if (name) return `The contract refused the call (${name}).`;
      if (revert.reason) return `The contract refused the call: ${revert.reason}.`;
    }
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

export type TxState =
  | { status: "idle" }
  | { status: "signing"; label: string }
  | { status: "pending"; label: string; hash: Hash }
  | { status: "done"; label: string; hash: Hash; receipt: TransactionReceipt }
  | { status: "failed"; label: string; error: string; hash?: Hash };

/** Runs one transaction at a time: sign, wait for the receipt, then refresh every query on the page. */
export function useTx() {
  const qc = useQueryClient();
  const [state, setState] = useState<TxState>({ status: "idle" });
  const run = useCallback(
    async (label: string, fn: () => Promise<Hash>) => {
      setState({ status: "signing", label });
      let hash: Hash | undefined;
      try {
        hash = await fn();
        setState({ status: "pending", label, hash });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("The transaction was mined but reverted.");
        setState({ status: "done", label, hash, receipt });
        await qc.invalidateQueries();
        return receipt;
      } catch (e) {
        setState({ status: "failed", label, error: explain(e), hash });
        return null;
      }
    },
    [qc],
  );
  const busy = state.status === "signing" || state.status === "pending";
  return { state, run, busy, reset: () => setState({ status: "idle" }) };
}

/** Wall-clock seconds, ticking; null until mounted so server and client render the same markup. */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
