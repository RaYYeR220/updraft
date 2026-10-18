// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Where Ascend will deploy a launch token, known before the launch happens.
/// @dev Ascend creates the token with CREATE2, salted by keccak(abi.encode(sender, salt)), so the
/// address depends on who calls launch(): a round's token address is fixed by the round itself.
library TokenAddress {
    uint256 internal constant TOTAL_SUPPLY = 1_000_000_000e18;

    function predict(
        address launchpad,
        address sender,
        bytes32 salt,
        bytes memory creationCode,
        string memory name,
        string memory symbol
    ) internal pure returns (address) {
        bytes32 initCodeHash = keccak256(abi.encodePacked(creationCode, abi.encode(name, symbol, TOTAL_SUPPLY)));
        bytes32 create2Salt = keccak256(abi.encode(sender, salt));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), launchpad, create2Salt, initCodeHash)))));
    }
}
