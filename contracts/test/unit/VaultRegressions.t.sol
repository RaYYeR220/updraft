// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {LibClone} from "solady/utils/LibClone.sol";
import {CreatorVault} from "../../src/CreatorVault.sol";
import {UpdraftStaking} from "../../src/UpdraftStaking.sol";
import {IAscendLaunchpad} from "../../src/interfaces/IAscendLaunchpad.sol";
import {Policy, PolicyBounds} from "../../src/interfaces/IUpdraft.sol";
import {FakeAscendLaunchpad} from "../utils/FakeAscendLaunchpad.sol";
import {BurnableUsdc} from "../utils/BurnableUsdc.sol";

interface IERC20VR {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

/// @notice Regression tests for the vault findings of the self-audit (F03b, F04, F08, F11, F12, I5).
contract VaultRegressionsTest is Test {
    FakeAscendLaunchpad internal lp;
    BurnableUsdc internal usdc;
    UpdraftStaking internal staking;
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    uint256 internal salt;

    function setUp() public {
        lp = new FakeAscendLaunchpad(address(this));
        usdc = new BurnableUsdc();
        lp.setQuoteConfig(address(usdc), true, -393_800, 4_000e6);
        staking = new UpdraftStaking(address(this));
        usdc.mint(address(this), 100_000e6);
        usdc.approve(address(lp), type(uint256).max);
    }

    function _vault(uint256 listingCap, bool exitEnabled) internal returns (CreatorVault v, address token, bytes32 pid) {
        (v, token, pid) = _offeredVault(listingCap, exitEnabled);
        v.acceptRole();
    }

    /// @dev A vault that has been offered Ascend's creator role but not accepted it yet.
    function _offeredVault(uint256 listingCap, bool exitEnabled)
        internal
        returns (CreatorVault v, address token, bytes32 pid)
    {
        (token, pid) = lp.launch(
            IAscendLaunchpad.LaunchParams("Vaulted", "VLT", address(usdc), 10_000e6, 0, bytes32(++salt), address(this))
        );
        v = CreatorVault(LibClone.clone(address(new CreatorVault())));
        v.initialize(
            CreatorVault.InitParams({
                launchpad: address(lp),
                poolId: pid,
                token: token,
                quote: address(usdc),
                creator: creator,
                staking: address(staking),
                policy: Policy(1000, 3000, 3000, 3000),
                bounds: PolicyBounds({min: Policy(1000, 1000, 0, 0), max: Policy(1000, 6000, 6000, 5000), timelock: 72 hours}),
                listingCap: listingCap,
                exitEnabled: exitEnabled
            })
        );
        lp.transferCreator(pid, address(v));
    }

    function _stake(CreatorVault v, address token, address who, uint256 amount) internal {
        IERC20VR(token).transfer(who, amount);
        vm.startPrank(who);
        IERC20VR(token).approve(address(v), amount);
        v.stake(amount);
        vm.stopPrank();
    }

    function _owe(bytes32 pid, address token, uint256 tokenFees, uint256 quoteFees) internal {
        IERC20VR(token).transfer(address(lp), tokenFees);
        usdc.mint(address(lp), quoteFees);
        lp.setOwed(pid, tokenFees, quoteFees);
    }

    // F04: fees that accrued before a stake are routed before the new stake counts.
    function test_F04_jitStaker_getsNothingAccruedBeforeItStaked() public {
        (CreatorVault v, address token, bytes32 pid) = _vault(0, false);
        _stake(v, token, alice, 1_000e18);
        _owe(pid, token, 0, 1_000e6);
        _stake(v, token, bob, 9_000e18); // stake pulls and routes first
        (uint256 bobQuote,) = v.earned(bob);
        (uint256 aliceQuote,) = v.earned(alice);
        assertEq(bobQuote, 0, "the late staker earns none of the earlier fees");
        assertEq(aliceQuote, 300e6, "the staker who was there gets the whole stakers leg");
    }

    // F03(b): an absurd quote mint can't overflow the accumulator or freeze principal.
    function test_F03_hugeQuoteIncome_neverFreezesUnstake() public {
        (CreatorVault v, address token,) = _vault(0, false);
        _stake(v, token, alice, 1);
        for (uint256 i; i < 3; i++) {
            usdc.mint(address(v), 3.86e41);
            v.checkpoint();
        }
        vm.prank(alice);
        v.unstake(1);
        assertEq(IERC20VR(token).balanceOf(alice), 1, "principal comes back");
        vm.prank(alice);
        v.claimRewards(); // and rewards remain claimable without overflow
    }

    // F11: with nobody staked, the stakers leg is not queued for a first-staker snipe.
    function test_F11_noStakers_legGoesToBidAndPlatform() public {
        (CreatorVault v, address token, bytes32 pid) = _vault(0, false);
        _owe(pid, token, 100e18, 1_000e6);
        v.harvest();
        assertEq(lp.bidInventory(pid), 600e6, "bid leg plus the unclaimed stakers leg");
        assertEq(IERC20VR(token).balanceOf(address(staking)), 10e18 + 60e18, "platform leg plus the token stakers and bid legs");
        _stake(v, token, bob, 1);
        (uint256 q, uint256 t) = v.earned(bob);
        assertEq(q + t, 0, "a first staker inherits nothing");
    }

    // F12: exiting first returns the vault-era listing set-aside to the vault, routed by policy.
    function test_F12_exit_reclaimsListingSetAsideBeforeHandoff() public {
        (CreatorVault v, address token, bytes32 pid) = _vault(500e6, true);
        token;
        usdc.mint(address(lp), 200e6);
        lp.setListingOwed(pid, 200e6);
        vm.prank(creator);
        v.queueExit(creator);
        vm.warp(block.timestamp + 72 hours);
        v.executeExit();
        assertEq(lp.listingOwed(pid), 0, "set-aside pulled back before the role left");
        assertEq(lp.bidInventory(pid), 120e6, "and routed by policy (bid leg plus the unstaked stakers leg)");
        assertEq(usdc.balanceOf(creator), 0, "nothing reached the exit target directly");
    }

    // I5: queued exit and listing can be cancelled; an unenrollable cap is refused up front.
    function test_I5_cancelExitAndListing_andCapBound() public {
        (CreatorVault v,,) = _vault(0, true);
        vm.startPrank(creator);
        v.queueExit(creator);
        v.cancelExit();
        assertEq(v.exitEta(), 0);
        v.queueListing(100e6);
        v.cancelListing();
        assertEq(v.listingEta(), 0);
        vm.expectRevert(CreatorVault.OutOfBounds.selector);
        v.queueListing(uint256(type(uint88).max) + 1);
        vm.stopPrank();
    }

    // F08 / F13: the vault no longer lets anyone sign on its behalf.
    function test_F08_noEip1271() public {
        (CreatorVault v,,) = _vault(0, false);
        (bool ok,) = address(v).staticcall(abi.encodeWithSignature("isValidSignature(bytes32,bytes)", bytes32(0), ""));
        assertFalse(ok, "no signature authority for the creator role");
    }

    // F06 (vault side): a listing the desk refuses doesn't block accepting the role.
    function test_F06_refusedListing_doesNotBlockAccept() public {
        lp.desk().setRefuseAll(true);
        (CreatorVault v,, bytes32 pid) = _vault(100e6, false);
        assertEq(lp.poolCreator(pid), address(v));
    }

    // I1: a stake sent from inside someone else's Infinity lock would skip the fee pull (Ascend's
    // collect needs the lock) and let a just-in-time staker share fees accrued before it staked.
    function test_I1_pullInsideAForeignLock_reverts() public {
        (CreatorVault v, address token,) = _vault(0, false);
        IERC20VR(token).transfer(alice, 1e18);
        vm.startPrank(alice);
        IERC20VR(token).approve(address(v), 1e18);
        lp.vault().setLocker(makeAddr("griefer"));
        vm.expectRevert(CreatorVault.VaultLocked.selector);
        v.stake(1e18);
        lp.vault().setLocker(address(0));
        v.stake(1e18);
        vm.stopPrank();
        assertEq(v.stakeOf(alice), 1e18);
    }

    // I1: the same skip by starving collect of gas is refused too.
    function test_I1_starvedPull_reverts() public {
        (CreatorVault v, address token,) = _vault(0, false);
        IERC20VR(token).transfer(alice, 1e18);
        lp.setCollectGas(2_000_000);
        vm.startPrank(alice);
        IERC20VR(token).approve(address(v), 1e18);
        vm.expectRevert(CreatorVault.InsufficientGas.selector);
        v.stake{gas: 2_500_000}(1e18);
        v.stake(1e18);
        vm.stopPrank();
        assertEq(v.stakeOf(alice), 1e18);
    }

    // I1: an exit can't complete while the listing set-aside is still live; the desk's refusal reverts it.
    function test_I1_exitCannotSkipALiveListing() public {
        (CreatorVault v,, bytes32 pid) = _vault(500e6, true);
        assertGt(lp.listingElection(pid), 0);
        vm.prank(creator);
        v.queueExit(creator);
        vm.warp(block.timestamp + 72 hours);
        lp.desk().setCloseReverts(true);
        vm.expectRevert();
        v.executeExit();
        assertEq(lp.poolCreator(pid), address(v), "the role stays with the vault");
    }

    // F16 (vault side): accepting the role with too little gas for the desk reverts; it can't skip the listing.
    function test_F16_starvedListing_revertsInsteadOfSkipping() public {
        lp.desk().setEnrollGas(600_000);
        (CreatorVault v,, bytes32 pid) = _offeredVault(100e6, false);
        vm.expectRevert(CreatorVault.InsufficientGas.selector);
        v.acceptRole{gas: 500_000}();
        v.acceptRole();
        assertEq(lp.desk().enrolledCapOf(pid), 100e6);
    }
}
