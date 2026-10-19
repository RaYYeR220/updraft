import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";
import { usdc, when } from "./format";

export interface ErrorContext {
  minCommit?: bigint;
  walletCap?: bigint;
  creatorCap?: bigint;
  openAt?: number;
  lockAt?: number;
  closeAt?: number;
}

/** Custom errors that come from libraries rather than the round's own ABI, by selector. */
const SELECTORS: Record<string, string> = {
  "0x7939f424": "TransferFromFailed",
  "0x90b8ec18": "TransferFailed",
  "0xab143c06": "Reentrancy",
};

function sentence(name: string, c: ErrorContext): string {
  switch (name) {
    case "NotOpen":
      return c.openAt ? `This round isn't open yet. Commits open ${when(c.openAt)}.` : "This round isn't open for commits yet.";
    case "Closed":
      return "Commits closed at T0. The round can only fire, or be aborted, from here.";
    case "Locked":
      return c.lockAt ? `Withdrawals locked at ${when(c.lockAt)}. Your commit is final.` : "Withdrawals are locked. Your commit is final.";
    case "ZeroAmount":
      return "Enter an amount above zero.";
    case "BelowMinCommit":
      return c.minCommit !== undefined
        ? `The smallest commit here is ${usdc(c.minCommit)} USDC, and a withdrawal has to leave either nothing or at least ${usdc(c.minCommit)} USDC.`
        : "That's below this round's minimum commit.";
    case "OverWalletCap":
      return c.walletCap !== undefined ? `That would take this wallet over the round's cap of ${usdc(c.walletCap)} USDC.` : "That would take this wallet over the round's cap.";
    case "OverCreatorCap":
      return c.creatorCap !== undefined ? `The creator can commit at most ${usdc(c.creatorCap)} USDC in this round.` : "That's over the creator's cap.";
    case "OverCommitted":
      return "You can't withdraw more than you have in the round.";
    case "EscrowShort":
      return "The round's escrow holds less USDC than it has on its books, so new commits wait until it's made whole.";
    case "TooManyParticipants":
      return "This round is full: one round holds at most 1,000 wallets.";
    case "BadVoucher":
      return "The identity voucher wasn't accepted. Verify again and retry.";
    case "VoucherExpired":
      return "Your identity voucher expired. Verify again for a fresh one.";
    case "IdentityTaken":
      return "This Hyperliquid account already holds a place in this round, from another wallet.";
    case "WrongRound":
      return "That voucher was issued for a different round. Verify again on this page.";
    case "WrongWallet":
      return "That voucher was issued to a different wallet. Verify again with the wallet you're committing from.";
    case "NotLive":
      return "This round is no longer live.";
    case "NotClosed":
      return c.closeAt ? `The round can fire at T0, ${when(c.closeAt)}, not before.` : "The round can fire at T0, not before.";
    case "NotAbortable":
      return "The round can't be aborted: it hasn't missed its deadline or closed under its minimum.";
    case "NothingToRefund":
      return "There's nothing left to refund to this wallet.";
    case "NotFired":
      return "The round hasn't fired yet.";
    case "NothingToClaim":
      return "Nothing to claim right now. Unlocked tokens and refunds show up here as they become claimable.";
    case "LaunchpadPaused":
      return "Ascend is paused. The round waits and can fire as soon as it resumes.";
    case "TokenMismatch":
      return "Ascend would have created a different token address than the one this round promised, so the launch was stopped.";
    case "TransferFromFailed":
      return "The USDC transfer failed. Check your balance and that the permit or allowance went through.";
    case "TransferFailed":
      return "A token transfer out of the round failed. Try again in a moment.";
    case "Reentrancy":
      return "The round refused a nested call. Try again.";
    default:
      return `The round refused this transaction (${name}).`;
  }
}

// Every Updraft revert names its error, so a bare one is the node refusing a gas limit the
// wallet's HYPE can't cover.
const BARE_REVERT = "The node refused it without a reason, which here almost always means the wallet's HYPE can't cover this call's gas. Top up the wallet and try again.";
const bare = (r: ContractFunctionRevertedError) => !r.signature && (!r.reason || /^execution reverted\.?$/i.test(r.reason));

/** Turns a failed write into one plain sentence. */
export function explain(e: unknown, c: ErrorContext = {}): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "You cancelled the request in your wallet.";
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? (revert.signature ? SELECTORS[revert.signature] : undefined);
      if (name) return sentence(name, c);
      if (bare(revert)) return BARE_REVERT;
      if (revert.reason) return `The transaction would revert: ${revert.reason}.`;
    }
    const text = `${e.shortMessage} ${e.details ?? ""}`;
    if (/insufficient funds/i.test(text)) return "This wallet doesn't hold enough HYPE to pay for gas on Elysium.";
    if (/chain/i.test(text) && /mismatch|does not match|unsupported/i.test(text)) return "Switch your wallet to Elysium testnet (chain 99801) and try again.";
    if (/rejected|denied/i.test(text)) return "You cancelled the request in your wallet.";
    return e.shortMessage;
  }
  if (e instanceof Error) {
    if (/wallet client with an account/.test(e.message)) return "Connect a wallet first.";
    return e.message;
  }
  return "Something went wrong. Try again.";
}
