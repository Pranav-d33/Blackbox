// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// DEV ONLY. A minimal stand-in for ENSv2 on anvil, so `npm run dev:local` runs the same ENS code path
/// with no network. It copies the ENSv2 ABI the core and the verifier use, not its access control:
///   DevUniversalResolver   resolve(bytes name, bytes data) returns (bytes, address)  (UniversalResolverV2)
///                          findResolver(bytes name): nearest ancestor with a resolver (ENSIP-10 wildcard)
///   DevPermissionedResolver setText / setAddress take a DNS-encoded name, multicall, resolve(bytes,bytes),
///                          and unlinked names fall back to the default record of the root name 0x00.
/// On Sepolia and mainnet Blackbox uses the real ENSv2 contracts (see core/scripts/setup-ens.ts).

library DnsName {
    /// ENSIP-1 namehash of a DNS-encoded name, from byte `off`.
    function namehash(bytes memory name, uint256 off) internal pure returns (bytes32 node) {
        uint256 len = uint8(name[off]);
        if (len == 0) return bytes32(0);
        bytes32 label;
        assembly {
            label := keccak256(add(add(name, 32), add(off, 1)), len)
        }
        return keccak256(abi.encodePacked(namehash(name, off + 1 + len), label));
    }
}

contract DevPermissionedResolver {
    using DnsName for bytes;

    error Unauthorized();
    error UnsupportedResolverProfile(bytes4 selector);

    event Linked(uint256 indexed recordId, bytes32 indexed node, bytes name);
    event TextChanged(bytes32 indexed node, string key, string value);
    event AddressChanged(bytes32 indexed node, uint256 coinType, bytes addressBytes);

    address public immutable owner;
    mapping(bytes32 => uint256) public getRecordId;
    uint256 public getRecordCount;
    mapping(uint256 => mapping(string => string)) private _texts;
    mapping(uint256 => mapping(uint256 => bytes)) private _addrs;

    constructor(address owner_) {
        owner = owner_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner && msg.sender != address(this)) revert Unauthorized();
        _;
    }

    function _writable(bytes calldata name) internal returns (uint256 id, bytes32 node) {
        node = bytes(name).namehash(0);
        id = getRecordId[node];
        if (id == 0) {
            id = ++getRecordCount;
            getRecordId[node] = id;
            emit Linked(id, node, name);
        }
    }

    function setText(bytes calldata name, string calldata key, string calldata value) external onlyOwner {
        (uint256 id, bytes32 node) = _writable(name);
        _texts[id][key] = value;
        emit TextChanged(node, key, value);
    }

    function setAddress(bytes calldata name, uint256 coinType, bytes calldata addressBytes) external onlyOwner {
        (uint256 id, bytes32 node) = _writable(name);
        _addrs[id][coinType] = addressBytes;
        emit AddressChanged(node, coinType, addressBytes);
    }

    function multicall(bytes[] calldata data) external returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i; i < data.length; i++) {
            (bool ok, bytes memory r) = address(this).delegatecall(data[i]);
            if (!ok) {
                assembly {
                    revert(add(r, 32), mload(r))
                }
            }
            results[i] = r;
        }
    }

    /// ENSIP-10. The node inside `data` is ignored: the record comes from `name`, as in ENSv2.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        uint256 id = getRecordId[bytes(name).namehash(0)];
        if (id == 0) id = getRecordId[bytes32(0)];
        bytes4 sel = bytes4(data[:4]);
        if (sel == 0x3b3b57de) {
            bytes memory a = _addrs[id][60];
            return abi.encode(a.length == 20 ? address(bytes20(a)) : address(0));
        }
        if (sel == 0xf1cb7e06) {
            (, uint256 coinType) = abi.decode(data[4:], (bytes32, uint256));
            return abi.encode(_addrs[id][coinType]);
        }
        if (sel == 0x59d1d43c) {
            (, string memory key) = abi.decode(data[4:], (bytes32, string));
            return abi.encode(_texts[id][key]);
        }
        revert UnsupportedResolverProfile(sel);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x9061b923 || id == 0xc7279f88 || id == 0xb4436dde;
    }
}

contract DevUniversalResolver {
    using DnsName for bytes;

    error ResolverNotFound(bytes name);
    error ResolverError(bytes errorData);

    address public immutable owner;
    mapping(bytes32 => address) public resolverOf;

    constructor(address owner_) {
        owner = owner_;
    }

    /// Stands in for setResolver() on the registry that holds the name.
    function setResolver(bytes calldata name, address resolver) external {
        require(msg.sender == owner, "owner");
        resolverOf[bytes(name).namehash(0)] = resolver;
    }

    function findResolver(bytes memory name) public view returns (address resolver, bytes32 node, uint256 offset) {
        node = name.namehash(0);
        while (true) {
            resolver = resolverOf[name.namehash(offset)];
            if (resolver != address(0) || uint8(name[offset]) == 0) return (resolver, node, offset);
            offset += 1 + uint8(name[offset]);
        }
    }

    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory result, address resolver) {
        (resolver,,) = findResolver(name);
        if (resolver == address(0)) revert ResolverNotFound(name);
        (bool ok, bytes memory r) = resolver.staticcall(abi.encodeWithSelector(0x9061b923, name, data));
        if (!ok) revert ResolverError(r);
        result = abi.decode(r, (bytes));
    }
}
