// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {EIP712} from "solady/utils/EIP712.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";
import {LibClone} from "solady/utils/LibClone.sol";
import {
    RoundConfig, Params, Wiring, Voucher, Status, AbortReason, Mode, Vesting, FirePreview
} from "./interfaces/IUpdraft.sol";
import {IAscendLaunchpad} from "./interfaces/IAscendLaunchpad.sol";
import {CurveLens} from "./lens/CurveLens.sol";
import {CreatorVault} from "./CreatorVault.sol";
import {LaunchCertificate, Certificate} from "./LaunchCertificate.sol";

interface IFactoryView {
    function isAllowedLaunchpad(address launchpad) external view returns (bool);
}

interface IStakingNotifier {
    function notify(address asset, uint256 amount) external;
}

interface IERC20Permit {
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external;
}

/// @notice One fair launch. Before T0, anyone commits quote into the round; at T0 the whole pot
/// becomes a single atomic dev-buy through Ascend's launch(), so every participant pays the same
/// price. Until then the round is an escrow: funds leave only as withdrawals, refunds or the launch.
/// @dev Every payout is computed against the real quote balance, never against bookkeeping alone:
/// the quote can lose balance outside our control (Ascend's testnet stables have a public burn).
contract UpdraftRound is ReentrancyGuard, EIP712 {
    using SafeTransferLib for address;

    uint256 public constant MAX_PARTICIPANTS = 1000;
    bytes32 public constant VOUCHER_TYPEHASH =
        keccak256("Voucher(address round,address wallet,bytes32 identityId,uint64 expiry,bytes32 evidenceHash)");

    error AlreadyInitialized();
    error NotOpen();
    error Closed();
    error Locked();
    error ZeroAmount();
    error OverWalletCap();
    error OverCreatorCap();
    error OverCommitted();
    error TooManyParticipants();
    error NotLive();
    error NotAbortable();
    error NothingToRefund();
    error BadVoucher();
    error VoucherExpired();
    error IdentityTaken();
    error WrongRound();
    error WrongWallet();
    error NotClosed();
    error NotFired();
    error NothingToClaim();
    error TokenMismatch();

    event Committed(
        address indexed wallet, bytes32 indexed identityId, uint256 amount, uint256 walletTotal, uint256 roundTotal
    );
    event Withdrawn(address indexed wallet, uint256 amount, uint256 paid, uint256 roundTotal);
    event Aborted(AbortReason reason, uint256 balance);
    event Refunded(address indexed wallet, uint256 amount);
    event Shortfall(uint256 accounted, uint256 balance);
    event Fired(
        address indexed token, bytes32 indexed poolId, address vault, uint256 quoteUsed, uint256 tokensOut, uint256 avgPriceX96
    );
    event Distributed(uint256 from, uint256 to);
    event Claimed(address indexed wallet, uint256 tokens, uint256 quote);

    address public factory;
    RoundConfig internal _cfg;
    Params internal _params;
    Wiring internal _wiring;
    address public expectedToken;
    bytes32 public curveHash;

    Status public status;
    AbortReason public abortReason;
    uint256 public totalCommitted;
    uint256 public balanceAtAbort;
    mapping(address => uint256) public commitOf;
    mapping(address => bool) public refunded;
    address[] internal _participants;
    mapping(address => bool) internal _joined;

    /// @notice Verified mode: one identity per wallet and one wallet per identity, per round.
    mapping(address => bytes32) public identityOf;
    mapping(bytes32 => address) public walletOfIdentity;
    /// @notice Rolling hash of every accepted voucher's evidence hash, in commit order.
    bytes32 public evidenceAccumulator;
    uint32 public verifiedCount;

    // Set at fire.
    address public token;
    bytes32 public poolId;
    address public vault;
    uint40 public firedAt;
    uint256 public tokensOut;
    uint256 public netTokens;
    uint256 public quoteUsed;
    uint256 public refundPool;
    uint256 public distributedCount;
    mapping(address => uint256) public claimedTokens;
    mapping(address => bool) public quoteRefunded;
    mapping(address => bool) public pushed;

    constructor() {
        // The implementation itself can never be initialized; clones start empty.
        factory = address(0xdead);
    }

    function initialize(
        RoundConfig calldata cfg,
        Params calldata params_,
        Wiring calldata wiring_,
        address expectedToken_,
        bytes32 curveHash_
    ) external {
        if (factory != address(0)) revert AlreadyInitialized();
        factory = msg.sender;
        _cfg = cfg;
        _params = params_;
        _wiring = wiring_;
        expectedToken = expectedToken_;
        curveHash = curveHash_;
    }

    // ---------------------------------------------------------------- commit phase

    function commit(uint256 amount, Voucher calldata voucher, bytes calldata signature) external nonReentrant {
        _commit(amount, voucher, signature);
    }

    /// @notice Commit with an EIP-2612 permit, so a first-time participant needs one transaction.
    /// @dev A permit that was front-run still leaves the allowance in place, so its failure is ignored.
    function commitWithPermit(
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        Voucher calldata voucher,
        bytes calldata signature
    ) external nonReentrant {
        try IERC20Permit(_cfg.quote).permit(msg.sender, address(this), amount, deadline, v, r, s) {} catch {}
        _commit(amount, voucher, signature);
    }

    function _commit(uint256 amount, Voucher calldata voucher, bytes calldata signature) internal {
        if (status != Status.Live) revert NotLive();
        if (block.timestamp < _cfg.windows.openAt) revert NotOpen();
        if (block.timestamp >= _cfg.windows.closeAt) revert Closed();
        if (amount == 0) revert ZeroAmount();

        bytes32 identityId = _checkIdentity(voucher, signature);
        uint256 walletTotal = commitOf[msg.sender] + amount;
        if (msg.sender == _cfg.creator) {
            if (walletTotal > _cfg.raise.creatorCap) revert OverCreatorCap();
        } else if (walletTotal > _cfg.raise.walletCap) {
            revert OverWalletCap();
        }
        if (!_joined[msg.sender]) {
            if (_participants.length >= MAX_PARTICIPANTS) revert TooManyParticipants();
            _joined[msg.sender] = true;
            _participants.push(msg.sender);
        }

        commitOf[msg.sender] = walletTotal;
        totalCommitted += amount;
        _cfg.quote.safeTransferFrom(msg.sender, address(this), amount);
        emit Committed(msg.sender, identityId, amount, walletTotal, totalCommitted);
    }

    /// @dev Open mode needs no identity. Verified mode needs one attestor voucher per wallet, once:
    /// later top-ups by the same wallet reuse the identity it was admitted with.
    function _checkIdentity(Voucher calldata v, bytes calldata signature) internal returns (bytes32) {
        if (_cfg.mode == Mode.Open) return bytes32(0);
        bytes32 known = identityOf[msg.sender];
        if (known != bytes32(0)) return known;

        if (v.round != address(this)) revert WrongRound();
        if (v.wallet != msg.sender) revert WrongWallet();
        if (block.timestamp > v.expiry) revert VoucherExpired();
        bytes32 structHash =
            keccak256(abi.encode(VOUCHER_TYPEHASH, v.round, v.wallet, v.identityId, v.expiry, v.evidenceHash));
        address signer = ECDSA.tryRecoverCalldata(_hashTypedData(structHash), signature);
        if (signer == address(0) || signer != _cfg.attestor || v.identityId == bytes32(0)) revert BadVoucher();
        if (walletOfIdentity[v.identityId] != address(0)) revert IdentityTaken();

        identityOf[msg.sender] = v.identityId;
        walletOfIdentity[v.identityId] = msg.sender;
        evidenceAccumulator = keccak256(abi.encode(evidenceAccumulator, v.evidenceHash));
        verifiedCount++;
        return v.identityId;
    }

    /// @notice Take quote back out before the lock. If the escrow has lost balance, the
    /// withdrawal carries its pro-rata share of the loss, so everyone else's backing is unchanged.
    function withdraw(uint256 amount) external nonReentrant {
        if (status != Status.Live) revert NotLive();
        if (block.timestamp >= _cfg.windows.lockAt) revert Locked();
        if (amount == 0) revert ZeroAmount();
        uint256 committed = commitOf[msg.sender];
        if (amount > committed) revert OverCommitted();

        uint256 total = totalCommitted;
        uint256 balance = _quoteBalance();
        uint256 paid = balance < total ? amount * balance / total : amount;

        commitOf[msg.sender] = committed - amount;
        totalCommitted = total - amount;
        _cfg.quote.safeTransfer(msg.sender, paid);
        emit Withdrawn(msg.sender, amount, paid, totalCommitted);
    }

    // ---------------------------------------------------------------- fire

    /// @notice What fire() would do right now: the batch, the fee parity, the tokens it buys.
    function previewFire() public view returns (FirePreview memory p) {
        uint256 balance = _quoteBalance();
        p.usable = balance < totalCommitted ? balance : totalCommitted;
        p.effective = p.usable < _cfg.raise.maxRaise ? p.usable : _cfg.raise.maxRaise;
        p.parity = p.effective * _params.parityBps / 10_000;
        p.devBuy = p.effective - p.parity;
        (p.tokensOut,) =
            CurveLens.preview(IAscendLaunchpad(_cfg.launchpad), _cfg.quote, expectedToken < _cfg.quote, p.devBuy);
        p.platformTokens = p.tokensOut * _params.platformTokenBps / 10_000;
        uint256 net = p.tokensOut - p.platformTokens;
        if (net > 0) p.avgPriceX96 = (p.effective << 96) / net;
    }

    /// @notice Launches the token: the whole batch becomes Ascend's atomic dev-buy, so every
    /// participant pays the same price. Anyone may call it once commits close. If Ascend's side
    /// changed in a way the participants did not sign up for, the round aborts and refunds instead.
    function fire() external nonReentrant {
        if (status != Status.Live) revert NotLive();
        if (block.timestamp < _cfg.windows.closeAt) revert NotClosed();
        if (block.timestamp > _cfg.windows.fireBy) return _abort(AbortReason.Expired);

        uint256 total = totalCommitted;
        uint256 balance = _quoteBalance();
        uint256 usable = balance < total ? balance : total;
        if (usable < _cfg.raise.minRaise) return _abort(AbortReason.BelowMinimum);
        AbortReason reason = _preflight();
        if (reason != AbortReason.None) return _abort(reason);
        if (usable < total) emit Shortfall(total, balance);

        uint256 effective = usable < _cfg.raise.maxRaise ? usable : _cfg.raise.maxRaise;
        uint256 parity = effective * _params.parityBps / 10_000;
        uint256 spent = _launch(effective - parity, balance);

        IAscendLaunchpad lp = IAscendLaunchpad(_cfg.launchpad);
        if (parity > 0) {
            _cfg.quote.safeApprove(address(lp), parity);
            lp.fundBid(poolId, parity);
        }
        _installVault(lp);

        uint256 out = token.balanceOf(address(this));
        uint256 platformTokens = out * _params.platformTokenBps / 10_000;
        if (platformTokens > 0) {
            token.safeApprove(_wiring.staking, platformTokens);
            IStakingNotifier(_wiring.staking).notify(token, platformTokens);
        }

        status = Status.Fired;
        firedAt = uint40(block.timestamp);
        tokensOut = out;
        netTokens = out - platformTokens;
        quoteUsed = spent + parity;
        refundPool = usable - quoteUsed;
        uint256 avgPriceX96 = netTokens > 0 ? (quoteUsed << 96) / netTokens : 0;
        _certify(total - usable, platformTokens, avgPriceX96);
        emit Fired(token, poolId, vault, quoteUsed, out, avgPriceX96);
    }

    function _preflight() internal view returns (AbortReason) {
        IAscendLaunchpad lp = IAscendLaunchpad(_cfg.launchpad);
        if (!IFactoryView(factory).isAllowedLaunchpad(address(lp))) return AbortReason.LaunchpadRevoked;
        if (lp.paused()) return AbortReason.LaunchpadPaused;
        if (!lp.quoteConfig(_cfg.quote).allowed) return AbortReason.QuoteDisallowed;
        if (CurveLens.curveHash(lp, _cfg.quote) != curveHash) return AbortReason.CurveChanged;
        return AbortReason.None;
    }

    /// @dev The dev-buy. The round is the creator at launch, so the tokens land here.
    function _launch(uint256 devBuy, uint256 balanceBefore) internal returns (uint256 spent) {
        IAscendLaunchpad lp = IAscendLaunchpad(_cfg.launchpad);
        (uint256 expectedOut,) = CurveLens.preview(lp, _cfg.quote, expectedToken < _cfg.quote, devBuy);
        _cfg.quote.safeApprove(address(lp), devBuy);
        (address launched, bytes32 pid) = lp.launch(
            IAscendLaunchpad.LaunchParams({
                name: _cfg.name,
                symbol: _cfg.symbol,
                quote: _cfg.quote,
                devBuyQuote: devBuy,
                minDevOut: expectedOut,
                salt: _cfg.tokenSalt,
                creator: address(this)
            })
        );
        if (launched != expectedToken) revert TokenMismatch();
        token = launched;
        poolId = pid;
        spent = balanceBefore - _quoteBalance();
    }

    /// @dev Hands Ascend's creator role to a fresh policy vault in the same transaction.
    function _installVault(IAscendLaunchpad lp) internal {
        address v = LibClone.cloneDeterministic(_wiring.vaultImplementation, poolId);
        CreatorVault(v).initialize(
            CreatorVault.InitParams({
                launchpad: address(lp),
                poolId: poolId,
                token: token,
                quote: _cfg.quote,
                creator: _cfg.creator,
                staking: _wiring.staking,
                policy: _cfg.policy,
                bounds: _cfg.bounds,
                listingCap: _cfg.listingCap,
                exitEnabled: _cfg.exitEnabled
            })
        );
        lp.transferCreator(poolId, v);
        CreatorVault(v).acceptRole();
        vault = v;
    }

    function _certify(uint256 shortfall, uint256 platformTokens, uint256 avgPriceX96) internal {
        (uint32 count, uint16 top1, uint16 top10) = _concentration();
        LaunchCertificate(_wiring.certificate).record(
            Certificate({
                round: address(this),
                token: token,
                poolId: poolId,
                launchpad: _cfg.launchpad,
                quote: _cfg.quote,
                firedAt: firedAt,
                quoteUsed: quoteUsed,
                tokensOut: tokensOut,
                platformTokens: platformTokens,
                avgPriceX96: avgPriceX96,
                participants: count,
                verifiedIdentities: verifiedCount,
                top1Bps: top1,
                top10Bps: top10,
                creatorTokens: netTokens * commitOf[_cfg.creator] / totalCommitted,
                creatorVesting: _cfg.creatorVesting,
                participantVesting: _cfg.participantVesting,
                policyHash: keccak256(abi.encode(_cfg.policy, _cfg.bounds)),
                attestor: _cfg.mode == Mode.Verified ? _cfg.attestor : address(0),
                evidenceAccumulator: evidenceAccumulator,
                shortfall: shortfall
            })
        );
    }

    /// @dev Participants with a live commit, plus the share held by the largest one and by the top ten.
    function _concentration() internal view returns (uint32 count, uint16 top1Bps, uint16 top10Bps) {
        uint256[10] memory top;
        uint256 n = _participants.length;
        for (uint256 i; i < n; i++) {
            uint256 c = commitOf[_participants[i]];
            if (c == 0) continue;
            count++;
            if (c <= top[9]) continue;
            uint256 j = 9;
            while (j > 0 && top[j - 1] < c) {
                top[j] = top[j - 1];
                j--;
            }
            top[j] = c;
        }
        uint256 sum;
        for (uint256 k; k < 10; k++) {
            sum += top[k];
        }
        top1Bps = uint16(top[0] * 10_000 / totalCommitted);
        top10Bps = uint16(sum * 10_000 / totalCommitted);
    }

    // ---------------------------------------------------------------- distribution and claims

    /// @notice Pushes every participant's unlocked tokens and quote refund. Permissionless and
    /// chunked so any number of participants fits; the creator always claims through claim().
    function distribute(uint256 from, uint256 to) external nonReentrant {
        if (status != Status.Fired) revert NotFired();
        uint256 n = _participants.length;
        if (to > n) to = n;
        for (uint256 i = from; i < to; i++) {
            address w = _participants[i];
            if (w == _cfg.creator || pushed[w] || commitOf[w] == 0) continue;
            pushed[w] = true;
            distributedCount++;
            _payout(w);
        }
        emit Distributed(from, to);
    }

    function claim() external nonReentrant {
        (uint256 tokens, uint256 refund) = claimable(msg.sender);
        if (tokens == 0 && refund == 0) revert NothingToClaim();
        _payout(msg.sender);
    }

    function claimable(address wallet) public view returns (uint256 tokens, uint256 refund) {
        if (status != Status.Fired) return (0, 0);
        uint256 c = commitOf[wallet];
        if (c == 0) return (0, 0);
        uint256 share = netTokens * c / totalCommitted;
        Vesting memory v = wallet == _cfg.creator ? _cfg.creatorVesting : _cfg.participantVesting;
        tokens = _vested(share, v) - claimedTokens[wallet];
        refund = quoteRefunded[wallet] ? 0 : refundPool * c / totalCommitted;
    }

    function _payout(address wallet) internal {
        (uint256 tokens, uint256 refund) = claimable(wallet);
        if (tokens > 0) {
            claimedTokens[wallet] += tokens;
            token.safeTransfer(wallet, tokens);
        }
        if (!quoteRefunded[wallet]) {
            quoteRefunded[wallet] = true;
            if (refund > 0) _cfg.quote.safeTransfer(wallet, refund);
        }
        emit Claimed(wallet, tokens, refund);
    }

    function _vested(uint256 share, Vesting memory v) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - firedAt;
        uint256 atTge = share * v.tgeBps / 10_000;
        if (elapsed < v.cliff) return atTge;
        uint256 sinceCliff = elapsed - v.cliff;
        if (v.duration == 0 || sinceCliff >= v.duration) return share;
        return atTge + (share - atTge) * sinceCliff / v.duration;
    }

    // ---------------------------------------------------------------- abort and refunds

    /// @notice Anyone may abort a round that missed its deadline or closed under its minimum.
    function abort() external nonReentrant {
        if (status != Status.Live) revert NotLive();
        if (block.timestamp > _cfg.windows.fireBy) {
            _abort(AbortReason.Expired);
        } else if (block.timestamp >= _cfg.windows.closeAt && totalCommitted < _cfg.raise.minRaise) {
            _abort(AbortReason.BelowMinimum);
        } else {
            revert NotAbortable();
        }
    }

    function _abort(AbortReason reason) internal {
        status = Status.Aborted;
        abortReason = reason;
        balanceAtAbort = _quoteBalance();
        emit Aborted(reason, balanceAtAbort);
    }

    /// @notice After an abort, each participant takes their pro-rata share of what the escrow holds.
    function refundAborted() external nonReentrant {
        if (status != Status.Aborted) revert NotAbortable();
        uint256 committed = commitOf[msg.sender];
        if (committed == 0 || refunded[msg.sender]) revert NothingToRefund();
        refunded[msg.sender] = true;
        uint256 amount = balanceAtAbort * committed / totalCommitted;
        _cfg.quote.safeTransfer(msg.sender, amount);
        emit Refunded(msg.sender, amount);
    }

    // ---------------------------------------------------------------- views

    function config() external view returns (RoundConfig memory) {
        return _cfg;
    }

    function params() external view returns (Params memory) {
        return _params;
    }

    function wiring() external view returns (Wiring memory) {
        return _wiring;
    }

    function mode() external view returns (Mode) {
        return _cfg.mode;
    }

    function isCreatorCommit(address wallet) external view returns (bool) {
        return wallet == _cfg.creator;
    }

    function participantAt(uint256 i) external view returns (address) {
        return _participants[i];
    }

    function participantCount() external view returns (uint256) {
        return _participants.length;
    }

    function _domainNameAndVersion() internal pure override returns (string memory, string memory) {
        return ("Updraft Attestor", "1");
    }

    function _quoteBalance() internal view returns (uint256) {
        return _cfg.quote.balanceOf(address(this));
    }
}
