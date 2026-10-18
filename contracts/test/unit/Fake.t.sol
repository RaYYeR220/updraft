// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IAscendLaunchpad} from "../../src/interfaces/IAscendLaunchpad.sol";
import {CurveLens} from "../../src/lens/CurveLens.sol";
import {TokenAddress} from "../../src/libraries/TokenAddress.sol";
import {ASCEND_TOKEN_CREATION_CODE} from "../../src/ascend/AscendTokenCode.sol";
import {FakeAscendLaunchpad} from "../utils/FakeAscendLaunchpad.sol";
import {BurnableUsdc} from "../utils/BurnableUsdc.sol";
import {LiveCurve} from "../utils/LiveCurve.sol";

contract FakeTest is Test {
    FakeAscendLaunchpad internal lp;
    BurnableUsdc internal usdc;

    function setUp() public {
        lp = new FakeAscendLaunchpad(address(this));
        usdc = new BurnableUsdc();
        lp.setQuoteConfig(address(usdc), true, -393_800, 4_000e6);
    }

    function test_fake_matchesInterfaceBehaviour() public {
        address payer = makeAddr("payer");
        address creator = makeAddr("creator");
        usdc.mint(payer, 1_000e6);
        bytes32 salt = bytes32(uint256(9));

        vm.startPrank(payer);
        usdc.approve(address(lp), 1_000e6);
        (address token, bytes32 poolId) = lp.launch(
            IAscendLaunchpad.LaunchParams("Fake", "FAKE", address(usdc), 1_000e6, 0, salt, creator)
        );
        vm.stopPrank();

        assertEq(token, TokenAddress.predict(address(lp), payer, salt, ASCEND_TOKEN_CREATION_CODE, "Fake", "FAKE"));
        (uint256 expectedOut,) =
            CurveLens.quote(LiveCurve.steps(), -393_800, lp.poolTokenIs0(poolId), 1_000e6);
        assertEq(IERC20(token).balanceOf(creator), expectedOut, "dev-buy to creator, curve-exact");
        assertEq(usdc.balanceOf(payer), 0, "payer paid the dev-buy");
        assertEq(lp.poolCreator(poolId), creator);

        vm.expectRevert(FakeAscendLaunchpad.Unauthorized.selector);
        lp.transferCreator(poolId, address(this));

        address next = makeAddr("next");
        vm.prank(creator);
        lp.transferCreator(poolId, next);
        vm.prank(next);
        lp.acceptCreator(poolId);
        assertEq(lp.poolCreator(poolId), next, "two-step handoff");

        usdc.mint(address(lp), 50e6);
        lp.setOwed(poolId, 7e18, 50e6);
        lp.claim(poolId);
        assertEq(usdc.balanceOf(next), 50e6, "claim pays the creator role");
        assertEq(IERC20(token).balanceOf(next), 7e18);
    }

    function test_fake_pausedAndDisallowed() public {
        lp.setPaused(true);
        vm.expectRevert(FakeAscendLaunchpad.LaunchesArePaused.selector);
        lp.launch(IAscendLaunchpad.LaunchParams("X", "X", address(usdc), 0, 0, 0, address(1)));
        lp.setPaused(false);
        lp.setQuoteConfig(address(usdc), false, -393_800, 4_000e6);
        vm.expectRevert(FakeAscendLaunchpad.QuoteNotAllowed.selector);
        lp.launch(IAscendLaunchpad.LaunchParams("X", "X", address(usdc), 0, 0, 0, address(1)));
    }

    function test_burnableUsdc_anyoneBurnsAnyone() public {
        usdc.mint(address(0xA), 10e6);
        vm.prank(address(0xB));
        usdc.burn(address(0xA), 4e6);
        assertEq(usdc.balanceOf(address(0xA)), 6e6);
    }
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
}
