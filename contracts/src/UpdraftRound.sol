// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {RoundConfig, Params, Wiring, Voucher, Status, AbortReason, Mode} from "./interfaces/IUpdraft.sol";

interface IERC20Permit {
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external;
}

/// @notice One fair launch. Before T0, anyone commits quote into the round; at T0 the whole pot
/// becomes a single atomic dev-buy through Ascend's launch(), so every participant pays the same
/// price. Until then the round is an escrow: funds leave only as withdrawals, refunds or the launch.
/// @dev Every payout is computed against the real quote balance, never against bookkeeping alone:
/// the quote can lose balance outside our control (Ascend's testnet stables have a public burn).
contract UpdraftRound is ReentrancyGuard {
    using SafeTransferLib for address;

    uint256 public constant MAX_PARTICIPANTS = 1000;

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

    event Committed(
        address indexed wallet, bytes32 indexed identityId, uint256 amount, uint256 walletTotal, uint256 roundTotal
    );
    event Withdrawn(address indexed wallet, uint256 amount, uint256 paid, uint256 roundTotal);
    event Aborted(AbortReason reason, uint256 balance);
    event Refunded(address indexed wallet, uint256 amount);

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

    constructor() {
        // The implementation itself can never be initialized; clones start empty.
        factory = address(0xdead);
    }

    function initialize(
        RoundConfig calldata cfg,
        Params calldata params,
        Wiring calldata wiring,
        address expectedToken_,
        bytes32 curveHash_
    ) external {
        if (factory != address(0)) revert AlreadyInitialized();
        factory = msg.sender;
        _cfg = cfg;
        _params = params;
        _wiring = wiring;
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

    /// @dev Open mode needs no identity. Verified mode is added on top of this hook.
    function _checkIdentity(Voucher calldata, bytes calldata) internal virtual returns (bytes32) {
        return bytes32(0);
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

    function _quoteBalance() internal view returns (uint256) {
        return _cfg.quote.balanceOf(address(this));
    }
}
