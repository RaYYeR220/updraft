// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {FixedPointMathLib as FPM} from "solady/utils/FixedPointMathLib.sol";
import {IAscendLaunchpad} from "./interfaces/IAscendLaunchpad.sol";
import {IListingDesk} from "./interfaces/IListingDesk.sol";
import {Policy, PolicyBounds} from "./interfaces/IUpdraft.sol";

interface IStakingDepositor {
    function deposit(address asset, uint256 amount) external;
}

interface IInfinityVault {
    function getLocker() external view returns (address);
}

/// @notice Holds an Ascend launch's creator role and routes its fees by a published policy.
/// The creator can change the split only inside bounds fixed at launch, and only after a timelock,
/// so nobody can quietly redirect the fees to themselves overnight.
/// @dev Fees can arrive without harvest() (anyone may call the launchpad's claim, which pays the
/// role holder), so routing works on balance deltas: whatever the vault holds beyond what it owes
/// (staked principal, team balance, staker rewards) is new income. Every state change that moves
/// stake or policy first pulls what Ascend owes, so fees always follow the split and the stakers
/// that were in place when they accrued.
contract CreatorVault is ReentrancyGuard {
    using SafeTransferLib for address;

    uint256 internal constant SCALE = 1e36;
    /// @dev Bounds the quote credited per checkpoint (far above any real fee flow), so a minted
    /// testnet balance can never overflow the reward accumulator.
    uint256 internal constant MAX_QUOTE_INCOME = 1e30;
    /// @dev Gas every fee pull is guaranteed, so collect can't be starved into a silent skip: above
    /// the 2M Ascend's own listing desk budgets for collect, with room for the claims and routing.
    uint256 internal constant PULL_GAS_FLOOR = 3_000_000;
    /// @dev Gas the listing desk is guaranteed, so a refused enrollment means the desk refused it
    /// rather than ran out of gas (about 2.6 times the 287k a live enrollment takes).
    uint256 internal constant ENROLL_GAS_FLOOR = 750_000;

    struct InitParams {
        address launchpad;
        bytes32 poolId;
        address token;
        address quote;
        address creator;
        address staking;
        Policy policy;
        PolicyBounds bounds;
        uint256 listingCap;
        bool exitEnabled;
    }

    error AlreadyInitialized();
    error OnlyRound();
    error OnlyCreator();
    error OutOfBounds();
    error TooEarly();
    error NothingQueued();
    error AlreadyQueued();
    error ExitDisabled();
    error ZeroAmount();
    error OverStaked();
    error InsufficientGas();
    error VaultLocked();

    event Routed(uint256 quoteIncome, uint256 tokenIncome);
    event PolicyQueued(Policy policy, uint40 eta);
    event PolicyExecuted(Policy policy);
    event PolicyCancelled();
    event ExitQueued(address indexed to, uint40 eta);
    event ExitCancelled();
    event Exited(address indexed to);
    event ListingQueued(uint256 cap, uint40 eta);
    event ListingCancelled();
    event ListingEnrolled(uint256 cap);
    event ListingRefused(uint256 cap);
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 quote, uint256 token);
    event TeamClaimed(address indexed to, uint256 quote, uint256 token);

    address public round;
    IAscendLaunchpad public launchpad;
    bytes32 public poolId;
    address public token;
    address public quote;
    address public creator;
    address public staking;
    Policy public policy;
    PolicyBounds internal _bounds;
    bool public exitEnabled;
    uint256 public listingCap;

    Policy internal _pendingPolicy;
    uint40 internal _policyEta;
    address public pendingExit;
    uint40 public exitEta;
    uint256 public pendingListingCap;
    uint40 public listingEta;

    uint256 public totalStaked;
    mapping(address => uint256) public stakeOf;
    uint256 public teamOwedQuote;
    uint256 public teamOwedToken;
    uint256 public stakerReservedQuote;
    uint256 public stakerReservedToken;
    uint256 public rewardPerTokenQuote;
    uint256 public rewardPerTokenToken;
    mapping(address => uint256) internal _paidQuote;
    mapping(address => uint256) internal _paidToken;
    mapping(address => uint256) internal _owedQuote;
    mapping(address => uint256) internal _owedToken;

    modifier onlyCreator() {
        if (msg.sender != creator) revert OnlyCreator();
        _;
    }

    constructor() {
        round = address(0xdead); // the implementation is never usable; clones start empty
    }

    function initialize(InitParams calldata p) external {
        if (round != address(0)) revert AlreadyInitialized();
        round = msg.sender;
        launchpad = IAscendLaunchpad(p.launchpad);
        poolId = p.poolId;
        token = p.token;
        quote = p.quote;
        creator = p.creator;
        staking = p.staking;
        policy = p.policy;
        _bounds = p.bounds;
        listingCap = p.listingCap;
        exitEnabled = p.exitEnabled;
    }

    /// @notice Completes the creator-role handoff the round started. Enrolls the HyperCore
    /// listing set-aside afterwards (accepting the role resets Ascend's listing election); a
    /// listing the desk refuses is reported and never blocks the launch.
    function acceptRole() external {
        if (msg.sender != round) revert OnlyRound();
        launchpad.acceptCreator(poolId);
        if (listingCap > 0) {
            if (gasleft() < ENROLL_GAS_FLOOR) revert InsufficientGas();
            try IListingDesk(launchpad.listingDesk()).enroll(token, quote, listingCap) {
                emit ListingEnrolled(listingCap);
            } catch {
                emit ListingRefused(listingCap);
            }
        }
    }

    // ---------------------------------------------------------------- fee routing

    /// @notice Pulls accrued fees from Ascend and routes them.
    function harvest() external nonReentrant {
        _pull();
        _checkpoint();
    }

    /// @dev Each leg is claimed separately so a quote that refuses transfers cannot strand the token side.
    /// collect is allowed to fail on its own (a paused launchpad must not freeze unstaking), but never
    /// because the caller arranged it: not starved of gas, and not from inside a lock on Ascend's
    /// Infinity vault, where collect always reverts. A skipped collect would let a stake, a policy
    /// change or an exit land before fees that accrued under the old state are routed.
    function _pull() internal {
        if (gasleft() < PULL_GAS_FLOOR) revert InsufficientGas();
        if (IInfinityVault(launchpad.vault()).getLocker() != address(0)) revert VaultLocked();
        try launchpad.collect(poolId) {} catch {}
        try launchpad.claimToken(poolId) {} catch {}
        try launchpad.claimQuote(poolId) {} catch {}
    }

    /// @notice Routes whatever arrived since the last checkpoint, however it arrived.
    function checkpoint() external nonReentrant {
        _checkpoint();
    }

    function _checkpoint() internal {
        uint256 quoteIncome = _excess(quote, teamOwedQuote + stakerReservedQuote);
        if (quoteIncome > MAX_QUOTE_INCOME) quoteIncome = MAX_QUOTE_INCOME;
        uint256 tokenIncome = _excess(token, totalStaked + teamOwedToken + stakerReservedToken);
        if (quoteIncome == 0 && tokenIncome == 0) return;
        Policy memory p = policy;
        bool stakers = totalStaked > 0;

        if (quoteIncome > 0) {
            uint256 platformQ = quoteIncome * p.platformBps / 10_000;
            uint256 bidQ = quoteIncome * p.bidBps / 10_000;
            uint256 stakersQ = quoteIncome * p.stakersBps / 10_000;
            teamOwedQuote += quoteIncome - platformQ - bidQ - stakersQ;
            // With nobody staked, the stakers' share becomes buy support rather than a prize
            // for whoever stakes first.
            if (stakers) _toStakersQuote(stakersQ);
            else bidQ += stakersQ;
            _deposit(quote, platformQ);
            if (bidQ > 0) {
                quote.safeApprove(address(launchpad), bidQ);
                launchpad.fundBid(poolId, bidQ);
            }
        }
        if (tokenIncome > 0) {
            uint256 platformT = tokenIncome * p.platformBps / 10_000;
            uint256 teamT = tokenIncome * p.teamBps / 10_000;
            // The bid only buys with quote, so the bid share of token fees goes to stakers, or to
            // the platform basket when nobody is staked.
            uint256 stakersT = tokenIncome - platformT - teamT;
            teamOwedToken += teamT;
            if (stakers) _toStakersToken(stakersT);
            else platformT += stakersT;
            _deposit(token, platformT);
        }
        emit Routed(quoteIncome, tokenIncome);
    }

    function _deposit(address asset, uint256 amount) internal {
        if (amount == 0) return;
        asset.safeApprove(staking, amount);
        IStakingDepositor(staking).deposit(asset, amount);
    }

    function _toStakersQuote(uint256 amount) internal {
        if (amount == 0) return;
        rewardPerTokenQuote += FPM.fullMulDiv(amount, SCALE, totalStaked);
        stakerReservedQuote += amount;
    }

    function _toStakersToken(uint256 amount) internal {
        if (amount == 0) return;
        rewardPerTokenToken += FPM.fullMulDiv(amount, SCALE, totalStaked);
        stakerReservedToken += amount;
    }

    function _excess(address asset, uint256 owed) internal view returns (uint256) {
        uint256 balance = asset.balanceOf(address(this));
        return balance > owed ? balance - owed : 0;
    }

    // ---------------------------------------------------------------- holders

    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _pull();
        _checkpoint();
        _settle(msg.sender);
        token.safeTransferFrom(msg.sender, address(this), amount);
        stakeOf[msg.sender] += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > stakeOf[msg.sender]) revert OverStaked();
        _pull();
        _checkpoint();
        _settle(msg.sender);
        stakeOf[msg.sender] -= amount;
        totalStaked -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claimRewards() external nonReentrant {
        _checkpoint();
        _settle(msg.sender);
        uint256 q = _cap(quote, _owedQuote[msg.sender], 0);
        uint256 t = _cap(token, _owedToken[msg.sender], totalStaked);
        _owedQuote[msg.sender] -= q;
        _owedToken[msg.sender] -= t;
        stakerReservedQuote -= q;
        stakerReservedToken -= t;
        if (q > 0) quote.safeTransfer(msg.sender, q);
        if (t > 0) token.safeTransfer(msg.sender, t);
        emit RewardsClaimed(msg.sender, q, t);
    }

    function earned(address user) public view returns (uint256 quoteAmount, uint256 tokenAmount) {
        uint256 s = stakeOf[user];
        quoteAmount = _owedQuote[user] + FPM.fullMulDiv(s, rewardPerTokenQuote - _paidQuote[user], SCALE);
        tokenAmount = _owedToken[user] + FPM.fullMulDiv(s, rewardPerTokenToken - _paidToken[user], SCALE);
    }

    function _settle(address user) internal {
        (_owedQuote[user], _owedToken[user]) = earned(user);
        _paidQuote[user] = rewardPerTokenQuote;
        _paidToken[user] = rewardPerTokenToken;
    }

    // ---------------------------------------------------------------- team

    function claimTeam() external nonReentrant onlyCreator {
        _checkpoint();
        uint256 q = _cap(quote, teamOwedQuote, 0);
        uint256 t = _cap(token, teamOwedToken, totalStaked);
        teamOwedQuote -= q;
        teamOwedToken -= t;
        if (q > 0) quote.safeTransfer(creator, q);
        if (t > 0) token.safeTransfer(creator, t);
        emit TeamClaimed(creator, q, t);
    }

    /// @dev Pays at most what is actually held (testnet stables can be burned out from under us),
    /// never touching the staked principal.
    function _cap(address asset, uint256 owed, uint256 locked) internal view returns (uint256) {
        uint256 balance = asset.balanceOf(address(this));
        uint256 available = balance > locked ? balance - locked : 0;
        return owed < available ? owed : available;
    }

    // ---------------------------------------------------------------- policy

    function queuePolicy(Policy calldata p) external onlyCreator {
        if (_policyEta != 0) revert AlreadyQueued();
        if (!_withinBounds(p)) revert OutOfBounds();
        _pendingPolicy = p;
        _policyEta = uint40(block.timestamp + _bounds.timelock);
        emit PolicyQueued(p, _policyEta);
    }

    function executePolicy() external nonReentrant {
        if (_policyEta == 0) revert NothingQueued();
        if (block.timestamp < _policyEta) revert TooEarly();
        // Fees that accrued under the old split are routed under the old split.
        _pull();
        _checkpoint();
        policy = _pendingPolicy;
        delete _pendingPolicy;
        _policyEta = 0;
        emit PolicyExecuted(policy);
    }

    function cancelPolicy() external onlyCreator {
        if (_policyEta == 0) revert NothingQueued();
        delete _pendingPolicy;
        _policyEta = 0;
        emit PolicyCancelled();
    }

    function pendingPolicy() external view returns (Policy memory, uint40) {
        return (_pendingPolicy, _policyEta);
    }

    function bounds() external view returns (PolicyBounds memory) {
        return _bounds;
    }

    function _withinBounds(Policy calldata p) internal view returns (bool) {
        PolicyBounds memory b = _bounds;
        if (uint256(p.platformBps) + p.bidBps + p.stakersBps + p.teamBps != 10_000) return false;
        if (p.platformBps != policy.platformBps) return false;
        return p.bidBps >= b.min.bidBps && p.bidBps <= b.max.bidBps && p.stakersBps >= b.min.stakersBps
            && p.stakersBps <= b.max.stakersBps && p.teamBps >= b.min.teamBps && p.teamBps <= b.max.teamBps;
    }

    // ---------------------------------------------------------------- exit and listing

    function queueExit(address to) external onlyCreator {
        if (!exitEnabled) revert ExitDisabled();
        if (exitEta != 0) revert AlreadyQueued();
        pendingExit = to;
        exitEta = uint40(block.timestamp + _bounds.timelock);
        emit ExitQueued(to, exitEta);
    }

    function cancelExit() external onlyCreator {
        if (exitEta == 0) revert NothingQueued();
        exitEta = 0;
        pendingExit = address(0);
        emit ExitCancelled();
    }

    /// @notice Offers Ascend's creator role to the queued address once the timelock has passed.
    /// Everything the vault earned while it held the role (pending fees and any listing set-aside)
    /// is pulled back and routed first; balances owed to the team and to stakers stay claimable here.
    function executeExit() external nonReentrant {
        if (exitEta == 0) revert NothingQueued();
        if (block.timestamp < exitEta) revert TooEarly();
        _pull();
        _reclaimListing();
        _checkpoint();
        address to = pendingExit;
        exitEta = 0;
        pendingExit = address(0);
        launchpad.transferCreator(poolId, to);
        emit Exited(to);
    }

    /// @dev Stops the set-aside and withdraws what is not locked for a delivery, to this vault. Either
    /// step failing stops the exit: the role must not leave with the set-aside still attached.
    function _reclaimListing() internal {
        IListingDesk desk = IListingDesk(launchpad.listingDesk());
        if (launchpad.listingElection(poolId) != 0) desk.close(poolId);
        uint256 owed = launchpad.listingOwed(poolId);
        uint256 locked = desk.pool(poolId).locked;
        if (owed > locked) desk.withdraw(poolId, owed - locked);
    }

    function queueListing(uint256 cap) external onlyCreator {
        if (listingEta != 0) revert AlreadyQueued();
        if (cap == 0) revert ZeroAmount();
        if (cap > type(uint88).max) revert OutOfBounds();
        pendingListingCap = cap;
        listingEta = uint40(block.timestamp + _bounds.timelock);
        emit ListingQueued(cap, listingEta);
    }

    function cancelListing() external onlyCreator {
        if (listingEta == 0) revert NothingQueued();
        listingEta = 0;
        pendingListingCap = 0;
        emit ListingCancelled();
    }

    function executeListing() external {
        if (listingEta == 0) revert NothingQueued();
        if (block.timestamp < listingEta) revert TooEarly();
        listingCap = pendingListingCap;
        listingEta = 0;
        pendingListingCap = 0;
        IListingDesk(launchpad.listingDesk()).enroll(token, quote, listingCap);
        emit ListingEnrolled(listingCap);
    }

    /// @notice Stops the listing set-aside; anything returned by the desk is routed as income.
    function closeListing() external onlyCreator {
        IListingDesk(launchpad.listingDesk()).close(poolId);
    }
}
