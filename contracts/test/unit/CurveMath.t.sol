// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IAscendLaunchpad} from "../../src/interfaces/IAscendLaunchpad.sol";
import {CurveLens} from "../../src/lens/CurveLens.sol";
import {LiveCurve} from "../utils/LiveCurve.sol";

contract CurveMathTest is Test {
    int24 internal constant USDC_START = -393_800;

    function _steps() internal pure returns (IAscendLaunchpad.CurveStep[] memory) {
        return LiveCurve.steps();
    }

    function testFuzz_preview_isMonotonic(uint256 a, uint256 b, bool tokenIs0) public pure {
        a = bound(a, 1, 2_000_000e6);
        b = bound(b, a, 2_000_000e6);
        (uint256 outA,) = CurveLens.quote(_steps(), USDC_START, tokenIs0, a);
        (uint256 outB,) = CurveLens.quote(_steps(), USDC_START, tokenIs0, b);
        assertLe(outA, outB, "more quote never buys fewer tokens");
    }

    function test_capacity_buysWholeCurve() public pure {
        for (uint256 o; o < 2; o++) {
            bool tokenIs0 = o == 0;
            uint256 cap = CurveLens.capacityOf(_steps(), USDC_START, tokenIs0);
            (uint256 outAtCap, uint256 spentAtCap) = CurveLens.quote(_steps(), USDC_START, tokenIs0, cap);
            (uint256 outOver, uint256 spentOver) = CurveLens.quote(_steps(), USDC_START, tokenIs0, cap + 1e6);

            assertEq(spentAtCap, cap, "capacity is fully spent");
            assertEq(spentOver, cap, "nothing beyond the curve is spent");
            assertEq(outOver, outAtCap, "the curve end caps the output");
            assertGt(outAtCap, 999_999_999e18, "almost the whole supply is bought");
            assertLe(outAtCap, 1_000_000_000e18, "never more than the supply");
        }
    }

    function test_preview_zero_isZero() public pure {
        (uint256 out, uint256 spent) = CurveLens.quote(_steps(), USDC_START, true, 0);
        assertEq(out, 0);
        assertEq(spent, 0);
    }
}
