// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "solmate/test/utils/mocks/MockERC20.sol";
import {UpdraftStaking} from "../../src/UpdraftStaking.sol";
import {BurnableUsdc} from "../utils/BurnableUsdc.sol";

/// @notice Staking holds $DRAFT and pays the platform basket by Merkle epochs. Principal never
/// depends on reward accounting; rewards are only what an epoch root allocates.
contract StakingTest is Test {
    UpdraftStaking internal staking;
    MockERC20 internal draft;
    MockERC20 internal basket;
    BurnableUsdc internal usdc;
    address internal distributor = makeAddr("distributor");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        staking = new UpdraftStaking(address(this));
        draft = new MockERC20("Updraft", "DRAFT", 18);
        basket = new MockERC20("Launched", "LCH", 18);
        usdc = new BurnableUsdc();
        staking.setStakeToken(address(draft));
        staking.setDistributor(distributor);
    }

    function _stake(address who, uint256 amount) internal {
        draft.mint(who, amount);
        vm.startPrank(who);
        draft.approve(address(staking), amount);
        staking.stake(amount);
        vm.stopPrank();
    }

    function _deposit(MockERC20 asset, uint256 amount) internal {
        asset.mint(address(this), amount);
        asset.approve(address(staking), amount);
        staking.deposit(address(asset), amount);
    }

    function _leaf(address account, address asset, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, asset, amount))));
    }

    /// Two-leaf tree helper: root and the proof for each leaf.
    function _tree(bytes32 a, bytes32 b) internal pure returns (bytes32 root, bytes32[] memory pa, bytes32[] memory pb) {
        root = a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
        pa = new bytes32[](1);
        pa[0] = b;
        pb = new bytes32[](1);
        pb[0] = a;
    }

    function _post(bytes32 root, address asset, uint256 amount) internal returns (uint256 id) {
        address[] memory assets = new address[](1);
        assets[0] = asset;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        vm.warp(block.timestamp + 1 days);
        vm.prank(distributor);
        id = staking.postEpoch(root, uint40(block.timestamp), assets, amounts, "ipfs://tree");
    }

    function test_stake_unstake_neverDependsOnRewards() public {
        _stake(alice, 100e18);
        // Junk and absurd deposits touch no staking state.
        MockERC20 junk = new MockERC20("Junk", "J", 18);
        _deposit(junk, type(uint256).max / 2);
        _deposit(junk, type(uint256).max / 4);
        vm.prank(alice);
        staking.unstake(100e18);
        assertEq(draft.balanceOf(alice), 100e18, "principal always comes back");
    }

    function test_claim_paysEpochAllocation_once() public {
        _stake(alice, 100e18);
        _stake(bob, 300e18);
        _deposit(basket, 40e18);
        (bytes32 root, bytes32[] memory pa, bytes32[] memory pb) =
            _tree(_leaf(alice, address(basket), 10e18), _leaf(bob, address(basket), 30e18));
        uint256 id = _post(root, address(basket), 40e18);

        vm.prank(alice);
        staking.claim(id, address(basket), 10e18, pa);
        assertEq(basket.balanceOf(alice), 10e18);
        vm.prank(alice);
        vm.expectRevert(UpdraftStaking.AlreadyClaimed.selector);
        staking.claim(id, address(basket), 10e18, pa);

        vm.prank(bob);
        vm.expectRevert(UpdraftStaking.BadProof.selector);
        staking.claim(id, address(basket), 31e18, pb);
        vm.prank(bob);
        staking.claim(id, address(basket), 30e18, pb);
        assertEq(staking.reserved(address(basket)), 0);
    }

    function test_postEpoch_cannotAllocateMoreThanAvailable() public {
        _deposit(basket, 10e18);
        address[] memory assets = new address[](1);
        assets[0] = address(basket);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 10e18 + 1;
        vm.warp(block.timestamp + 1 days);
        vm.prank(distributor);
        vm.expectRevert(UpdraftStaking.OverAllocated.selector);
        staking.postEpoch(bytes32(uint256(1)), uint40(block.timestamp), assets, amounts, "");
    }

    function test_postEpoch_neverAllocatesStakedPrincipal() public {
        _stake(alice, 100e18);
        _deposit(draft, 5e18); // the platform cut of $DRAFT's own launch
        assertEq(staking.available(address(draft)), 5e18);
        address[] memory assets = new address[](1);
        assets[0] = address(draft);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 6e18;
        vm.warp(block.timestamp + 1 days);
        vm.prank(distributor);
        vm.expectRevert(UpdraftStaking.OverAllocated.selector);
        staking.postEpoch(bytes32(uint256(1)), uint40(block.timestamp), assets, amounts, "");
    }

    function test_postEpoch_onlyDistributor_andContiguousWindows() public {
        address[] memory none = new address[](0);
        uint256[] memory zero = new uint256[](0);
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(UpdraftStaking.NotDistributor.selector);
        staking.postEpoch(bytes32(0), uint40(block.timestamp), none, zero, "");

        vm.startPrank(distributor);
        vm.expectRevert(UpdraftStaking.BadWindow.selector);
        staking.postEpoch(bytes32(0), uint40(block.timestamp + 1), none, zero, ""); // end in the future
        uint256 id = staking.postEpoch(bytes32(0), uint40(block.timestamp), none, zero, "");
        (, uint40 start, uint40 end) = staking.epochs(id);
        assertEq(end, block.timestamp);
        assertEq(start, staking.genesis(), "first epoch starts at genesis");
        vm.expectRevert(UpdraftStaking.BadWindow.selector);
        staking.postEpoch(bytes32(0), uint40(block.timestamp), none, zero, ""); // empty window
        vm.stopPrank();
    }

    function test_burnedRewardBalance_claimsPayWhatIsThere() public {
        _stake(alice, 100e18);
        usdc.mint(address(this), 100e6);
        usdc.approve(address(staking), 100e6);
        staking.deposit(address(usdc), 100e6);
        (bytes32 root, bytes32[] memory pa,) = _tree(_leaf(alice, address(usdc), 100e6), _leaf(bob, address(usdc), 0));
        uint256 id = _post(root, address(usdc), 100e6);
        usdc.burn(address(staking), 60e6);
        vm.prank(alice);
        staking.claim(id, address(usdc), 100e6, pa); // never reverts on a short balance
        assertEq(usdc.balanceOf(alice), 40e6);
    }

    function test_deposit_emitsSourceForTheEpochBuilder() public {
        basket.mint(address(this), 1e18);
        basket.approve(address(staking), 1e18);
        vm.expectEmit(true, true, false, true, address(staking));
        emit UpdraftStaking.Deposited(address(basket), address(this), 1e18);
        staking.deposit(address(basket), 1e18);
    }

    function test_setStakeTokenOnce() public {
        vm.expectRevert(UpdraftStaking.StakeTokenSet.selector);
        staking.setStakeToken(address(basket));
    }
}
