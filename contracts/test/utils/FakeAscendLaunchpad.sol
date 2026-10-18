// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAscendLaunchpad} from "../../src/interfaces/IAscendLaunchpad.sol";
import {CurveLens} from "../../src/lens/CurveLens.sol";
import {ASCEND_TOKEN_CREATION_CODE} from "../../src/ascend/AscendTokenCode.sol";
import {LiveCurve} from "./LiveCurve.sol";

interface IERC20Min {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

/// @notice In-memory stand-in for Ascend's launchpad, for fast unit tests. It deploys the real
/// AscendToken bytecode at the same CREATE2 address and fills the dev-buy with the curve lens;
/// fee accrual is test-driven through setOwed. Fork tests cover the real contract.
contract FakeAscendLaunchpad {
    error LaunchesArePaused();
    error QuoteNotAllowed();
    error ZeroCreator();
    error UnknownPool();
    error Unauthorized();
    error DevBuySlippage();
    error FrozenQuote();

    struct Pool {
        address token;
        address quote;
        address creator;
        bool tokenIs0;
        uint40 launchedAt;
    }

    address public owner;
    bool public paused;
    FakeListingDesk public immutable desk;
    IAscendLaunchpad.CurveStep[] internal _curve;
    mapping(address => IAscendLaunchpad.QuoteConfig) internal _quote;
    mapping(bytes32 => Pool) public pools;
    mapping(bytes32 => address) public pendingCreator;
    mapping(bytes32 => uint256) public creatorOwedToken;
    mapping(bytes32 => uint256) public creatorOwedQuote;
    mapping(bytes32 => uint256) public bidInventory;
    bool public quoteClaimReverts;
    bool public launchReverts;
    mapping(bytes32 => uint256) public listingOwed;

    event Launched(
        bytes32 indexed poolId,
        address indexed token,
        address indexed creator,
        address quote,
        uint256 supplySeeded,
        uint256 devBuyTokens
    );

    constructor(address owner_) {
        owner = owner_;
        desk = new FakeListingDesk(this);
        _setCurve(LiveCurve.steps());
    }

    // ------------------------------------------------------------ test controls
    function setPaused(bool p) external {
        paused = p;
    }

    function setQuoteConfig(address quote, bool allowed, int24 startTick, uint128 maxClip) external {
        _quote[quote] = IAscendLaunchpad.QuoteConfig(allowed, startTick, maxClip);
    }

    function setCurve(IAscendLaunchpad.CurveStep[] memory steps) external {
        _setCurve(steps);
    }

    function setOwed(bytes32 poolId, uint256 tokenAmt, uint256 quoteAmt) external {
        creatorOwedToken[poolId] += tokenAmt;
        creatorOwedQuote[poolId] += quoteAmt;
    }

    function setQuoteClaimReverts(bool v) external {
        quoteClaimReverts = v;
    }

    function setOwner(address o) external {
        owner = o;
    }

    function setLaunchReverts(bool v) external {
        launchReverts = v;
    }

    /// @dev Models Ascend's listing set-aside: funds the desk can pay to the creator role.
    function setListingOwed(bytes32 poolId, uint256 amount) external {
        listingOwed[poolId] = amount;
    }

    function takeListing(bytes32 poolId, address to, uint256 amount) external {
        require(msg.sender == address(desk), "desk only");
        listingOwed[poolId] -= amount;
        IERC20Min(pools[poolId].quote).transfer(to, amount);
    }

    function listingElection(bytes32 poolId) external view returns (uint256) {
        return desk.enrolledCapOf(poolId);
    }

    // ------------------------------------------------------------ launch
    function launch(IAscendLaunchpad.LaunchParams calldata p) external returns (address token, bytes32 poolId) {
        if (paused) revert LaunchesArePaused();
        require(!launchReverts, "launch reverts");
        if (p.creator == address(0)) revert ZeroCreator();
        IAscendLaunchpad.QuoteConfig memory qc = _quote[p.quote];
        if (!qc.allowed) revert QuoteNotAllowed();

        bytes memory init = abi.encodePacked(ASCEND_TOKEN_CREATION_CODE, abi.encode(p.name, p.symbol, 1e27));
        bytes32 salt = keccak256(abi.encode(msg.sender, p.salt));
        assembly ("memory-safe") {
            token := create2(0, add(init, 0x20), mload(init), salt)
        }
        require(token != address(0), "create2");
        poolId = keccak256(abi.encode(token, p.quote));
        bool tokenIs0 = token < p.quote;
        pools[poolId] = Pool(token, p.quote, p.creator, tokenIs0, uint40(block.timestamp));

        uint256 out;
        uint256 spent;
        if (p.devBuyQuote > 0) {
            IERC20Min(p.quote).transferFrom(msg.sender, address(this), p.devBuyQuote);
            (out, spent) = CurveLens.quote(_curve, qc.startTick, tokenIs0, p.devBuyQuote);
            IERC20Min(token).transfer(p.creator, out);
        }
        if (out < p.minDevOut) revert DevBuySlippage();
        emit Launched(poolId, token, p.creator, p.quote, 1e27 - out, out);
        if (p.devBuyQuote > spent) IERC20Min(p.quote).transfer(msg.sender, p.devBuyQuote - spent);
    }

    // ------------------------------------------------------------ fees and bid
    function fundBid(bytes32 poolId, uint256 amount) external {
        Pool storage pool = pools[poolId];
        if (pool.launchedAt == 0) revert UnknownPool();
        IERC20Min(pool.quote).transferFrom(msg.sender, address(this), amount);
        bidInventory[poolId] += amount;
    }

    function collect(bytes32) external pure returns (uint256) {
        return 0;
    }

    function claim(bytes32 poolId) external {
        _claimToken(poolId);
        _claimQuote(poolId);
    }

    function claimToken(bytes32 poolId) external {
        _claimToken(poolId);
    }

    function claimQuote(bytes32 poolId) external {
        _claimQuote(poolId);
    }

    function _claimToken(bytes32 poolId) internal {
        Pool storage pool = pools[poolId];
        uint256 t = creatorOwedToken[poolId];
        creatorOwedToken[poolId] = 0;
        if (t > 0) IERC20Min(pool.token).transfer(pool.creator, t);
    }

    function _claimQuote(bytes32 poolId) internal {
        if (quoteClaimReverts) revert FrozenQuote();
        Pool storage pool = pools[poolId];
        uint256 q = creatorOwedQuote[poolId];
        creatorOwedQuote[poolId] = 0;
        if (q > 0) IERC20Min(pool.quote).transfer(pool.creator, q);
    }

    // ------------------------------------------------------------ creator role
    function transferCreator(bytes32 poolId, address next) external {
        if (msg.sender != pools[poolId].creator) revert Unauthorized();
        pendingCreator[poolId] = next;
    }

    function acceptCreator(bytes32 poolId) external {
        if (msg.sender != pendingCreator[poolId]) revert Unauthorized();
        pools[poolId].creator = msg.sender;
        delete pendingCreator[poolId];
    }

    // ------------------------------------------------------------ views
    function curve() external view returns (IAscendLaunchpad.CurveStep[] memory) {
        return _curve;
    }

    function quoteConfig(address quote) external view returns (IAscendLaunchpad.QuoteConfig memory) {
        return _quote[quote];
    }

    function listingDesk() external view returns (address) {
        return address(desk);
    }

    function poolCreator(bytes32 poolId) external view returns (address) {
        return pools[poolId].creator;
    }

    function poolTokenIs0(bytes32 poolId) external view returns (bool) {
        return pools[poolId].tokenIs0;
    }

    function poolLaunchedAt(bytes32 poolId) external view returns (uint40) {
        return pools[poolId].launchedAt;
    }

    function currentFee(bytes32 poolId) external view returns (uint24) {
        return block.timestamp - pools[poolId].launchedAt < 5 ? 900_000 : 10_000;
    }

    function emaSqrtPrice(bytes32) external pure returns (uint160) {
        return 0;
    }

    function _setCurve(IAscendLaunchpad.CurveStep[] memory steps) internal {
        delete _curve;
        for (uint256 i; i < steps.length; i++) {
            _curve.push(steps[i]);
        }
    }
}

/// @notice Records listing enrollments the way Ascend's desk gates them: creator role only,
/// cap within uint88; closing stops the election and lets the role withdraw the set-aside.
contract FakeListingDesk {
    struct Pool {
        address token;
        uint40 committedUntil;
        uint40 listedAt;
        uint32 coreIndex;
        uint32 spotIndex;
        uint256 locked;
    }

    FakeAscendLaunchpad public immutable launchpad;
    mapping(address => uint256) public enrolledCap;
    mapping(bytes32 => uint256) public enrolledCapOf;
    bool public refuseAll;

    error Refused();

    constructor(FakeAscendLaunchpad lp) {
        launchpad = lp;
    }

    function setRefuseAll(bool v) external {
        refuseAll = v;
    }

    function enroll(address token, address quote, uint256 cap) external {
        bytes32 poolId = keccak256(abi.encode(token, quote));
        if (refuseAll || msg.sender != launchpad.poolCreator(poolId) || cap == 0 || cap > type(uint88).max) {
            revert Refused();
        }
        enrolledCap[token] = cap;
        enrolledCapOf[poolId] = cap;
    }

    function close(bytes32 poolId) external {
        if (enrolledCapOf[poolId] == 0 || msg.sender != launchpad.poolCreator(poolId)) revert Refused();
        enrolledCapOf[poolId] = 0;
    }

    function withdraw(bytes32 poolId, uint256 amount) external {
        if (enrolledCapOf[poolId] != 0 || amount == 0 || amount > launchpad.listingOwed(poolId)) revert Refused();
        launchpad.takeListing(poolId, launchpad.poolCreator(poolId), amount);
    }

    function pool(bytes32) external pure returns (Pool memory p) {
        return p;
    }
}
