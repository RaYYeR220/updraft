// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IAscendLaunchpad} from "../../src/interfaces/IAscendLaunchpad.sol";

/// @notice Ascend's live launch curve on Elysium testnet (AscendLaunchpad 0x6d01…bF3d), read 2026-10-18.
library LiveCurve {
    function steps() internal pure returns (IAscendLaunchpad.CurveStep[] memory s) {
        s = new IAscendLaunchpad.CurveStep[](15);
        s[0] = IAscendLaunchpad.CurveStep(0, 19_400, 3519);
        s[1] = IAscendLaunchpad.CurveStep(19_400, 20_600, 146);
        s[2] = IAscendLaunchpad.CurveStep(20_600, 21_800, 160);
        s[3] = IAscendLaunchpad.CurveStep(21_800, 23_000, 175);
        s[4] = IAscendLaunchpad.CurveStep(23_000, 40_000, 1888);
        s[5] = IAscendLaunchpad.CurveStep(40_000, 41_200, 97);
        s[6] = IAscendLaunchpad.CurveStep(41_200, 42_400, 108);
        s[7] = IAscendLaunchpad.CurveStep(42_400, 43_600, 121);
        s[8] = IAscendLaunchpad.CurveStep(43_600, 44_800, 135);
        s[9] = IAscendLaunchpad.CurveStep(44_800, 46_000, 151);
        s[10] = IAscendLaunchpad.CurveStep(46_000, 66_600, 1853);
        s[11] = IAscendLaunchpad.CurveStep(66_600, 67_800, 70);
        s[12] = IAscendLaunchpad.CurveStep(67_800, 69_000, 77);
        s[13] = IAscendLaunchpad.CurveStep(69_000, 92_000, 1000);
        s[14] = IAscendLaunchpad.CurveStep(92_000, 200_000, 500);
    }
}
