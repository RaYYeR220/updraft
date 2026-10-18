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

interface IERC20V {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

contract VaultTest is Test {
    FakeAscendLaunchpad internal lp;
    BurnableUsdc internal usdc;
    UpdraftStaking internal staking;
    CreatorVault internal vault;
    address internal token;
    bytes32 internal poolId;
    uint256 internal creatorKey = 0xC0FFEE;
    address internal creator;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        creator = vm.addr(creatorKey);
        lp = new FakeAscendLaunchpad(address(this));
        usdc = new BurnableUsdc();
        lp.setQuoteConfig(address(usdc), true, -393_800, 4_000e6);
        staking = new UpdraftStaking(address(this));

        // This test plays the round: it launches as the creator, then hands the role to the vault.
        usdc.mint(address(this), 10_000e6);
        usdc.approve(address(lp), 10_000e6);
        (token, poolId) = lp.launch(
            IAscendLaunchpad.LaunchParams("Vaulted", "VLT", address(usdc), 10_000e6, 0, bytes32(0), address(this))
        );
        vault = _vault(1000, 3000, 3000, 3000, 0, false);
    }

    function _vault(uint16 platform, uint16 bid, uint16 stakers, uint16 team, uint256 listingCap, bool exitEnabled)
        internal
        returns (CreatorVault v)
    {
        v = CreatorVault(LibClone.clone(address(new CreatorVault())));
        v.initialize(
            CreatorVault.InitParams({
                launchpad: address(lp),
                poolId: poolId,
                token: token,
                quote: address(usdc),
                creator: creator,
                staking: address(staking),
                policy: Policy(platform, bid, stakers, team),
                bounds: PolicyBounds({
                    min: Policy(platform, 1000, 0, 0),
                    max: Policy(platform, 6000, 6000, 5000),
                    timelock: 72 hours
                }),
                listingCap: listingCap,
                exitEnabled: exitEnabled
            })
        );
        lp.transferCreator(poolId, address(v));
        v.acceptRole();
    }

    function _accrue(uint256 tokenFees, uint256 quoteFees) internal {
        IERC20V(token).transfer(address(lp), tokenFees);
        usdc.mint(address(lp), quoteFees);
        lp.setOwed(poolId, tokenFees, quoteFees);
    }

    function _stake(address who, uint256 amount) internal {
        IERC20V(token).transfer(who, amount);
        vm.startPrank(who);
        IERC20V(token).approve(address(vault), amount);
        vault.stake(amount);
        vm.stopPrank();
    }

    function test_harvest_routesByPolicy_exactSplit() public {
        _stake(alice, 1_000e18);
        _accrue(0, 1_000e6);
        vault.harvest();
        assertEq(usdc.balanceOf(address(staking)), 100e6, "platform 10%");
        assertEq(lp.bidInventory(poolId), 300e6, "bid 30%");
        assertEq(vault.teamOwedQuote(), 300e6, "team 30%");
        (uint256 q,) = vault.earned(alice);
        assertEq(q, 300e6, "stakers 30%");
    }

    function test_externalClaim_isRoutedOnNextCheckpoint() public {
        _stake(alice, 1_000e18);
        _accrue(0, 1_000e6);
        lp.claim(poolId); // anyone can push fees to the role holder, bypassing harvest
        assertEq(usdc.balanceOf(address(vault)), 1_000e6);
        vault.checkpoint();
        assertEq(lp.bidInventory(poolId), 300e6);
        assertEq(vault.teamOwedQuote(), 300e6);
    }

    function test_stakedPrincipal_neverCountedAsIncome() public {
        _stake(alice, 5_000e18);
        vault.harvest();
        assertEq(vault.teamOwedToken(), 0, "staked tokens are not fees");
        _accrue(100e18, 0);
        vault.harvest();
        assertEq(vault.teamOwedToken(), 30e18, "only the new token fees are routed");
        vm.prank(alice);
        vault.unstake(5_000e18);
        assertEq(IERC20V(token).balanceOf(alice), 5_000e18, "principal returned in full");
    }

