// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Shared types for Updraft rounds, vaults, the factory and the certificate registry.

enum Mode {
    Open,
    Verified
}

enum Status {
    Live,
    Fired,
    Aborted
}

enum AbortReason {
    None,
    Expired,
    BelowMinimum,
    LaunchpadPaused,
    QuoteDisallowed,
    CurveChanged,
    LaunchpadRevoked,
    LaunchFailed
}

/// @dev openAt < lockAt <= closeAt < fireBy. Withdrawals stop at lockAt, commits at closeAt.
struct Windows {
    uint40 openAt;
    uint40 lockAt;
    uint40 closeAt;
    uint40 fireBy;
}

/// @dev Quote-denominated. walletCap is the per-wallet (Open) or per-identity (Verified) cap.
struct Raise {
    uint128 minRaise;
    uint128 maxRaise;
    uint128 walletCap;
    uint128 creatorCap;
    /// @dev Smallest commit and smallest balance a wallet may leave behind (0 or at least this).
    uint128 minCommit;
}

/// @dev tgeBps unlocks at fire; the rest unlocks linearly over `duration` after `cliff`.
struct Vesting {
    uint16 tgeBps;
    uint32 cliff;
    uint32 duration;
}

/// @dev Shares of the creator fees, in bps; the four legs sum to 10,000.
struct Policy {
    uint16 platformBps;
    uint16 bidBps;
    uint16 stakersBps;
    uint16 teamBps;
}

struct PolicyBounds {
    Policy min;
    Policy max;
    uint32 timelock;
}

struct RoundConfig {
    address launchpad;
    address quote;
    string name;
    string symbol;
    bytes32 tokenSalt;
    address creator;
    Mode mode;
    address attestor;
    Windows windows;
    Raise raise;
    Vesting participantVesting;
    Vesting creatorVesting;
    Policy policy;
    PolicyBounds bounds;
    uint256 listingCap;
    bool exitEnabled;
}

/// @dev Protocol parameters snapshotted into each round when it is created.
struct Params {
    uint16 parityBps;
    uint16 platformTokenBps;
    uint16 platformFeeBps;
    uint32 minPolicyTimelock;
    uint16 maxTeamBps;
}

/// @dev The contracts a round talks to at fire, fixed when it is created.
struct Wiring {
    address vaultImplementation;
    address certificate;
    address staking;
}

/// @dev Signed by an allowed attestor: `wallet` may commit into `round` as `identityId`.
struct Voucher {
    address round;
    address wallet;
    bytes32 identityId;
    uint64 expiry;
    bytes32 evidenceHash;
}

struct FirePreview {
    uint256 usable;
    uint256 effective;
    uint256 parity;
    uint256 devBuy;
    uint256 tokensOut;
    uint256 platformTokens;
    uint256 avgPriceX96;
}
