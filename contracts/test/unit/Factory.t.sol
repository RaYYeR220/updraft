// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {UpdraftFactory} from "../../src/UpdraftFactory.sol";
import {UpdraftRound} from "../../src/UpdraftRound.sol";
import {CreatorVault} from "../../src/CreatorVault.sol";
import {LaunchCertificate} from "../../src/LaunchCertificate.sol";
import {UpdraftStaking} from "../../src/UpdraftStaking.sol";
import {TokenAddress} from "../../src/libraries/TokenAddress.sol";
import {ASCEND_TOKEN_CREATION_CODE} from "../../src/ascend/AscendTokenCode.sol";
import {
    RoundConfig, Mode, Windows, Raise, Vesting, Policy, PolicyBounds, Params
} from "../../src/interfaces/IUpdraft.sol";
import {FakeAscendLaunchpad} from "../utils/FakeAscendLaunchpad.sol";
import {BurnableUsdc} from "../utils/BurnableUsdc.sol";

contract FactoryTest is Test {
    UpdraftFactory internal factory;
    FakeAscendLaunchpad internal lp;
    BurnableUsdc internal usdc;
    address internal creator = makeAddr("creator");
    address internal attestor = makeAddr("attestor");

    function setUp() public {
        lp = new FakeAscendLaunchpad(address(this));
        usdc = new BurnableUsdc();
        lp.setQuoteConfig(address(usdc), true, -393_800, 4_000e6);
        LaunchCertificate cert = new LaunchCertificate(address(this));
        factory = new UpdraftFactory(
            address(this),
            address(new UpdraftRound()),
            address(new CreatorVault()),
            address(cert),
            address(new UpdraftStaking(address(this))),
            Params({parityBps: 100, platformTokenBps: 50, platformFeeBps: 1000, minPolicyTimelock: 5 minutes, maxTeamBps: 6000})
        );
        cert.setFactory(address(factory));
        factory.allowLaunchpad(address(lp), address(this), ASCEND_TOKEN_CREATION_CODE);
        factory.setAttestor(attestor, true);
    }

    function _cfg() internal view returns (RoundConfig memory cfg) {
        uint40 t = uint40(block.timestamp);
        cfg.launchpad = address(lp);
        cfg.quote = address(usdc);
        cfg.name = "Factory Test";
        cfg.symbol = "FCT";
        cfg.tokenSalt = bytes32(uint256(3));
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

    function test_create_predictsRoundAndToken() public {
        bytes32 roundSalt = bytes32(uint256(11));
        address predictedRound = factory.predictRound(roundSalt, creator);
        vm.prank(creator);
        (address round, address token) = factory.createRound(_cfg(), roundSalt);
        assertEq(round, predictedRound);
        assertEq(token, TokenAddress.predict(address(lp), round, bytes32(uint256(3)), ASCEND_TOKEN_CREATION_CODE, "Factory Test", "FCT"));
        assertEq(token, factory.predictToken(address(lp), round, bytes32(uint256(3)), "Factory Test", "FCT"));
        assertEq(UpdraftRound(round).expectedToken(), token);
        assertTrue(factory.isRound(round));
        assertEq(factory.roundCount(), 1);
        assertEq(factory.rounds(0), round);
    }

    function test_create_sameSaltDifferentCaller_noCollision() public {
        bytes32 roundSalt = bytes32(uint256(11));
        vm.prank(creator);
        (address a,) = factory.createRound(_cfg(), roundSalt);
        vm.prank(makeAddr("someone"));
        (address b,) = factory.createRound(_cfg(), roundSalt);
        assertTrue(a != b, "a stranger cannot squat a creator's round address");
    }

    function test_create_rejectsUnallowedLaunchpad() public {
        RoundConfig memory cfg = _cfg();
        cfg.launchpad = address(new FakeAscendLaunchpad(address(this)));
        vm.expectRevert(UpdraftFactory.LaunchpadNotAllowed.selector);
        factory.createRound(cfg, 0);
    }

    function test_create_rejectsOwnerMismatch() public {
        lp.setOwner(makeAddr("hijacker"));
        vm.expectRevert(UpdraftFactory.LaunchpadOwnerMismatch.selector);
        factory.createRound(_cfg(), 0);
    }

    function test_create_rejectsDisallowedQuote() public {
        lp.setQuoteConfig(address(usdc), false, -393_800, 4_000e6);
        vm.expectRevert(UpdraftFactory.QuoteNotAllowed.selector);
        factory.createRound(_cfg(), 0);
    }

    function test_create_rejectsBadWindows() public {
        RoundConfig memory cfg = _cfg();
        cfg.windows.lockAt = cfg.windows.closeAt + 1;
        vm.expectRevert(UpdraftFactory.BadWindows.selector);
        factory.createRound(cfg, 0);
        cfg = _cfg();
        cfg.windows.fireBy = cfg.windows.closeAt;
        vm.expectRevert(UpdraftFactory.BadWindows.selector);
        factory.createRound(cfg, 0);
    }

    function test_create_rejectsBadRaise() public {
        RoundConfig memory cfg = _cfg();
        cfg.raise.minRaise = cfg.raise.maxRaise + 1;
        vm.expectRevert(UpdraftFactory.BadRaise.selector);
        factory.createRound(cfg, 0);
        cfg = _cfg();
        cfg.raise.walletCap = 0;
        vm.expectRevert(UpdraftFactory.BadRaise.selector);
        factory.createRound(cfg, 0);
    }

    function test_create_rejectsMaxRaiseOverCapacity() public {
        RoundConfig memory cfg = _cfg();
        cfg.raise.maxRaise = type(uint128).max;
        vm.expectRevert(UpdraftFactory.MaxRaiseOverCapacity.selector);
        factory.createRound(cfg, 0);
    }

    function test_create_rejectsPolicyOutOfBounds() public {
        RoundConfig memory cfg = _cfg();
        cfg.policy = Policy({platformBps: 1000, bidBps: 500, stakersBps: 3500, teamBps: 5000});
        vm.expectRevert(UpdraftFactory.BadPolicy.selector);
        factory.createRound(cfg, 0);

        cfg = _cfg();
        cfg.bounds.max.teamBps = 7000;
        vm.expectRevert(UpdraftFactory.BadPolicy.selector);
        factory.createRound(cfg, 0);

        cfg = _cfg();
        cfg.policy = Policy({platformBps: 500, bidBps: 3500, stakersBps: 3000, teamBps: 3000});
        vm.expectRevert(UpdraftFactory.BadPolicy.selector);
        factory.createRound(cfg, 0);

        cfg = _cfg();
        cfg.bounds.timelock = 1 minutes;
        vm.expectRevert(UpdraftFactory.BadPolicy.selector);
        factory.createRound(cfg, 0);
    }

    function test_create_rejectsWeakCreatorVesting() public {
        RoundConfig memory cfg = _cfg();
        cfg.creatorVesting.duration = 0;
        vm.expectRevert(UpdraftFactory.WeakCreatorVesting.selector);
        factory.createRound(cfg, 0);

        cfg = _cfg();
        cfg.creatorVesting.tgeBps = 1;
        vm.expectRevert(UpdraftFactory.WeakCreatorVesting.selector);
        factory.createRound(cfg, 0);

        cfg = _cfg();
        cfg.participantVesting = Vesting({tgeBps: 5_000, cliff: 0, duration: 2 days});
        cfg.creatorVesting.cliff = 1 days; // shorter than the participants' vesting
        vm.expectRevert(UpdraftFactory.WeakCreatorVesting.selector);
        factory.createRound(cfg, 0);
    }

    function test_create_rejectsUnknownAttestorInVerified() public {
        RoundConfig memory cfg = _cfg();
        cfg.mode = Mode.Verified;
        cfg.attestor = makeAddr("random");
        vm.expectRevert(UpdraftFactory.UnknownAttestor.selector);
        factory.createRound(cfg, 0);
        cfg.attestor = attestor;
        factory.createRound(cfg, 0);
    }

    function test_setParams_hardBounds() public {
        Params memory p = factory.params();
        p.parityBps = 201;
        vm.expectRevert(UpdraftFactory.BadParams.selector);
        factory.setParams(p);
        p = factory.params();
        p.minPolicyTimelock = 4 minutes;
        vm.expectRevert(UpdraftFactory.BadParams.selector);
        factory.setParams(p);
        p = factory.params();
        p.platformFeeBps = 2001;
        vm.expectRevert(UpdraftFactory.BadParams.selector);
        factory.setParams(p);
    }

    function test_onlyOwner_admin() public {
        vm.startPrank(makeAddr("stranger"));
        vm.expectRevert();
        factory.allowLaunchpad(address(lp), address(this), "");
        vm.expectRevert();
        factory.setAttestor(address(1), true);
        vm.stopPrank();
    }

    function test_paramsChange_doesNotAffectExistingRounds() public {
        (address round,) = factory.createRound(_cfg(), 0);
        Params memory p = factory.params();
        p.parityBps = 150;
        p.platformFeeBps = 1500;
        factory.setParams(p);
        assertEq(UpdraftRound(round).params().parityBps, 100);
        assertEq(UpdraftRound(round).params().platformFeeBps, 1000);
    }

    // Self-audit regressions (F06, F13, I2) and the minimum-commit bound.
    function test_create_rejectsZeroCreator() public {
        RoundConfig memory cfg = _cfg();
        cfg.creator = address(0);
        vm.expectRevert(UpdraftFactory.ZeroCreator.selector);
        factory.createRound(cfg, 0);
    }

    function test_create_rejectsLongFireWindow() public {
        RoundConfig memory cfg = _cfg();
        cfg.windows.fireBy = cfg.windows.closeAt + 7 days + 1;
        vm.expectRevert(UpdraftFactory.BadWindows.selector);
        factory.createRound(cfg, 0);
    }

    function test_create_rejectsListingCapOverUint88() public {
        RoundConfig memory cfg = _cfg();
        cfg.listingCap = uint256(type(uint88).max) + 1;
        vm.expectRevert(UpdraftFactory.BadListingCap.selector);
        factory.createRound(cfg, 0);
    }

    function test_create_rejectsLongParticipantLock() public {
        RoundConfig memory cfg = _cfg();
        cfg.participantVesting = Vesting({tgeBps: 0, cliff: 365 days, duration: 1 days});
        cfg.creatorVesting = Vesting({tgeBps: 0, cliff: 400 days, duration: 1 days});
        vm.expectRevert(UpdraftFactory.BadVesting.selector);
        factory.createRound(cfg, 0);
    }

    function test_create_rejectsBadMinCommit() public {
        RoundConfig memory cfg = _cfg();
        cfg.raise.minCommit = 0;
        vm.expectRevert(UpdraftFactory.BadRaise.selector);
        factory.createRound(cfg, 0);
        cfg.raise.minCommit = cfg.raise.walletCap + 1;
        vm.expectRevert(UpdraftFactory.BadRaise.selector);
        factory.createRound(cfg, 0);
    }

    function test_revokeLaunchpad() public {
        factory.revokeLaunchpad(address(lp));
        assertFalse(factory.isAllowedLaunchpad(address(lp)));
        vm.expectRevert(UpdraftFactory.LaunchpadNotAllowed.selector);
        factory.createRound(_cfg(), 0);
    }
}
