import { type Address, type Hex, isAddressEqual, recoverTypedDataAddress } from "viem";

/** A Hyperliquid account's key signs this to vouch that an Elysium wallet is the same person. */
export const LINK_DOMAIN = { name: "Updraft", version: "1" } as const;
export const LINK_TYPES = {
  Link: [
    { name: "hlAccount", type: "address" },
    { name: "wallet", type: "address" },
    { name: "chainId", type: "uint256" },
  ],
} as const;

export async function verifyLink(hlAccount: Address, wallet: Address, chainId: number, signature: Hex): Promise<boolean> {
  try {
    const signer = await recoverTypedDataAddress({
      domain: LINK_DOMAIN,
      types: LINK_TYPES,
      primaryType: "Link",
      message: { hlAccount, wallet, chainId: BigInt(chainId) },
      signature,
    });
    return isAddressEqual(signer, hlAccount);
  } catch {
    return false;
  }
}
