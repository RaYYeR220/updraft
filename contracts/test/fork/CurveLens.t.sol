// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ForkBase, IMockMintable} from "./ForkBase.sol";
import {IAscendLaunchpad} from "../../src/interfaces/IAscendLaunchpad.sol";
import {CurveLens} from "../../src/lens/CurveLens.sol";

contract CurveLensForkTest is ForkBase {
    /// @dev The lens must reproduce Ascend's atomic dev-buy to the wei, in both token orderings.
    function test_preview_equalsActualDevBuy_fuzzOverSizes() public {
        uint256[5] memory sizes = [uint256(1e6), 37e6, 1_000e6, 5_000e6, 45_000e6];
        bool sawToken0;
        bool sawToken1;
        uint256 salt;

        for (uint256 i; i < sizes.length; i++) {
            // Two launches per size with fresh salts; most sizes end up covering both orderings.
            for (uint256 k; k < 2; k++) {
                address payer = makeAddr(string.concat("payer", vm.toString(salt)));
                _mintUsdc(payer, sizes[i]);
                (, bytes32 poolId, uint256 devOut) = _launchRaw(payer, payer, bytes32(++salt), sizes[i]);
                bool tokenIs0 = launchpad.poolTokenIs0(poolId);
                (uint256 tokensOut, uint256 quoteSpent) = CurveLens.preview(launchpad, USDC, tokenIs0, sizes[i]);

                assertEq(tokensOut, devOut, "tokens out matches the live dev-buy");
                assertEq(quoteSpent, sizes[i], "the whole dev-buy is spent");
                if (tokenIs0) sawToken0 = true;
                else sawToken1 = true;
            }
        }
        assertTrue(sawToken0 && sawToken1, "both token orderings exercised");
    }

    function test_preview_equalsActualDevBuy_rwaQuote() public {
        address payer = makeAddr("rwa-payer");
        uint256 amount = 3e18;
        IMockMintable(MNVDAX).mint(payer, amount);
        vm.startPrank(payer);
        (bool ok,) = MNVDAX.call(abi.encodeWithSignature("approve(address,uint256)", LAUNCHPAD, amount));
        assertTrue(ok);
        (address token, bytes32 poolId) = launchpad.launch(
            IAscendLaunchpad.LaunchParams({
                name: "Probe RWA",
                symbol: "PRBR",
                quote: MNVDAX,
                devBuyQuote: amount,
                minDevOut: 0,
                salt: bytes32(uint256(7)),
                creator: payer
            })
        );
        vm.stopPrank();

        (uint256 tokensOut,) = CurveLens.preview(launchpad, MNVDAX, launchpad.poolTokenIs0(poolId), amount);
        (bool ok2, bytes memory bal) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", payer));
        assertTrue(ok2);
        assertEq(tokensOut, abi.decode(bal, (uint256)), "rwa-quoted dev-buy matches");
    }
}
