// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Ascend's HyperCore listing desk: the creator role may set aside a share of
/// its quote fees toward a future HyperCore spot listing.
interface IListingDesk {
    function enroll(address token, address quote, uint256 cap) external;
    function close(bytes32 poolId) external;
}
