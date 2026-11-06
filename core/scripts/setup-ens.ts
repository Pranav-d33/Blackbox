/**
 * Point an ENSv2 name at a Permissioned Resolver Blackbox can write, so the fleet and its assets
 * get names: drone.<parent>, 0g-tee.<parent>, r2m14.solar.<parent>, x12y03.bridge.<parent> …
 *   npm run setup:ens
 *
 * ENS=local    anvil: the dev stand-in from contracts/script/DeployDevEns.s.sol (dev-local.sh runs this)
 * ENS=sepolia  the real ENSv2 deployment. MANUAL first: register ENS_PARENT (a .eth 2LD) at
 *              https://sepolia.app.ens.domains with the ENS key (fees in test USDC), and fund that key with Sepolia ETH.
 *              This script deploys your Permissioned Resolver through the VerifiableFactory and calls
 *              setResolver on the ETH registry. Idempotent. Prints the ENS_* lines for .env.
 */
import { Contract, Interface, JsonRpcProvider, Wallet, dnsEncode, getAddress, id, keccak256, AbiCoder } from "ethers";
import { loadConfig } from "../src/config";
import { KEYS } from "../src/ens/names";
import { EnsReader } from "../src/ens/reader";

/** ENSv2 on Sepolia (docs.ens.domains/learn/deployments, checked Nov 2026). */
const SEPOLIA = {
  verifiableFactory: "0xda70306c98e97ece36f997a21368e53298572991",
  permissionedResolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
  ethRegistry: "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4",
};
// every resolver role and its admin role (docs: Verifiable Factory, "Deploying a Resolver Proxy")
const ALL_ROLES = 0x1111111111111111111111111111111111111111111111111111111111111111n;
const DEFAULT_TEXT = "Blackbox asset. No inspection recorded on ENS yet.";

const cfg = loadConfig();
const e = cfg.ens;
if (!e) throw new Error("ENS=none: set ENS=local or ENS=sepolia");
if (!e.parent) throw new Error("ENS_PARENT is not set (the name you own, e.g. blackbox-demo.eth)");
if (!e.key) throw new Error("ENS_PRIVATE_KEY (or OPERATOR_PRIVATE_KEY) is not set");
const provider = new JsonRpcProvider(e.rpc, e.chainId, { staticNetwork: true });
const wallet = new Wallet(e.key, provider);
const reader = new EnsReader(e.rpc, e.chainId, e.universalResolver);
const RES = new Interface(["function setText(bytes name, string key, string value)", "function multicall(bytes[] data) returns (bytes[])"]);

console.log(`ENS network        ${e.network} (${e.chainId})`);
console.log(`parent name        ${e.parent}`);
console.log(`ENS key            ${wallet.address} (${Number(await provider.getBalance(wallet.address)) / 1e18} ETH)`);
console.log(`Universal Resolver ${e.universalResolver}`);

let resolver = e.resolver;
if (e.network === "local") {
  if (!resolver) throw new Error("no dev ENS deployment: run contracts/script/DeployDevEns.s.sol (dev-local.sh does)");
  const ur = new Contract(e.universalResolver, ["function setResolver(bytes name, address resolver)", "function resolverOf(bytes32) view returns (address)"], wallet);
  await (await ur.setResolver(dnsEncode(e.parent, 255), resolver)).wait();
  console.log(`setResolver        ${e.parent} -> ${resolver} (dev stand-in)`);
} else {
  if (e.network !== "sepolia") throw new Error("only ENS=local and ENS=sepolia are scripted; on mainnet do the same steps by hand");
  const labels = e.parent.split(".");
  if (labels.length !== 2 || labels[1] !== "eth") throw new Error("ENS_PARENT must be a .eth second-level name you registered (e.g. blackbox-demo.eth)");
  const reg = new Contract(SEPOLIA.ethRegistry, ["function getOwner(uint256 anyId) view returns (address)", "function getResolver(string label) view returns (address)", "function setResolver(uint256 anyId, address resolver)"], wallet);
  const labelhash = BigInt(id(labels[0]));
  const owner: string = await reg.getOwner(labelhash);
  if (owner === "0x0000000000000000000000000000000000000000") throw new Error(`${e.parent} is not registered on Sepolia ENSv2: register it at https://sepolia.app.ens.domains first`);
  if (getAddress(owner) !== wallet.address) throw new Error(`${e.parent} is owned by ${owner}, not the ENS key ${wallet.address}`);
  if (!resolver) {
    const factory = new Contract(SEPOLIA.verifiableFactory, ["function deployProxy(address implementation, uint256 salt, bytes data)", "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)"], wallet);
    // salt scheme from the ENS docs: keccak256("OwnedResolver", owner, version)
    const salt = BigInt(keccak256(AbiCoder.defaultAbiCoder().encode(["bytes32", "address", "uint256"], [id("OwnedResolver"), wallet.address, 1n])));
    const init = new Interface(["function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)"]).encodeFunctionData("initialize", [[{ account: wallet.address, roleBitmap: ALL_ROLES }], []]);
    const tx = await factory.deployProxy(SEPOLIA.permissionedResolverImpl, salt, init);
    const rc = await tx.wait();
    const log = rc.logs.map((l: any) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((l: any) => l?.name === "ProxyDeployed");
    if (!log) throw new Error(`deployProxy ${tx.hash}: no ProxyDeployed event`);
    resolver = log.args.proxyAddress as string;
    console.log(`Permissioned Resolver ${resolver} (deployProxy ${tx.hash})`);
  } else console.log(`Permissioned Resolver ${resolver} (ENS_RESOLVER)`);
  const cur: string = await reg.getResolver(labels[0]);
  if (getAddress(cur) !== getAddress(resolver)) {
    const tx = await reg.setResolver(labelhash, resolver);
    await tx.wait();
    console.log(`setResolver        ${tx.hash}`);
  } else console.log("setResolver        already points at it");
}

// The default record (root name 0x00) answers for every panel or square not inspected yet.
const r = new Contract(resolver, RES, wallet);
const anyAsset = `never-inspected.solar.${e.parent}`;
if ((await reader.text(anyAsset, KEYS.description).catch(() => null)) !== DEFAULT_TEXT) {
  await (await r.setText("0x00", KEYS.description, DEFAULT_TEXT)).wait();
  console.log("default record     set");
}
console.log(`check              ${anyAsset} -> "${await reader.text(anyAsset, KEYS.description)}"`);

console.log(`\nAdd to .env:\nENS=${e.network}\nENS_PARENT=${e.parent}\nENS_RESOLVER=${resolver}`);
