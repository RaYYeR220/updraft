// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vesting} from "./interfaces/IUpdraft.sol";

/// @notice Facts of one Updraft launch, written once by its round at fire.
struct Certificate {
    address round;
    address token;
    bytes32 poolId;
    address launchpad;
    address quote;
    uint40 firedAt;
    uint256 quoteUsed;
    uint256 tokensOut;
    uint256 platformTokens;
    uint256 avgPriceX96;
    uint32 participants;
    uint32 verifiedIdentities;
    uint16 top1Bps;
    uint16 top10Bps;
    uint256 creatorTokens;
    Vesting creatorVesting;
    Vesting participantVesting;
    bytes32 policyHash;
    address attestor;
    bytes32 evidenceAccumulator;
    uint256 shortfall;
}

interface IRoundRegistry {
    function isRound(address) external view returns (bool);
}

/// @notice Public registry of launch certificates. Only rounds created by the Updraft factory
/// can write, each exactly once, about the token it launched.
contract LaunchCertificate {
    error NotRound();
    error AlreadyRecorded();
    error FactoryAlreadySet();
    error NotDeployer();

    event Certified(address indexed token, address indexed round);

    address public immutable deployer;
    address public factory;
    mapping(address => Certificate) internal _certificates;
    mapping(address => bool) public exists;

    constructor(address deployer_) {
        deployer = deployer_;
    }

    /// @notice Binds the factory once; the factory and the registry reference each other.
    function setFactory(address factory_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (factory != address(0)) revert FactoryAlreadySet();
        factory = factory_;
    }

    function record(Certificate calldata c) external {
        if (c.round != msg.sender || factory == address(0) || !IRoundRegistry(factory).isRound(msg.sender)) {
            revert NotRound();
        }
        if (exists[c.token]) revert AlreadyRecorded();
        exists[c.token] = true;
        _certificates[c.token] = c;
        emit Certified(c.token, msg.sender);
    }

    function get(address token) external view returns (Certificate memory) {
        return _certificates[token];
    }
}
