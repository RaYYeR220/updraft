// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {LibClone} from "solady/utils/LibClone.sol";
import {UpdraftRound} from "../../src/UpdraftRound.sol";
import {TokenAddress} from "../../src/libraries/TokenAddress.sol";
import {CurveLens} from "../../src/lens/CurveLens.sol";
import {IAscendLaunchpad} from "../../src/interfaces/IAscendLaunchpad.sol";
import {ASCEND_TOKEN_CREATION_CODE} from "../../src/ascend/AscendTokenCode.sol";
import {
    RoundConfig, Mode, Windows, Raise, Vesting, Policy, PolicyBounds, Params, Wiring, Voucher
} from "../../src/interfaces/IUpdraft.sol";
import {FakeAscendLaunchpad} from "./FakeAscendLaunchpad.sol";
import {BurnableUsdc} from "./BurnableUsdc.sol";

/// @notice Unit-test harness: this contract plays the factory for rounds it clones.
abstract contract RoundTestBase is Test {
    int24 internal constant USDC_START = -393_800;

    FakeAscendLaunchpad internal lp;
    BurnableUsdc internal usdc;
    UpdraftRound internal roundImpl;
    address internal creator = makeAddr("creator");
    uint256 internal attestorKey = 0xA77E57;
    address internal attestor;

    mapping(address => bool) public isAllowedLaunchpad;
    mapping(address => bool) public isAttestor;
    Params internal params = Params({
        parityBps: 100,
        platformTokenBps: 50,
        platformFeeBps: 1000,
        minPolicyTimelock: 5 minutes,
        maxTeamBps: 6000
    });
    Wiring internal wiring;

    function setUp() public virtual {
        lp = new FakeAscendLaunchpad(address(this));
        usdc = new BurnableUsdc();
        lp.setQuoteConfig(address(usdc), true, USDC_START, 4_000e6);
        isAllowedLaunchpad[address(lp)] = true;
        roundImpl = new UpdraftRound();
        attestor = vm.addr(attestorKey);
        isAttestor[attestor] = true;
    }

    function _defaultConfig() internal view returns (RoundConfig memory cfg) {
        uint40 t = uint40(block.timestamp);
        cfg.launchpad = address(lp);
        cfg.quote = address(usdc);
        cfg.name = "Updraft Test";
        cfg.symbol = "UPT";
        cfg.tokenSalt = bytes32(uint256(42));
        cfg.creator = creator;
        cfg.mode = Mode.Open;
        cfg.attestor = attestor;
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

    function _newRound(RoundConfig memory cfg) internal returns (UpdraftRound round) {
        round = UpdraftRound(LibClone.clone(address(roundImpl)));
        address expected = TokenAddress.predict(
            cfg.launchpad, address(round), cfg.tokenSalt, ASCEND_TOKEN_CREATION_CODE, cfg.name, cfg.symbol
        );
        round.initialize(cfg, params, wiring, expected, CurveLens.curveHash(IAscendLaunchpad(cfg.launchpad), cfg.quote));
    }

    function _newRound() internal returns (UpdraftRound) {
        return _newRound(_defaultConfig());
    }

    function _fund(address who, uint256 amount, UpdraftRound round) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(round), type(uint256).max);
    }

    function _commit(UpdraftRound round, address who, uint256 amount) internal {
        _fund(who, amount, round);
        vm.prank(who);
        round.commit(amount, _noVoucher(), "");
    }

    function _noVoucher() internal pure returns (Voucher memory v) {}
}
