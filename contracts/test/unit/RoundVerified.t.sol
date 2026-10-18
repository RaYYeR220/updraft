// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {RoundTestBase} from "../utils/RoundTestBase.sol";
import {UpdraftRound} from "../../src/UpdraftRound.sol";
import {RoundConfig, Mode, Voucher} from "../../src/interfaces/IUpdraft.sol";

contract RoundVerifiedTest is RoundTestBase {
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    UpdraftRound internal round;

    bytes32 internal constant VOUCHER_TYPEHASH =
        keccak256("Voucher(address round,address wallet,bytes32 identityId,uint64 expiry,bytes32 evidenceHash)");

    function setUp() public override {
        super.setUp();
        RoundConfig memory cfg = _defaultConfig();
        cfg.mode = Mode.Verified;
        round = _newRound(cfg);
    }

    function _voucher(address wallet, bytes32 id) internal view returns (Voucher memory) {
        return Voucher({
            round: address(round),
            wallet: wallet,
            identityId: id,
            expiry: uint64(block.timestamp + 1 hours),
            evidenceHash: keccak256(abi.encode("evidence", id))
        });
    }

    function _sign(uint256 key, Voucher memory v) internal view returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Updraft Attestor"),
                keccak256("1"),
                block.chainid,
                address(round)
            )
        );
        bytes32 structHash =
            keccak256(abi.encode(VOUCHER_TYPEHASH, v.round, v.wallet, v.identityId, v.expiry, v.evidenceHash));
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, vv);
    }

    function _commitVerified(address wallet, uint256 amount, Voucher memory v, bytes memory sig) internal {
        _fund(wallet, amount, round);
        vm.prank(wallet);
        round.commit(amount, v, sig);
    }

    function test_verified_validVoucher_commits() public {
        Voucher memory v = _voucher(alice, keccak256("hl:alice"));
        _commitVerified(alice, 100e6, v, _sign(attestorKey, v));
        assertEq(round.commitOf(alice), 100e6);
        assertEq(round.identityOf(alice), keccak256("hl:alice"));
        assertEq(round.walletOfIdentity(keccak256("hl:alice")), alice);
        assertEq(round.verifiedCount(), 1);
    }

    function test_verified_noVoucher_reverts() public {
        _fund(alice, 100e6, round);
        vm.prank(alice);
        vm.expectRevert(UpdraftRound.WrongRound.selector);
        round.commit(100e6, _noVoucher(), "");
    }

    function test_verified_emptySignature_reverts() public {
        Voucher memory v = _voucher(alice, keccak256("hl:alice"));
        _fund(alice, 100e6, round);
        vm.prank(alice);
        vm.expectRevert(UpdraftRound.BadVoucher.selector);
        round.commit(100e6, v, "");
    }

    function test_verified_wrongSigner_reverts() public {
        Voucher memory v = _voucher(alice, keccak256("hl:alice"));
        bytes memory sig = _sign(0xBAD, v);
        _fund(alice, 100e6, round);
        vm.prank(alice);
        vm.expectRevert(UpdraftRound.BadVoucher.selector);
        round.commit(100e6, v, sig);
    }

    function test_verified_expired_reverts() public {
        Voucher memory v = _voucher(alice, keccak256("hl:alice"));
        v.expiry = uint64(block.timestamp + 10 minutes);
        bytes memory sig = _sign(attestorKey, v);
        vm.warp(v.expiry + 1);
        _fund(alice, 100e6, round);
        vm.prank(alice);
        vm.expectRevert(UpdraftRound.VoucherExpired.selector);
        round.commit(100e6, v, sig);
    }

    function test_verified_otherRound_reverts() public {
        Voucher memory v = _voucher(alice, keccak256("hl:alice"));
        v.round = address(0x1234);
        bytes memory sig = _sign(attestorKey, v);
        _fund(alice, 100e6, round);
        vm.prank(alice);
        vm.expectRevert(UpdraftRound.WrongRound.selector);
        round.commit(100e6, v, sig);
    }

    function test_verified_otherWallet_reverts() public {
        Voucher memory v = _voucher(alice, keccak256("hl:alice"));
        bytes memory sig = _sign(attestorKey, v);
        _fund(bob, 100e6, round);
        vm.prank(bob);
        vm.expectRevert(UpdraftRound.WrongWallet.selector);
        round.commit(100e6, v, sig);
    }

    function test_verified_identityReuseBySecondWallet_reverts() public {
        bytes32 id = keccak256("hl:shared");
        Voucher memory va = _voucher(alice, id);
        _commitVerified(alice, 100e6, va, _sign(attestorKey, va));
        Voucher memory vb = _voucher(bob, id);
        bytes memory sig = _sign(attestorKey, vb);
        _fund(bob, 100e6, round);
        vm.prank(bob);
        vm.expectRevert(UpdraftRound.IdentityTaken.selector);
        round.commit(100e6, vb, sig);
    }

    function test_verified_sameWalletTopUp_ok() public {
        Voucher memory v = _voucher(alice, keccak256("hl:alice"));
        _commitVerified(alice, 100e6, v, _sign(attestorKey, v));
        _commitVerified(alice, 50e6, _noVoucher(), "");
        assertEq(round.commitOf(alice), 150e6);
        assertEq(round.verifiedCount(), 1);
    }

    function test_open_ignoresVoucher() public {
        UpdraftRound open = _newRound();
        _fund(alice, 100e6, open);
        vm.prank(alice);
        open.commit(100e6, _noVoucher(), hex"deadbeef");
        assertEq(open.commitOf(alice), 100e6);
        assertEq(open.identityOf(alice), bytes32(0));
    }

    function test_evidenceAccumulator_matchesOffchainFold() public {
        Voucher memory va = _voucher(alice, keccak256("hl:alice"));
        Voucher memory vb = _voucher(bob, keccak256("hl:bob"));
        _commitVerified(alice, 100e6, va, _sign(attestorKey, va));
        _commitVerified(bob, 100e6, vb, _sign(attestorKey, vb));
        bytes32 acc = keccak256(abi.encode(bytes32(0), va.evidenceHash));
        acc = keccak256(abi.encode(acc, vb.evidenceHash));
        assertEq(round.evidenceAccumulator(), acc);
    }
}
