// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DevPermissionedResolver, DevUniversalResolver} from "../src/dev/DevEnsV2.sol";

/// @notice DEV ONLY (anvil): deploys the ENSv2 stand-in. Sepolia and mainnet use the real ENSv2
/// contracts; `npm run setup:ens` configures either. Writes deployments/ens-<chainId>.json.
contract DeployDevEns is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        // the key that writes ENS records; on anvil it must differ from the 0G relayer key, or their nonces collide
        address owner = vm.envOr("ENS_OWNER", vm.addr(pk));
        vm.startBroadcast(pk);
        DevUniversalResolver ur = new DevUniversalResolver(owner);
        DevPermissionedResolver resolver = new DevPermissionedResolver(owner);
        vm.stopBroadcast();

        console2.log("DevUniversalResolver", address(ur));
        console2.log("DevPermissionedResolver", address(resolver));

        string memory obj = "ens";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeBool(obj, "dev", true);
        vm.serializeAddress(obj, "universalResolver", address(ur));
        string memory json = vm.serializeAddress(obj, "resolver", address(resolver));
        vm.writeJson(json, string.concat("./deployments/ens-", vm.toString(block.chainid), ".json"));
    }
}
