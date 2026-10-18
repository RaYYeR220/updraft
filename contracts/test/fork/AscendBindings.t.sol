// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ForkBase, IERC20Like} from "./ForkBase.sol";
import {IAscendLaunchpad} from "../../src/interfaces/IAscendLaunchpad.sol";

contract AscendBindingsTest is ForkBase {
    function test_bindings_readLiveAscend() public view {
        IAscendLaunchpad.CurveStep[] memory steps = launchpad.curve();
        assertEq(steps.length, 15, "15 curve bands");

        IAscendLaunchpad.QuoteConfig memory qc = launchpad.quoteConfig(USDC);
        assertTrue(qc.allowed, "usdc allowed");
        assertEq(qc.startTick, -393_800, "usdc start tick");

        assertFalse(launchpad.paused(), "not paused");
        assertEq(launchpad.owner(), ASCEND_OWNER, "ascend owner");
    }

    function test_rawLaunch_devBuyGoesToCreator() public {
        address payer = makeAddr("payer");
        address creator = address(0xBEEF);
        _mintUsdc(payer, 100e6);

        (address token, bytes32 poolId, uint256 devOut) = _launchRaw(payer, creator, bytes32(uint256(1)), 100e6);

        assertGt(devOut, 0, "dev-buy filled");
        assertEq(IERC20Like(token).balanceOf(creator), devOut, "tokens land with the creator role");
        uint256 spent = 100e6 - IERC20Like(USDC).balanceOf(payer);
        assertGt(spent, 0, "payer funded the dev-buy");
        assertLe(spent, 100e6, "payer spent at most the dev-buy");
        assertEq(launchpad.poolCreator(poolId), creator, "creator role recorded");
    }
}
