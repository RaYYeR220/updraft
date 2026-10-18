// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {RoundTestBase} from "../utils/RoundTestBase.sol";
import {UpdraftRound} from "../../src/UpdraftRound.sol";
import {CreatorVault} from "../../src/CreatorVault.sol";
import {LaunchCertificate, Certificate} from "../../src/LaunchCertificate.sol";
import {UpdraftStaking} from "../../src/UpdraftStaking.sol";
import {IAscendLaunchpad} from "../../src/interfaces/IAscendLaunchpad.sol";
import {RoundConfig, Status, AbortReason, Wiring, FirePreview} from "../../src/interfaces/IUpdraft.sol";
import {LiveCurve} from "../utils/LiveCurve.sol";

interface IERC20B {
    function balanceOf(address) external view returns (uint256);
}

contract RoundFireTest is RoundTestBase {
    LaunchCertificate internal certificate;
    UpdraftStaking internal staking;
    mapping(address => bool) public isRound;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public override {
        super.setUp();
        certificate = new LaunchCertificate(address(this));
        certificate.setFactory(address(this));
        staking = new UpdraftStaking(address(this));
        wiring = Wiring({
            vaultImplementation: address(new CreatorVault()),
            certificate: address(certificate),
            staking: address(staking)
        });
    }

    function _round(RoundConfig memory cfg) internal returns (UpdraftRound r) {
        r = _newRound(cfg);
        isRound[address(r)] = true;
    }

    function _fired(uint256 a, uint256 b, uint256 c) internal returns (UpdraftRound r) {
        r = _round(_defaultConfig());
        if (a > 0) _commit(r, alice, a);
        if (b > 0) _commit(r, bob, b);
        if (c > 0) _commit(r, carol, c);
        vm.warp(block.timestamp + 1 hours);
        r.fire();
    }

    function _tokens(UpdraftRound r, address who) internal view returns (uint256) {
        return IERC20B(r.token()).balanceOf(who);
    }

    function test_fire_uniformPrice_allParticipants() public {
        UpdraftRound r = _fired(100e6, 200e6, 700e6);
        r.distribute(0, 3);
        uint256 net = r.netTokens();
        assertEq(_tokens(r, alice), net * 100e6 / 1_000e6, "alice: pro-rata");
        assertEq(_tokens(r, bob), net * 200e6 / 1_000e6, "bob: pro-rata");
        assertEq(_tokens(r, carol), net * 700e6 / 1_000e6, "carol: pro-rata");
        // Same price for everyone: tokens per unit of quote are equal up to rounding.
        assertApproxEqAbs(_tokens(r, alice) * 7, _tokens(r, carol), 7);
        assertEq(uint8(r.status()), uint8(Status.Fired));
    }

    function test_fire_parityGoesToBid() public {
        UpdraftRound r = _fired(400e6, 600e6, 0);
        assertEq(lp.bidInventory(r.poolId()), 10e6, "1% of the effective raise funds Ascend's bid");
    }

    function test_fire_platformCutToStaking() public {
        UpdraftRound r = _fired(400e6, 600e6, 0);
        assertEq(IERC20B(r.token()).balanceOf(address(staking)), r.tokensOut() * 50 / 10_000);
        assertEq(r.netTokens(), r.tokensOut() - r.tokensOut() * 50 / 10_000);
    }

    function test_fire_handsCreatorRoleToVault() public {
        UpdraftRound r = _fired(400e6, 600e6, 0);
        assertTrue(r.vault() != address(0));
        assertEq(lp.poolCreator(r.poolId()), r.vault());
        assertEq(CreatorVault(r.vault()).creator(), creator);
    }

    function test_fire_matchesPreview() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 1_000e6);
        vm.warp(block.timestamp + 1 hours);
        FirePreview memory p = r.previewFire();
        r.fire();
        assertEq(r.tokensOut(), p.tokensOut, "fire buys exactly what the preview said");
        assertEq(p.parity, 10e6);
        assertEq(p.devBuy, 990e6);
    }

    function test_fire_overMaxRaise_scalesAndRefunds() public {
        RoundConfig memory cfg = _defaultConfig();
        cfg.raise.maxRaise = 500e6;
        UpdraftRound r = _round(cfg);
        _commit(r, alice, 600e6);
        _commit(r, bob, 400e6);
        vm.warp(block.timestamp + 1 hours);
        r.fire();
        r.distribute(0, 2);
        assertEq(usdc.balanceOf(alice), 300e6, "half of alice's commit comes back");
        assertEq(usdc.balanceOf(bob), 200e6, "half of bob's commit comes back");
    }

    function test_fire_withBurnedEscrow_socialisesShortfall() public {
        RoundConfig memory cfg = _defaultConfig();
        cfg.raise.maxRaise = 500e6;
        UpdraftRound r = _round(cfg);
        _commit(r, alice, 600e6);
        _commit(r, bob, 400e6);
        usdc.burn(address(r), 250e6);
        vm.warp(block.timestamp + 1 hours);
        vm.expectEmit(true, true, true, true, address(r));
        emit UpdraftRound.Shortfall(1_000e6, 750e6);
        r.fire();
        r.distribute(0, 2);
        assertEq(usdc.balanceOf(alice), 150e6, "alice's refund carries 60% of the loss");
        assertEq(usdc.balanceOf(bob), 100e6, "bob's refund carries 40% of the loss");
        assertEq(r.quoteUsed(), 500e6);
        assertEq(certificate.get(r.token()).shortfall, 250e6);
    }

    function test_fire_whenPaused_aborts() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 500e6);
        lp.setPaused(true);
        vm.warp(block.timestamp + 1 hours);
        r.fire();
        assertEq(uint8(r.abortReason()), uint8(AbortReason.LaunchpadPaused));
        vm.prank(alice);
        r.refundAborted();
        assertEq(usdc.balanceOf(alice), 500e6);
    }

    function test_fire_whenQuoteDisallowed_aborts() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 500e6);
        lp.setQuoteConfig(address(usdc), false, USDC_START, 4_000e6);
        vm.warp(block.timestamp + 1 hours);
        r.fire();
        assertEq(uint8(r.abortReason()), uint8(AbortReason.QuoteDisallowed));
    }

    function test_fire_whenCurveChanged_aborts() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 500e6);
        IAscendLaunchpad.CurveStep[] memory steps = LiveCurve.steps();
        steps[0].bps += 1;
        steps[14].bps -= 1;
        lp.setCurve(steps);
        vm.warp(block.timestamp + 1 hours);
        r.fire();
        assertEq(uint8(r.abortReason()), uint8(AbortReason.CurveChanged));
    }

    function test_fire_whenLaunchpadRevoked_aborts() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 500e6);
        isAllowedLaunchpad[address(lp)] = false;
        vm.warp(block.timestamp + 1 hours);
        r.fire();
        assertEq(uint8(r.abortReason()), uint8(AbortReason.LaunchpadRevoked));
    }

    function test_fire_belowMinimum_aborts() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 50e6);
        vm.warp(block.timestamp + 1 hours);
        r.fire();
        assertEq(uint8(r.abortReason()), uint8(AbortReason.BelowMinimum));
    }

    function test_fire_beforeClose_reverts() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 500e6);
        vm.expectRevert(UpdraftRound.NotClosed.selector);
        r.fire();
    }

    function test_fire_twice_reverts() public {
        UpdraftRound r = _fired(500e6, 0, 0);
        vm.expectRevert(UpdraftRound.NotLive.selector);
        r.fire();
    }

    function test_distribute_chunks_pushAll_noDoublePay() public {
        UpdraftRound r = _round(_defaultConfig());
        for (uint256 i; i < 5; i++) {
            _commit(r, address(uint160(0x5000 + i)), 100e6);
        }
        vm.warp(block.timestamp + 1 hours);
        r.fire();
        r.distribute(0, 2);
        r.distribute(2, 5);
        r.distribute(0, 5);
        uint256 each = r.netTokens() * 100e6 / 500e6;
        for (uint256 i; i < 5; i++) {
            assertEq(_tokens(r, address(uint160(0x5000 + i))), each, "paid once");
        }
        assertEq(r.distributedCount(), 5);
        vm.prank(address(0x5000));
        vm.expectRevert(UpdraftRound.NothingToClaim.selector);
        r.claim();
    }

    function test_claim_afterDistribute_onlyVestedRemainder() public {
        RoundConfig memory cfg = _defaultConfig();
        cfg.participantVesting.tgeBps = 5_000;
        cfg.participantVesting.duration = 48 hours;
        UpdraftRound r = _round(cfg);
        _commit(r, alice, 1_000e6);
        vm.warp(block.timestamp + 1 hours);
        r.fire();
        r.distribute(0, 1);
        uint256 all = r.netTokens();
        assertEq(_tokens(r, alice), all / 2, "half at fire");
        vm.warp(block.timestamp + 24 hours);
        vm.prank(alice);
        r.claim();
        assertEq(_tokens(r, alice), all / 2 + (all - all / 2) / 2, "a quarter more after a day");
    }

    function test_creator_cannotClaimBeforeCliff() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 800e6);
        _commit(r, creator, 200e6);
        vm.warp(block.timestamp + 1 hours);
        r.fire();
        r.distribute(0, 2);
        assertEq(_tokens(r, creator), 0, "the creator is never pushed");
        vm.warp(block.timestamp + 1 days - 1);
        vm.prank(creator);
        vm.expectRevert(UpdraftRound.NothingToClaim.selector);
        r.claim();
    }

    function test_creator_linearAfterCliff() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 800e6);
        _commit(r, creator, 200e6);
        vm.warp(block.timestamp + 1 hours);
        r.fire();
        uint256 share = r.netTokens() * 200e6 / 1_000e6;
        vm.warp(block.timestamp + 1 days + 3.5 days);
        vm.prank(creator);
        r.claim();
        assertEq(_tokens(r, creator), share / 2, "half vested halfway through");
        vm.warp(block.timestamp + 4 days);
        vm.prank(creator);
        r.claim();
        assertEq(_tokens(r, creator), share, "fully vested");
    }

    function test_participantVesting_optional() public {
        UpdraftRound r = _fired(300e6, 0, 0);
        r.distribute(0, 1);
        assertEq(_tokens(r, alice), r.netTokens(), "default: everything at fire");
    }

    function test_certificate_recordsTop10AndCounts() public {
        UpdraftRound r = _round(_defaultConfig());
        // 12 participants: one big (1,000), eleven small (100 each) = 2,100 total.
        _commit(r, alice, 1_000e6);
        for (uint256 i; i < 11; i++) {
            _commit(r, address(uint160(0x7000 + i)), 100e6);
        }
        vm.warp(block.timestamp + 1 hours);
        r.fire();
        Certificate memory c = certificate.get(r.token());
        assertEq(c.round, address(r));
        assertEq(c.participants, 12);
        assertEq(c.verifiedIdentities, 0);
        assertEq(c.top1Bps, 4761, "1,000 / 2,100");
        assertEq(c.top10Bps, 9047, "1,000 + 9 x 100 over 2,100");
        assertEq(c.tokensOut, r.tokensOut());
        assertEq(c.quoteUsed, 2_100e6);
    }
}
