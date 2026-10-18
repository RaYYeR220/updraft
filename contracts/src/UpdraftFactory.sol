// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "solady/auth/Ownable.sol";
import {LibClone} from "solady/utils/LibClone.sol";
import {IAscendLaunchpad} from "./interfaces/IAscendLaunchpad.sol";
import {RoundConfig, Params, Wiring, Policy, PolicyBounds, Vesting, Mode} from "./interfaces/IUpdraft.sol";
import {CurveLens} from "./lens/CurveLens.sol";
import {TokenAddress} from "./libraries/TokenAddress.sol";
import {UpdraftRound} from "./UpdraftRound.sol";

/// @notice Creates Updraft rounds. Each round is a deterministic clone, so both the round and the
/// token Ascend will launch for it are known the moment it is created. The factory validates every
/// round against the live Ascend launchpad and fixes the protocol parameters the round runs under.
contract UpdraftFactory is Ownable {
    uint16 public constant MAX_PARITY_BPS = 200;
    uint16 public constant MAX_PLATFORM_TOKEN_BPS = 200;
    uint16 public constant MAX_PLATFORM_FEE_BPS = 2000;
    uint16 public constant MAX_TEAM_BPS = 6000;
    uint32 public constant MIN_POLICY_TIMELOCK = 5 minutes;
    uint32 public constant MAX_PARTICIPANT_VESTING = 30 days;
    /// @dev Commits can only be held this long past the close before anyone may abort for refunds.
    uint32 public constant MAX_FIRE_WINDOW = 7 days;

    struct LaunchpadInfo {
        bool allowed;
        address ascendOwner;
        bytes tokenCreationCode;
    }

    error LaunchpadNotAllowed();
    error LaunchpadOwnerMismatch();
    error QuoteNotAllowed();
    error BadWindows();
    error BadRaise();
    error MaxRaiseOverCapacity();
    error BadPolicy();
    error WeakCreatorVesting();
    error BadVesting();
    error UnknownAttestor();
    error BadParams();
    error BadToken();
    error ZeroCreator();
    error BadListingCap();

    event LaunchpadAllowed(address indexed launchpad, address ascendOwner);
    event LaunchpadRevoked(address indexed launchpad);
    event AttestorSet(address indexed attestor, bool allowed);
    event ParamsSet(Params params);
    event RoundCreated(
        address indexed round,
        address indexed token,
        address indexed creator,
        address launchpad,
        address quote,
        uint8 mode
    );

    address public immutable roundImplementation;
    address public immutable vaultImplementation;
    address public immutable certificate;
    address public immutable staking;

    Params internal _params;
    mapping(address => LaunchpadInfo) internal _launchpads;
    mapping(address => bool) public isAttestor;
    mapping(address => bool) public isRound;
    address[] public rounds;

    constructor(
        address owner_,
        address roundImplementation_,
        address vaultImplementation_,
        address certificate_,
        address staking_,
        Params memory params_
    ) {
        _initializeOwner(owner_);
        roundImplementation = roundImplementation_;
        vaultImplementation = vaultImplementation_;
        certificate = certificate_;
        staking = staking_;
        _setParams(params_);
    }

    // ---------------------------------------------------------------- admin

    /// @notice Accept a genuine Ascend launchpad: its owner must be `ascendOwner` at every round
    /// creation, and `tokenCreationCode` is the code it deploys launch tokens with.
    function allowLaunchpad(address launchpad, address ascendOwner, bytes calldata tokenCreationCode)
        external
        onlyOwner
    {
        _launchpads[launchpad] = LaunchpadInfo(true, ascendOwner, tokenCreationCode);
        emit LaunchpadAllowed(launchpad, ascendOwner);
    }

    function revokeLaunchpad(address launchpad) external onlyOwner {
        _launchpads[launchpad].allowed = false;
        emit LaunchpadRevoked(launchpad);
    }

    function setAttestor(address attestor, bool allowed) external onlyOwner {
        isAttestor[attestor] = allowed;
        emit AttestorSet(attestor, allowed);
    }

    /// @notice New parameters apply to rounds created from now on; existing rounds keep theirs.
    function setParams(Params calldata p) external onlyOwner {
        _setParams(p);
    }

    function _setParams(Params memory p) internal {
        if (
            p.parityBps > MAX_PARITY_BPS || p.platformTokenBps > MAX_PLATFORM_TOKEN_BPS
                || p.platformFeeBps > MAX_PLATFORM_FEE_BPS || p.minPolicyTimelock < MIN_POLICY_TIMELOCK
                || p.maxTeamBps > MAX_TEAM_BPS
        ) revert BadParams();
        _params = p;
        emit ParamsSet(p);
    }

    // ---------------------------------------------------------------- rounds

    function createRound(RoundConfig calldata cfg, bytes32 roundSalt) external returns (address round, address token) {
        LaunchpadInfo storage info = _launchpads[cfg.launchpad];
        if (!info.allowed) revert LaunchpadNotAllowed();
        IAscendLaunchpad lp = IAscendLaunchpad(cfg.launchpad);
        if (lp.owner() != info.ascendOwner) revert LaunchpadOwnerMismatch();
        if (!lp.quoteConfig(cfg.quote).allowed) revert QuoteNotAllowed();
        if (bytes(cfg.name).length == 0 || bytes(cfg.symbol).length == 0) revert BadToken();
        if (cfg.creator == address(0)) revert ZeroCreator();
        // Ascend's listing desk refuses caps above uint88; such a round could never fire.
        if (cfg.listingCap > type(uint88).max) revert BadListingCap();
        _checkWindows(cfg);
        _checkVesting(cfg.participantVesting, cfg.creatorVesting);
        _checkPolicy(cfg.policy, cfg.bounds);
        if (cfg.mode == Mode.Verified && !isAttestor[cfg.attestor]) revert UnknownAttestor();

        round = LibClone.cloneDeterministic(roundImplementation, _roundSalt(msg.sender, roundSalt));
        token = TokenAddress.predict(
            cfg.launchpad, round, cfg.tokenSalt, info.tokenCreationCode, cfg.name, cfg.symbol
        );
        _checkRaise(cfg, lp, token < cfg.quote);

        isRound[round] = true;
        rounds.push(round);
        UpdraftRound(round).initialize(
            cfg,
            _params,
            Wiring({vaultImplementation: vaultImplementation, certificate: certificate, staking: staking}),
            token,
            CurveLens.curveHash(lp, cfg.quote)
        );
        emit RoundCreated(round, token, cfg.creator, cfg.launchpad, cfg.quote, uint8(cfg.mode));
    }

    function _checkWindows(RoundConfig calldata cfg) internal view {
        if (
            !(cfg.windows.openAt < cfg.windows.lockAt && cfg.windows.lockAt <= cfg.windows.closeAt
                    && cfg.windows.closeAt < cfg.windows.fireBy && cfg.windows.closeAt > block.timestamp
                    && cfg.windows.fireBy - cfg.windows.closeAt <= MAX_FIRE_WINDOW)
        ) revert BadWindows();
    }

    function _checkRaise(RoundConfig calldata cfg, IAscendLaunchpad lp, bool tokenIs0) internal view {
        if (
            cfg.raise.minRaise == 0 || cfg.raise.minRaise > cfg.raise.maxRaise || cfg.raise.walletCap == 0
                || cfg.raise.minCommit == 0 || cfg.raise.minCommit > cfg.raise.walletCap
        ) {
            revert BadRaise();
        }
        if (cfg.raise.maxRaise > CurveLens.capacity(lp, cfg.quote, tokenIs0)) revert MaxRaiseOverCapacity();
    }

    /// @dev The creator never unlocks anything at T0 and stays locked at least as long as anyone else.
    function _checkVesting(Vesting calldata participant, Vesting calldata creator) internal pure {
        if (participant.tgeBps > 10_000 || uint256(participant.cliff) + participant.duration > MAX_PARTICIPANT_VESTING) {
            revert BadVesting();
        }
        if (participant.tgeBps < 10_000 && participant.duration == 0) revert BadVesting();
        if (creator.tgeBps != 0 || creator.duration == 0 || creator.cliff < participant.cliff + participant.duration) {
            revert WeakCreatorVesting();
        }
    }

    function _checkPolicy(Policy calldata p, PolicyBounds calldata b) internal view {
        Params memory params_ = _params;
        bool ok = uint256(p.platformBps) + p.bidBps + p.stakersBps + p.teamBps == 10_000
            && p.platformBps == params_.platformFeeBps && b.min.platformBps == params_.platformFeeBps
            && b.max.platformBps == params_.platformFeeBps && b.max.teamBps <= params_.maxTeamBps
            && b.timelock >= params_.minPolicyTimelock && b.min.bidBps <= p.bidBps && p.bidBps <= b.max.bidBps
            && b.min.stakersBps <= p.stakersBps && p.stakersBps <= b.max.stakersBps && b.min.teamBps <= p.teamBps
            && p.teamBps <= b.max.teamBps;
        if (!ok) revert BadPolicy();
    }

    // ---------------------------------------------------------------- views

    function predictRound(bytes32 roundSalt, address deployer) external view returns (address) {
        return LibClone.predictDeterministicAddress(roundImplementation, _roundSalt(deployer, roundSalt), address(this));
    }

    function predictToken(address launchpad, address round, bytes32 tokenSalt, string calldata name, string calldata symbol)
        external
        view
        returns (address)
    {
        return TokenAddress.predict(launchpad, round, tokenSalt, _launchpads[launchpad].tokenCreationCode, name, symbol);
    }

    function isAllowedLaunchpad(address launchpad) external view returns (bool) {
        return _launchpads[launchpad].allowed;
    }

    function launchpadInfo(address launchpad) external view returns (LaunchpadInfo memory) {
        return _launchpads[launchpad];
    }

    function params() external view returns (Params memory) {
        return _params;
    }

    function roundCount() external view returns (uint256) {
        return rounds.length;
    }

    function _roundSalt(address deployer, bytes32 roundSalt) internal pure returns (bytes32) {
        return keccak256(abi.encode(deployer, roundSalt));
    }
}
