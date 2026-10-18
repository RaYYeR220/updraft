// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ForkBase, IERC20Like} from "./ForkBase.sol";
import {UpdraftFactory} from "../../src/UpdraftFactory.sol";
import {UpdraftRound} from "../../src/UpdraftRound.sol";
import {CreatorVault} from "../../src/CreatorVault.sol";
import {LaunchCertificate, Certificate} from "../../src/LaunchCertificate.sol";
import {UpdraftStaking} from "../../src/UpdraftStaking.sol";
import {ASCEND_TOKEN_CREATION_CODE} from "../../src/ascend/AscendTokenCode.sol";
import {
    RoundConfig, Mode, Windows, Raise, Vesting, Policy, PolicyBounds, Params, Voucher
} from "../../src/interfaces/IUpdraft.sol";
import {AscendSwapper} from "../utils/AscendSwapper.sol";
import {LockHolder} from "../utils/LockHolder.sol";
import {CurveLens} from "../../src/lens/CurveLens.sol";
import {IAscendLaunchpad} from "../../src/interfaces/IAscendLaunchpad.sol";
import {Status, AbortReason} from "../../src/interfaces/IUpdraft.sol";

contract RoundFireForkTest is ForkBase {
    address internal constant INFINITY_VAULT = 0x2B738A9A69b7a45C9dA6B519f6bE6efBfb912aec;

    UpdraftFactory internal factory;
    LaunchCertificate internal cert;
    UpdraftStaking internal staking;
    AscendSwapper internal swapper;
    address internal creator = makeAddr("creator");
    address[5] internal wallets;
    uint256[5] internal amounts = [uint256(150e6), 250e6, 400e6, 600e6, 1_100e6];

    function setUp() public override {
        super.setUp();
        cert = new LaunchCertificate(address(this));
        staking = new UpdraftStaking(address(this));
        factory = new UpdraftFactory(
            address(this),
            address(new UpdraftRound()),
            address(new CreatorVault()),
            address(cert),
            address(staking),
            Params({parityBps: 100, platformTokenBps: 50, platformFeeBps: 1000, minPolicyTimelock: 5 minutes, maxTeamBps: 6000})
        );
        cert.setFactory(address(factory));
        factory.allowLaunchpad(LAUNCHPAD, ASCEND_OWNER, ASCEND_TOKEN_CREATION_CODE);
        swapper = new AscendSwapper(INFINITY_VAULT, POOL_MANAGER, LAUNCHPAD);
        for (uint256 i; i < 5; i++) {
            wallets[i] = makeAddr(string.concat("wallet", vm.toString(i)));
        }
    }

    function _cfg() internal view returns (RoundConfig memory cfg) {
        uint40 t = uint40(block.timestamp);
        cfg.launchpad = LAUNCHPAD;
        cfg.quote = USDC;
        cfg.name = "Updraft Fork";
        cfg.symbol = "UPFK";
        cfg.tokenSalt = bytes32(uint256(1));
        cfg.creator = creator;
        cfg.mode = Mode.Open;
        cfg.windows = Windows({openAt: t, lockAt: t + 50 minutes, closeAt: t + 1 hours, fireBy: t + 2 hours});
        cfg.raise = Raise({minRaise: 100e6, maxRaise: 50_000e6, walletCap: 5_000e6, creatorCap: 2_000e6, minCommit: 1e6});
        cfg.participantVesting = Vesting({tgeBps: 10_000, cliff: 0, duration: 0});
        cfg.creatorVesting = Vesting({tgeBps: 0, cliff: 1 days, duration: 7 days});
        cfg.policy = Policy({platformBps: 1000, bidBps: 3000, stakersBps: 3000, teamBps: 3000});
        cfg.bounds = PolicyBounds({
            min: Policy({platformBps: 1000, bidBps: 1000, stakersBps: 0, teamBps: 0}),
            max: Policy({platformBps: 1000, bidBps: 6000, stakersBps: 6000, teamBps: 6000}),
            timelock: 72 hours
        });
    }

    function _firedRound() internal returns (UpdraftRound round) {
        vm.prank(creator);
        (address r,) = factory.createRound(_cfg(), bytes32(uint256(1)));
        round = UpdraftRound(r);
        Voucher memory none;
        for (uint256 i; i < 5; i++) {
            _mintUsdc(wallets[i], amounts[i]);
            vm.startPrank(wallets[i]);
            IERC20Like(USDC).approve(r, amounts[i]);
            round.commit(amounts[i], none, "");
            vm.stopPrank();
        }
        vm.warp(block.timestamp + 1 hours);
        round.fire();
    }

    function test_fork_fullRound_onLiveAscend() public {
        UpdraftRound round = _firedRound();
        bytes32 poolId = round.poolId();

        assertEq(round.token(), round.expectedToken(), "token address known before launch");
        assertEq(launchpad.poolCreator(poolId), round.vault(), "vault holds Ascend's creator role");
        assertEq(launchpad.bidInventory(poolId), 25e6, "1% fee parity funded Ascend's bid");

        round.distribute(0, 5);
        uint256 net = round.netTokens();
        for (uint256 i; i < 5; i++) {
            assertEq(IERC20Like(round.token()).balanceOf(wallets[i]), net * amounts[i] / 2_500e6, "pro-rata, one price");
        }
        Certificate memory c = cert.get(round.token());
        assertEq(c.participants, 5);
        assertEq(c.quoteUsed, 2_500e6);
        assertEq(c.top1Bps, 4400, "1,100 of 2,500");
    }

    function test_fork_sniperAfterFire_paysTaxAndHigherPrice() public {
        UpdraftRound round = _firedRound();
        bytes32 poolId = round.poolId();
        assertEq(launchpad.currentFee(poolId), 900_000, "same block as fire: the 90% sniper tax applies");

        address sniper = makeAddr("sniper");
        _mintUsdc(sniper, 100e6);
        vm.startPrank(sniper);
        IERC20Like(USDC).approve(address(swapper), 100e6);
        uint256 sniped = swapper.buy(round.token(), USDC, 100e6, sniper);
        vm.stopPrank();

        uint256 batchPerUsdc = round.netTokens() * 1e6 / round.quoteUsed();
        uint256 sniperPerUsdc = sniped * 1e6 / 100e6;
        assertLt(sniperPerUsdc * 10, batchPerUsdc, "the sniper gets under a tenth of the batch's tokens per dollar");
    }

    // The worst case for fire(): a round that buys out the whole live curve still fits comfortably in one
    // transaction (Arbitrum Orbit caps a transaction at 32M gas).
    function test_fork_fullCurveBuyout_firesInOneTransaction() public {
        uint256 capacity = CurveLens.capacity(IAscendLaunchpad(LAUNCHPAD), USDC, false);
        RoundConfig memory cfg = _cfg();
        cfg.raise.maxRaise = uint128(capacity);
        cfg.raise.walletCap = uint128(capacity);
        vm.prank(creator);
        (address r,) = factory.createRound(cfg, bytes32(uint256(2)));
        UpdraftRound round = UpdraftRound(r);
        Voucher memory none;
        _mintUsdc(wallets[0], capacity);
        vm.startPrank(wallets[0]);
        IERC20Like(USDC).approve(r, capacity);
        round.commit(capacity, none, "");
        vm.stopPrank();
        vm.warp(block.timestamp + 1 hours);

        uint256 before = gasleft();
        round.fire();
        uint256 used = before - gasleft();
        assertEq(uint8(round.abortReason()), uint8(AbortReason.None));
        assertEq(uint8(round.status()), uint8(Status.Fired));
        assertLt(used, 8_000_000, "a full-curve fire stays far under the per-transaction cap");
    }

    // Ascend's launch and collect both take the Infinity vault's lock, so a caller who already holds it
    // makes them revert. That must never end a round or skip a fee pull.
    function test_fork_fireInsideAForeignLock_revertsAndTheRoundStaysLive() public {
        vm.prank(creator);
        (address r,) = factory.createRound(_cfg(), bytes32(uint256(9)));
        UpdraftRound round = UpdraftRound(r);
        Voucher memory none;
        _mintUsdc(wallets[0], 1_000e6);
        vm.startPrank(wallets[0]);
        IERC20Like(USDC).approve(r, 1_000e6);
        round.commit(1_000e6, none, "");
        vm.stopPrank();
        vm.warp(block.timestamp + 1 hours);

        LockHolder griefer = new LockHolder(INFINITY_VAULT);
        vm.expectRevert();
        griefer.callInsideLock(r, abi.encodeCall(UpdraftRound.fire, ()));
        assertEq(uint8(round.status()), uint8(Status.Live), "the round survives");

        round.fire();
        assertEq(uint8(round.status()), uint8(Status.Fired), "and fires for the next honest caller");
    }

    function test_fork_stakeInsideAForeignLock_reverts() public {
        UpdraftRound round = _firedRound();
        round.distribute(0, 5);
        CreatorVault vault = CreatorVault(round.vault());
        address token = round.token();
        LockHolder staker = new LockHolder(INFINITY_VAULT);
        vm.prank(wallets[0]);
        IERC20Like(token).transfer(address(staker), 1e18);
        vm.prank(address(staker));
        IERC20Like(token).approve(address(vault), 1e18);

        vm.expectRevert(CreatorVault.VaultLocked.selector);
        staker.callInsideLock(address(vault), abi.encodeCall(CreatorVault.stake, (1e18)));
    }

    function test_fork_vault_harvestsLiveFees() public {
        UpdraftRound round = _firedRound();
        round.distribute(0, 5);
        CreatorVault vault = CreatorVault(round.vault());
        bytes32 poolId = round.poolId();
        address token = round.token();

        // A holder stakes in the vault, then the market trades after the launch window.
        vm.startPrank(wallets[4]);
        IERC20Like(token).approve(address(vault), 1e18);
        vault.stake(1e18);
        vm.stopPrank();
        vm.warp(block.timestamp + 30);
        address trader = makeAddr("trader");
        _mintUsdc(trader, 2_000e6);
        vm.startPrank(trader);
        IERC20Like(USDC).approve(address(swapper), 2_000e6);
        swapper.buy(token, USDC, 2_000e6, trader);
        vm.stopPrank();

        uint256 bidBefore = launchpad.bidInventory(poolId);
        vault.harvest();
        assertGt(vault.teamOwedQuote(), 0, "team leg received live quote fees");
        assertGt(launchpad.bidInventory(poolId), bidBefore, "bid leg funded Ascend's buy support");
        (uint256 q,) = vault.earned(wallets[4]);
        assertGt(q, 0, "stakers earn live fees");
    }
}
