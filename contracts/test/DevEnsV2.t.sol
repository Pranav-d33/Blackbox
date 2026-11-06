// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DevPermissionedResolver, DevUniversalResolver} from "../src/dev/DevEnsV2.sol";

contract DevEnsV2Test is Test {
    DevUniversalResolver ur;
    DevPermissionedResolver res;

    // DNS-encoded names
    bytes parent = hex"08626c61636b626f780365746800"; // blackbox.eth
    bytes drone = hex"0564726f6e6508626c61636b626f780365746800"; // drone.blackbox.eth
    bytes panel = hex"0572326d313405736f6c617208626c61636b626f780365746800"; // r2m14.solar.blackbox.eth
    bytes other = hex"05723373303105736f6c617208626c61636b626f780365746800"; // r3s01.solar.blackbox.eth

    function setUp() public {
        ur = new DevUniversalResolver(address(this));
        res = new DevPermissionedResolver(address(this));
        ur.setResolver(parent, address(res));
    }

    function _text(bytes memory name, string memory key) internal view returns (string memory) {
        (bytes memory r, address used) = ur.resolve(name, abi.encodeWithSelector(0x59d1d43c, bytes32(0), key));
        assertEq(used, address(res));
        return abi.decode(r, (string));
    }

    function test_namehash_matches_ens() public view {
        (, bytes32 node,) = ur.findResolver(parent);
        bytes32 eth = keccak256(abi.encodePacked(bytes32(0), keccak256("eth")));
        assertEq(node, keccak256(abi.encodePacked(eth, keccak256("blackbox"))));
    }

    function test_wildcard_subnames_use_the_parent_resolver() public {
        res.setText(panel, "blackbox.status", "cracked_cell sev 2");
        assertEq(_text(panel, "blackbox.status"), "cracked_cell sev 2");
        (address r,, uint256 offset) = ur.findResolver(panel);
        assertEq(r, address(res));
        assertEq(offset, 12); // "r2m14" + "solar" labels skipped
    }

    function test_unlinked_names_fall_back_to_the_default_record() public {
        res.setText(hex"00", "blackbox.status", "not inspected yet");
        res.setText(panel, "blackbox.status", "soiling");
        assertEq(_text(other, "blackbox.status"), "not inspected yet");
        assertEq(_text(panel, "blackbox.status"), "soiling");
    }

    function test_addr_and_multicall() public {
        address robot = makeAddr("robot");
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(res.setAddress, (drone, 60, abi.encodePacked(robot)));
        calls[1] = abi.encodeCall(res.setText, (drone, "blackbox.role", "robot"));
        res.multicall(calls);
        (bytes memory r,) = ur.resolve(drone, abi.encodeWithSelector(0x3b3b57de, bytes32(0)));
        assertEq(abi.decode(r, (address)), robot);
        assertEq(_text(drone, "blackbox.role"), "robot");
    }

    function test_only_owner_writes() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(DevPermissionedResolver.Unauthorized.selector);
        res.setText(panel, "blackbox.status", "forged");
    }

    function test_unknown_name_reverts() public {
        vm.expectRevert();
        ur.resolve(hex"036f746865720365746800", abi.encodeWithSelector(0x3b3b57de, bytes32(0)));
    }
}
