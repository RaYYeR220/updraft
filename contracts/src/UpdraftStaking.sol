// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {MerkleProofLib} from "solady/utils/MerkleProofLib.sol";

/// @notice Stake $DRAFT; earn the platform basket: the platform's cut of every Updraft launch's
/// tokens and of every vault's creator fees.
/// @dev Rewards are paid by epoch. Rounds and vaults deposit; at the end of an epoch the distributor
/// posts a Merkle root that allocates the deposited basket to stakers by time-weighted stake, which
/// anyone can recompute from this contract's Staked / Unstaked / Deposited events. Staking itself
/// keeps no reward accounting, so nothing that arrives here can ever block a stake or an unstake.
contract UpdraftStaking is ReentrancyGuard {
    using SafeTransferLib for address;

    error NotOwner();
    error NotDistributor();
    error StakeTokenSet();
    error StakeTokenUnset();
    error ZeroAmount();
    error OverStaked();
    error BadWindow();
    error OverAllocated();
    error LengthMismatch();
    error AlreadyClaimed();
    error BadProof();

    event StakeTokenBound(address token);
    event DistributorSet(address distributor);
    event Staked(address indexed user, uint256 amount, uint256 balance, uint256 totalStaked);
    event Unstaked(address indexed user, uint256 amount, uint256 balance, uint256 totalStaked);
    event Deposited(address indexed asset, address indexed from, uint256 amount);
    event EpochPosted(uint256 indexed id, bytes32 root, uint40 start, uint40 end, address[] assets, uint256[] amounts, string uri);
    event Claimed(uint256 indexed epoch, address indexed account, address indexed asset, uint256 amount, uint256 paid);

    struct Epoch {
        bytes32 root;
        uint40 start;
        uint40 end;
    }

    address public immutable owner;
    uint40 public immutable genesis;
    address public stakeToken;
    address public distributor;

    uint256 public totalStaked;
    mapping(address => uint256) public stakeOf;

    Epoch[] public epochs;
    /// @notice Allocated by a posted epoch and not yet claimed.
    mapping(address => uint256) public reserved;
    mapping(uint256 => mapping(address => mapping(address => bool))) public claimed;

    constructor(address owner_) {
        owner = owner_;
        genesis = uint40(block.timestamp);
    }

    function setStakeToken(address token) external {
        if (msg.sender != owner) revert NotOwner();
        if (stakeToken != address(0)) revert StakeTokenSet();
        stakeToken = token;
        emit StakeTokenBound(token);
    }

    function setDistributor(address distributor_) external {
        if (msg.sender != owner) revert NotOwner();
        distributor = distributor_;
        emit DistributorSet(distributor_);
    }

    // ---------------------------------------------------------------- stake

    function stake(uint256 amount) external nonReentrant {
        if (stakeToken == address(0)) revert StakeTokenUnset();
        if (amount == 0) revert ZeroAmount();
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        stakeOf[msg.sender] += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount, stakeOf[msg.sender], totalStaked);
    }

    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > stakeOf[msg.sender]) revert OverStaked();
        stakeOf[msg.sender] -= amount;
        totalStaked -= amount;
        stakeToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount, stakeOf[msg.sender], totalStaked);
    }

    // ---------------------------------------------------------------- basket in

    /// @notice Adds to the basket. Rounds deposit their platform token cut, vaults their platform
    /// fee leg. Only the source in the event matters to the epoch builder; nothing else is stored.
    function deposit(address asset, uint256 amount) external nonReentrant {
        if (amount == 0) return;
        uint256 before = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(asset, msg.sender, asset.balanceOf(address(this)) - before);
    }

    /// @notice What the next epoch may still allocate of `asset`.
    function available(address asset) public view returns (uint256) {
        uint256 locked = reserved[asset] + (asset == stakeToken ? totalStaked : 0);
        uint256 balance = asset.balanceOf(address(this));
        return balance > locked ? balance - locked : 0;
    }

    // ---------------------------------------------------------------- epochs

    /// @notice Closes the epoch [previous end, `end`) and allocates `amounts` of `assets` by `root`.
    /// Leaves are keccak256(bytes.concat(keccak256(abi.encode(account, asset, amount)))).
    function postEpoch(bytes32 root, uint40 end, address[] calldata assets, uint256[] calldata amounts, string calldata uri)
        external
        returns (uint256 id)
    {
        if (msg.sender != distributor) revert NotDistributor();
        if (assets.length != amounts.length) revert LengthMismatch();
        uint40 start = epochs.length == 0 ? genesis : epochs[epochs.length - 1].end;
        if (end <= start || end > block.timestamp) revert BadWindow();
        for (uint256 i; i < assets.length; i++) {
            if (amounts[i] > available(assets[i])) revert OverAllocated();
            reserved[assets[i]] += amounts[i];
        }
        id = epochs.length;
        epochs.push(Epoch(root, start, end));
        emit EpochPosted(id, root, start, end, assets, amounts, uri);
    }

    function epochCount() external view returns (uint256) {
        return epochs.length;
    }

    /// @notice Claims one allocation. Pays at most what the contract holds of the asset.
    function claim(uint256 epoch, address asset, uint256 amount, bytes32[] calldata proof) public nonReentrant {
        if (claimed[epoch][msg.sender][asset]) revert AlreadyClaimed();
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, asset, amount))));
        if (!MerkleProofLib.verifyCalldata(proof, epochs[epoch].root, leaf)) revert BadProof();
        claimed[epoch][msg.sender][asset] = true;
        reserved[asset] -= amount;
        uint256 balance = asset.balanceOf(address(this));
        uint256 locked = asset == stakeToken ? totalStaked : 0;
        uint256 free = balance > locked ? balance - locked : 0;
        uint256 paid = amount < free ? amount : free;
        if (paid > 0) asset.safeTransfer(msg.sender, paid);
        emit Claimed(epoch, msg.sender, asset, amount, paid);
    }

    struct ClaimArgs {
        uint256 epoch;
        address asset;
        uint256 amount;
        bytes32[] proof;
    }

    function claimMany(ClaimArgs[] calldata claims) external {
        for (uint256 i; i < claims.length; i++) {
            claim(claims[i].epoch, claims[i].asset, claims[i].amount, claims[i].proof);
        }
    }
}
