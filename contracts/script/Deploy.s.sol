// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {UpdraftFactory} from "../src/UpdraftFactory.sol";
import {UpdraftRound} from "../src/UpdraftRound.sol";
import {CreatorVault} from "../src/CreatorVault.sol";
import {LaunchCertificate} from "../src/LaunchCertificate.sol";
import {UpdraftStaking} from "../src/UpdraftStaking.sol";
import {UpdraftLens} from "../src/lens/UpdraftLens.sol";
import {ASCEND_TOKEN_CREATION_CODE} from "../src/ascend/AscendTokenCode.sol";
import {Params} from "../src/interfaces/IUpdraft.sol";

/// @notice Deploys Updraft on Elysium testnet and accepts Ascend's current launchpad.
/// Env: DEPLOYER_PRIVATE_KEY, ATTESTOR_ADDRESS; optional DISTRIBUTOR_ADDRESS, ASCEND_LAUNCHPAD,
/// ASCEND_OWNER, DEPLOYMENTS_FILE.
contract Deploy is Script {
    address internal constant DEFAULT_LAUNCHPAD = 0x6d01f6644bbf1b5074472D3e85aa1465B4d2bF3d;
    address internal constant DEFAULT_ASCEND_OWNER = 0x5Fa637713b819d6314e139291De2Bfa7b7cD70eB;

    function run() external {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);
        address attestor = vm.envAddress("ATTESTOR_ADDRESS");
        address distributor = vm.envOr("DISTRIBUTOR_ADDRESS", deployer);
        address launchpad = vm.envOr("ASCEND_LAUNCHPAD", DEFAULT_LAUNCHPAD);
        address ascendOwner = vm.envOr("ASCEND_OWNER", DEFAULT_ASCEND_OWNER);

        vm.startBroadcast(key);
        LaunchCertificate certificate = new LaunchCertificate(deployer);
        UpdraftStaking staking = new UpdraftStaking(deployer);
        UpdraftRound roundImpl = new UpdraftRound();
        CreatorVault vaultImpl = new CreatorVault();
        UpdraftFactory factory = new UpdraftFactory(
            deployer,
            address(roundImpl),
            address(vaultImpl),
            address(certificate),
            address(staking),
            Params({parityBps: 100, platformTokenBps: 50, platformFeeBps: 1000, minPolicyTimelock: 5 minutes, maxTeamBps: 6000})
        );
        certificate.setFactory(address(factory));
        factory.allowLaunchpad(launchpad, ascendOwner, ASCEND_TOKEN_CREATION_CODE);
        factory.setAttestor(attestor, true);
        staking.setDistributor(distributor);
        UpdraftLens lens = new UpdraftLens();
        vm.stopBroadcast();

        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "deployBlock", block.number);
        vm.serializeAddress(o, "factory", address(factory));
        vm.serializeAddress(o, "roundImplementation", address(roundImpl));
        vm.serializeAddress(o, "vaultImplementation", address(vaultImpl));
        vm.serializeAddress(o, "certificate", address(certificate));
        vm.serializeAddress(o, "staking", address(staking));
        vm.serializeAddress(o, "lens", address(lens));
        vm.serializeAddress(o, "attestor", attestor);
        vm.serializeAddress(o, "distributor", distributor);
        string memory json = vm.serializeAddress(o, "launchpad", launchpad);
        string memory outFile = vm.envOr("DEPLOYMENTS_FILE", string("elysium-testnet.json"));
        vm.writeJson(json, string.concat(vm.projectRoot(), "/../deployments/", outFile));
        console.log("factory", address(factory));
    }
}
