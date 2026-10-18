// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {FixedPointMathLib as FPM} from "solady/utils/FixedPointMathLib.sol";

/// @notice Concentrated-liquidity price math, rounding-identical to the pool manager Ascend
/// launches on, so a dev-buy can be simulated to the wei before the pool exists.
library CurveMath {
    uint256 internal constant Q96 = 0x1000000000000000000000000;
    int24 internal constant MIN_TICK = -887_272;
    int24 internal constant MAX_TICK = 887_272;
    uint160 internal constant MIN_SQRT_PRICE = 4_295_128_739;
    uint160 internal constant MAX_SQRT_PRICE = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342;

    error TickOutOfRange();
    error PriceOverflow();

    /// @dev sqrt(1.0001^tick) as Q64.96, rounded up — the standard bit-decomposition.
    function sqrtPriceAtTick(int24 tick) internal pure returns (uint160) {
        uint256 absTick = tick < 0 ? uint256(-int256(tick)) : uint256(int256(tick));
        if (absTick > uint256(int256(MAX_TICK))) revert TickOutOfRange();

        uint256 price = absTick & 0x1 != 0 ? 0xfffcb933bd6fad37aa2d162d1a594001 : 0x100000000000000000000000000000000;
        unchecked {
            if (absTick & 0x2 != 0) price = (price * 0xfff97272373d413259a46990580e213a) >> 128;
            if (absTick & 0x4 != 0) price = (price * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
            if (absTick & 0x8 != 0) price = (price * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
            if (absTick & 0x10 != 0) price = (price * 0xffcb9843d60f6159c9db58835c926644) >> 128;
            if (absTick & 0x20 != 0) price = (price * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
            if (absTick & 0x40 != 0) price = (price * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
            if (absTick & 0x80 != 0) price = (price * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
            if (absTick & 0x100 != 0) price = (price * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
            if (absTick & 0x200 != 0) price = (price * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
            if (absTick & 0x400 != 0) price = (price * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
            if (absTick & 0x800 != 0) price = (price * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
            if (absTick & 0x1000 != 0) price = (price * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
            if (absTick & 0x2000 != 0) price = (price * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
            if (absTick & 0x4000 != 0) price = (price * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
            if (absTick & 0x8000 != 0) price = (price * 0x31be135f97d08fd981231505542fcfa6) >> 128;
            if (absTick & 0x10000 != 0) price = (price * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
            if (absTick & 0x20000 != 0) price = (price * 0x5d6af8dedb81196699c329225ee604) >> 128;
            if (absTick & 0x40000 != 0) price = (price * 0x2216e584f5fa1ea926041bedfe98) >> 128;
            if (absTick & 0x80000 != 0) price = (price * 0x48a170391f7dc42444e8fa2) >> 128;

            if (tick > 0) price = type(uint256).max / price;
            // Q128.128 → Q64.96, rounding up.
            return uint160((price + type(uint32).max) >> 32);
        }
    }

    function amount0Delta(uint160 sqrtA, uint160 sqrtB, uint128 liquidity, bool roundUp)
        internal
        pure
        returns (uint256)
    {
        if (sqrtA > sqrtB) (sqrtA, sqrtB) = (sqrtB, sqrtA);
        uint256 numerator1 = uint256(liquidity) << 96;
        uint256 numerator2 = sqrtB - sqrtA;
        return roundUp
            ? FPM.divUp(FPM.fullMulDivUp(numerator1, numerator2, sqrtB), sqrtA)
            : FPM.fullMulDiv(numerator1, numerator2, sqrtB) / sqrtA;
    }

    function amount1Delta(uint160 sqrtA, uint160 sqrtB, uint128 liquidity, bool roundUp)
        internal
        pure
        returns (uint256)
    {
        uint256 diff = sqrtA > sqrtB ? sqrtA - sqrtB : sqrtB - sqrtA;
        return roundUp ? FPM.fullMulDivUp(liquidity, diff, Q96) : FPM.fullMulDiv(liquidity, diff, Q96);
    }

    /// @dev The price reached after adding `amountIn` (exact input). zeroForOne adds currency0.
    function nextSqrtPriceFromInput(uint160 sqrtP, uint128 liquidity, uint256 amountIn, bool zeroForOne)
        internal
        pure
        returns (uint160)
    {
        if (amountIn == 0) return sqrtP;
        if (zeroForOne) {
            uint256 numerator1 = uint256(liquidity) << 96;
            unchecked {
                uint256 product = amountIn * sqrtP;
                if (product / amountIn == sqrtP) {
                    uint256 denominator = numerator1 + product;
                    if (denominator >= numerator1) return uint160(FPM.fullMulDivUp(numerator1, sqrtP, denominator));
                }
            }
            return uint160(FPM.divUp(numerator1, (numerator1 / sqrtP) + amountIn));
        }
        uint256 quotient =
            amountIn <= type(uint160).max ? (amountIn << 96) / liquidity : FPM.fullMulDiv(amountIn, Q96, liquidity);
        uint256 next = uint256(sqrtP) + quotient;
        if (next > type(uint160).max) revert PriceOverflow();
        return uint160(next);
    }

    function liquidityForAmount0(uint160 sqrtA, uint160 sqrtB, uint256 amount0) internal pure returns (uint128) {
        if (sqrtA > sqrtB) (sqrtA, sqrtB) = (sqrtB, sqrtA);
        uint256 intermediate = FPM.fullMulDiv(sqrtA, sqrtB, Q96);
        return _toUint128(FPM.fullMulDiv(amount0, intermediate, sqrtB - sqrtA));
    }

    function liquidityForAmount1(uint160 sqrtA, uint160 sqrtB, uint256 amount1) internal pure returns (uint128) {
        if (sqrtA > sqrtB) (sqrtA, sqrtB) = (sqrtB, sqrtA);
        return _toUint128(FPM.fullMulDiv(amount1, Q96, sqrtB - sqrtA));
    }

    function _toUint128(uint256 x) private pure returns (uint128) {
        if (x > type(uint128).max) revert PriceOverflow();
        return uint128(x);
    }
}
