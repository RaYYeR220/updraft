// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MockERC20} from "solmate/test/utils/mocks/MockERC20.sol";

/// @notice Models Ascend's testnet quote: 6 decimals, EIP-2612, public mint, and a public
/// burn(from, amount) that lets anyone destroy anyone's balance.
contract BurnableUsdc is MockERC20 {
    constructor() MockERC20("Mock USDC", "USDC", 6) {}
}