    function test_stakers_earnProRata_quoteAndToken() public {
        _stake(alice, 1_000e18);
        _stake(bob, 3_000e18);
        _accrue(400e18, 400e6);
        vault.harvest();
        (uint256 aq, uint256 at) = vault.earned(alice);
        (uint256 bq, uint256 bt) = vault.earned(bob);
        assertEq(aq, 30e6, "alice: 1/4 of the 120 quote staker leg");
        assertEq(bq, 90e6);
        // Token fees: stakers leg (30%) plus the bid leg (30%), which cannot buy with tokens.
        assertEq(at, 60e18, "alice: 1/4 of 240 tokens");
        assertEq(bt, 180e18);
        vm.prank(bob);
        vault.claimRewards();
        assertEq(usdc.balanceOf(bob), 90e6);
    }

    function test_rewardsBeforeAnyStake_goToFirstStakers() public {
        _accrue(0, 1_000e6);
        vault.harvest();
        _stake(alice, 10e18);
        (uint256 q,) = vault.earned(alice);
        assertEq(q, 300e6, "queued staker leg released to the first staker");
    }

    function test_claimQuoteReverting_tokenLegStillHarvested() public {
        _accrue(100e18, 100e6);
        lp.setQuoteClaimReverts(true);
        vault.harvest();
        assertEq(vault.teamOwedToken(), 30e18, "token leg harvested");
        assertEq(vault.teamOwedQuote(), 0, "quote leg waits");
    }

    function test_burnedQuote_doesNotLockClaims() public {
        _accrue(0, 1_000e6);
        vault.harvest();
        usdc.burn(address(vault), usdc.balanceOf(address(vault)));
        vm.prank(creator);
        vault.claimTeam(); // pays what is there (nothing), never reverts
        assertEq(usdc.balanceOf(creator), 0);
    }

    function test_policy_outOfBounds_reverts() public {
        vm.prank(creator);
        vm.expectRevert(CreatorVault.OutOfBounds.selector);
        vault.queuePolicy(Policy(1000, 500, 3500, 5000)); // bid under its 10% floor
    }

    function test_policy_sumMustBe100_reverts() public {
        vm.prank(creator);
        vm.expectRevert(CreatorVault.OutOfBounds.selector);
        vault.queuePolicy(Policy(1000, 3000, 3000, 2000));
    }

    function test_policy_beforeTimelock_reverts() public {
        vm.prank(creator);
        vault.queuePolicy(Policy(1000, 2000, 2000, 5000));
        vm.warp(block.timestamp + 72 hours - 1);
        vm.expectRevert(CreatorVault.TooEarly.selector);
        vault.executePolicy();
    }

    function test_policy_afterTimelock_applies() public {
        vm.prank(creator);
        vault.queuePolicy(Policy(1000, 2000, 2000, 5000));
        _accrue(0, 1_000e6);
        vm.warp(block.timestamp + 72 hours);
        vault.executePolicy();
        assertEq(vault.teamOwedQuote(), 300e6, "income accrued before the change uses the old split");
        _accrue(0, 1_000e6);
        vault.harvest();
        assertEq(vault.teamOwedQuote(), 800e6, "new income uses the new split");
    }

    function test_policy_nonCreator_reverts() public {
        vm.expectRevert(CreatorVault.OnlyCreator.selector);
        vault.queuePolicy(Policy(1000, 2000, 2000, 5000));
    }

    function test_policy_doubleQueue_reverts() public {
        vm.startPrank(creator);
        vault.queuePolicy(Policy(1000, 2000, 2000, 5000));
        vm.expectRevert(CreatorVault.AlreadyQueued.selector);
        vault.queuePolicy(Policy(1000, 3000, 1000, 5000));
        vm.stopPrank();
    }

