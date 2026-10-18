// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IInfinityLock {
    function lock(bytes calldata data) external returns (bytes memory);
}

/// @dev Takes the Infinity vault's lock and makes one call from inside it.
contract LockHolder {
    address internal immutable vault;
    address internal target;
    bytes internal data;

    constructor(address vault_) {
        vault = vault_;
    }

    function callInsideLock(address target_, bytes calldata data_) external {
        target = target_;
        data = data_;
        IInfinityLock(vault).lock("");
    }

    function lockAcquired(bytes calldata) external returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(ret, 0x20), mload(ret))
            }
        }
        return "";
    }
}
