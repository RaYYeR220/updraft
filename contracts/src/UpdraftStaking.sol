// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

/// @notice Stake $DRAFT, earn the platform's share of every Updraft launch: quote from creator
/// fees and a slice of each batch's tokens. Rewards that arrive before anyone stakes are queued
/// for the first stakers.
contract UpdraftStaking is ReentrancyGuard {
    using SafeTransferLib for address;

    uint256 internal constant SCALE = 1e36;
    uint256 public constant MAX_REWARD_ASSETS = 200;

    error NotOwner();
    error StakeTokenSet();
    error StakeTokenUnset();
    error ZeroAmount();
    error TooManyAssets();
    error OverStaked();

    event StakeTokenBound(address token);
    event Notified(address indexed asset, address indexed from, uint256 amount);
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, address indexed asset, uint256 amount);

    address public immutable owner;
    address public stakeToken;
    uint256 public totalStaked;
    mapping(address => uint256) public stakeOf;

    address[] internal _assets;
    mapping(address => bool) public isRewardAsset;
    mapping(address => uint256) public rewardPerToken;
    /// @notice Rewards received while nothing was staked.
    mapping(address => uint256) public queued;
    /// @notice Rewards allocated to stakers and not yet paid out.
    mapping(address => uint256) public reserved;
    mapping(address => mapping(address => uint256)) internal _paid;
    mapping(address => mapping(address => uint256)) internal _owed;

    constructor(address owner_) {
        owner = owner_;
    }

    function setStakeToken(address token) external {
        if (msg.sender != owner) revert NotOwner();
        if (stakeToken != address(0)) revert StakeTokenSet();
        stakeToken = token;
        emit StakeTokenBound(token);
    }

    /// @notice Pulls `amount` of `asset` from the caller and distributes what actually arrived.
    function notify(address asset, uint256 amount) external nonReentrant {
        if (amount == 0) return;
        if (!isRewardAsset[asset]) {
            if (_assets.length >= MAX_REWARD_ASSETS) revert TooManyAssets();
            isRewardAsset[asset] = true;
            _assets.push(asset);
        }
        uint256 before = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = asset.balanceOf(address(this)) - before;
        if (totalStaked == 0) {
            queued[asset] += received;
        } else {
            rewardPerToken[asset] += received * SCALE / totalStaked;
            reserved[asset] += received;
        }
        emit Notified(asset, msg.sender, received);
    }

    function stake(uint256 amount) external nonReentrant {
        if (stakeToken == address(0)) revert StakeTokenUnset();
        if (amount == 0) revert ZeroAmount();
        _settle(msg.sender);
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        stakeOf[msg.sender] += amount;
        totalStaked += amount;
        _releaseQueued();
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > stakeOf[msg.sender]) revert OverStaked();
        _settle(msg.sender);
        stakeOf[msg.sender] -= amount;
        totalStaked -= amount;
        stakeToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    /// @notice Pays the caller's rewards in `assets`, capped by what the contract actually holds.
    function claim(address[] calldata assets) external nonReentrant {
        for (uint256 i; i < assets.length; i++) {
            address asset = assets[i];
            _settleAsset(msg.sender, asset);
            uint256 owed = _owed[msg.sender][asset];
            if (owed == 0) continue;
            uint256 pay = _payable(asset, owed);
            _owed[msg.sender][asset] = owed - pay;
            reserved[asset] -= pay;
            if (pay > 0) asset.safeTransfer(msg.sender, pay);
            emit Claimed(msg.sender, asset, pay);
        }
    }

    function earned(address user, address asset) public view returns (uint256) {
        return _owed[user][asset] + stakeOf[user] * (rewardPerToken[asset] - _paid[user][asset]) / SCALE;
    }

    function rewardAssets() external view returns (address[] memory) {
        return _assets;
    }

    function _settle(address user) internal {
        for (uint256 i; i < _assets.length; i++) {
            _settleAsset(user, _assets[i]);
        }
    }

    function _settleAsset(address user, address asset) internal {
        _owed[user][asset] = earned(user, asset);
        _paid[user][asset] = rewardPerToken[asset];
    }

    function _releaseQueued() internal {
        for (uint256 i; i < _assets.length; i++) {
            address asset = _assets[i];
            uint256 q = queued[asset];
            if (q == 0) continue;
            queued[asset] = 0;
            rewardPerToken[asset] += q * SCALE / totalStaked;
            reserved[asset] += q;
        }
    }

    /// @dev Never more than the balance, and never the staked principal when the asset is the stake token.
    function _payable(address asset, uint256 owed) internal view returns (uint256) {
        uint256 balance = asset.balanceOf(address(this));
        uint256 locked = asset == stakeToken ? totalStaked : 0;
        uint256 available = balance > locked ? balance - locked : 0;
        return owed < available ? owed : available;
    }
}
