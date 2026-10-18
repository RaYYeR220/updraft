import type { Address } from "viem";

/** Must match UpdraftRound's EIP-712 domain and Voucher typehash. */
export const voucherDomain = (chainId: number, round: Address) =>
  ({ name: "Updraft Attestor", version: "1", chainId, verifyingContract: round }) as const;

export const VOUCHER_TYPES = {
  Voucher: [
    { name: "round", type: "address" },
    { name: "wallet", type: "address" },
    { name: "identityId", type: "bytes32" },
    { name: "expiry", type: "uint64" },
    { name: "evidenceHash", type: "bytes32" },
  ],
} as const;
