// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {RoundTestBase} from "../utils/RoundTestBase.sol";
import {UpdraftRound} from "../../src/UpdraftRound.sol";
import {CreatorVault} from "../../src/CreatorVault.sol";
import {LaunchCertificate} from "../../src/LaunchCertificate.sol";
import {UpdraftStaking} from "../../src/UpdraftStaking.sol";
import {Status, Wiring, Voucher} from "../../src/interfaces/IUpdraft.sol";
import {BurnableUsdc} from "../utils/BurnableUsdc.sol";

interface IERC20I {
    function balanceOf(address) external view returns (uint256);
}

/// @notice Drives one round through random commits, withdrawals, escrow burns, time, fire,
/// distribution, claims and aborts, while tracking every unit of quote that moves.
contract RoundHandler is Test {
    UpdraftRound public round;
    BurnableUsdc public usdc;
    address[] public actors;

    uint256 public deposited;
    uint256 public paidOut;
    uint256 public burned;
    bool public everLeftLive;

    constructor(UpdraftRound round_, BurnableUsdc usdc_, address[] memory actors_) {
        round = round_;
        usdc = usdc_;
        actors = actors_;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function commit(uint256 seed, uint256 amount) external {
        address a = _actor(seed);
        amount = bound(amount, 1, 1_500e6);
        usdc.mint(a, amount);
        vm.startPrank(a);
        usdc.approve(address(round), amount);
        Voucher memory none;
        try round.commit(amount, none, "") {
            deposited += amount;
        } catch {
            usdc.burn(a, amount);
        }
        vm.stopPrank();
    }

    function withdraw(uint256 seed, uint256 amount) external {
        address a = _actor(seed);
        uint256 c = round.commitOf(a);
        if (c == 0) return;
        amount = bound(amount, 1, c);
        uint256 before = usdc.balanceOf(a);
        vm.prank(a);
        try round.withdraw(amount) {
            paidOut += usdc.balanceOf(a) - before;
        } catch {}
    }

    function burnEscrow(uint256 bps) external {
        bps = bound(bps, 1, 3_000);
        uint256 amount = usdc.balanceOf(address(round)) * bps / 10_000;
        if (amount == 0 || round.status() == Status.Fired) return;
        usdc.burn(address(round), amount);
        burned += amount;
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 40 minutes));
    }

    function fire() external {
        try round.fire() {} catch {}
        if (round.status() != Status.Live) everLeftLive = true;
    }

    function abort() external {
        try round.abort() {} catch {}
        if (round.status() != Status.Live) everLeftLive = true;
    }

    function distribute(uint256 from, uint256 span) external {
        uint256 n = round.participantCount();
        if (n == 0) return;
        from = bound(from, 0, n - 1);
        uint256 to = from + bound(span, 1, n);
        uint256[] memory before = _balances();
        try round.distribute(from, to) {
            paidOut += _delta(before);
        } catch {}
    }

    function claim(uint256 seed) external {
        address a = _actor(seed);
        uint256 before = usdc.balanceOf(a);
        vm.prank(a);
        try round.claim() {
            paidOut += usdc.balanceOf(a) - before;
        } catch {}
    }

    function refund(uint256 seed) external {
        address a = _actor(seed);
        uint256 before = usdc.balanceOf(a);
        vm.prank(a);
        try round.refundAborted() {
            paidOut += usdc.balanceOf(a) - before;
        } catch {}
    }

    function _balances() internal view returns (uint256[] memory b) {
        b = new uint256[](actors.length);
        for (uint256 i; i < actors.length; i++) {
            b[i] = usdc.balanceOf(actors[i]);
        }
    }

    function _delta(uint256[] memory before) internal view returns (uint256 d) {
        for (uint256 i; i < actors.length; i++) {
            d += usdc.balanceOf(actors[i]) - before[i];
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }
}

contract RoundInvariantsTest is RoundTestBase {
    RoundHandler internal handler;
    UpdraftRound internal round;
    mapping(address => bool) public isRound;

    function setUp() public override {
        super.setUp();
        LaunchCertificate cert = new LaunchCertificate(address(this));
        cert.setFactory(address(this));
        wiring = Wiring({
            vaultImplementation: address(new CreatorVault()),
            certificate: address(cert),
            staking: address(new UpdraftStaking(address(this)))
        });
        round = _newRound();
        isRound[address(round)] = true;

        address[] memory actors = new address[](5);
        for (uint256 i; i < 4; i++) {
            actors[i] = address(uint160(0xA000 + i));
        }
        actors[4] = creator;
        handler = new RoundHandler(round, usdc, actors);
        targetContract(address(handler));
    }

    /// @dev Every unit of quote that entered the round is still there, was paid back out,
    /// was burned by a third party, or bought the launch.
    function invariant_conservation() public view {
        uint256 used = round.status() == Status.Fired ? round.quoteUsed() : 0;
        assertEq(
            handler.paidOut() + usdc.balanceOf(address(round)) + handler.burned() + used,
            handler.deposited(),
            "quote is conserved"
        );
    }

    function invariant_tokensNeverOverAllocated() public view {
        if (round.status() != Status.Fired) return;
        uint256 claimed;
        uint256 total = round.totalCommitted();
        for (uint256 i; i < handler.actorCount(); i++) {
            address a = handler.actors(i);
            uint256 got = round.claimedTokens(a);
            claimed += got;
            assertLe(got, round.netTokens() * round.commitOf(a) / total, "no wallet beyond its pro-rata share");
        }
        assertLe(claimed, round.netTokens());
        assertEq(IERC20I(round.token()).balanceOf(address(round)) + claimed, round.netTokens(), "tokens conserved");
    }

    function invariant_statusMonotonic() public view {
        if (handler.everLeftLive()) assertTrue(round.status() != Status.Live, "never back to live");
    }
}
