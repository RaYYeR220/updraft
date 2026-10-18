// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

struct PoolKeyLike {
    address currency0;
    address currency1;
    address hooks;
    address poolManager;
    uint24 fee;
    bytes32 parameters;
}

struct SwapParamsLike {
    bool zeroForOne;
    int256 amountSpecified;
    uint160 sqrtPriceLimitX96;
}

interface IInfinityVault {
    function lock(bytes calldata data) external returns (bytes memory);
    function take(address currency, address to, uint256 amount) external;
    function sync(address currency) external;
    function settle() external payable returns (uint256);
}

interface ICLPoolManagerLike {
    function swap(PoolKeyLike memory key, SwapParamsLike memory params, bytes calldata hookData)
        external
        returns (int256 delta);
}

interface IERC20S {
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

/// @notice Buys and sells Ascend launch tokens straight through the pool manager, the way any
/// trader or bot would. Used by the fork suite and the demo scripts (e.g. a T+0 sniper).
contract AscendSwapper {
    uint24 internal constant DYNAMIC_FEE_FLAG = 0x800000;
    bytes32 internal constant POOL_PARAMETERS = bytes32(uint256(0x0445) | (uint256(uint24(200)) << 16));
    uint160 internal constant MIN_SQRT = 4_295_128_739 + 1;
    uint160 internal constant MAX_SQRT = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342 - 1;

    IInfinityVault public immutable vault;
    address public immutable poolManager;
    address public immutable launchpad;

    constructor(address vault_, address poolManager_, address launchpad_) {
        vault = IInfinityVault(vault_);
        poolManager = poolManager_;
        launchpad = launchpad_;
    }

    /// @notice Exact-input buy of `token` with `quoteIn`; tokens go to `to`.
    function buy(address token, address quote, uint256 quoteIn, address to) external returns (uint256 out) {
        IERC20S(quote).transferFrom(msg.sender, address(this), quoteIn);
        out = abi.decode(vault.lock(abi.encode(true, token, quote, quoteIn, to)), (uint256));
    }

    /// @notice Exact-input sell of `tokenIn` of `token`; quote goes to `to`.
    function sell(address token, address quote, uint256 tokenIn, address to) external returns (uint256 out) {
        IERC20S(token).transferFrom(msg.sender, address(this), tokenIn);
        out = abi.decode(vault.lock(abi.encode(false, token, quote, tokenIn, to)), (uint256));
    }

    function lockAcquired(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(vault), "vault only");
        (bool isBuy, address token, address quote, uint256 amountIn, address to) =
            abi.decode(data, (bool, address, address, uint256, address));
        bool tokenIs0 = token < quote;
        address inCurrency = isBuy ? quote : token;
        address outCurrency = isBuy ? token : quote;
        bool zeroForOne = inCurrency == (tokenIs0 ? token : quote);

        int256 delta = ICLPoolManagerLike(poolManager).swap(
            PoolKeyLike({
                currency0: tokenIs0 ? token : quote,
                currency1: tokenIs0 ? quote : token,
                hooks: launchpad,
                poolManager: poolManager,
                fee: DYNAMIC_FEE_FLAG,
                parameters: POOL_PARAMETERS
            }),
            SwapParamsLike({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(amountIn),
                sqrtPriceLimitX96: zeroForOne ? MIN_SQRT : MAX_SQRT
            }),
            ""
        );
        int128 a0 = int128(delta >> 128);
        int128 a1 = int128(delta);
        (int128 inDelta, int128 outDelta) = zeroForOne ? (a0, a1) : (a1, a0);
        uint256 out = uint256(uint128(outDelta));
        uint256 paid = uint256(uint128(-inDelta));
        if (out > 0) vault.take(outCurrency, to, out);
        vault.sync(inCurrency);
        IERC20S(inCurrency).transfer(address(vault), paid);
        vault.settle();
        // Return what was not spent.
        if (amountIn > paid) IERC20S(inCurrency).transfer(to, amountIn - paid);
        return abi.encode(out);
    }
}
