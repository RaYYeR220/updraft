// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {RoundTestBase} from "../utils/RoundTestBase.sol";
import {UpdraftRound} from "../../src/UpdraftRound.sol";
import {RoundConfig, Status, AbortReason} from "../../src/interfaces/IUpdraft.sol";

contract RoundCommitTest is RoundTestBase {
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function test_commit_beforeOpen_reverts() public {
        RoundConfig memory cfg = _defaultConfig();
        cfg.windows.openAt += 10 minutes;
        UpdraftRound round = _newRound(cfg);
        _fund(alice, 100e6, round);
        vm.prank(alice);
        vm.expectRevert(UpdraftRound.NotOpen.selector);
        round.commit(100e6, _noVoucher(), "");
    }

    function test_commit_afterClose_reverts() public {
        UpdraftRound round = _newRound();
        _fund(alice, 100e6, round);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(alice);
        vm.expectRevert(UpdraftRound.Closed.selector);
        round.commit(100e6, _noVoucher(), "");
    }

    function test_commit_zero_reverts() public {
        UpdraftRound round = _newRound();
        vm.prank(alice);
        vm.expectRevert(UpdraftRound.ZeroAmount.selector);
        round.commit(0, _noVoucher(), "");
    }

    function test_commit_overWalletCap_reverts() public {
        UpdraftRound round = _newRound();
        _commit(round, alice, 4_000e6);
        _fund(alice, 1_001e6, round);
        vm.prank(alice);
        vm.expectRevert(UpdraftRound.OverWalletCap.selector);
        round.commit(1_001e6, _noVoucher(), "");
    }

    function test_creatorCommit_overCreatorCap_reverts() public {
        UpdraftRound round = _newRound();
        _commit(round, creator, 2_000e6);
        assertTrue(round.isCreatorCommit(creator));
        _fund(creator, 1e6, round);
        vm.prank(creator);
        vm.expectRevert(UpdraftRound.OverCreatorCap.selector);
        round.commit(1e6, _noVoucher(), "");
    }

    function test_withdraw_afterLock_reverts() public {
        UpdraftRound round = _newRound();
        _commit(round, alice, 500e6);
        vm.warp(block.timestamp + 50 minutes);
        vm.prank(alice);
        vm.expectRevert(UpdraftRound.Locked.selector);
        round.withdraw(100e6);
    }

    function test_withdrawThenRecommit_beforeLock_ok() public {
        UpdraftRound round = _newRound();
        _commit(round, alice, 500e6);
        _commit(round, bob, 300e6);
        vm.prank(alice);
        round.withdraw(200e6);
        assertEq(usdc.balanceOf(alice), 200e6, "withdrawal paid back");
        assertEq(round.commitOf(alice), 300e6);
        assertEq(round.totalCommitted(), 600e6);

        vm.prank(alice);
        round.commit(150e6, _noVoucher(), "");
        assertEq(round.commitOf(alice), 450e6);
        assertEq(round.totalCommitted(), 750e6);
        assertEq(round.participantCount(), 2, "re-commit does not duplicate the participant");
        assertEq(usdc.balanceOf(address(round)), 750e6);
    }

    function test_withdraw_withBurnedEscrow_paysProRata() public {
        UpdraftRound round = _newRound();
        _commit(round, alice, 600e6);
        _commit(round, bob, 400e6);
        usdc.burn(address(round), 100e6); // anyone can do this on testnet
        vm.prank(alice);
        round.withdraw(600e6);
        assertEq(usdc.balanceOf(alice), 540e6, "alice carries her 10% share of the loss");
        assertEq(usdc.balanceOf(address(round)), 360e6, "bob's backing keeps the same ratio");
    }

    function test_commitWithPermit_singleTx() public {
        UpdraftRound round = _newRound();
        uint256 key = 0xA11CE;
        address owner = vm.addr(key);
        usdc.mint(owner, 250e6);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                usdc.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                        owner,
                        address(round),
                        250e6,
                        usdc.nonces(owner),
                        deadline
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        vm.prank(owner);
        round.commitWithPermit(250e6, deadline, v, r, s, _noVoucher(), "");
        assertEq(round.commitOf(owner), 250e6);
    }

    function test_participantLimit_reverts_at_1001st() public {
        RoundConfig memory cfg = _defaultConfig();
        cfg.raise.maxRaise = 2_000_000e6;
        UpdraftRound round = _newRound(cfg);
        for (uint256 i; i < 1000; i++) {
            _commit(round, address(uint160(0x10000 + i)), 1e6);
        }
        address extra = address(uint160(0x20000));
        _fund(extra, 1e6, round);
        vm.prank(extra);
        vm.expectRevert(UpdraftRound.TooManyParticipants.selector);
        round.commit(1e6, _noVoucher(), "");
    }

    function test_abort_beforeConditions_reverts() public {
        UpdraftRound round = _newRound();
        _commit(round, alice, 500e6);
        vm.expectRevert(UpdraftRound.NotAbortable.selector);
        round.abort();
    }

    function test_abort_belowMinimum_refundsFull() public {
        UpdraftRound round = _newRound();
        _commit(round, alice, 60e6);
        _commit(round, bob, 30e6);
        vm.warp(block.timestamp + 1 hours);
        round.abort();
        assertEq(uint8(round.status()), uint8(Status.Aborted));
        assertEq(uint8(round.abortReason()), uint8(AbortReason.BelowMinimum));
        vm.prank(alice);
        round.refundAborted();
        vm.prank(bob);
        round.refundAborted();
        assertEq(usdc.balanceOf(alice), 60e6);
        assertEq(usdc.balanceOf(bob), 30e6);
        vm.prank(bob);
        vm.expectRevert(UpdraftRound.NothingToRefund.selector);
        round.refundAborted();
    }

    function test_abort_expired_refundsFull() public {
        UpdraftRound round = _newRound();
        _commit(round, alice, 900e6);
        vm.warp(block.timestamp + 2 hours + 1);
        round.abort();
        assertEq(uint8(round.abortReason()), uint8(AbortReason.Expired));
        vm.prank(alice);
        round.refundAborted();
        assertEq(usdc.balanceOf(alice), 900e6);
    }

    function test_abort_withBurnedEscrow_refundsProRata() public {
        UpdraftRound round = _newRound();
        _commit(round, alice, 50e6);
        _commit(round, bob, 20e6);
        _commit(round, carol, 10e6);
        usdc.burn(address(round), 24e6); // 30% of 80
        vm.warp(block.timestamp + 1 hours);
        round.abort();
        vm.prank(alice);
        round.refundAborted();
        vm.prank(bob);
        round.refundAborted();
        vm.prank(carol);
        round.refundAborted();
        assertEq(usdc.balanceOf(alice), 35e6);
        assertEq(usdc.balanceOf(bob), 14e6);
        assertEq(usdc.balanceOf(carol), 7e6);
        assertEq(usdc.balanceOf(address(round)), 0);
    }
}
