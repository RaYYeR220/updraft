import type { Address, Hex } from "viem";

export const Mode = { Open: 0, Verified: 1 } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

export const Status = { Live: 0, Fired: 1, Aborted: 2 } as const;
export type Status = (typeof Status)[keyof typeof Status];

export const AbortReasons = [
  "none",
  "expired",
  "below-minimum",
  "launchpad-paused",
  "quote-disallowed",
  "curve-changed",
  "launchpad-revoked",
] as const;
export type AbortReason = (typeof AbortReasons)[number];

export interface Windows {
  openAt: number;
  lockAt: number;
  closeAt: number;
  fireBy: number;
}

export interface Raise {
  minRaise: bigint;
  maxRaise: bigint;
  walletCap: bigint;
  creatorCap: bigint;
}

export interface Vesting {
  tgeBps: number;
  cliff: number;
  duration: number;
}

export interface Policy {
  platformBps: number;
  bidBps: number;
  stakersBps: number;
  teamBps: number;
}

export interface PolicyBounds {
  min: Policy;
  max: Policy;
  timelock: number;
}

export interface RoundConfig {
  launchpad: Address;
  quote: Address;
  name: string;
  symbol: string;
  tokenSalt: Hex;
  creator: Address;
  mode: Mode;
  attestor: Address;
  windows: Windows;
  raise: Raise;
  participantVesting: Vesting;
  creatorVesting: Vesting;
  policy: Policy;
  bounds: PolicyBounds;
  listingCap: bigint;
  exitEnabled: boolean;
}

export interface Voucher {
  round: Address;
  wallet: Address;
  identityId: Hex;
  expiry: bigint;
  evidenceHash: Hex;
}

export interface FirePreview {
  usable: bigint;
  effective: bigint;
  parity: bigint;
  devBuy: bigint;
  tokensOut: bigint;
  platformTokens: bigint;
  avgPriceX96: bigint;
}

export interface RoundState {
  address: Address;
  config: RoundConfig;
  status: Status;
  abortReason: AbortReason;
  expectedToken: Address;
  totalCommitted: bigint;
  participantCount: number;
  verifiedCount: number;
  preview: FirePreview;
  fired?: {
    token: Address;
    poolId: Hex;
    vault: Address;
    firedAt: number;
    tokensOut: bigint;
    netTokens: bigint;
    quoteUsed: bigint;
    refundPool: bigint;
    distributedCount: number;
  };
}

export type Attestation =
  | { ok: true; voucher: Voucher; signature: Hex; evidenceHash: Hex }
  | { ok: false; reason: string; evidence?: unknown };

export interface Deployment {
  chainId: number;
  deployBlock: number;
  factory: Address;
  roundImplementation: Address;
  vaultImplementation: Address;
  certificate: Address;
  staking: Address;
  lens: Address;
  attestor: Address;
  launchpad: Address;
}

export const EMPTY_VOUCHER: Voucher = {
  round: "0x0000000000000000000000000000000000000000",
  wallet: "0x0000000000000000000000000000000000000000",
  identityId: "0x0000000000000000000000000000000000000000000000000000000000000000",
  expiry: 0n,
  evidenceHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
};
