// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ForkBase} from "./ForkBase.sol";
import {TokenAddress} from "../../src/libraries/TokenAddress.sol";
import {ASCEND_TOKEN_CREATION_CODE} from "../../src/ascend/AscendTokenCode.sol";

contract TokenAddressForkTest is ForkBase {
    function test_predict_matchesLiveLaunch() public {
        address payer = makeAddr("predict-payer");
        bytes32 salt = bytes32(uint256(0x01));
        address predicted =
            TokenAddress.predict(LAUNCHPAD, payer, salt, ASCEND_TOKEN_CREATION_CODE, "Probe", "PRB");

        (address token,,) = _launchRaw(payer, payer, salt, 0);

        assertEq(token, predicted, "predicted before launch");
    }

    function test_predict_dependsOnSender() public pure {
        bytes32 salt = bytes32(uint256(0x01));
        address a = TokenAddress.predict(LAUNCHPAD, address(1), salt, ASCEND_TOKEN_CREATION_CODE, "Probe", "PRB");
        address b = TokenAddress.predict(LAUNCHPAD, address(2), salt, ASCEND_TOKEN_CREATION_CODE, "Probe", "PRB");
        assertTrue(a != b, "nobody can squat a round's token address");
    }
}
