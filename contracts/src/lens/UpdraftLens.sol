// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAscendLaunchpad} from "../interfaces/IAscendLaunchpad.sol";
import {CurveLens} from "./CurveLens.sol";

/// @notice Read-only curve simulations for apps: what a batch of `quoteIn` buys on a fresh
/// Ascend launch, the quote that buys out the curve, and where the price lands afterwards.
contract UpdraftLens {
    function preview(address launchpad, address quote, bool tokenIs0, uint256 quoteIn)
        external
        view
        returns (uint256 tokensOut, uint256 quoteSpent)
    {
        return CurveLens.preview(IAscendLaunchpad(launchpad), quote, tokenIs0, quoteIn);
    }

    function capacity(address launchpad, address quote, bool tokenIs0) external view returns (uint256) {
        return CurveLens.capacity(IAscendLaunchpad(launchpad), quote, tokenIs0);
    }

    /// @notice Pool sqrt price (Q64.96, pool orientation) after a dev-buy of `quoteIn`.
    function priceAfter(address launchpad, address quote, bool tokenIs0, uint256 quoteIn)
        external
        view
        returns (uint160)
    {
        IAscendLaunchpad lp = IAscendLaunchpad(launchpad);
        return CurveLens.priceAfter(lp.curve(), lp.quoteConfig(quote).startTick, tokenIs0, quoteIn);
    }
}
