// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAscendLaunchpad} from "../interfaces/IAscendLaunchpad.sol";
import {CurveMath} from "./CurveMath.sol";

/// @notice Simulates Ascend's atomic dev-buy on a fresh launch pool.
/// @dev A fresh pool holds only the launchpad's seed: 100% of supply, single-sided, in the
/// curve's bands, priced one tick spacing outside the first band. The dev-buy is an exact-input
/// swap with zero fee and no price limit but the curve's end. This walks the same steps the pool
/// manager takes (next initialized tick within one bitmap word), so rounding matches to the wei.
library CurveLens {
    int24 internal constant TICK_SPACING = 200;
    uint256 internal constant TOTAL_SUPPLY = 1_000_000_000e18;

    struct Walk {
        int24[] ticks; // initialized ticks in pool space, compressed (tick / spacing), ascending
        int256[] net; // liquidity added when crossing each tick upward
    }

    struct State {
        uint160 sqrtP;
        int24 tick;
        uint128 liquidity;
        uint256 remaining;
        uint256 tokensOut;
    }

    function preview(IAscendLaunchpad lp, address quoteToken, bool tokenIs0, uint256 quoteIn)
        internal
        view
        returns (uint256 tokensOut, uint256 quoteSpent)
    {
        return quote(lp.curve(), lp.quoteConfig(quoteToken).startTick, tokenIs0, quoteIn);
    }

    function capacity(IAscendLaunchpad lp, address quoteToken, bool tokenIs0) internal view returns (uint256) {
        return capacityOf(lp.curve(), lp.quoteConfig(quoteToken).startTick, tokenIs0);
    }

    /// @dev Fingerprint of everything the preview depends on, snapshotted when a round is created.
    function curveHash(IAscendLaunchpad lp, address quoteToken) internal view returns (bytes32) {
        return keccak256(abi.encode(lp.curve(), lp.quoteConfig(quoteToken).startTick));
    }

    /// @notice Quote needed to buy out the whole curve.
    function capacityOf(IAscendLaunchpad.CurveStep[] memory steps, int24 startTick, bool tokenIs0)
        internal
        pure
        returns (uint256 spent)
    {
        (, spent,) = _walk(steps, startTick, tokenIs0, type(uint128).max);
    }

    function quote(IAscendLaunchpad.CurveStep[] memory steps, int24 startTick, bool tokenIs0, uint256 quoteIn)
        internal
        pure
        returns (uint256 tokensOut, uint256 quoteSpent)
    {
        if (quoteIn == 0) return (0, 0);
        (tokensOut, quoteSpent,) = _walk(steps, startTick, tokenIs0, quoteIn);
    }

    /// @notice The pool price right after a dev-buy of `quoteIn`: where the next buyer starts.
    function priceAfter(IAscendLaunchpad.CurveStep[] memory steps, int24 startTick, bool tokenIs0, uint256 quoteIn)
        internal
        pure
        returns (uint160 sqrtPriceX96)
    {
        (,, sqrtPriceX96) = _walk(steps, startTick, tokenIs0, quoteIn);
    }

    function _walk(IAscendLaunchpad.CurveStep[] memory steps, int24 startTick, bool tokenIs0, uint256 quoteIn)
        private
        pure
        returns (uint256 tokensOut, uint256 quoteSpent, uint160 sqrtP)
    {
        Walk memory w = _seed(steps, startTick, tokenIs0);
        // Buying the token: token is currency0 -> pay currency1, price rises (zeroForOne = false).
        bool zeroForOne = !tokenIs0;
        uint160 limit = zeroForOne ? CurveMath.MIN_SQRT_PRICE + 1 : CurveMath.MAX_SQRT_PRICE - 1;
        State memory st;
        st.tick = tokenIs0 ? startTick - TICK_SPACING : -startTick + TICK_SPACING;
        st.sqrtP = CurveMath.sqrtPriceAtTick(st.tick);
        st.remaining = quoteIn;

        while (st.remaining != 0 && st.sqrtP != limit) {
            _step(w, st, zeroForOne, limit);
        }
        return (st.tokensOut, quoteIn - st.remaining, st.sqrtP);
    }

    function _step(Walk memory w, State memory st, bool zeroForOne, uint160 limit) private pure {
        (int24 tickNext, bool initialized, uint256 idx) = _nextInitialized(w, st.tick, zeroForOne);
        if (tickNext < CurveMath.MIN_TICK) tickNext = CurveMath.MIN_TICK;
        else if (tickNext > CurveMath.MAX_TICK) tickNext = CurveMath.MAX_TICK;
        uint160 sqrtNext = CurveMath.sqrtPriceAtTick(tickNext);
        uint160 target = zeroForOne ? (sqrtNext < limit ? limit : sqrtNext) : (sqrtNext > limit ? limit : sqrtNext);

        uint256 amountIn = zeroForOne
            ? CurveMath.amount0Delta(target, st.sqrtP, st.liquidity, true)
            : CurveMath.amount1Delta(st.sqrtP, target, st.liquidity, true);
        uint160 newSqrt;
        if (st.remaining >= amountIn) {
            newSqrt = target;
            st.remaining -= amountIn;
        } else {
            newSqrt = CurveMath.nextSqrtPriceFromInput(st.sqrtP, st.liquidity, st.remaining, zeroForOne);
            // The pool keeps the unspendable remainder of an unfinished step as fee.
            st.remaining = 0;
        }
        st.tokensOut += zeroForOne
            ? CurveMath.amount1Delta(newSqrt, st.sqrtP, st.liquidity, false)
            : CurveMath.amount0Delta(st.sqrtP, newSqrt, st.liquidity, false);

        if (newSqrt == sqrtNext) {
            if (initialized) {
                int256 net = zeroForOne ? -w.net[idx] : w.net[idx];
                st.liquidity = uint128(uint256(int256(uint256(st.liquidity)) + net));
            }
            st.tick = zeroForOne ? tickNext - 1 : tickNext;
        }
        st.sqrtP = newSqrt;
    }

    /// @dev Pool-space bands and their liquidity, exactly as the launchpad seeds them.
    function _seed(IAscendLaunchpad.CurveStep[] memory steps, int24 startTick, bool tokenIs0)
        private
        pure
        returns (Walk memory w)
    {
        uint256 n = steps.length;
        w.ticks = new int24[](2 * n);
        w.net = new int256[](2 * n);
        uint256 len;
        for (uint256 i; i < n; i++) {
            int24 lo = startTick + steps[i].offsetLower;
            int24 up = startTick + steps[i].offsetUpper;
            if (!tokenIs0) (lo, up) = (-up, -lo);
            uint256 amount = (TOTAL_SUPPLY * steps[i].bps) / 10_000;
            uint128 liq = tokenIs0
                ? CurveMath.liquidityForAmount0(CurveMath.sqrtPriceAtTick(lo), CurveMath.sqrtPriceAtTick(up), amount)
                : CurveMath.liquidityForAmount1(CurveMath.sqrtPriceAtTick(lo), CurveMath.sqrtPriceAtTick(up), amount);
            len = _insert(w, len, lo / TICK_SPACING, int256(uint256(liq)));
            len = _insert(w, len, up / TICK_SPACING, -int256(uint256(liq)));
        }
        int24[] memory ticks = w.ticks;
        int256[] memory net = w.net;
        assembly ("memory-safe") {
            mstore(ticks, len)
            mstore(net, len)
        }
    }

    /// @dev Sorted insert that merges shared band edges (band edges are multiples of the spacing).
    function _insert(Walk memory w, uint256 len, int24 c, int256 net) private pure returns (uint256) {
        uint256 j;
        while (j < len && w.ticks[j] < c) j++;
        if (j < len && w.ticks[j] == c) {
            w.net[j] += net;
            return len;
        }
        for (uint256 k = len; k > j; k--) {
            w.ticks[k] = w.ticks[k - 1];
            w.net[k] = w.net[k - 1];
        }
        w.ticks[j] = c;
        w.net[j] = net;
        return len + 1;
    }

    /// @dev Mirrors the pool's bitmap search: the next initialized tick within the current
    /// 256-spacing word, or the word's edge when there is none.
    function _nextInitialized(Walk memory w, int24 tick, bool lte)
        private
        pure
        returns (int24 next, bool initialized, uint256 idx)
    {
        int24 compressed = tick / TICK_SPACING;
        if (tick < 0 && tick % TICK_SPACING != 0) compressed--;

        if (lte) {
            int24 wordPos = compressed >> 8;
            uint8 bitPos = uint8(uint24(compressed) & 0xff);
            for (uint256 i = w.ticks.length; i > 0; i--) {
                int24 c = w.ticks[i - 1];
                if (c <= compressed && (c >> 8) == wordPos) return (c * TICK_SPACING, true, i - 1);
                if (c < compressed && (c >> 8) < wordPos) break;
            }
            return ((compressed - int24(uint24(bitPos))) * TICK_SPACING, false, 0);
        }

        compressed++;
        int24 word = compressed >> 8;
        uint8 bit = uint8(uint24(compressed) & 0xff);
        for (uint256 i; i < w.ticks.length; i++) {
            int24 c = w.ticks[i];
            if (c >= compressed && (c >> 8) == word) return (c * TICK_SPACING, true, i);
            if ((c >> 8) > word) break;
        }
        return ((compressed + int24(uint24(255 - bit))) * TICK_SPACING, false, 0);
    }
}
