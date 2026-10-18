// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Ascend's HyperCore listing desk: the creator role may set aside a share of
/// its quote fees toward a future HyperCore spot listing.
interface IListingDesk {
    struct Pool {
        address token;
        uint40 committedUntil;
        uint40 listedAt;
        uint32 coreIndex;
        uint32 spotIndex;
        uint256 locked;
    }

    function enroll(address token, address quote, uint256 cap) external;
    function close(bytes32 poolId) external;
    function withdraw(bytes32 poolId, uint256 amount) external;
    function pool(bytes32 poolId) external view returns (Pool memory);
}
