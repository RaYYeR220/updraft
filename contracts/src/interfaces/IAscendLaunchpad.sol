// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The subset of Ascend's launchpad that Updraft calls or reads.
/// Mirrors the verified `IAscendLaunchpad` on Elysium; `PoolId` is carried as bytes32.
interface IAscendLaunchpad {
    struct QuoteConfig {
        bool allowed;
        int24 startTick;
        uint128 maxClip;
    }

    struct CurveStep {
        int24 offsetLower;
        int24 offsetUpper;
        uint16 bps;
    }

    struct LaunchParams {
        string name;
        string symbol;
        address quote;
        uint256 devBuyQuote;
        uint256 minDevOut;
        bytes32 salt;
        address creator;
    }

    event Launched(
        bytes32 indexed poolId,
        address indexed token,
        address indexed creator,
        address quote,
        uint256 supplySeeded,
        uint256 devBuyTokens
    );
    event CreatorClaimed(bytes32 indexed poolId, address indexed creator, uint256 tokenAmount, uint256 quoteAmount);
    event Filled(bytes32 indexed poolId, uint256 tokensIn, uint256 feeTokens, uint256 tokensBurned, uint256 quotePaid);
    event BidFunded(bytes32 indexed poolId, address indexed funder, uint256 amount);

    function launch(LaunchParams calldata p) external returns (address tokenAddr, bytes32 poolId);
    function fundBid(bytes32 poolId, uint256 amount) external;
    function collect(bytes32 poolId) external returns (uint256 flywheelQuote);
    function claim(bytes32 poolId) external;
    function claimToken(bytes32 poolId) external;
    function claimQuote(bytes32 poolId) external;
    function transferCreator(bytes32 poolId, address next) external;
    function acceptCreator(bytes32 poolId) external;

    function curve() external view returns (CurveStep[] memory);
    function quoteConfig(address quote) external view returns (QuoteConfig memory);
    function paused() external view returns (bool);
    function owner() external view returns (address);
    function listingDesk() external view returns (address);
    function poolCreator(bytes32 poolId) external view returns (address);
    function pendingCreator(bytes32 poolId) external view returns (address);
    function creatorOwedToken(bytes32 poolId) external view returns (uint256);
    function creatorOwedQuote(bytes32 poolId) external view returns (uint256);
    function poolTokenIs0(bytes32 poolId) external view returns (bool);
    function poolLaunchedAt(bytes32 poolId) external view returns (uint40);
    function emaSqrtPrice(bytes32 poolId) external view returns (uint160);
    function bidInventory(bytes32 poolId) external view returns (uint256);
    function currentFee(bytes32 poolId) external view returns (uint24);
}
