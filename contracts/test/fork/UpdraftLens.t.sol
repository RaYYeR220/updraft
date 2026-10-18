// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ForkBase} from "./ForkBase.sol";
import {CurveLens} from "../../src/lens/CurveLens.sol";
import {UpdraftLens} from "../../src/lens/UpdraftLens.sol";

contract UpdraftLensForkTest is ForkBase {
    function test_lens_exposesPreviewCapacityAndPrice() public {
        UpdraftLens lens = new UpdraftLens();
        (uint256 out, uint256 spent) = lens.preview(LAUNCHPAD, USDC, true, 5_000e6);
        (uint256 libOut, uint256 libSpent) = CurveLens.preview(launchpad, USDC, true, 5_000e6);
        assertEq(out, libOut);
        assertEq(spent, libSpent);
        assertEq(lens.capacity(LAUNCHPAD, USDC, false), CurveLens.capacity(launchpad, USDC, false));

        uint160 before = lens.priceAfter(LAUNCHPAD, USDC, true, 0);
        uint160 afterBuy = lens.priceAfter(LAUNCHPAD, USDC, true, 5_000e6);
        assertGt(afterBuy, before, "buying token0 raises its price");
    }
}
