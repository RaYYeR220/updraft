// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {RoundTestBase} from "../utils/RoundTestBase.sol";
import {UpdraftRound} from "../../src/UpdraftRound.sol";
import {CreatorVault} from "../../src/CreatorVault.sol";
import {LaunchCertificate, Certificate} from "../../src/LaunchCertificate.sol";
import {UpdraftStaking} from "../../src/UpdraftStaking.sol";
import {RoundConfig, Status, AbortReason, Wiring, Mode, Voucher} from "../../src/interfaces/IUpdraft.sol";

interface IERC20R {
    function balanceOf(address) external view returns (uint256);
}

/// @notice Regression tests for the pre-deployment self-audit (findings F03, F07, F09, F10, F14,
/// F15, I1, I6, I9). Each reproduces the audited scenario and asserts the fixed behaviour.
contract RoundRegressionsTest is RoundTestBase {
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

    // F03(a): a huge testnet mint before abort must not make refunds overflow.
    function test_F03_abortRefunds_surviveAHugeMint() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 30e6);
        _commit(r, bob, 20e6);
        usdc.mint(address(r), 2 ** 200);
        vm.warp(block.timestamp + 1 hours);
        r.abort();
        vm.prank(alice);
        r.refundAborted();
        vm.prank(bob);
        r.refundAborted();
        assertEq(usdc.balanceOf(address(r)), 0, "everything paid out, nothing panicked");
        assertGt(usdc.balanceOf(alice), usdc.balanceOf(bob));
    }

    // F10: a loss after the abort is shared pro-rata; nobody is locked out.
    function test_F10_postAbortBurn_isSharedProRata() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 30e6);
        _commit(r, bob, 20e6);
        _commit(r, carol, 10e6);
        vm.warp(block.timestamp + 1 hours);
        r.abort();
        usdc.burn(address(r), 12e6); // 20% loss after the abort
        vm.prank(alice);
        r.refundAborted();
        vm.prank(bob);
        r.refundAborted();
        vm.prank(carol);
        r.refundAborted();
        assertEq(usdc.balanceOf(alice), 24e6);
        assertEq(usdc.balanceOf(bob), 16e6);
        assertEq(usdc.balanceOf(carol), 8e6);
    }

    // F07: dust commits are refused, and a wallet that withdraws to zero frees its slot.
    function test_F07_dustCommit_refused() public {
        UpdraftRound r = _round(_defaultConfig());
        _fund(alice, 1, r);
        vm.prank(alice);
        vm.expectRevert(UpdraftRound.BelowMinCommit.selector);
        r.commit(1, _noVoucher(), "");
    }

    function test_F07_withdrawToZero_freesTheSlot() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 5e6);
        _commit(r, bob, 5e6);
        vm.prank(alice);
        r.withdraw(5e6);
        assertEq(r.participantCount(), 1, "slot released");
        assertEq(r.participantAt(0), bob);
        _commit(r, alice, 5e6);
        assertEq(r.participantCount(), 2, "re-joins at the end");
    }

    function test_F07_withdrawLeavingDust_refused() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 5e6);
        vm.prank(alice);
        vm.expectRevert(UpdraftRound.BelowMinCommit.selector);
        r.withdraw(5e6 - 1);
    }

    // F09: a quote shortfall after fire never blocks anyone's tokens.
    function test_F09_quoteShortfall_doesNotBlockTokens() public {
        RoundConfig memory cfg = _defaultConfig();
        cfg.raise.maxRaise = 500e6;
        UpdraftRound r = _round(cfg);
        _commit(r, alice, 600e6);
        _commit(r, bob, 400e6);
        vm.warp(block.timestamp + 1 hours);
        r.fire();
        usdc.burn(address(r), usdc.balanceOf(address(r)));
        r.distribute(0, 2);
        uint256 net = r.netTokens();
        assertEq(IERC20R(r.token()).balanceOf(alice), net * 600e6 / 1_000e6, "tokens delivered");
        assertEq(IERC20R(r.token()).balanceOf(bob), net * 400e6 / 1_000e6, "tokens delivered");
        (, uint256 owed) = r.claimable(alice);
        assertEq(owed, 300e6, "the refund is still owed");
        usdc.mint(address(r), 500e6);
        vm.prank(alice);
        r.claim();
        assertEq(usdc.balanceOf(alice), 300e6, "and paid once the quote is back");
    }

    // F14: a paused launchpad makes fire() wait, not abort.
    function test_F14_pausedLaunchpad_fireRevertsAndRoundStaysLive() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 500e6);
        lp.setPaused(true);
        vm.warp(block.timestamp + 1 hours);
        vm.expectRevert(UpdraftRound.LaunchpadPaused.selector);
        r.fire();
        assertEq(uint8(r.status()), uint8(Status.Live));
        lp.setPaused(false);
        r.fire();
        assertEq(uint8(r.status()), uint8(Status.Fired));
    }

    // F15: no new commits while the escrow is short.
    function test_F15_commitWhileEscrowShort_refused() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 100e6);
        usdc.burn(address(r), 50e6);
        _fund(bob, 1_000e6, r);
        vm.prank(bob);
        vm.expectRevert(UpdraftRound.EscrowShort.selector);
        r.commit(1_000e6, _noVoucher(), "");
    }

    // I9 / F06: a launch that reverts aborts the round instead of freezing it until fireBy.
    // C1: a launch that reverts takes fire() down with it. A caller can make Ascend's launch revert at
    // will (by holding the Infinity vault's lock), so a revert must never end the round. If the launch
    // keeps failing, the fire-by deadline refunds everyone.
    function test_C1_launchRevert_revertsFire_thenTheDeadlineRefunds() public {
        RoundConfig memory cfg = _defaultConfig();
        UpdraftRound r = _round(cfg);
        _commit(r, alice, 500e6);
        lp.setLaunchReverts(true);
        vm.warp(cfg.windows.closeAt);
        vm.expectRevert();
        r.fire();
        assertEq(uint8(r.status()), uint8(Status.Live));

        vm.warp(uint256(cfg.windows.fireBy) + 1);
        r.fire();
        assertEq(uint8(r.abortReason()), uint8(AbortReason.Expired));
        vm.prank(alice);
        r.refundAborted();
        assertEq(usdc.balanceOf(alice), 500e6);
    }

    // C1: fire() sent from inside someone else's Infinity lock reverts; the round stays live.
    function test_C1_fireInsideAForeignLock_revertsAndTheRoundStaysLive() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 500e6);
        vm.warp(block.timestamp + 1 hours);
        lp.vault().setLocker(makeAddr("griefer"));
        vm.expectRevert();
        r.fire();
        assertEq(uint8(r.status()), uint8(Status.Live));
        lp.vault().setLocker(address(0));
        r.fire();
        assertEq(uint8(r.status()), uint8(Status.Fired));
    }

    // F16: a fire sent with too little gas for Ascend's launch reverts; it can't abort the round.
    function test_F16_starvedLaunch_revertsAndRoundStaysLive() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 500e6);
        lp.setLaunchGas(2_500_000);
        vm.warp(block.timestamp + 1 hours);
        vm.expectRevert();
        r.fire{gas: 2_000_000}();
        assertEq(uint8(r.status()), uint8(Status.Live));
        r.fire();
        assertEq(uint8(r.status()), uint8(Status.Fired));
    }

    // F06: a listing the desk refuses no longer blocks the launch.
    function test_F06_refusedListing_doesNotBlockFire() public {
        RoundConfig memory cfg = _defaultConfig();
        cfg.listingCap = 100e6;
        UpdraftRound r = _round(cfg);
        _commit(r, alice, 500e6);
        lp.desk().setRefuseAll(true);
        vm.warp(block.timestamp + 1 hours);
        r.fire();
        assertEq(uint8(r.status()), uint8(Status.Fired));
    }

    // I1: the certificate's policy hash covers the exit and listing escape hatches.
    function test_I1_policyHash_coversExitAndListing() public {
        RoundConfig memory cfg = _defaultConfig();
        cfg.exitEnabled = true;
        cfg.listingCap = 77e6;
        UpdraftRound r = _round(cfg);
        _commit(r, alice, 500e6);
        vm.warp(block.timestamp + 1 hours);
        r.fire();
        Certificate memory c = certificate.get(r.token());
        assertEq(c.policyHash, keccak256(abi.encode(cfg.policy, cfg.bounds, cfg.exitEnabled, cfg.listingCap)));
    }

    // I6: revoking an attestor stops new vouchers in live rounds.
    function test_I6_revokedAttestor_refusesNewVouchers() public {
        RoundConfig memory cfg = _defaultConfig();
        cfg.mode = Mode.Verified;
        UpdraftRound r = _round(cfg);
        Voucher memory v = Voucher({
            round: address(r),
            wallet: alice,
            identityId: keccak256("hl:alice"),
            expiry: uint64(block.timestamp + 10 minutes),
            evidenceHash: bytes32(uint256(1))
        });
        bytes memory sig = _signVoucher(r, v);
        isAttestor[attestor] = false;
        _fund(alice, 100e6, r);
        vm.prank(alice);
        vm.expectRevert(UpdraftRound.BadVoucher.selector);
        r.commit(100e6, v, sig);
    }

    // Platform token cut lands in staking as a deposit (no reward accounting to poison).
    function test_platformCut_isDepositedToStaking() public {
        UpdraftRound r = _round(_defaultConfig());
        _commit(r, alice, 1_000e6);
        vm.warp(block.timestamp + 1 hours);
        r.fire();
        assertEq(IERC20R(r.token()).balanceOf(address(staking)), r.tokensOut() * 50 / 10_000);
    }

    function _signVoucher(UpdraftRound r, Voucher memory v) internal view returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Updraft Attestor"),
                keccak256("1"),
                block.chainid,
                address(r)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(r.VOUCHER_TYPEHASH(), v.round, v.wallet, v.identityId, v.expiry, v.evidenceHash)
        );
        (uint8 vv, bytes32 rr, bytes32 ss) = vm.sign(attestorKey, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(rr, ss, vv);
    }
}
