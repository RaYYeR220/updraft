// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IAscendLaunchpad} from "../../src/interfaces/IAscendLaunchpad.sol";

interface IERC20Like {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

interface IMockMintable {
    function mint(address to, uint256 value) external;
    function burn(address from, uint256 value) external;
}

/// @notice Shared setup for tests that run against the live Ascend deployment on Elysium testnet.
abstract contract ForkBase is Test {
    address internal constant LAUNCHPAD = 0x6d01f6644bbf1b5074472D3e85aa1465B4d2bF3d;
    address internal constant ASCEND_OWNER = 0x5Fa637713b819d6314e139291De2Bfa7b7cD70eB;
    address internal constant POOL_MANAGER = 0x12E84206cB53aE0df055482ebc4658635096E1aA;
    address internal constant UNIVERSAL_ROUTER = 0x252392a912A8C4fe5aD8CCe1d64662e25Ce33321;
    address internal constant USDC = 0x84Cc00D13173f7016Bbab22A736dBf75A154cFE2;
    address internal constant MNVDAX = 0xa7CDbE6342A2eF5f789BCdd3653c7f48c7F16A51;

    /// @dev Pinned so runs are reproducible and RPC state is cached; override with FORK_BLOCK.
    uint256 internal constant DEFAULT_FORK_BLOCK = 11024188;

    IAscendLaunchpad internal launchpad = IAscendLaunchpad(LAUNCHPAD);

    function setUp() public virtual {
        vm.createSelectFork("elysium", vm.envOr("FORK_BLOCK", DEFAULT_FORK_BLOCK));
    }

    function _mintUsdc(address to, uint256 amount) internal {
        IMockMintable(USDC).mint(to, amount);
    }

    /// @dev Launches straight through Ascend, the way any wallet would.
    function _launchRaw(address payer, address creator, bytes32 salt, uint256 devBuy)
        internal
        returns (address token, bytes32 poolId, uint256 devOut)
    {
        vm.startPrank(payer);
        IERC20Like(USDC).approve(LAUNCHPAD, devBuy);
        (token, poolId) = launchpad.launch(
            IAscendLaunchpad.LaunchParams({
                name: "Probe",
                symbol: "PRB",
                quote: USDC,
                devBuyQuote: devBuy,
                minDevOut: 0,
                salt: salt,
                creator: creator
            })
        );
        vm.stopPrank();
        devOut = IERC20Like(token).balanceOf(creator);
    }
}