    function test_policy_pendingVisible() public {
        vm.prank(creator);
        vault.queuePolicy(Policy(1000, 2000, 2000, 5000));
        (Policy memory p, uint40 eta) = vault.pendingPolicy();
        assertEq(p.teamBps, 5000);
        assertEq(eta, block.timestamp + 72 hours);
        vm.prank(creator);
        vault.cancelPolicy();
        (, eta) = vault.pendingPolicy();
        assertEq(eta, 0);
        vm.expectRevert(CreatorVault.NothingQueued.selector);
        vault.executePolicy();
    }

    function test_platformBps_isImmutable() public {
        vm.prank(creator);
        vm.expectRevert(CreatorVault.OutOfBounds.selector);
        vault.queuePolicy(Policy(0, 4000, 3000, 3000));
    }

    function test_exit_disabled_reverts() public {
        vm.prank(creator);
        vm.expectRevert(CreatorVault.ExitDisabled.selector);
        vault.queueExit(creator);
    }

    function _launchSecond(bytes32 salt) internal returns (address tok, bytes32 pid) {
        (tok, pid) = lp.launch(IAscendLaunchpad.LaunchParams("Second", "SEC", address(usdc), 0, 0, salt, address(this)));
    }

    function _vaultFor(address tok, bytes32 pid, uint256 listingCap, bool exitEnabled)
        internal
        returns (CreatorVault v)
    {
        v = CreatorVault(LibClone.clone(address(new CreatorVault())));
        v.initialize(
            CreatorVault.InitParams({
                launchpad: address(lp),
                poolId: pid,
                token: tok,
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
        v.acceptRole();
    }

    function test_exit_afterTimelock_movesRole() public {
        (address tok, bytes32 pid) = _launchSecond(bytes32(uint256(77)));
        CreatorVault v = _vaultFor(tok, pid, 0, true);
        vm.prank(creator);
        v.queueExit(creator);
        vm.warp(block.timestamp + 72 hours - 1);
        vm.expectRevert(CreatorVault.TooEarly.selector);
        v.executeExit();
        vm.warp(block.timestamp + 1);
        v.executeExit();
        assertEq(lp.pendingCreator(pid), creator, "role offered to the exit target");
        vm.prank(creator);
        lp.acceptCreator(pid);
        assertEq(lp.poolCreator(pid), creator);
    }

    function test_onlyRound_canAcceptRole() public {
        (address tok, bytes32 pid) = _launchSecond(bytes32(uint256(78)));
        CreatorVault v = CreatorVault(LibClone.clone(address(new CreatorVault())));
        v.initialize(
            CreatorVault.InitParams({
                launchpad: address(lp),
                poolId: pid,
                token: tok,
                quote: address(usdc),
                creator: creator,
                staking: address(staking),
                policy: Policy(1000, 3000, 3000, 3000),
                bounds: PolicyBounds({min: Policy(1000, 1000, 0, 0), max: Policy(1000, 6000, 6000, 5000), timelock: 72 hours}),
                listingCap: 0,
                exitEnabled: false
            })
        );
        lp.transferCreator(pid, address(v));
        vm.prank(alice);
        vm.expectRevert(CreatorVault.OnlyRound.selector);
        v.acceptRole();
    }

    function test_listing_enrollAfterAccept() public {
        (address tok, bytes32 pid) = _launchSecond(bytes32(uint256(79)));
        _vaultFor(tok, pid, 500e6, false);
        assertEq(lp.desk().enrolledCap(tok), 500e6, "listing set-aside enrolled by the vault as creator");
    }

    function test_1271_validForCreatorSig_invalidOtherwise() public view {
        bytes32 hash = keccak256("art claim");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(creatorKey, hash);
        assertEq(vault.isValidSignature(hash, abi.encodePacked(r, s, v)), bytes4(0x1626ba7e));
        (v, r, s) = vm.sign(0xBEEF, hash);
        assertEq(vault.isValidSignature(hash, abi.encodePacked(r, s, v)), bytes4(0xffffffff));
    }
}
