// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "solmate/test/utils/mocks/MockERC20.sol";
import {UpdraftStaking} from "../../src/UpdraftStaking.sol";
import {BurnableUsdc} from "../utils/BurnableUsdc.sol";

contract StakingTest is Test {
    UpdraftStaking internal staking;
    MockERC20 internal draft;
    MockERC20 internal basket;
    BurnableUsdc internal usdc;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        staking = new UpdraftStaking(address(this));
        draft = new MockERC20("Updraft", "DRAFT", 18);
        basket = new MockERC20("Launched", "LCH", 18);
        usdc = new BurnableUsdc();
        staking.setStakeToken(address(draft));
    }

    function _stake(address who, uint256 amount) internal {
        draft.mint(who, amount);
        vm.startPrank(who);
        draft.approve(address(staking), amount);
        staking.stake(amount);
        vm.stopPrank();
    }

    function _notify(MockERC20 asset, uint256 amount) internal {
        asset.mint(address(this), amount);
        asset.approve(address(staking), amount);
        staking.notify(address(asset), amount);
    }

    function test_staking_proRata_multiAsset() public {
        _stake(alice, 100e18);
        _stake(bob, 300e18);
        _notify(usdc, 400e6);
        _notify(basket, 40e18);
        assertEq(staking.earned(alice, address(usdc)), 100e6);
        assertEq(staking.earned(bob, address(basket)), 30e18);

        address[] memory assets = new address[](2);
        assets[0] = address(usdc);
        assets[1] = address(basket);
        vm.prank(alice);
        staking.claim(assets);
        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(basket.balanceOf(alice), 10e18);
        assertEq(staking.rewardAssets().length, 2);
    }

    function test_staking_lateStaker_doesNotEarnPastRewards() public {
        _stake(alice, 100e18);
        _notify(usdc, 100e6);
        _stake(bob, 100e18);
        assertEq(staking.earned(bob, address(usdc)), 0);
        assertEq(staking.earned(alice, address(usdc)), 100e6);
    }

    function test_staking_queuedRewards_releasedToFirstStakers() public {
        _notify(usdc, 50e6);
        assertEq(staking.queued(address(usdc)), 50e6);
        _stake(alice, 1e18);
        assertEq(staking.earned(alice, address(usdc)), 50e6);
    }

    function test_staking_setStakeTokenOnce() public {
        vm.expectRevert(UpdraftStaking.StakeTokenSet.selector);
        staking.setStakeToken(address(basket));
    }

    function test_staking_unstake_returnsPrincipal_evenWhenStakeTokenIsReward() public {
        _stake(alice, 100e18);
        _notify(draft, 10e18); // a round can pay its platform cut in the staked token itself
        vm.prank(alice);
        staking.unstake(100e18);
        assertEq(draft.balanceOf(alice), 100e18, "principal intact");
        assertEq(staking.earned(alice, address(draft)), 10e18, "reward kept separately");
    }

    function test_staking_balanceDeltaNotify_withBurnedBalance_noRevert() public {
        _stake(alice, 100e18);
        _notify(usdc, 100e6);
        usdc.burn(address(staking), 60e6);
        address[] memory assets = new address[](1);
        assets[0] = address(usdc);
        vm.prank(alice);
        staking.claim(assets); // pays what is actually there
        assertEq(usdc.balanceOf(alice), 40e6);
    }
}
